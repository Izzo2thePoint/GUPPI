import { Bell, Database, Gauge, Palette, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSettings } from '@/state/settings';
import { DEFAULT_THEME, useDefaultTheme, useThemes } from '@/state/theme';
import { ThemePicker } from '@/components/theme-picker';
import { useSession } from '@/state/session';
import { useArchive } from '@/state/archive';
import { useRoutines } from '@/state/routines';
import { Button, Card, CardBody, CardHeader, Input, Switch } from '@/components/ui/primitives';
import { Page, PageHeader } from '@/components/shared';
import { PhoneRemoteCard } from '@/components/phone-remote';

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
  const defaultTheme = useDefaultTheme();
  const setTheme = useThemes((x) => x.set);
  const game = useSession((x) => x.game);
  const mode = useSession((x) => x.mode);
  const archive = useArchive();
  const routines = useRoutines((x) => x.routines);

  return (
    <Page>
      <PageHeader title="Settings" subtitle="Stored on this computer." actions={<Button variant="ghost" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => (s.reset(), useThemes.getState().clear(DEFAULT_THEME))}>Restore defaults</Button>} />
      <div className="grid gap-5 xl:grid-cols-2">
        <PhoneRemoteCard />
        <Card>
          <CardHeader title="Appearance" icon={<Palette />} />
          <CardBody className="divide-y divide-line py-2">
            <div className="py-4">
              <div className="mb-3">
                <div className="text-[13.5px] font-medium">Default colours</div>
                <div className="text-[12.5px] text-ink-3">For probes without their own colours. Give a probe its own in Fleet → Colours.</div>
              </div>
              <ThemePicker value={defaultTheme} onChange={(t) => setTheme(DEFAULT_THEME, t)} />
            </div>
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
