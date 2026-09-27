/**
 * GUPPI relay: a tiny Cloudflare Worker that lets GUPPI Mobile talk to the
 * Neumann Probe API from a phone browser when the game does not accept
 * cross-site browser requests (CORS).
 *
 * • Forwards only /api/* requests, only to the fixed game host.
 * • Holds no key: the phone sends its own key on every request and the relay
 *   passes it through. Nothing is stored and nothing is logged.
 * • ALLOWED_ORIGINS (optional, comma separated) limits which pages may use it,
 *   e.g. "https://you.github.io". Leave it unset to allow any page.
 * • Deployed with wrangler.toml it also hosts GUPPI Mobile itself (static
 *   assets are served before this code runs), so the phone app and the relay
 *   share one https address and need no CORS at all.
 */
const GAME_ORIGIN = 'https://neumann-probe.net';
const METHODS = new Set(['GET', 'POST', 'PATCH', 'DELETE']);
const MAX_BODY = 64_000;
const PASS_REQUEST = ['authorization', 'content-type', 'accept'];
const PASS_RESPONSE = ['content-type', 'retry-after', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset'];
const PATH = /^\/api\/[A-Za-z0-9_\-/]*$/;

function allowedOrigin(request, env) {
  const origin = request.headers.get('origin');
  // No Origin: not a cross-site browser call (the app's own GETs, curl, …).
  if (!origin) return '*';
  // The relay's own site (GUPPI Mobile served from here) is always allowed.
  if (origin === new URL(request.url).origin) return origin;
  const list = (env?.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (!list.length) return origin;
  return list.includes(origin) ? origin : null;
}

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
    'Access-Control-Expose-Headers': 'Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function reply(status, message, origin) {
  return new Response(JSON.stringify({ error: { code: 'relay', message } }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(origin ? cors(origin) : {}) },
  });
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    if (!origin) return reply(403, 'This relay does not accept requests from this page.', null);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/') return reply(200, 'GUPPI relay is running.', origin);
    // GUPPI Mobile asks this to find out it can use its own site as the relay.
    if (request.method === 'GET' && url.pathname === '/relay-info')
      return new Response(JSON.stringify({ guppiRelay: 1 }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(origin) } });
    if (!METHODS.has(request.method)) return reply(405, 'Method not allowed.', origin);
    if (!PATH.test(url.pathname) || url.pathname.includes('//')) return reply(404, 'Only game API paths are relayed.', origin);

    const headers = new Headers();
    for (const name of PASS_REQUEST) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    let body;
    if (request.method !== 'GET') {
      body = await request.text();
      if (body.length > MAX_BODY) return reply(413, 'Request body is too large.', origin);
      if (!body) body = undefined;
    }

    let upstream;
    try {
      upstream = await fetch(GAME_ORIGIN + url.pathname + url.search, { method: request.method, headers, body, redirect: 'manual' });
    } catch {
      return reply(502, 'The game did not answer.', origin);
    }
    if (upstream.status >= 300 && upstream.status < 400) return reply(502, 'The game answered with a redirect, which the relay does not follow.', origin);

    const out = new Headers({ 'Cache-Control': 'no-store', ...cors(origin) });
    for (const name of PASS_RESPONSE) {
      const value = upstream.headers.get(name);
      if (value) out.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};
