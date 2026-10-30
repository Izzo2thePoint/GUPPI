import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Bot, Copy, KeyRound, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import type { AgentScope, RemoteInfo } from '@/env';
import { Badge, Button, Card, CardBody, CardHeader, Input, Segmented, Select, Switch } from './ui/primitives';
import { Confirm } from './ui/dialog';

/** Desktop settings card: remote access for the phone app and for scripts and AI agents (the Agent API). */
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
        <CardHeader title="Phone & agent access" icon={<Smartphone />} />
        <CardBody className="text-sm text-ink-3">Available in the desktop app. Your PC hosts GUPPI Mobile for your phone and the Agent API for scripts and AI tools.</CardBody>
      </Card>
    );

  const update = async (patch: { enabled?: boolean; port?: number; regenerate?: boolean; agents?: AgentScope; dangerous?: boolean }) => {
    setBusy(true);
    try {
      const next = await bridge.set(patch);
      setInfo(next);
      if (next.error) toast.error('Phone & agent access', { description: next.error });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="xl:col-span-2">
      <CardHeader
        title="Phone & agent access"
        subtitle="Control GUPPI from your iPhone or Android phone, or let scripts and AI agents drive it. Automations keep running here on the PC; your game key never leaves it."
        icon={<Smartphone />}
        actions={
          <>
            {info?.running ? <Badge tone="ok" dot>On · port {info.port}</Badge> : <Badge>Off</Badge>}
            <Switch checked={!!info?.enabled} onChange={(v) => void update({ enabled: v })} label="Enable remote access" />
          </>
        }
      />
      {info?.enabled && info.running ? (
        <>
        <CardBody className="grid gap-6 md:grid-cols-[240px_1fr]">
          <div className="rounded-2xl bg-white p-2">{qr ? <img src={qr} alt="Pairing QR code" className="h-auto w-full" /> : <div className="aspect-square" />}</div>
          <div className="space-y-4 text-sm">
            <ol className="list-decimal space-y-1.5 pl-5 text-ink-2">
              <li>Put your phone (iPhone or Android) on the same Wi-Fi as this PC.</li>
              <li>Open its camera, point it at the code, then tap the link.</li>
              <li>
                Add it to the home screen: in Safari tap <b>Share → Add to Home Screen</b>; in Chrome on Android tap the menu → <b>Add to Home screen</b>. GUPPI Mobile opens full-screen from then on.
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
              Away from home? Install <b>Tailscale</b> on this PC and your phone, then choose the 100.x address above. Anyone holding the pairing link can control GUPPI; “Unpair all phones” revokes it.
            </p>
          </div>
        </CardBody>
        <CardBody className="space-y-4 border-t border-line text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-medium">
              <Bot className="h-4 w-4 text-ink-3" />
              AI agents &amp; scripts
              {info.agents !== 'off' && <Badge tone={info.agents === 'control' ? 'warn' : 'ok'}>{info.agents === 'control' ? 'Control' : 'Read-only'}</Badge>}
            </div>
            <Segmented<AgentScope>
              value={info.agents}
              onChange={(v) => void update({ agents: v })}
              options={[
                { value: 'off', label: 'Off' },
                { value: 'read', label: 'Read-only' },
                { value: 'control', label: 'Control' },
              ]}
            />
          </div>
          <p className="text-xs leading-relaxed text-ink-3">
            The <b>Agent API</b> on this same port lets the <code className="mono">guppi</code> command line, the <code className="mono">guppi-mcp</code> server (Claude, Cursor and other MCP tools) and your own scripts read the fleet and, with Control, give orders. Everything runs through GUPPI's request lane below your own clicks, is validated against the game's API, and shows in Activity under the agent's name.
          </p>
          {info.agents !== 'off' && (
            <>
              <label className="flex items-center justify-between gap-3">
                <span>
                  Allow dangerous actions
                  <div className="text-xs text-ink-3">Firing missiles, jettison, assembling a probe, detaching or dropping containers, asteroid launches. Needs Control. Off: agents get a refusal that tells them to ask you.</div>
                </span>
                <Switch checked={info.dangerous} onChange={(v) => void update({ dangerous: v })} />
              </label>
              <div className="grid gap-2 text-xs">
                <Snippet label="Pair the command line" text={`guppi pair "${link}"`} />
                <Snippet
                  label="MCP server (Claude Desktop, Claude Code, Cursor…)"
                  text={JSON.stringify({ mcpServers: { guppi: { command: 'guppi-mcp', env: { GUPPI_URL: `http://${host}:${info.port}`, GUPPI_TOKEN: info.token } } } }, null, 2)}
                />
                <div className="text-ink-3">
                  Install with <code className="mono">npm install -g guppi-cli-&lt;version&gt;.tgz</code> from the release, or <code className="mono">npm install -g ./guppi2/cli</code> from the repository. The API spec is at <code className="mono">http://{host}:{info.port}/api/v1/openapi.json</code>.
                </div>
              </div>
            </>
          )}
        </CardBody>
        </>
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

function Snippet({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-lg border border-line bg-chrome">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5">
        <span className="text-ink-2">{label}</span>
        <Button
          size="xs"
          variant="ghost"
          icon={<Copy className="h-3.5 w-3.5" />}
          onClick={() => {
            void navigator.clipboard?.writeText(text);
            toast.success('Copied', { description: 'The token inside grants access to GUPPI. Keep it to your own tools.' });
          }}
        >
          Copy
        </Button>
      </div>
      <pre className="mono overflow-x-auto whitespace-pre-wrap break-all px-3 py-2 text-[11.5px] leading-relaxed text-ink-2">{text}</pre>
    </div>
  );
}
