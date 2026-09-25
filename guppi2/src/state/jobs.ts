/**
 * The job runner. Every long-running automation (craft queues, voyages, mining
 * runs, routines, scans) is a Job: it holds resource claims, reports progress,
 * keeps its own log and can be stopped at any time. Stopping never cancels work
 * the game has already accepted — it only prevents further orders.
 */
import { create } from 'zustand';
import { ClaimConflict, conflictWith, type Claim, type Job } from '@/core/claims';
import { StoppedError, errorMessage, isStopped, pause } from '@/core/errors';

export type JobContext = {
  signal: AbortSignal;
  job: Job;
  report: (message: string, progress?: number) => void;
  log: (text: string, tone?: 'ok' | 'warn' | 'error') => void;
  /** Wait until the claims are free, then hold them. */
  acquire: (claims: Claim[]) => Promise<void>;
  release: () => void;
  sleep: (ms: number) => Promise<void>;
  check: () => void;
};

export type JobSpec = {
  name: string;
  kind: string;
  probeId: string;
  claims?: Claim[];
  /** Fail immediately on a claim conflict instead of waiting. */
  exclusive?: boolean;
  run: (ctx: JobContext) => Promise<string | void>;
};

type JobsState = {
  jobs: Job[];
  version: number;
  start: (spec: JobSpec) => Job;
  stop: (id: string) => void;
  stopAll: () => void;
  clearFinished: () => void;
};

const MAX_FINISHED = 30;

export const useJobs = create<JobsState>((set, get) => {
  const bump = () => set((s) => ({ jobs: [...s.jobs], version: s.version + 1 }));

  const start = (spec: JobSpec): Job => {
    const claims = spec.claims ?? [];
    const holder = conflictWith(get().jobs, spec.probeId, claims);
    if (holder && spec.exclusive) throw new ClaimConflict(holder);
    const job: Job = {
      id: crypto.randomUUID(),
      name: spec.name,
      kind: spec.kind,
      probeId: spec.probeId,
      state: holder ? 'waiting' : 'running',
      message: holder ? `Waiting for ${holder.name}` : 'Starting…',
      startedAt: Date.now(),
      claims: [],
      controller: new AbortController(),
      log: [],
    };
    const signal = job.controller.signal;
    const ctx: JobContext = {
      signal,
      job,
      report(message, progress) {
        if (job.state !== 'running' && job.state !== 'waiting') return;
        job.message = message;
        if (progress !== undefined) job.progress = Math.max(0, Math.min(1, progress));
        bump();
      },
      log(text, tone) {
        job.log.push({ at: Date.now(), text, tone });
        if (job.log.length > 300) job.log.splice(0, job.log.length - 300);
        bump();
      },
      async acquire(next) {
        while (true) {
          ctx.check();
          const other = conflictWith(get().jobs, job.probeId, next, job);
          if (!other) {
            job.claims = next;
            if (job.state === 'waiting') job.state = 'running';
            bump();
            return;
          }
          if (job.state !== 'waiting') {
            job.state = 'waiting';
            job.message = `Waiting for ${other.name}`;
            bump();
          }
          await pause(1000, signal);
        }
      },
      release() {
        job.claims = [];
        bump();
      },
      sleep: (ms) => pause(ms, signal),
      check() {
        if (signal.aborted) throw new StoppedError();
      },
    };

    set((s) => {
      const finished = s.jobs.filter((j) => j.finishedAt);
      const trimmed = finished.length > MAX_FINISHED ? s.jobs.filter((j) => !j.finishedAt || finished.slice(-MAX_FINISHED).includes(j)) : s.jobs;
      return { jobs: [...trimmed, job], version: s.version + 1 };
    });

    void (async () => {
      try {
        await ctx.acquire(claims);
        job.state = 'running';
        bump();
        const result = await spec.run(ctx);
        job.state = 'done';
        job.message = result || 'Complete';
        job.progress = 1;
        ctx.log(job.message, 'ok');
      } catch (e) {
        job.state = isStopped(e) || signal.aborted ? 'stopped' : 'failed';
        job.message = job.state === 'stopped' ? 'Stopped — accepted orders continue in-game' : errorMessage(e);
        ctx.log(job.message, job.state === 'failed' ? 'error' : 'warn');
      } finally {
        job.claims = [];
        job.finishedAt = Date.now();
        bump();
      }
    })();
    return job;
  };

  return {
    jobs: [],
    version: 0,
    start,
    stop(id) {
      get().jobs.find((j) => j.id === id)?.controller.abort();
    },
    stopAll() {
      for (const j of get().jobs) if (!j.finishedAt) j.controller.abort();
    },
    clearFinished() {
      set((s) => ({ jobs: s.jobs.filter((j) => !j.finishedAt), version: s.version + 1 }));
    },
  };
});

export const activeJobs = (jobs: Job[]) => jobs.filter((j) => !j.finishedAt);
