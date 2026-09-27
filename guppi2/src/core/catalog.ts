/**
 * The documented Neumann Probe API, captured from https://neumann-probe.net/api-docs.
 *
 * Every request GUPPI sends is compiled against this catalog: unknown operations,
 * missing path parameters, malformed bodies and invalid sector parity are rejected
 * locally, before anything reaches the game.
 */
import raw from './catalog.json';

export type Schema = {
  type?: string;
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  nullable?: boolean;
  description?: string;
  additionalProperties?: boolean;
};

export type Parameter = {
  name: string;
  in: 'path' | 'query' | string;
  required?: boolean;
  schema: Schema;
  example?: unknown;
};

export type Operation = {
  id: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  title: string;
  description: string;
  group: string;
  parameters: Parameter[];
  schema: Schema;
  body: unknown;
};

export const catalog = raw as unknown as Operation[];
const byId = new Map(catalog.map((op) => [op.id, op]));

export type OperationId = string;

export type Command = {
  operation: OperationId;
  params?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
};

export type CompiledRequest = {
  op: Operation;
  method: Operation['method'];
  path: string;
  body?: unknown;
};

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function operation(id: OperationId): Operation {
  const op = byId.get(id);
  if (!op) throw new ValidationError(`Unknown API operation "${id}".`);
  return op;
}

export const isRead = (id: OperationId) => id.startsWith('GET ');

export function validateValue(value: unknown, s: Schema, label = 'body'): void {
  if (value === null && s.nullable) return;
  if (s.enum && !s.enum.includes(value)) throw new ValidationError(`${label}: choose one of ${s.enum.join(', ')}`);
  if (s.type === 'object' || s.properties) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(`${label} must be an object`);
    for (const key of s.required ?? []) if (!(key in value)) throw new ValidationError(`${label}.${key} is required`);
    for (const [key, v] of Object.entries(value)) {
      const child = s.properties?.[key];
      if (child) validateValue(v, child, `${label}.${key}`);
      else if (s.additionalProperties === false) throw new ValidationError(`${label}.${key} is not a documented field`);
    }
  }
  if (s.type === 'string') {
    if (typeof value !== 'string') throw new ValidationError(`${label} must be text`);
    if (s.minLength !== undefined && value.length < s.minLength) throw new ValidationError(`${label} needs at least ${s.minLength} characters`);
    if (s.maxLength !== undefined && value.length > s.maxLength) throw new ValidationError(`${label} allows at most ${s.maxLength} characters`);
  }
  if (s.type === 'integer' || s.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (s.type === 'integer' && !Number.isInteger(value)))
      throw new ValidationError(`${label} must be ${s.type === 'integer' ? 'a whole number' : 'a number'}`);
    if (s.minimum !== undefined && value < s.minimum) throw new ValidationError(`${label} must be at least ${s.minimum}`);
    if (s.maximum !== undefined && value > s.maximum) throw new ValidationError(`${label} must be at most ${s.maximum}`);
  }
  if (s.type === 'boolean' && typeof value !== 'boolean') throw new ValidationError(`${label} must be true or false`);
  if (s.type === 'array') {
    if (!Array.isArray(value)) throw new ValidationError(`${label} must be a list`);
    if (s.minItems !== undefined && value.length < s.minItems) throw new ValidationError(`${label} needs at least ${s.minItems} items`);
    if (s.maxItems !== undefined && value.length > s.maxItems) throw new ValidationError(`${label} allows at most ${s.maxItems} items`);
    if (s.items) value.forEach((item, i) => validateValue(item, s.items!, `${label}[${i}]`));
  }
}

const PATH_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;

function coerceQuery(value: string, schema: Schema): unknown {
  if (schema.type === 'integer' || schema.type === 'number') return Number(value);
  if (schema.type === 'boolean') return value === 'true' || value === '1' ? true : value === 'false' || value === '0' ? false : value;
  return value;
}

/** Sectors live on a face-centred cubic lattice: x + y + z must be even. */
export const validSectorParity = (x: number, y: number, z: number) => (x + y + z) % 2 === 0;

