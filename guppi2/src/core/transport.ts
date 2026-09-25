/**
 * Transports carry an already-validated request to the game and return the raw
 * response. They never retry and never interpret the result — that is the
 * scheduler's job.
 */
export type WireRequest = { method: string; path: string; body?: unknown };

export type RateHeaders = {
  retryAfter: string | null;
  remaining: string | null;
  reset: string | null;
  limit: string | null;
};

export type WireResponse = { status: number; data: unknown; headers: RateHeaders };

export class TransportFailure extends Error {
  constructor(
    message: string,
    /** True when the request certainly never reached the game (e.g. no key, blocked locally). */
    readonly notSent = false,
  ) {
    super(message);
    this.name = 'TransportFailure';
  }
}

export interface Transport {
  readonly kind: 'desktop' | 'proxy' | 'simulator';
  send(request: WireRequest, signal: AbortSignal): Promise<WireResponse>;
}

/** Electron: the key lives only in the main process, which talks to the fixed game host. */
export function desktopTransport(): Transport {
  return {
    kind: 'desktop',
    async send(request, signal) {
      const bridge = window.guppi;
      if (!bridge) throw new TransportFailure('Desktop bridge unavailable.', true);
      const id = crypto.randomUUID();
      const abort = () => void bridge.api.cancel(id);
      signal.addEventListener('abort', abort, { once: true });
      try {
        const result = await bridge.api.request(id, request);
        if ('error' in result) throw new TransportFailure(result.error, result.notSent);
        return result;
      } finally {
        signal.removeEventListener('abort', abort);
      }
    },
  };
}

/**
 * Browser development: Vite proxies /game to neumann-probe.net. The key is held in
 * page memory, so this mode is intended for local development only.
 */
export function proxyTransport(getKey: () => string): Transport {
  return {
    kind: 'proxy',
    async send(request, signal) {
      const key = getKey();
      if (!key) throw new TransportFailure('Not connected.', true);
      let response: Response;
      try {
        response = await fetch('/game' + request.path, {
          method: request.method,
          headers: {
            Authorization: `Bearer ${key}`,
            Accept: 'application/json',
            ...(request.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
          signal,
          cache: 'no-store',
        });
      } catch (e) {
        if (signal.aborted) throw e;
        throw new TransportFailure('No response from the game.');
      }
      const text = await response.text();
      let data: unknown = null;
      if (text.trim()) {
        try {
          data = JSON.parse(text);
        } catch {
          throw new TransportFailure(`Unreadable game response (HTTP ${response.status}).`);
        }
      }
      return {
        status: response.status,
        data,
        headers: {
          retryAfter: response.headers.get('retry-after'),
          remaining: response.headers.get('x-ratelimit-remaining'),
          reset: response.headers.get('x-ratelimit-reset'),
          limit: response.headers.get('x-ratelimit-limit'),
        },
      };
    },
  };
}
