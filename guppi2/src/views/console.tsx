import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Braces, ClipboardCopy, FormInput, Play, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useGame } from '@/state/session';
import { useNav } from '@/state/nav';
import { useSelectedProbeId } from '@/state/hooks';
import { usePickers } from '@/state/pickers';
import { catalog, compile, exampleBody, groups, isRead, operation } from '@/core/catalog';
import { GameApiError, errorMessage } from '@/core/errors';
import { label } from '@/core/models';
import { Badge, Button, Card, CardBody, Empty, Field, Input, Segmented, Select, Switch, Textarea, cn } from '@/components/ui/primitives';
import { JsonView } from '@/components/ui/data';
import { SchemaForm } from '@/components/schema-form';

const METHOD_TONE: Record<string, string> = {
  GET: 'text-ok bg-ok/10',
  POST: 'text-accent bg-accent-soft',
  PATCH: 'text-warn bg-warn/10',
  DELETE: 'text-bad bg-bad/10',
};

type Result = { ok: boolean; data: unknown; ms: number; at: number; status?: number };

export default function Console() {
  const probeId = useSelectedProbeId();
  const game = useGame();
  const preset = useNav((s) => s.consoleOp);
  const [query, setQuery] = useState('');
  const [id, setId] = useState(preset ?? 'GET /api/probe/{probeId}');
  const [params, setParams] = useState<Record<string, string>>({});
  const [body, setBody] = useState<Record<string, unknown>>({});
  const [json, setJson] = useState('');
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const pickers = usePickers(probeId);
  const op = operation(id);

  useEffect(() => {
    if (preset) setId(preset);
  }, [preset]);

  useEffect(() => {
    const ex = exampleBody(op);
    setParams({ probeId });
    setBody((ex as Record<string, unknown>) ?? {});
    setJson(ex === undefined ? '' : JSON.stringify(ex, null, 2));
    setArmed(false);
    setResult(null);
  }, [id, probeId, op]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return groups
      .map((g) => ({ g, ops: catalog.filter((o) => o.group === g && (!q || `${o.id} ${o.title}`.toLowerCase().includes(q))) }))
      .filter((x) => x.ops.length);
  }, [query]);

  const payload = mode === 'form' ? body : (() => { try { return json.trim() ? JSON.parse(json) : undefined; } catch { return Symbol.for('invalid'); } })();
  const compiled = useMemo(() => {
    if (payload === Symbol.for('invalid')) return { error: 'Body is not valid JSON' };
    try {
      return { req: compile({ operation: id, params, body: op.body === null ? undefined : payload }) };
    } catch (e) {
      return { error: errorMessage(e) };
    }
  }, [id, params, payload, op.body]);

  const mutation = !isRead(id);
  const send = async () => {
    if (!('req' in compiled)) return;
    setBusy(true);
    const t = performance.now();
    try {
      const data = await game.raw({ operation: id, params, body: op.body === null ? undefined : payload }, { priority: 'user', label: `Console · ${op.title}` });
      setResult({ ok: true, data, ms: Math.round(performance.now() - t), at: Date.now() });
    } catch (e) {
      setResult({ ok: false, data: e instanceof GameApiError ? e.data : { error: errorMessage(e) }, status: e instanceof GameApiError ? e.status : undefined, ms: Math.round(performance.now() - t), at: Date.now() });
    } finally {
      setBusy(false);
      setArmed(false);
    }
  };

  const curl = () => {
    if (!('req' in compiled) || !compiled.req) return;
    const r = compiled.req;
    const cmd = [`curl -X ${r.method} 'https://neumann-probe.net${r.path}'`, `-H 'Authorization: Bearer $NEUMANN_API_KEY'`, `-H 'Accept: application/json'`, ...(r.body !== undefined ? [`-H 'Content-Type: application/json'`, `-d '${JSON.stringify(r.body)}'`] : [])].join(' \\\n  ');
    void navigator.clipboard?.writeText(cmd);
    toast.success('cURL command copied', { description: 'Your key is not included — set $NEUMANN_API_KEY.' });
  };

  return (
    <div className="grid h-full lg:grid-cols-[320px_1fr]">
      <aside className="flex min-h-0 flex-col border-r border-line bg-base/40">
        <div className="border-b border-line p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" />
            <Input className="pl-8" placeholder={`Search ${catalog.length} endpoints`} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.map(({ g, ops }) => (
            <div key={g} className="mb-3">
              <div className="px-2 pb-1 text-[12px] font-medium text-ink-3">{label(g)}</div>
              {ops.map((o) => (
                <button key={o.id} onClick={() => setId(o.id)} className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-raised', o.id === id && 'bg-raised')}>
                  <span className={cn('num w-12 shrink-0 rounded px-1 text-center text-[12px] font-semibold', METHOD_TONE[o.method])}>{o.method}</span>
                  <span className={cn('truncate', o.id === id ? 'text-ink' : 'text-ink-2')}>{o.title}</span>
                </button>
              ))}
            </div>
          ))}
          {!filtered.length && <Empty icon={<Search />} title="No endpoints match" />}
        </div>
      </aside>

      <div className="min-w-0 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-5">
          <div>
            <div className="flex items-center gap-2">
              <span className={cn('num rounded-md px-2 py-0.5 text-xs font-semibold', METHOD_TONE[op.method])}>{op.method}</span>
              <code className="num truncate text-sm text-ink-2">{op.path}</code>
            </div>
            <h1 className="mt-2 text-xl font-semibold tracking-tight">{op.title}</h1>
            {op.description && <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-3">{op.description.trim()}</p>}
          </div>

          {op.parameters.length > 0 && (
            <Card>
              <CardBody className="grid gap-3 sm:grid-cols-2">
                {op.parameters.map((p) => (
                  <Field key={p.name} label={<>{p.name}{p.required && <span className="text-accent"> *</span>} <span className="text-ink-4">· {p.in}</span></>} hint={[p.schema.type, p.schema.enum?.join(' | '), p.schema.minimum !== undefined && `≥ ${p.schema.minimum}`, p.schema.maximum !== undefined && `≤ ${p.schema.maximum}`].filter(Boolean).join(' · ')}>
                    {p.schema.enum ? (
                      <Select value={params[p.name] ?? ''} onChange={(e) => setParams({ ...params, [p.name]: e.target.value })}>
                        <option value="">—</option>
                        {p.schema.enum.map((v) => <option key={String(v)}>{String(v)}</option>)}
                      </Select>
                    ) : pickers[p.name]?.length ? (
                      <Select value={params[p.name] ?? ''} onChange={(e) => setParams({ ...params, [p.name]: e.target.value })}>
                        <option value="">Choose…</option>
                        {pickers[p.name]!.map((o) => <option key={o.value} value={o.value}>{o.label}{o.hint ? ` · ${o.hint}` : ''}</option>)}
                      </Select>
                    ) : (
                      <Input className="num" value={params[p.name] ?? ''} onChange={(e) => setParams({ ...params, [p.name]: e.target.value })} />
                    )}
                  </Field>
                ))}
              </CardBody>
            </Card>
          )}

          {op.body !== null && (
            <Card>
              <div className="flex items-center gap-3 border-b border-line px-5 py-3">
                <span className="text-sm font-semibold">Request body</span>
                <Segmented
                  className="ml-auto"
                  value={mode}
                  onChange={(m) => {
                    if (m === 'json') setJson(JSON.stringify(body, null, 2));
                    else {
                      try {
                        setBody(JSON.parse(json || '{}'));
                      } catch {
                        toast.error('Fix the JSON before switching to the form');
                        return;
                      }
                    }
                    setMode(m);
                  }}
                  options={[
                    { value: 'form', label: <span className="flex items-center gap-1.5"><FormInput className="h-3.5 w-3.5" />Form</span> },
                    { value: 'json', label: <span className="flex items-center gap-1.5"><Braces className="h-3.5 w-3.5" />JSON</span> },
                  ]}
                />
              </div>
              <CardBody>
                {mode === 'form' ? <SchemaForm schema={op.schema} value={body} onChange={setBody} pickers={pickers} /> : <Textarea className="num min-h-48 text-xs" value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} />}
              </CardBody>
            </Card>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {mutation && (
              <label className="flex items-center gap-2 rounded-xl border border-warn/25 bg-warn/[0.05] px-3 py-2 text-xs text-warn">
                <AlertTriangle className="h-3.5 w-3.5" />
                This changes game state
                <Switch checked={armed} onChange={setArmed} label="Arm request" />
              </label>
            )}
            <Button variant="primary" icon={<Play className="h-4 w-4" />} disabled={'error' in compiled || (mutation && !armed)} loading={busy} onClick={() => void send()}>
              Send request
            </Button>
            <Button variant="ghost" icon={<ClipboardCopy className="h-4 w-4" />} disabled={'error' in compiled} onClick={curl}>
              Copy as cURL
            </Button>
            {'error' in compiled && <span className="text-xs text-warn">{compiled.error}</span>}
            {'req' in compiled && compiled.req && <code className="num ml-auto truncate text-xs text-ink-4">{compiled.req.path}</code>}
          </div>

          {result && (
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs">
                <Badge tone={result.ok ? 'ok' : 'bad'}>{result.ok ? 'Success' : result.status ? `HTTP ${result.status}` : 'Error'}</Badge>
                <span className="num text-ink-3">{result.ms} ms (incl. queue)</span>
              </div>
              <JsonView value={result.data} className="max-h-[60vh]" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
