/**
 * Renders a form from the API's JSON schema. Fields named like game ids
 * (objectId, containerId, mannyId…) can be given pickers so the user chooses
 * from live data instead of typing identifiers.
 */
import type { Schema } from '@/core/catalog';
import { label as human } from '@/core/models';
import { Field, Input, Select, Switch, cn } from './ui/primitives';

export type Option = { value: string; label: string; hint?: string };
export type Pickers = Record<string, Option[] | undefined>;

type Props = {
  schema: Schema;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  pickers?: Pickers;
  /** Hide fields (e.g. deprecated aliases). */
  hide?: string[];
};

export function SchemaForm({ schema, value, onChange, pickers = {}, hide = [] }: Props) {
  const props = Object.entries(schema.properties ?? {}).filter(([k, s]) => !hide.includes(k) && (s.type !== undefined || s.properties || s.enum));
  if (!props.length) return <div className="text-sm text-ink-3">This action needs no additional details.</div>;
  const required = new Set(schema.required ?? []);
  const set = (k: string, v: unknown) => {
    const next = { ...value };
    if (v === undefined || v === '') delete next[k];
    else next[k] = v;
    onChange(next);
  };
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {props.map(([k, s]) => (
          <FieldFor key={k} name={k} schema={s} required={required.has(k)} value={value[k]} onChange={(v) => set(k, v)} options={pickers[k]} pickers={pickers} />
        ))}
    </div>
  );
}

function FieldFor({
  name,
  schema: s,
  required,
  value,
  onChange,
  options,
  pickers,
}: {
  name: string;
  schema: Schema;
  required: boolean;
  value: unknown;
  onChange: (v: unknown) => void;
  options?: Option[];
  pickers: Pickers;
}) {
  const title = (
    <>
      {human(name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())}
      {required && <span className="ml-0.5 text-accent">*</span>}
    </>
  );
  const hint = [s.description, s.minimum !== undefined && `min ${s.minimum}`, s.maximum !== undefined && `max ${s.maximum}`].filter(Boolean).join(' · ') || undefined;

  if (s.type === 'object' || s.properties) {
    const v = (value as Record<string, unknown>) ?? {};
    return (
      <div className="col-span-full rounded-xl border border-line p-3.5">
        <div className="mb-3 text-xs font-medium text-ink-2">{title}</div>
        <SchemaForm schema={s} value={v} onChange={(x) => onChange(Object.keys(x).length ? x : undefined)} pickers={pickers} />
      </div>
    );
  }

  if (s.type === 'array' && (s.items?.enum || options)) {
    const choices: Option[] = options ?? (s.items!.enum as string[]).map((e) => ({ value: String(e), label: human(e) }));
    const selected = new Set(Array.isArray(value) ? (value as string[]) : []);
    return (
      <Field label={title} hint={hint} className="col-span-full">
        <div className="flex flex-wrap gap-1.5">
          {choices.map((c) => {
            const on = selected.has(c.value);
            return (
              <button
                type="button"
                key={c.value}
                onClick={() => {
                  const next = new Set(selected);
                  if (on) next.delete(c.value);
                  else next.add(c.value);
                  onChange(next.size ? [...next] : undefined);
                }}
                className={cn(
                  'h-7 rounded-lg border px-2.5 text-xs transition-colors',
                  on ? 'border-accent/50 bg-accent-soft text-accent' : 'border-line-strong text-ink-3 hover:text-ink-2',
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </Field>
    );
  }

  if (s.type === 'array') {
    const text = Array.isArray(value) ? (value as unknown[]).join(', ') : '';
    const numeric = s.items?.type === 'integer' || s.items?.type === 'number';
    return (
      <Field label={title} hint={hint ?? 'Comma-separated'} className="col-span-full">
        <Input
          defaultValue={text}
          onBlur={(e) => {
            const parts = e.target.value.split(',').map((x) => x.trim()).filter(Boolean);
            onChange(parts.length ? (numeric ? parts.map(Number) : parts) : undefined);
          }}
        />
      </Field>
    );
  }

  if (s.type === 'boolean') {
    return (
      <Field label={title} hint={hint}>
        <div className="flex h-9 items-center">
          <Switch checked={value === true} onChange={(v) => onChange(v)} label={name} />
        </div>
      </Field>
    );
  }

  if (s.enum || options) {
    const choices: Option[] = options ?? (s.enum as unknown[]).map((e) => ({ value: String(e), label: human(e) }));
    return (
      <Field label={title} hint={hint}>
        <Select
          value={value === undefined ? '' : String(value)}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === '' ? undefined : s.type === 'integer' || s.type === 'number' ? Number(raw) : raw);
          }}
        >
          <option value="">{required ? 'Choose…' : '—'}</option>
          {choices.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
              {c.hint ? ` · ${c.hint}` : ''}
            </option>
          ))}
        </Select>
      </Field>
    );
  }

  if (s.type === 'integer' || s.type === 'number') {
    return (
      <Field label={title} hint={hint}>
        <Input
          type="number"
          className="num"
          step={s.type === 'integer' ? 1 : 'any'}
          min={s.minimum}
          max={s.maximum}
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      </Field>
    );
  }

  return (
    <Field label={title} hint={hint} className={name === 'body' || name === 'content' ? 'col-span-full' : undefined}>
      <Input value={typeof value === 'string' ? value : ''} maxLength={s.maxLength} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}
