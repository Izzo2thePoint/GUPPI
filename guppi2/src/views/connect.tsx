import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, FlaskConical, KeyRound, ShieldCheck, Sparkles, Workflow, Zap } from 'lucide-react';
import { isDesktop, useSession } from '@/state/session';
import { Logo } from '@/components/bits';
import { Button, ErrorNote, Input, Switch } from '@/components/ui/primitives';

export function Connect() {
  const { connect, status, error } = useSession();
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(false);
  const desktop = isDesktop();
  const busy = status === 'connecting';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (key.trim()) void connect(desktop ? 'desktop' : 'proxy', key, remember).catch(() => undefined);
  };

  return (
    <div className="bg-starfield relative grid h-full overflow-hidden lg:grid-cols-[1.1fr_1fr]">
      <OrbitArt />
      <div className="app-drag absolute inset-x-0 top-0 z-20 h-10" />
      <div className="relative z-10 hidden flex-col justify-between p-12 lg:flex">
        <div className="flex items-center gap-3">
          <Logo size={36} />
          <div>
            <div className="text-lg font-semibold tracking-tight">GUPPI</div>
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-3">Mission Control · v2</div>
          </div>
        </div>
        <div className="max-w-xl">
          <h1 className="text-[44px] font-semibold leading-[1.05] tracking-[-0.03em]">
            Command your <span className="text-gradient">Von Neumann</span> fleet.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
            A calm, fast cockpit for Neumann Probe — every documented API endpoint, a rate-limit-aware request engine, and automation that never double-sends an order.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3">
            {[
              [Zap, 'Priority request lane', 'Your clicks jump ahead of background polling.'],
              [ShieldCheck, 'Safe by design', 'Mutations are never retried blindly.'],
              [Workflow, 'Automation', 'Craft queues, voyages, mining runs, routines.'],
              [Sparkles, 'Every endpoint', 'A schema-driven API console built in.'],
            ].map(([Icon, t, d]) => {
              const I = Icon as typeof Zap;
              return (
                <div key={t as string} className="glass rounded-xl p-4">
                  <I className="h-4 w-4 text-accent" />
                  <div className="mt-2 text-sm font-medium">{t as string}</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-ink-3">{d as string}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="text-xs text-ink-4">Independent fan-made companion. Not affiliated with neumann-probe.net.</div>
      </div>

      <div className="relative z-10 flex items-center justify-center p-6">
        <div className="glass w-full max-w-[420px] animate-rise rounded-2xl p-7">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <Logo size={32} />
            <div className="text-lg font-semibold">GUPPI</div>
          </div>
          <div className="text-xl font-semibold tracking-tight">Connect to your probe</div>
          <p className="mt-1 text-sm text-ink-3">Use your personal API key from your game account settings.</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-4" />
              <Input
                autoFocus
                type={show ? 'text' : 'password'}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Personal API key"
                className="h-11 pl-9 pr-10 font-mono text-[13px]"
                autoComplete="off"
                spellCheck={false}
              />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-3 hover:text-ink" aria-label={show ? 'Hide key' : 'Show key'}>
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {desktop && (
              <label className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white/[0.02] px-3.5 py-3">
                <div>
                  <div className="text-sm font-medium">Remember on this computer</div>
                  <div className="text-xs text-ink-3">Encrypted with your operating system’s keychain.</div>
                </div>
                <Switch checked={remember} onChange={setRemember} label="Remember key" />
              </label>
            )}
            {error && <ErrorNote error={error} />}
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={!key.trim()}>
              Connect <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-ink-4">
            <div className="h-px flex-1 bg-line-strong" /> or <div className="h-px flex-1 bg-line-strong" />
          </div>
          <Button variant="secondary" size="lg" className="w-full" disabled={busy} onClick={() => void connect('simulator', '').catch(() => undefined)} icon={<FlaskConical className="h-4 w-4 text-accent-2" />}>
            Explore with the simulator
          </Button>
          <p className="mt-3 text-center text-xs text-ink-4">A fully offline universe — nothing is sent to the game.</p>
          {!desktop && (
            <p className="mt-5 rounded-lg border border-warn/20 bg-warn/[0.06] px-3 py-2 text-xs leading-relaxed text-warn/90">
              Browser development mode: requests go through the local Vite proxy and your key stays in page memory. Use the desktop app for everyday play.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function OrbitArt() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-[30%] top-1/2 h-[900px] w-[900px] -translate-x-1/2 -translate-y-1/2 opacity-60">
        {[1, 0.78, 0.56, 0.34].map((s, i) => (
          <div
            key={i}
            className="absolute inset-0 m-auto animate-orbit rounded-full border border-white/[0.05]"
            style={{ width: `${s * 100}%`, height: `${s * 100}%`, animationDuration: `${40 + i * 25}s`, animationDirection: i % 2 ? 'reverse' : 'normal' }}
          >
            <div className="absolute -top-1 left-1/2 h-2 w-2 rounded-full bg-accent shadow-[0_0_16px_4px_var(--accent)]" style={{ opacity: 0.4 + i * 0.15 }} />
          </div>
        ))}
      </div>
      {Array.from({ length: 70 }, (_, i) => (
        <div
          key={i}
          className="absolute h-px w-px rounded-full bg-white"
          style={{ left: `${(i * 37.3) % 100}%`, top: `${(i * 61.7) % 100}%`, opacity: 0.15 + ((i * 13) % 50) / 100, transform: `scale(${1 + (i % 3)})` }}
        />
      ))}
    </div>
  );
}
