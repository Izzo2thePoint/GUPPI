/// <reference types="vite/client" />
import type { WireRequest, WireResponse } from './core/transport';

export type RemoteInfo = { enabled: boolean; running: boolean; port: number; token: string; addresses: string[]; error: string | null };

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
        set(patch: { enabled?: boolean; port?: number; regenerate?: boolean }): Promise<RemoteInfo>;
        onCall(callback: (id: string, kind: string, payload: unknown) => void): () => void;
        reply(id: string, result: { ok: true; value: unknown } | { ok: false; error: string; code?: string }): Promise<void>;
      };
      openExternal(url: string): Promise<void>;
      onMenu(callback: (action: string) => void): () => void;
    };
  }
}
export {};
