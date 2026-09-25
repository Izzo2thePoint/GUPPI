/**
 * One lane to the game, shared by every screen and every automation.
 *
 * - Priorities: your clicks jump ahead of automation, which jumps ahead of polling.
 * - Identical reads that are already queued share a single request.
 * - Spacing, `Retry-After`, `X-RateLimit-Remaining/Reset` are all honoured.
 * - Reads are retried with jittered backoff on network/5xx failures.
 * - Mutations are never retried unless the game explicitly refused them with 429
 *   (which means they were not accepted). An unconfirmed mutation surfaces as an
 *   UncertainOutcomeError so nothing is ever sent twice by accident.
 * - After repeated network failures the link is marked offline and background
 *   polling backs off until a request succeeds again.
 */
import { compile, operation, type Command } from './catalog';
import { GameApiError, StoppedError, UncertainOutcomeError, pause } from './errors';
import { TransportFailure, type Transport, type WireResponse } from './transport';

export type Priority = 'user' | 'automation' | 'background';
const RANK: Record<Priority, number> = { user: 0, automation: 1, background: 2 };

export type LinkState = 'idle' | 'busy' | 'waiting' | 'offline';

export type SchedulerStats = {
  link: LinkState;
  queued: number;
  remaining: number | null;
  limit: number | null;
  waitUntil: number;
  lastLatencyMs: number | null;
  sent: number;
  failures: number;
  consecutiveNetworkFailures: number;
};

export type ActivityEntry = {
  id: number;
  at: number;
  label: string;
  method: string;
  path: string;
  priority: Priority;
  status: number | null;
  durationMs: number | null;
  outcome: 'pending' | 'ok' | 'error' | 'retry' | 'stopped';
  note?: string;
};

export type RequestOptions = { priority?: Priority; signal?: AbortSignal; label?: string };

export type SchedulerConfig = {
  /** Minimum spacing between requests in ms. */
  spacingMs: number;
  /** Retries for reads on network / 5xx failures. */
  readRetries: number;
  /** Maximum times a single request may wait on 429 before giving up. */
  rateLimitRetries: number;
  maxWaitMs: number;
};

type Job = {
  seq: number;
  command: Command;
  key: string | null;
  priority: Priority;
  label: string;
  waiters: { resolve: (v: unknown) => void; reject: (e: unknown) => void; signal?: AbortSignal }[];
};

export const DEFAULT_CONFIG: SchedulerConfig = {
  spacingMs: 1200,
  readRetries: 2,
  rateLimitRetries: 6,
  maxWaitMs: 24 * 3600_000,
};

export function retryAfterMs(value: string | null, now = Date.now()): number {
  if (!value) return 30_000;
  const seconds = Number(value);
  if (!Number.isNaN(seconds)) return seconds > 0 ? seconds * 1000 : 30_000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1000, date - now) : 30_000;
}

/** X-RateLimit-Reset may be epoch seconds or seconds-until-reset. */
export function resetMs(value: string | null, now = Date.now()): number {
  const n = Number(value);
  if (!value || !Number.isFinite(n) || n <= 0) return 30_000;
  if (n > 1e9) return Math.max(1000, n * 1000 - now);
  return n * 1000;
}

export class Scheduler {
  private queue: Job[] = [];
  private inflight = new Map<string, Job>();
  private seq = 0;
  private running = false;
  private nextAt = 0;
  private wake: (() => void) | null = null;
  private offlineProbeAt = 0;
  private listeners = new Set<() => void>();
  private activityListeners = new Set<(e: ActivityEntry) => void>();
  private activityId = 0;
  private statsCache: SchedulerStats;
  config: SchedulerConfig;

  constructor(
    private transport: Transport,
    config: Partial<SchedulerConfig> = {},
    private now: () => number = Date.now,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.statsCache = {
      link: 'idle',
      queued: 0,
      remaining: null,
      limit: null,
      waitUntil: 0,
      lastLatencyMs: null,
      sent: 0,
      failures: 0,
      consecutiveNetworkFailures: 0,
    };
  }

  get transportKind() {
    return this.transport.kind;
  }

  stats = () => this.statsCache;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  onActivity(fn: (e: ActivityEntry) => void) {
    this.activityListeners.add(fn);
    return () => this.activityListeners.delete(fn);
  }

  private patch(p: Partial<SchedulerStats>) {
    this.statsCache = { ...this.statsCache, ...p, queued: this.queue.length };
    for (const fn of this.listeners) fn();
  }

  private log(entry: ActivityEntry) {
    for (const fn of this.activityListeners) fn({ ...entry });
  }

