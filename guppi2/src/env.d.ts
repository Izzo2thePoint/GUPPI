/// <reference types="vite/client" />
import type { WireRequest, WireResponse } from './core/transport';

declare global {
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
      openExternal(url: string): Promise<void>;
      onMenu(callback: (action: string) => void): () => void;
    };
  }
}
export {};
