import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Eye, EyeOff, FlaskConical, Globe, KeyRound, Monitor } from 'lucide-react';
import { useSession } from '@/state/session';
import { Logo } from '@/components/bits';
import { Button, ErrorNote, Field, Input, Segmented, Switch, cn } from '@/components/ui/primitives';
import { connectMobile, defaultDirectBase, detectHostedRelay, forgetConnection, savedConnection, servedByPc, takePairingToken } from './connection';

type Via = 'pc' | 'direct';

export function MobileConnect() {
  const status = useSession((s) => s.status);
  const error = useSession((s) => s.error);
  const busy = status === 'connecting';
  const [via, setVia] = useState<Via>(servedByPc() ? 'pc' : 'direct');
  const [pcUrl, setPcUrl] = useState(servedByPc() ? location.origin : '');
  const [token, setToken] = useState('');
  const [key, setKey] = useState('');
  const [relay, setRelay] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [autoError, setAutoError] = useState<string | null>(null);
  const [hosted, setHosted] = useState(false);
  const tried = useRef(false);

  useEffect(() => {
    void detectHostedRelay().then(setHosted);
  }, []);

  // Paired from the QR code, or reopening a saved connection: connect straight away.
  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    const paired = takePairingToken();
    const saved = savedConnection();
    const auto = paired ? { mode: 'remote' as const, base: location.origin, secret: paired } : saved;
    if (!auto) return;
    if (auto.mode === 'remote') {
      setVia('pc');
      setPcUrl(auto.base);
      setToken(auto.secret);
    }
    connectMobile(auto, true).catch((e) => {
      setAutoError(e instanceof Error ? e.message : String(e));
      if (!paired) forgetConnection();
    });
  }, []);

  const connectPc = () => {
    // Accept a whole pairing link pasted from the PC, or just the code.
    const fromLink = token.match(/pair=([A-Za-z0-9_-]{16,})/)?.[1];
    const base = (pcUrl || location.origin).replace(/\/+$/, '').replace(/#.*$/, '');
    void connectMobile({ mode: 'remote', base, secret: fromLink ?? token.trim() }, remember).catch(() => undefined);
  };
  const connectDirect = () =>
    void connectMobile({ mode: 'direct', base: relay.trim().replace(/\/+$/, '') || (hosted ? location.origin : defaultDirectBase), secret: key.trim() }, remember).catch(() => undefined);
  const mixedContent = via === 'pc' && location.protocol === 'https:' && pcUrl.startsWith('http:');

  return (
    <div className="bg-base min-h-[100dvh] overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+28px)]">
      <div className="mx-auto max-w-md">
        <div className="flex items-center gap-3">
          <Logo size={40} />
          <div>
            <div className="text-xl font-semibold tracking-tight">GUPPI Mobile</div>
            <div className="text-[13px] text-ink-3">Mission control for Neumann Probe</div>
          </div>
        </div>

        {/* A PC-served page may only talk to that PC (strict CSP), so direct mode lives on the hosted app. */}
        {!servedByPc() && <Segmented<Via>
          className="mt-8 w-full [&>button]:h-9 [&>button]:flex-1"
          value={via}
          onChange={setVia}
          options={[
            { value: 'pc', label: <span className="flex items-center justify-center gap-1.5"><Monitor className="h-3.5 w-3.5" />My PC</span> },
            { value: 'direct', label: <span className="flex items-center justify-center gap-1.5"><Globe className="h-3.5 w-3.5" />Direct</span> },
          ]}
        />}

        <div className={cn('surface rounded-2xl p-5', servedByPc() ? 'mt-8' : 'mt-4')}>
          {via === 'pc' ? (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-ink-2">
                Control GUPPI running on your PC. Jobs and outposts keep running there, and your game key stays on the PC.
              </p>
              {!servedByPc() && (
                <Field label="PC address" hint="Shown under Settings → Phone & agent access on the PC, e.g. http://192.168.1.20:47811">
                  <Input value={pcUrl} onChange={(e) => setPcUrl(e.target.value)} placeholder="http://192.168.1.20:47811" inputMode="url" autoCapitalize="off" autoCorrect="off" className="h-11" />
                </Field>
              )}
              <Field label="Pairing code" hint="Easiest: scan the QR code in GUPPI on your PC with the Camera app.">
                <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Pairing link or code" autoCapitalize="off" autoCorrect="off" className="num h-11 text-xs" />
              </Field>
              {mixedContent && (
                <div className="rounded-xl border border-warn/25 bg-warn/[0.06] px-3 py-2 text-xs leading-relaxed text-warn">
                  This page is secure (https) and your PC link is not, so iOS will block it. Open the pairing link from your PC’s QR code instead.
                </div>
              )}
              <Button variant="primary" size="lg" className="w-full" loading={busy} disabled={!token.trim() || (!servedByPc() && !pcUrl.trim())} onClick={connectPc}>
                Connect to my PC <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-ink-2">
                Talk to the game straight from this phone with your personal API key. Automations only run while the app is open.
              </p>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-4" />
                <Input
                  type={show ? 'text' : 'password'}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="Personal API key"
                  autoCapitalize="off"
                  autoCorrect="off"
                  className="num h-11 pl-9 pr-10 text-[13px]"
                />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-ink-3" aria-label={show ? 'Hide key' : 'Show key'}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {hosted ? (
                <p className="text-xs leading-relaxed text-ink-3">Game calls go through this site’s own relay. It passes your key along and stores nothing.</p>
              ) : (
                <details className="text-xs text-ink-3">
                  <summary className="cursor-pointer">Use a relay</summary>
                  <p className="mt-2 leading-relaxed">If the game refuses browser connections, deploy the tiny relay from the GUPPI repo (relay/README.md) and enter its address, or open GUPPI Mobile from the relay’s own address.</p>
                  <Input className="mt-2 h-10" value={relay} onChange={(e) => setRelay(e.target.value)} placeholder="https://guppi-relay.example.workers.dev" inputMode="url" autoCapitalize="off" autoCorrect="off" />
                </details>
              )}
              <Button variant="primary" size="lg" className="w-full" loading={busy} disabled={!key.trim()} onClick={connectDirect}>
                Connect <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}
          <label className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4 text-sm">
            <span>
              Remember on this phone
              <div className="text-xs text-ink-3">{via === 'pc' ? 'Keeps the pairing code.' : 'Stores your key in this browser’s storage.'}</div>
            </span>
            <Switch checked={remember} onChange={setRemember} label="Remember" />
          </label>
          {(error || autoError) && <div className="mt-4"><ErrorNote error={error ?? autoError} /></div>}
        </div>

        <Button variant="secondary" size="lg" className="mt-4 w-full" disabled={busy} icon={<FlaskConical className="h-4 w-4 text-ink-3" />} onClick={() => void connectMobile({ mode: 'simulator' }, false).catch(() => undefined)}>
          Try the simulator
        </Button>
        <p className="mt-6 text-center text-xs leading-relaxed text-ink-4">
          Tip: in Safari tap Share → Add to Home Screen to use GUPPI like an app.
        </p>
      </div>
    </div>
  );
}