export function compile(command: Command): CompiledRequest {
  const op = operation(command.operation);
  let path = op.path;
  const query = new URLSearchParams();
  for (const p of op.parameters) {
    const rawValue = command.params?.[p.name];
    if (rawValue === undefined || rawValue === '') {
      if (p.required) throw new ValidationError(`${p.name} is required`);
      continue;
    }
    const value = String(rawValue);
    if (p.schema.type === 'integer' && !/^-?\d+$/.test(value)) throw new ValidationError(`${p.name} must be a whole number`);
    if (p.in === 'path') {
      if (!PATH_SEGMENT.test(value)) throw new ValidationError(`${p.name} contains invalid characters`);
      path = path.replaceAll(`{${p.name}}`, encodeURIComponent(value));
    } else if (p.in === 'query') {
      validateValue(coerceQuery(value, p.schema), p.schema, p.name);
      query.set(p.name, value);
    }
  }
  if (path.includes('{')) throw new ValidationError('Fill in every path parameter');
  if (!path.startsWith('/api/')) throw new ValidationError('Invalid API path');

  const hasBody = op.body !== null;
  if (hasBody) validateValue(command.body ?? {}, op.schema);

  if (op.method === 'POST' && op.path.endsWith('/move')) {
    const t = (command.body as { target?: { x: number; y: number; z: number } })?.target;
    if (!t || !validSectorParity(t.x, t.y, t.z)) throw new ValidationError('A sector requires X + Y + Z to be even.');
  }
  if (op.path === '/api/sector') {
    const { x, y, z } = command.params ?? {};
    if ([x, y, z].every((v) => v !== undefined) && !validSectorParity(Number(x), Number(y), Number(z)))
      throw new ValidationError('A sector requires X + Y + Z to be even.');
  }

  return {
    op,
    method: op.method,
    path: path + (query.size ? `?${query}` : ''),
    ...(hasBody ? { body: command.body ?? {} } : {}),
  };
}

/** Build an example body from the schema, used by the API console and forms. */
export function exampleBody(op: Operation): unknown {
  if (op.body === null) return undefined;
  const make = (s: Schema): unknown => {
    if (s.enum?.length) return s.enum[0];
    switch (s.type) {
      case 'object':
        return Object.fromEntries(
          Object.entries(s.properties ?? {})
            .filter(([k]) => (s.required ?? []).includes(k))
            .map(([k, v]) => [k, make(v)]),
        );
      case 'array':
        return s.items ? [make(s.items)] : [];
      case 'integer':
      case 'number':
        return s.minimum ?? 0;
      case 'boolean':
        return false;
      case 'string':
        return '';
      default:
        return s.properties ? make({ ...s, type: 'object' }) : null;
    }
  };
  return op.body && typeof op.body === 'object' ? op.body : make(op.schema);
}

export const groups = [...new Set(catalog.map((op) => op.group))].sort((a, b) => a.localeCompare(b));

// ── Wire → command ───────────────────────────────────────────────────────────

type Template = { op: Operation; re: RegExp; names: string[]; literal: number };
const escapeRe = (s: string) => s.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
const TEMPLATES: Template[] = catalog
  .map((op) => {
    const parts = op.path.split(/\{([^}]+)\}/);
    const names = parts.filter((_, i) => i % 2 === 1);
    const re = new RegExp('^' + parts.map((p, i) => (i % 2 ? '([A-Za-z0-9_-]{1,128})' : escapeRe(p))).join('') + '$');
    return { op, re, names, literal: parts.filter((_, i) => i % 2 === 0).join('').length };
  })
  // Prefer the most literal template, e.g. /mannies/tasks over /mannies/{mannyId}.
  .sort((a, b) => b.literal - a.literal);

/**
 * Turn a raw HTTP request (method + path + body) back into a documented
 * Command. Used by the phone remote so its requests run through the PC's own
 * scheduler and validation. Anything that is not a documented operation, or
 * carries undocumented query parameters, is rejected.
 */
export function parseWire(request: { method: string; path: string; body?: unknown }): Command {
  if (typeof request?.method !== 'string' || typeof request.path !== 'string') throw new ValidationError('Invalid request.');
  const url = new URL(request.path, 'http://wire.local');
  if (url.origin !== 'http://wire.local' || !url.pathname.startsWith('/api/')) throw new ValidationError('Only game API paths are allowed.');
  for (const t of TEMPLATES) {
    if (t.op.method !== request.method) continue;
    const m = url.pathname.match(t.re);
    if (!m) continue;
    const params: Record<string, string> = {};
    t.names.forEach((n, i) => (params[n] = m[i + 1]));
    const queryNames = new Set(t.op.parameters.filter((p) => p.in === 'query').map((p) => p.name));
    for (const [k, v] of url.searchParams) {
      if (!queryNames.has(k)) throw new ValidationError(`Undocumented query parameter "${k}".`);
      params[k] = v;
    }
    const command: Command = { operation: t.op.id, params, ...(t.op.body !== null ? { body: request.body ?? {} } : {}) };
    compile(command); // full validation, including body schema and sector parity
    return command;
  }
  throw new ValidationError(`${request.method} ${url.pathname} is not a documented game API operation.`);
}
