/// <reference types="vite/client" />
import type { WireRequest, WireResponse } from './core/transport';

export type AgentScope = 'off' | 'read' | 'control';
/** `bind` is the address the PC listens on ('' = every network); `addresses` lists the PC's LAN/Tailscale addresses. */
export type RemoteInfo = { enabled: boolean; running: boolean; port: number; token: string; addresses: string[]; error: string | null; agents: AgentScope; dangerous: boolean; bind: string };
export type UpdateCheck = { current: string; latest?: string; url?: string; newer?: boolean; publishedAt?: string; error?: string };

declare global {
  const __APP_VERSION__: string;
  interface Window {
    guppi?: {
      platform: string;
      version: string;
      auth: {
        connect(key: string, remember: boolean): Promise<{ ok: true } | { ok: false; error: string }>;
        status(): Promise<{ connected: boolean; remembered: boolean }>;
        disconnect(forget: boolean): Promise<void>;
      };
      api: {
        request(id: string, request: WireRequest): Promise<WireResponse | { error: string; notSent: boolean }>;
        cancel(id: string): Promise<void>;
      };
      notify(title: string, body: string): Promise<void>;
      remote?: {
        get(): Promise<RemoteInfo>;
        set(patch: { enabled?: boolean; port?: number; regenerate?: boolean; agents?: AgentScope; dangerous?: boolean; bind?: string }): Promise<RemoteInfo>;
        onCall(callback: (id: string, kind: string, payload: unknown) => void): () => void;
        reply(id: string, result: { ok: true; value: unknown } | { ok: false; error: string; code?: string }): Promise<void>;
        emit?(event: unknown): Promise<void>;
      };
      openExternal(url: string): Promise<void>;
      /** Asks GitHub for the latest release. Manual only; absent in builds older than 2.8. */
      checkForUpdates?(): Promise<UpdateCheck>;
      onMenu(callback: (action: string) => void): () => void;
    };
  }
}
export {};
