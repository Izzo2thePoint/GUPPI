export const fmtNumber = (v: number | undefined | null, digits = 2) =>
  typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: digits }) : '—';

export const fmtPercent = (v: number | undefined | null, digits = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(digits)}%` : '—';

export function fmtDuration(seconds: number | undefined | null): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '—';
  const s = Math.max(0, Math.round(seconds));
  const d = Math.floor(s / 86400),
    h = Math.floor((s % 86400) / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = s % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m.toString().padStart(2, '0')}m`;
  if (m) return `${m}m ${sec.toString().padStart(2, '0')}s`;
  return `${sec}s`;
}

export function fmtRelative(iso: string | number | undefined | null, now = Date.now()): string {
  if (iso === undefined || iso === null) return '—';
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const diff = (t - now) / 1000;
  const abs = Math.abs(diff);
  const unit: [Intl.RelativeTimeFormatUnit, number] =
    abs < 60 ? ['second', diff] : abs < 3600 ? ['minute', diff / 60] : abs < 86400 ? ['hour', diff / 3600] : ['day', diff / 86400];
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(Math.round(unit[1]), unit[0]);
}

export function fmtTime(iso: string | number | undefined | null) {
  if (iso === undefined || iso === null) return '—';
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

export const secondsUntil = (iso: string | undefined, now = Date.now()) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? (t - now) / 1000 : undefined;
};
