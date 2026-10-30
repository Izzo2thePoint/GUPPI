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
  readonly kind: 'desktop' | 'proxy' | 'simulator' | 'remote' | 'direct';
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

const rateHeaders = (h: Headers): RateHeaders => ({
  retryAfter: h.get('retry-after'),
  remaining: h.get('x-ratelimit-remaining'),
  reset: h.get('x-ratelimit-reset'),
  limit: h.get('x-ratelimit-limit'),
});

/** Plain HTTPS to a game-compatible base URL with the key in page memory. */
function httpTransport(kind: 'proxy' | 'direct', base: string, getKey: () => string, blockedHint?: string): Transport {
  return {
    kind,
    async send(request, signal) {
      const key = getKey();
      if (!key) throw new TransportFailure('Not connected.', true);
      let response: Response;
      try {
        response = await fetch(base + request.path, {
          method: request.method,
          headers: {
            Authorization: `Bearer ${key}`,
            Accept: 'application/json',
            ...(request.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
          signal,
          cache: 'no-store',
          redirect: 'error',
        });
      } catch (e) {
        if (signal.aborted) throw e;
        throw new TransportFailure(blockedHint ?? 'No response from the game.');
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
      return { status: response.status, data, headers: rateHeaders(response.headers) };
    },
  };
}

/**
 * Browser development: Vite proxies /game to neumann-probe.net. The key is held in
 * page memory, so this mode is intended for local development only.
 */
export function proxyTransport(getKey: () => string): Transport {
  return httpTransport('proxy', '/game', getKey);
}

export const GAME_ORIGIN = 'https://neumann-probe.net';

/**
 * Phone standalone mode: straight to the game (or a relay the player deploys when
 * the game does not accept browser requests from other sites).
 */
export function directTransport(base: string, getKey: () => string): Transport {
  const hint =
    base === GAME_ORIGIN
      ? 'No response from the game. If this keeps happening, the game may not accept direct browser connections — connect through your PC or a relay instead.'
      : 'No response from the relay. Check its address.';
  return httpTransport('direct', base.replace(/\/+$/, ''), getKey, hint);
}

export class PairingRejected extends TransportFailure {
  constructor() {
    super('Your PC rejected this phone. Pair again from GUPPI on the PC (Settings → Phone & agent access).', true);
    this.name = 'PairingRejected';
  }
}

/**
 * Phone remote mode: requests go to GUPPI on the player's PC, which runs them
 * through its own scheduler with the key it keeps. The phone never sees the key.
 */
export function remoteTransport(base: string, token: string): Transport {
  const root = base.replace(/\/+$/, '');
  return {
    kind: 'remote',
    async send(request, signal) {
      let response: Response;
      try {
        response = await fetch(`${root}/remote/v1/game`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
          signal,
          cache: 'no-store',
        });
      } catch (e) {
        if (signal.aborted) throw e;
        throw new TransportFailure('Your PC did not answer. Is GUPPI running and the phone on the same network?');
      }
      if (response.status === 401) throw new PairingRejected();
      if (response.status === 503) throw new TransportFailure('GUPPI on your PC is not connected to the game. Open it and connect first.', true);
      const out = (await response.json().catch(() => null)) as (WireResponse & { error?: string; notSent?: boolean; uncertain?: boolean }) | null;
      if (!out) throw new TransportFailure('Unreadable reply from your PC.');
      if (out.error) throw new TransportFailure(out.error, out.notSent === true && !out.uncertain);
      return { status: out.status, data: out.data, headers: out.headers ?? { retryAfter: null, remaining: null, reset: null, limit: null } };
    },
  };
}
