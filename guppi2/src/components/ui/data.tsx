import { useState, type ReactNode } from 'react';
import { ChevronRight, Copy, Check } from 'lucide-react';
import { cn, type Tone } from './primitives';

// ── Ring gauge ───────────────────────────────────────────────────────────
export function Ring({ value, size = 88, stroke = 7, tone, children }: { value?: number; size?: number; stroke?: number; tone?: Tone; children?: ReactNode }) {
  const v = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const auto: Tone = tone ?? (v >= 60 ? 'ok' : v >= 30 ? 'warn' : 'bad');
  const color = { neutral: '#6b7790', accent: 'var(--accent)', ok: '#34d399', warn: '#fbbf24', bad: '#f87171', info: '#60a5fa' }[auto];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgb(148 163 184 / 0.1)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * v) / 100}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(.2,.8,.2,1)', filter: `drop-shadow(0 0 6px ${color}55)` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

// ── Meter ────────────────────────────────────────────────────────────────
export function Meter({ value, max = 100, tone = 'accent', className, thin }: { value?: number; max?: number; tone?: Tone; className?: string; thin?: boolean }) {
  const pct = typeof value === 'number' && max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const color = {
    neutral: 'bg-ink-3',
    accent: 'bg-[linear-gradient(90deg,var(--accent),var(--accent-2))]',
    ok: 'bg-ok',
    warn: 'bg-warn',
    bad: 'bg-bad',
    info: 'bg-info',
  }[tone];
  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-white/[0.06]', thin ? 'h-1' : 'h-1.5', className)}>
      <div className={cn('h-full rounded-full transition-[width] duration-700 ease-out', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Stat tile ────────────────────────────────────────────────────────────
export function Stat({ label, value, sub, icon, tone, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: Tone; className?: string }) {
  const color = tone ? { neutral: 'text-ink', accent: 'text-accent', ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', info: 'text-info' }[tone] : 'text-ink';
  return (
    <div className={cn('rounded-xl border border-line bg-white/[0.015] px-4 py-3', className)}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3 [&>svg]:h-3.5 [&>svg]:w-3.5">
        {icon}
        {label}
      </div>
      <div className={cn('num mt-1.5 text-xl font-semibold', color)}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-ink-3">{sub}</div>}
    </div>
  );
}

// ── Key/value list ───────────────────────────────────────────────────────
export function KV({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-ink-3">{k}</dt>
          <dd className="min-w-0 truncate text-right text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── JSON viewer ──────────────────────────────────────────────────────────
function JsonNode({ name, value, depth }: { name?: string; value: unknown; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const isObj = value !== null && typeof value === 'object';
  const key = name !== undefined && <span className="text-[#93c5fd]">{name}</span>;
  if (!isObj) {
    const cls = typeof value === 'string' ? 'text-[#86efac]' : typeof value === 'number' ? 'text-[#fcd34d]' : typeof value === 'boolean' ? 'text-[#f0abfc]' : 'text-ink-3';
    return (
      <div className="pl-4">
        {key}
        {key && <span className="text-ink-4">: </span>}
        <span className={cls}>{typeof value === 'string' ? `"${value}"` : String(value)}</span>
      </div>
    );
  }
  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value as object);
  const [o, c] = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
  return (
    <div className="pl-4">
      <button onClick={() => setOpen(!open)} className="-ml-4 inline-flex items-center hover:text-ink">
        <ChevronRight className={cn('h-3 w-3 text-ink-4 transition-transform', open && 'rotate-90')} />
        <span className="ml-1">
          {key}
          {key && <span className="text-ink-4">: </span>}
          <span className="text-ink-4">
            {o}
            {!open && <span className="px-1 text-ink-3">{entries.length} {Array.isArray(value) ? 'items' : 'keys'}</span>}
            {!open && c}
          </span>
        </span>
      </button>
      {open && (
        <>
          {entries.map(([k, v]) => (
            <JsonNode key={k} name={Array.isArray(value) ? undefined : k} value={v} depth={depth + 1} />
          ))}
          <div className="text-ink-4">{c}</div>
        </>
      )}
    </div>
  );
}

export function JsonView({ value, className }: { value: unknown; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={cn('relative overflow-auto rounded-xl border border-line bg-void/70 p-3 font-mono text-[12px] leading-5 text-ink-2', className)}>
      <button
        className="absolute right-2 top-2 rounded-md border border-line bg-raised p-1.5 text-ink-3 hover:text-ink"
        onClick={() => {
          void navigator.clipboard?.writeText(JSON.stringify(value, null, 2));
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        aria-label="Copy JSON"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <div className="-ml-4">
        <JsonNode value={value} depth={0} />
      </div>
    </div>
  );
}

// ── Sparkline ────────────────────────────────────────────────────────────
export function Sparkline({ values: raw, className, height = 28 }: { values: number[]; className?: string; height?: number }) {
  const values = raw.filter(Number.isFinite);
  if (values.length < 2) return <div className={className} style={{ height }} />;
  const w = 120;
  const max = Math.max(...values, 1),
    min = Math.min(...values, 0);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${height - ((v - min) / (max - min || 1)) * (height - 4) - 2}`);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={cn('w-full', className)} style={{ height }}>
      <defs>
        <linearGradient id="spark" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts.join(' ')} ${w},${height}`} fill="url(#spark)" />
      <polyline points={pts.join(' ')} fill="none" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
