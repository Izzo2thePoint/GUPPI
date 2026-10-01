/**
 * Renders sensor data exactly as the game reports it. The API adds fields over
 * time, so nothing is hidden: every property is shown with a readable label,
 * and absent values are never presented as zero or as a confirmed absence.
 */
import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import type { SectorObject } from '@/core/models';
import { cn } from './ui/primitives';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

const LABELS: Record<string, string> = {
  id: 'ID',
  scutNetworks: 'SCUT networks',
  scutCoverageStatus: 'SCUT coverage',
  resourceAmounts: 'Resource amounts (ECE)',
  resourceTypes: 'Resources',
  massSolar: 'Mass (solar masses)',
  stellarMass: 'Stellar mass',
  minableTargets: 'Mineable bodies',
  bookmarkTargets: 'Waypoint targets',
  mannyMineable: 'Manny mineable',
  probes: 'Detected probes',
  objects: 'Detected objects',
  estimatedObjects: 'Estimated signals',
  possibleObjects: 'Possible objects',
  relativeCoordinates: 'Coordinates',
  knowledgeLevel: 'Knowledge level',
  dataFreshness: 'Data freshness',
  temperatureK: 'Temperature (K)',
  habitabilityScore: 'Habitability score',
  navigationalRisk: 'Navigational risk',
};

export function fieldLabel(key: string) {
  return LABELS[key] ?? key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase()).replace(/\bscut\b/gi, 'SCUT');
}

const ENUM_FIELDS = new Set(['type', 'status', 'knowledgeLevel', 'dataFreshness', 'scutCoverageStatus', 'mode', 'dangerLevel', 'motorFuelStatus', 'navigationalRisk']);

function titleOf(v: unknown, i: number) {
  if (!isObj(v)) return `Entry ${i + 1}`;
  return String(v.name ?? v.label ?? v.title ?? (v.type ? fieldLabel(String(v.type)) : `Object ${i + 1}`));
}

export function Scalar({ value, field }: { value: unknown; field?: string }) {
  if (value === null || value === undefined) return <span className="text-ink-4">Not reported</span>;
  if (typeof value === 'boolean') return <span className={value ? 'text-ok' : 'text-ink-3'}>{value ? 'Yes' : 'No'}</span>;
  if (typeof value === 'number') return <span className="num">{Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>;
  if (typeof value === 'string') return <span>{field && ENUM_FIELDS.has(field) ? fieldLabel(value) : value || 'Empty'}</span>;
  return <span>{String(value)}</span>;
}

function Value({ value, field, depth }: { value: unknown; field?: string; depth: number }) {
  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-ink-4">None reported</span>;
    if (value.every((v) => !isObj(v) && !Array.isArray(v)))
      return (
        <span className="flex flex-wrap justify-end gap-1">
          {value.map((v, i) => (
            <span key={i} className="rounded-md border border-line bg-chrome px-1.5 py-0.5 text-[12px]">
              <Scalar value={v} field={field === 'resourceTypes' ? 'type' : field} />
            </span>
          ))}
        </span>
      );
    return (
      <div className="mt-2 space-y-2">
        {value.map((item, i) =>
          isObj(item) ? <Section key={i} title={titleOf(item, i)} value={item} depth={depth + 1} /> : <Value key={i} value={item} depth={depth + 1} />,
        )}
      </div>
    );
  }
  if (isObj(value)) return Object.keys(value).length ? <Fields value={value} depth={depth + 1} /> : <span className="text-ink-4">No details reported</span>;
  return <Scalar value={value} field={field} />;
}

export function Fields({ value, depth = 0, skip = [] }: { value: Obj; depth?: number; skip?: string[] }) {
  const entries = Object.entries(value).filter(([k]) => !skip.includes(k));
  const scalars = entries.filter(([, v]) => !isObj(v) && !(Array.isArray(v) && v.some((x) => isObj(x))));
  const nested = entries.filter(([, v]) => isObj(v) || (Array.isArray(v) && v.some((x) => isObj(x))));
  return (
    <div className="space-y-2">
      {scalars.length > 0 && (
        <dl className="grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
          {scalars.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1">
              <dt className="shrink-0 text-ink-3">{fieldLabel(k)}</dt>
              <dd className="min-w-0 text-right text-ink-2">
                <Value value={v} field={k} depth={depth} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {nested.map(([k, v]) => (
        <Section key={k} title={`${fieldLabel(k)}${Array.isArray(v) ? ` · ${v.length}` : ''}`} value={v} depth={depth + 1} field={k} />
      ))}
    </div>
  );
}

function Section({ title, value, depth, field }: { title: ReactNode; value: unknown; depth: number; field?: string }) {
  const [open, setOpen] = useState(depth < 3);
  return (
    <div className="rounded-lg border border-line bg-chrome">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium text-ink-2 hover:text-ink">
        <ChevronRight className={cn('h-3 w-3 text-ink-4 transition-transform', open && 'rotate-90')} />
        {title}
      </button>
      {open && (
        <div className="px-3 pb-3">
          <Value value={value} field={field} depth={depth} />
        </div>
      )}
    </div>
  );
}

// ── Compact facts for list rows ────────────────────────────────────────────

const HIDDEN_FACTS = new Set(['id', 'name', 'type', 'label', 'minableTargets', 'bookmarkTargets', 'planets', 'moons', 'stars', 'objects', 'resourceTypes', 'resourceAmounts', 'description', 'summary']);

/** Short "key: value" chips for every scalar fact on a body — effects, hazards, habitability, etc. */
export function factChips(o: SectorObject, max = 8): { key: string; text: string; tone?: 'ok' | 'warn' | 'bad' }[] {
  const chips: { key: string; text: string; tone?: 'ok' | 'warn' | 'bad' }[] = [];
  for (const [k, v] of Object.entries(o.raw)) {
    if (HIDDEN_FACTS.has(k) || v === null || v === undefined) continue;
    let text: string | undefined;
    if (typeof v === 'boolean') text = v ? fieldLabel(k) : undefined;
    else if (typeof v === 'number') text = `${fieldLabel(k)} ${Number.isInteger(v) ? v : +v.toFixed(3)}`;
    else if (typeof v === 'string' && v.length <= 40) text = `${fieldLabel(k)}: ${ENUM_FIELDS.has(k) || /^[a-z]+(_[a-z]+)+$/.test(v) ? fieldLabel(v) : v}`;
    else if (Array.isArray(v) && v.length && v.every((x) => typeof x === 'string')) text = `${fieldLabel(k)}: ${(v as string[]).map(fieldLabel).join(', ')}`;
    else if (isObj(v) && Object.values(v).every((x) => typeof x !== 'object')) text = `${fieldLabel(k)}: ${Object.entries(v).map(([a, b]) => `${fieldLabel(a)} ${b}`).join(', ')}`;
    if (!text) continue;
    const tone = /danger|hazard|risk|radiation|storm|damage|hostile|black.?hole|extreme/i.test(`${k} ${v}`) ? (/(low|none|false)$/i.test(String(v)) ? undefined : 'bad') : /habitab|inhabited|refuel|station/i.test(k) && v ? 'ok' : undefined;
    chips.push({ key: k, text, tone });
    if (chips.length >= max) break;
  }
  return chips;
}