  request<T = unknown>(command: Command, options: RequestOptions = {}): Promise<T> {
    const { priority = 'user', signal } = options;
    if (signal?.aborted) return Promise.reject(new StoppedError());
    // Validate synchronously so bad input never waits in the queue.
    const compiled = compile(command);
    const read = compiled.method === 'GET';
    const key = read ? compiled.path : null;
    const label = options.label ?? compiled.op.title;

    return new Promise<T>((resolve, reject) => {
      const waiter = { resolve: resolve as (v: unknown) => void, reject, signal };
      const existing = key ? (this.queue.find((j) => j.key === key) ?? this.inflight.get(key)) : undefined;
      if (existing) {
        existing.waiters.push(waiter);
        // A user asking for data that is queued as background promotes it.
        if (RANK[priority] < RANK[existing.priority]) existing.priority = priority;
      } else {
        this.queue.push({ seq: ++this.seq, command, key, priority, label, waiters: [waiter] });
      }
      signal?.addEventListener(
        'abort',
        () => {
          reject(new StoppedError());
          this.dropAbandoned();
        },
        { once: true },
      );
      this.patch({});
      this.wake?.();
      void this.pump();
    });
  }

  /** Remove queued jobs whose every waiter has cancelled. */
  private dropAbandoned() {
    const before = this.queue.length;
    this.queue = this.queue.filter((j) => j.waiters.some((w) => !w.signal?.aborted));
    if (before !== this.queue.length) this.patch({});
  }

  /** Reject everything that is queued (used on disconnect). */
  clear(reason = 'Disconnected') {
    const jobs = this.queue;
    this.queue = [];
    for (const j of jobs) for (const w of j.waiters) w.reject(new StoppedError(reason));
    this.patch({ link: 'idle' });
  }

  /** Let a waiting loop run again now (e.g. user pressed “retry now”). */
  nudge() {
    this.nextAt = Math.min(this.nextAt, this.now());
    this.wake?.();
  }

  private next(): Job | undefined {
    if (!this.queue.length) return undefined;
    const offline = this.statsCache.link === 'offline';
    let best: Job | undefined;
    for (const j of this.queue) {
      if (offline && j.priority === 'background') continue;
      if (!best || RANK[j.priority] < RANK[best.priority] || (RANK[j.priority] === RANK[best.priority] && j.seq < best.seq)) best = j;
    }
    return best;
  }

