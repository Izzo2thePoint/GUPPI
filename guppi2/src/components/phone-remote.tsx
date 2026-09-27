import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, KeyRound, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import type { RemoteInfo } from '@/env';
import { Badge, Button, Card, CardBody, CardHeader, Input, Select, Switch } from './ui/primitives';
import { Confirm } from './ui/dialog';

/** Desktop settings card: turn on the phone remote and pair an iPhone by QR code. */
export function PhoneRemoteCard() {
  const bridge = window.guppi?.remote;
  const [info, setInfo] = useState<RemoteInfo | null>(null);
  const [address, setAddress] = useState('');
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    void bridge?.get().then(setInfo);
  }, [bridge]);

  const host = address || info?.addresses[0] || '';
  // The token travels in the #fragment: browsers never send it to the server.
  const link = info && host ? `http://${host}:${info.port}/#pair=${info.token}` : '';

  useEffect(() => {
    if (!link) return setQr('');
    void QRCode.toDataURL(link, { margin: 1, width: 240, color: { dark: '#0a0e17', light: '#ffffff' } }).then(setQr);
  }, [link]);

  if (!bridge)
    return (
      <Card>
        <CardHeader title="Phone remote" icon={<Smartphone />} />
        <CardBody className="text-sm text-ink-3">Available in the desktop app. Your PC hosts GUPPI Mobile for your iPhone.</CardBody>
      </Card>
    );

  const update = async (patch: { enabled?: boolean; port?: number; regenerate?: boolean }) => {
    setBusy(true);
    try {
      const next = await bridge.set(patch);
      setInfo(next);
      if (next.error) toast.error('Phone remote', { description: next.error });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="xl:col-span-2">
      <CardHeader
        title="Phone remote"
        subtitle="Control GUPPI from your iPhone. Automations keep running here on the PC; your game key never leaves it."
        icon={<Smartphone />}
        actions={
          <>
            {info?.running ? <Badge tone="ok" dot>On · port {info.port}</Badge> : <Badge>Off</Badge>}
            <Switch checked={!!info?.enabled} onChange={(v) => void update({ enabled: v })} label="Enable phone remote" />
          </>
        }
      />
      {info?.enabled && info.running ? (
        <CardBody className="grid gap-6 md:grid-cols-[240px_1fr]">
          <div className="rounded-2xl bg-white p-2">{qr ? <img src={qr} alt="Pairing QR code" className="h-auto w-full" /> : <div className="aspect-square" />}</div>
          <div className="space-y-4 text-sm">
            <ol className="list-decimal space-y-1.5 pl-5 text-ink-2">
              <li>Put your iPhone on the same Wi-Fi as this PC.</li>
              <li>Open the Camera app and point it at the code, then tap the link.</li>
              <li>
                In Safari tap <b>Share → Add to Home Screen</b>. GUPPI Mobile opens full-screen from then on.
              </li>
            </ol>
            <div className="flex flex-wrap items-center gap-2">
              {info.addresses.length > 1 && (
                <Select value={host} onChange={(e) => setAddress(e.target.value)} className="h-8 w-48 text-xs">
                  {info.addresses.map((a) => (
                    <option key={a} value={a}>
                      {a}
                      {a.startsWith('100.') ? ' (Tailscale)' : ''}
                    </option>
                  ))}
                </Select>
              )}
              <Button
                size="sm"
                icon={<Copy className="h-3.5 w-3.5" />}
                disabled={!link}
                onClick={() => {
                  void navigator.clipboard?.writeText(link);
                  toast.success('Pairing link copied', { description: 'Anyone with this link can control GUPPI. Only send it to your own devices.' });
                }}
              >
                Copy pairing link
              </Button>
              <Button size="sm" variant="ghost" icon={<KeyRound className="h-3.5 w-3.5" />} onClick={() => setConfirmReset(true)}>
                Unpair all phones
              </Button>
            </div>
            <div className="flex items-center gap-2 text-xs text-ink-3">
              Port
              <Input
                type="number"
                className="num h-8 w-24 text-right"
                defaultValue={info.port}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isInteger(v) && v >= 1024 && v <= 65535 && v !== info.port) void update({ port: v });
                }}
              />
              <span>Allow it in Windows Firewall if your phone can’t connect.</span>
            </div>
            <p className="text-xs leading-relaxed text-ink-3">
              Away from home? Install <b>Tailscale</b> on this PC and your iPhone, then choose the 100.x address above. Anyone holding the pairing link can control GUPPI; “Unpair all phones” revokes it.
            </p>
          </div>
        </CardBody>
      ) : (
        <CardBody className="text-sm text-ink-3">
          {info?.error ?? 'Turn this on to host GUPPI Mobile on your network. Nothing is reachable until you do.'}
        </CardBody>
      )}
      <Confirm
        open={confirmReset}
        onOpenChange={setConfirmReset}
        danger
        title="Unpair all phones?"
        body="Every phone using the current pairing link loses access. Scan the new code to pair again."
        confirmLabel="Unpair"
        onConfirm={() => update({ regenerate: true })}
      />
      {busy && <span className="sr-only">Saving…</span>}
    </Card>
  );
}
