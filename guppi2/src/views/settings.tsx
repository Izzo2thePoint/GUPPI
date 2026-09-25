import { Bell, Database, Gauge, Palette, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSettings, type Accent } from '@/state/settings';
import { useSession } from '@/state/session';
import { useArchive } from '@/state/archive';
import { useRoutines } from '@/state/routines';
import { Button, Card, CardBody, CardHeader, Input, Switch, cn } from '@/components/ui/primitives';
import { Page, PageHeader } from '@/components/shared';

const ACCENTS: { id: Accent; a: string; b: string }[] = [
  { id: 'cyan', a: '#38bdf8', b: '#a78bfa' },
  { id: 'violet', a: '#a78bfa', b: '#f472b6' },
  { id: 'emerald', a: '#34d399', b: '#38bdf8' },
  { id: 'amber', a: '#fbbf24', b: '#f87171' },
];

function Row({ title, text, children }: { title: string; text?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div>
        <div className="text-sm font-medium">{title}</div>
        {text && <div className="text-xs text-ink-3">{text}</div>}
      </div>
      {children}
    </div>
  );
}

function Seconds({ value, onChange, min = 5, max = 3600 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        className="num h-8 w-24 text-right"
        min={min}
        max={max}
        defaultValue={value}
        onBlur={(e) => {
          const v = Math.round(Number(e.target.value));
          if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
          e.target.value = String(Math.max(min, Math.min(max, Number.isFinite(v) ? v : value)));
        }}
      />
      <span className="text-xs text-ink-3">s</span>
    </div>
  );
}

export default function Settings() {
  const s = useSettings();
  const game = useSession((x) => x.game);
  const mode = useSession((x) => x.mode);
  const archive = useArchive();
  const routines = useRoutines((x) => x.routines);

  return (
    <Page>
      <PageHeader title="Settings" subtitle="Stored on this computer." actions={<Button variant="ghost" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => s.reset()}>Restore defaults</Button>} />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Appearance" icon={<Palette />} />
          <CardBody className="divide-y divide-line py-2">
            <Row title="Accent" text="Colours used for highlights and gauges.">
              <div className="flex gap-2">
                {ACCENTS.map((a) => (
                  <button
                    key={a.id}
                    aria-label={a.id}
                    onClick={() => s.set({ accent: a.id })}
                    className={cn('h-8 w-8 rounded-full ring-offset-2 ring-offset-panel transition-transform hover:scale-110', s.accent === a.id && 'ring-2 ring-ink')}
                    style={{ background: `linear-gradient(135deg, ${a.a}, ${a.b})` }}
                  />
                ))}
              </div>
            </Row>
            <Row title="Reduce motion" text="Turns off animations and transitions.">
              <Switch checked={s.reduceMotion} onChange={(v) => s.set({ reduceMotion: v })} />
            </Row>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Refresh & rate limits" icon={<Gauge />} subtitle="Slower polling leaves more budget for your orders." />
          <CardBody className="divide-y divide-line py-2">
            <Row title="Selected probe" text="Telemetry and sensors (faster while moving)."><Seconds value={s.pollProbe} onChange={(v) => s.set({ pollProbe: v })} /></Row>
            <Row title="Crew" text="Manny status (faster while tasks run)."><Seconds value={s.pollCrew} onChange={(v) => s.set({ pollCrew: v })} /></Row>
            <Row title="Fleet list"><Seconds value={s.pollFleet} onChange={(v) => s.set({ pollFleet: v })} min={30} /></Row>
            <Row title="Messages & alerts"><Seconds value={s.pollComms} onChange={(v) => s.set({ pollComms: v })} min={15} /></Row>
            <Row title="Minimum spacing between requests" text="Applies immediately to the live connection.">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  className="num h-8 w-24 text-right"
                  defaultValue={s.spacingMs}
                  onBlur={(e) => {
                    const v = Math.max(250, Math.min(10_000, Math.round(Number(e.target.value)) || 1200));
                    e.target.value = String(v);
                    s.set({ spacingMs: v });
                    if (game && mode !== 'simulator') game.scheduler.config.spacingMs = v;
                  }}
                />
                <span className="text-xs text-ink-3">ms</span>
              </div>
            </Row>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Safety & notifications" icon={<ShieldCheck />} />
          <CardBody className="divide-y divide-line py-2">
            <Row title="Confirm jumps" text="Ask before engaging the drive or starting a voyage.">
              <Switch checked={s.confirmMutations} onChange={(v) => s.set({ confirmMutations: v })} />
            </Row>
            <Row title="Desktop notifications" text="New alerts and failed jobs, even when GUPPI is in the background.">
              <Switch checked={s.desktopNotifications} onChange={(v) => s.set({ desktopNotifications: v })} />
            </Row>
            <div className="flex items-start gap-2 py-3 text-xs leading-relaxed text-ink-3">
              <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Orders are never re-sent automatically after an unconfirmed response. Stopping a job only prevents future orders; work the game has accepted continues.
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Local data" icon={<Database />} />
          <CardBody className="divide-y divide-line py-2">
            <Row title="Sector archive" text={`${Object.keys(archive.sectors).length} observed sectors · ${Object.keys(archive.bookmarks).length} bookmarks`}>
              <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => (archive.clear(), toast.success('Archive cleared'))}>Clear</Button>
            </Row>
            <Row title="Routines" text={`${routines.length} saved`}>
              <Button
                size="sm"
                onClick={() => {
                  const blob = new Blob([JSON.stringify({ routines, bookmarks: archive.bookmarks }, null, 2)], { type: 'application/json' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = 'guppi-backup.json';
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
              >
                Export backup
              </Button>
            </Row>
            <Row title="Version" text={window.guppi ? `Desktop ${window.guppi.version} · ${window.guppi.platform}` : 'Browser build'}>
              <span className="num text-xs text-ink-3">{__APP_VERSION__}</span>
            </Row>
          </CardBody>
        </Card>
      </div>
    </Page>
  );
}
