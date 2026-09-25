export class GameApiError extends Error {
  readonly code: string;
  constructor(
    readonly status: number,
    readonly data: unknown,
  ) {
    const payload = data as { error?: unknown; message?: unknown } | null;
    const error = payload?.error as { code?: unknown; message?: unknown } | string | undefined;
    const code = typeof error === 'object' && typeof error?.code === 'string' ? error.code : '';
    const detail =
      typeof error === 'string'
        ? error
        : typeof error?.message === 'string'
          ? error.message
          : typeof payload?.message === 'string'
            ? payload.message
            : describeStatus(status);
    super(detail);
    this.name = 'GameApiError';
    this.code = code;
  }
  get isAuth() {
    return this.status === 401;
  }
}

/**
 * The request left GUPPI but no response was confirmed. For a mutation the game
 * may or may not have accepted it, so GUPPI never retries these automatically.
 */
export class UncertainOutcomeError extends Error {
  constructor(
    message: string,
    readonly mutation: boolean,
  ) {
    super(message);
    this.name = 'UncertainOutcomeError';
  }
}

export class StoppedError extends Error {
  constructor(message = 'Stopped') {
    super(message);
    this.name = 'StoppedError';
  }
}

export function describeStatus(status: number) {
  if (status === 401) return 'The API key was rejected. Reconnect with a valid personal key.';
  if (status === 403) return 'The game refused this action for your account.';
  if (status === 404) return 'The game could not find that object.';
  if (status === 409) return 'The game reported a conflict — the target is busy or has changed.';
  if (status === 422) return 'The game rejected the request details.';
  if (status === 429) return 'Rate limit reached.';
  if (status >= 500) return `The game server had a problem (HTTP ${status}).`;
  return `HTTP ${status}`;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export const isStopped = (e: unknown) => e instanceof StoppedError || (e instanceof Error && e.name === 'AbortError');

export function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new StoppedError());
    const abort = () => {
      clearTimeout(timer);
      reject(new StoppedError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, Math.max(0, ms));
    signal?.addEventListener('abort', abort, { once: true });
  });
}
