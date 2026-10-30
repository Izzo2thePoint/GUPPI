/**
 * The Agent API: what scripts, the `guppi` CLI and the MCP server can read and
 * do through GUPPI. The verb table lives in `cli/verbs.json` so the CLI and
 * MCP server ship the same list; this module validates calls against it and
 * renders it as OpenAPI.
 */
import verbs from '../../cli/verbs.json';

export type Scope = 'off' | 'read' | 'control';

type Schema = {
  type?: string;
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  enum?: unknown[];
  minimum?: number;
  description?: string;
};

export type ReadVerb = { name: string; path: string; query?: string[]; description: string };
export type ActionVerb = { name: string; description: string; dangerous?: boolean; params: Schema };

export const AGENT_READS: ReadVerb[] = verbs.reads as unknown as ReadVerb[];
export const AGENT_ACTIONS: ActionVerb[] = verbs.actions as unknown as ActionVerb[];
/** Game operations an agent may only send when dangerous actions are allowed (matched against the path). */
export const DANGEROUS_OPERATIONS: string[] = verbs.dangerousOperations;

export class AgentError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const typeOf = (v: unknown) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);

/** A small JSON-schema check: types, required keys, enums and minimums; enough to catch a malformed order before it is sent. */
export function validate(schema: Schema | undefined, value: unknown, at = 'body'): void {
  if (!schema) return;
  if (schema.type) {
    const t = typeOf(value);
    const ok = schema.type === 'integer' ? t === 'number' && Number.isInteger(value) : schema.type === 'number' ? t === 'number' && Number.isFinite(value) : t === schema.type;
    if (!ok) throw new AgentError(400, 'invalid_params', `${at} must be ${schema.type === 'integer' ? 'an integer' : `a ${schema.type}`}.`);
  }
  if (schema.enum && !schema.enum.includes(value)) throw new AgentError(400, 'invalid_params', `${at} must be one of ${schema.enum.map(String).join(', ')}.`);
  if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) throw new AgentError(400, 'invalid_params', `${at} must be at least ${schema.minimum}.`);
  if (schema.type === 'object' && value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    for (const k of schema.required ?? []) if (o[k] === undefined) throw new AgentError(400, 'invalid_params', `${at}.${k} is required.`);
    for (const [k, sub] of Object.entries(schema.properties ?? {})) if (o[k] !== undefined) validate(sub, o[k], `${at}.${k}`);
  }
  if (schema.type === 'array' && Array.isArray(value) && schema.items) value.forEach((v, i) => validate(schema.items, v, `${at}[${i}]`));
}

export const actionVerb = (name: string) => AGENT_ACTIONS.find((a) => a.name === name);

/** The API as an OpenAPI 3.1 document, for agents that read specs. */
export function openapiSpec(version: string, serverUrl = 'http://127.0.0.1:47811') {
  const paths: Record<string, unknown> = {};
  for (const r of AGENT_READS) {
    const params = [...(r.path.match(/\{(\w+)\}/g) ?? []).map((m) => ({ name: m.slice(1, -1), in: 'path', required: true, schema: { type: 'string' } })), ...(r.query ?? []).map((q) => ({ name: q, in: 'query', required: false, schema: { type: 'string' } }))];
    paths[r.path] = { get: { operationId: r.name, summary: r.description, parameters: params, responses: { '200': { description: 'OK' } } } };
  }
  for (const a of AGENT_ACTIONS) {
    paths[`/api/v1/actions/${a.name}`] = {
      post: {
        operationId: a.name.replace(/-(\w)/g, (_, c: string) => c.toUpperCase()),
        summary: a.description + (a.dangerous ? ' Requires dangerous actions to be allowed in GUPPI.' : ''),
        requestBody: { required: true, content: { 'application/json': { schema: a.params } } },
        responses: { '200': { description: 'Accepted; the body says what started (jobId) or what the game answered.' }, '403': { description: 'Scope too low or dangerous actions not allowed.' } },
      },
    };
  }
  paths['/api/v1/game'] = {
    post: {
      operationId: 'game',
      summary: "Send any documented Neumann Probe API request through GUPPI's request lane (validated, rate-limited, never retried blindly). Mutations need control scope; dangerous operations need dangerous actions allowed.",
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['method', 'path'], properties: { method: { type: 'string' }, path: { type: 'string', description: 'The game path, e.g. /api/probe/1/sector' }, body: { type: 'object' } } } } } },
      responses: { '200': { description: 'The game response as { status, data }, or { error, uncertain } when the outcome could not be confirmed.' } },
    },
  };
  return {
    openapi: '3.1.0',
    info: {
      title: 'GUPPI Agent API',
      version,
      description:
        'Local API of GUPPI, the Neumann Probe mission-control app. Every call needs `Authorization: Bearer <token>` (the pairing token from Settings → Phone & agent access). Reads need read scope; actions need control scope. Game calls go through the same request lane as the player: validated against the documented API, rate-limit aware, and never re-sent blindly. Send `X-GUPPI-Client: <your name>` so the Activity log attributes your calls.',
    },
    servers: [{ url: serverUrl }],
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
    security: [{ bearer: [] }],
    paths,
  };
}
