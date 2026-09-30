import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, FlaskConical, KeyRound } from 'lucide-react';
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
    <div className="bg-base relative grid h-full overflow-hidden lg:grid-cols-[1.1fr_1fr]">
      <OrbitArt />
      <div className="app-drag absolute inset-x-0 top-0 z-20 h-10" />
      <div className="relative z-10 hidden flex-col justify-between p-12 lg:flex">
        <div className="flex items-center gap-3">
          <Logo size={34} />
          <div className="text-[19px] font-semibold tracking-[-0.01em]">GUPPI</div>
        </div>
        <div className="max-w-[34rem]">
          <h1 className="text-[42px] font-semibold leading-[1.08] tracking-[-0.03em]">Mission control for your Neumann Probe fleet.</h1>
          <p className="mt-4 max-w-[60ch] text-[15px] leading-relaxed text-ink-2">
            Fly the fleet, run the crew and keep outposts mining while you are away. Every order goes through one careful request lane, so nothing is ever sent twice.
          </p>
          <dl className="mt-9 grid max-w-md grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-[13.5px]">
            {[
              ['68', 'documented game endpoints, validated before they leave'],
              ['1', 'request lane: your clicks first, then automation, then refreshes'],
              ['0', 'blind retries of an order the game might already have'],
            ].map(([n, t]) => (
              <div key={t} className="contents">
                <dt className="num text-right text-[20px] font-semibold leading-6 text-accent">{n}</dt>
                <dd className="leading-6 text-ink-2">{t}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="text-[12px] text-ink-3">Independent fan-made companion. Not affiliated with neumann-probe.net.</div>
      </div>

      <div className="relative z-10 flex items-center justify-center p-6">
        <div className="w-full max-w-[420px] rounded-xl border border-line-strong bg-panel p-7">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <Logo size={32} />
            <div className="text-lg font-semibold">GUPPI</div>
          </div>
          <h2 className="text-[21px] font-semibold tracking-[-0.02em]">Connect to your probe</h2>
          <p className="mt-1 text-[13.5px] text-ink-3">Use the personal API key from your game account settings.</p>

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
              <label className="flex items-center justify-between gap-3 rounded-lg border border-line bg-chrome px-3.5 py-3">
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

          <div className="my-6 flex items-center gap-3 text-[12px] text-ink-3">
            <div className="h-px flex-1 bg-line-strong" /> or <div className="h-px flex-1 bg-line-strong" />
          </div>
          <Button variant="secondary" size="lg" className="w-full" disabled={busy} onClick={() => void connect('simulator', '').catch(() => undefined)} icon={<FlaskConical className="h-4 w-4 text-ink-3" />}>
            Explore with the simulator
          </Button>
          <p className="mt-3 text-center text-[12.5px] text-ink-3">A fully offline universe. Nothing is sent to the game.</p>
          {!desktop && (
            <p className="mt-5 rounded-lg border border-warn/30 bg-warn/[0.07] px-3 py-2 text-[12.5px] leading-relaxed text-warn">
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
            className="absolute inset-0 m-auto animate-orbit rounded-full border border-line"
            style={{ width: `${s * 100}%`, height: `${s * 100}%`, animationDuration: `${40 + i * 25}s`, animationDirection: i % 2 ? 'reverse' : 'normal' }}
          >
            <div className="absolute -top-[3px] left-1/2 h-1.5 w-1.5 rounded-full bg-accent" style={{ opacity: 0.45 + i * 0.15 }} />
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
