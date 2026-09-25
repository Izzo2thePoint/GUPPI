import { useState, type ReactNode } from 'react';
import { ArrowRight, Pencil } from 'lucide-react';
import type { Coord, Movement } from '@/core/models';
import { formatCoord } from '@/core/lattice';
import { fmtDuration, secondsUntil } from '@/core/format';
import { useNow } from '@/state/hooks';
import { Dialog } from './ui/dialog';
import { Button, Input } from './ui/primitives';
import { Meter } from './ui/data';

export function RenameButton({ current, title, onSave, maxLength = 80 }: { current: string; title: string; onSave: (name: string) => Promise<unknown>; maxLength?: number }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        onClick={() => {
          setValue(current);
          setOpen(true);
        }}
        className="rounded-md p-1 text-ink-4 transition-colors hover:bg-raised hover:text-ink-2"
        aria-label={title}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!value.trim() || value.trim() === current}
              onClick={async () => {
                setBusy(true);
                try {
                  await onSave(value.trim());
                  setOpen(false);
                } catch {
                  /* toast already shown */
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <Input autoFocus value={value} maxLength={maxLength} onChange={(e) => setValue(e.target.value)} />
      </Dialog>
    </>
  );
}

export function CoordChip({ c, children }: { c?: Coord; children?: ReactNode }) {
  return (
    <span className="num inline-flex items-center gap-1 rounded-md border border-line bg-void/50 px-1.5 py-0.5 text-[11px] text-ink-2">
      {children}
      {formatCoord(c)}
    </span>
  );
}

export function MovementPanel({ movement, status }: { movement: Movement; status: string }) {
  const now = useNow(1000);
  const left = secondsUntil(movement.arrivalAt, now) ?? movement.secondsRemaining;
  const start = movement.departedAt ? Date.parse(movement.departedAt) : NaN;
  const end = movement.arrivalAt ? Date.parse(movement.arrivalAt) : NaN;
  const pct = Number.isFinite(start) && Number.isFinite(end) && end > start ? ((now - start) / (end - start)) * 100 : undefined;
  return (
    <div className="rounded-xl border border-info/20 bg-info/[0.05] p-4">
      <div className="flex items-center gap-3 text-sm">
        <CoordChip c={movement.origin} />
        <div className="relative h-px flex-1 bg-info/30">
          <div className="absolute -top-[3px] h-[7px] w-[7px] rounded-full bg-info shadow-[0_0_10px_2px_#60a5fa]" style={{ left: `${Math.min(100, Math.max(0, pct ?? 50))}%` }} />
        </div>
        <ArrowRight className="h-3.5 w-3.5 text-info" />
        <CoordChip c={movement.target} />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="font-medium capitalize text-info">{(movement.status ?? status).replaceAll('_', ' ')}</span>
        <span className="num text-ink-2">
          {movement.estimatedVelocityC !== undefined && <span className="mr-3 text-ink-3">{movement.estimatedVelocityC.toFixed(2)} c</span>}
          ETA {fmtDuration(left)}
        </span>
      </div>
      {pct !== undefined && <Meter value={pct} tone="info" className="mt-2" thin />}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export const Page = ({ children }: { children: ReactNode }) => <div className="mx-auto w-full max-w-[1400px] p-6">{children}</div>;