  private async sleepUntil(t: number) {
    const ms = t - this.now();
    if (ms <= 0) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        resolve();
      }
      this.wake = done;
    });
    this.wake = null;
  }

  private async pump() {
    if (this.running) return;
    this.running = true;
    try {
      while (true) {
        this.dropAbandoned();
        const job = this.next();
        if (!job) {
          if (this.queue.length && this.statsCache.link === 'offline') {
            // Only background work is left while offline: let one probe through periodically.
            if (this.now() >= this.offlineProbeAt) {
              this.offlineProbeAt = this.now() + 15_000;
              this.patch({ link: 'waiting' });
            } else await this.sleepUntil(this.offlineProbeAt);
            continue;
          }
          break;
        }
        if (this.nextAt > this.now()) {
          this.patch({ link: this.statsCache.link === 'offline' ? 'offline' : 'waiting', waitUntil: this.nextAt });
          await this.sleepUntil(this.nextAt);
          continue; // Re-pick: something more urgent may have arrived.
        }
        this.queue = this.queue.filter((j) => j !== job);
        if (job.key) this.inflight.set(job.key, job);
        this.patch({ link: 'busy', waitUntil: 0 });
        try {
          const outcome = await this.execute(job);
          if (outcome === 'requeue') {
            this.queue.unshift(job);
            continue;
          }
        } finally {
          if (job.key) this.inflight.delete(job.key);
        }
      }
    } finally {
      this.running = false;
      if (this.statsCache.link !== 'offline') this.patch({ link: 'idle' });
      if (this.queue.length) void this.pump();
    }
  }

  private rateRetries = new WeakMap<Job, number>();
  private readRetries = new WeakMap<Job, number>();

  private settle(job: Job, ok: boolean, value: unknown) {
    for (const w of job.waiters) if (!w.signal?.aborted) (ok ? w.resolve : w.reject)(value);
  }

  private async execute(job: Job): Promise<'done' | 'requeue'> {
    const compiled = compile(job.command);
    const read = compiled.method === 'GET';
    const started = this.now();
    const entry: ActivityEntry = {
      id: ++this.activityId,
      at: started,
      label: job.label,
      method: compiled.method,
      path: compiled.path,
      priority: job.priority,
      status: null,
      durationMs: null,
      outcome: 'pending',
    };
    this.nextAt = started + this.config.spacingMs;
    const controller = new AbortController();
    // A read whose every waiter left can be cancelled; a mutation in flight never is.
    const stopIfAbandoned = () => {
      if (read && job.waiters.every((w) => w.signal?.aborted)) controller.abort();
    };
    for (const w of job.waiters) w.signal?.addEventListener('abort', stopIfAbandoned, { once: true });

    let response: WireResponse;
    try {
      response = await this.transport.send({ method: compiled.method, path: compiled.path, body: compiled.body }, controller.signal);
    } catch (e) {
      const duration = this.now() - started;
      if (controller.signal.aborted) {
        this.log({ ...entry, outcome: 'stopped', durationMs: duration });
        this.settle(job, false, new StoppedError());
        return 'done';
      }
      const notSent = e instanceof TransportFailure && e.notSent;
      const failures = this.statsCache.consecutiveNetworkFailures + (notSent ? 0 : 1);
      const goesOffline = failures >= 3 && this.statsCache.link !== 'offline';
      if (goesOffline) this.offlineProbeAt = this.now() + 15_000;
      this.patch({
        failures: this.statsCache.failures + 1,
        consecutiveNetworkFailures: failures,
        link: failures >= 3 ? 'offline' : this.statsCache.link,
      });
      const tries = this.readRetries.get(job) ?? 0;
      if (read && !notSent && tries < this.config.readRetries) {
        this.readRetries.set(job, tries + 1);
        this.nextAt = this.now() + backoff(tries);
        this.log({ ...entry, outcome: 'retry', durationMs: duration, note: 'Network failure — retrying' });
        return 'requeue';
      }
      const message = e instanceof Error ? e.message : String(e);
      this.log({ ...entry, outcome: 'error', durationMs: duration, note: message });
      this.settle(
        job,
        false,
        notSent
          ? e
          : new UncertainOutcomeError(
              read
                ? 'No response from the game. Check your connection.'
                : 'No confirmed response from the game. The order may already have been accepted — check before retrying.',
              !read,
            ),
      );
      return 'done';
    }

    const duration = this.now() - started;
    const { status, headers } = response;
    const remaining = headers.remaining !== null && headers.remaining !== '' ? Number(headers.remaining) : null;
    const limit = headers.limit !== null && headers.limit !== '' ? Number(headers.limit) : null;
    this.patch({
      sent: this.statsCache.sent + 1,
      lastLatencyMs: duration,
      consecutiveNetworkFailures: 0,
      link: 'busy',
      remaining: Number.isFinite(remaining) ? remaining : this.statsCache.remaining,
      limit: Number.isFinite(limit) ? limit : this.statsCache.limit,
    });
    if (remaining === 0) this.nextAt = Math.max(this.nextAt, this.now() + resetMs(headers.reset, this.now()));

    if (status === 429) {
      const wait = retryAfterMs(headers.retryAfter, this.now());
      const tries = this.rateRetries.get(job) ?? 0;
      if (wait > this.config.maxWaitMs || tries >= this.config.rateLimitRetries) {
        this.log({ ...entry, status, durationMs: duration, outcome: 'error', note: 'Rate limit persisted' });
        this.settle(job, false, new GameApiError(429, response.data));
        return 'done';
      }
      this.rateRetries.set(job, tries + 1);
      this.nextAt = Math.max(this.nextAt, this.now() + wait);
      this.log({ ...entry, status, durationMs: duration, outcome: 'retry', note: `Rate limited — waiting ${Math.ceil(wait / 1000)}s` });
      return 'requeue';
    }

    if (status >= 500 && read) {
      const tries = this.readRetries.get(job) ?? 0;
      if (tries < this.config.readRetries) {
        this.readRetries.set(job, tries + 1);
        this.nextAt = Math.max(this.nextAt, this.now() + backoff(tries));
        this.log({ ...entry, status, durationMs: duration, outcome: 'retry', note: 'Server error — retrying' });
        return 'requeue';
      }
    }

    if (status < 200 || status >= 300) {
      const error = new GameApiError(status, response.data);
      this.log({ ...entry, status, durationMs: duration, outcome: 'error', note: error.message });
      this.settle(job, false, error);
      return 'done';
    }

    this.log({ ...entry, status, durationMs: duration, outcome: 'ok' });
    this.settle(job, true, response.data);
    return 'done';
  }
}

function backoff(attempt: number) {
  const base = Math.min(30_000, 2000 * 2 ** attempt);
  return base / 2 + Math.random() * (base / 2);
}

export function describeOperation(id: string) {
  try {
    return operation(id).title;
  } catch {
    return id;
  }
}

export { pause };
