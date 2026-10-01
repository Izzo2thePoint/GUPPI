/**
 * Colour themes. One accent carries actions, selection, focus and "this probe"
 * markers; everything else is tinted neutral surfaces and semantic colours (see
 * DESIGN.md). Each probe can have its own theme, applied while it is in command
 * and on its Fleet card.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CSSProperties } from 'react';
import { safeStorage, useSettings } from './settings';

export type AccentId = 'ion' | 'solar' | 'aurora' | 'nebula' | 'comet' | 'helium';

export const ACCENTS: { id: AccentId; name: string; l: number; c: number; h: number }[] = [
  { id: 'ion', name: 'Ion', l: 0.78, c: 0.11, h: 250 },
  { id: 'solar', name: 'Solar', l: 0.78, c: 0.14, h: 52 },
  { id: 'aurora', name: 'Aurora', l: 0.82, c: 0.12, h: 170 },
  { id: 'nebula', name: 'Nebula', l: 0.76, c: 0.13, h: 292 },
  { id: 'comet', name: 'Comet', l: 0.77, c: 0.12, h: 350 },
  { id: 'helium', name: 'Helium', l: 0.86, c: 0.015, h: 250 },
];

export type ProbeTheme = {
  accent: AccentId | 'custom';
  /** Hue (0–360) for a custom accent. */
  hue?: number;
  /** Tint the neutral surfaces with the accent hue instead of deep-space blue. */
  tinted?: boolean;
};

const LEGACY: Record<string, AccentId> = { cyan: 'ion', violet: 'nebula', emerald: 'aurora', amber: 'solar' };
export const accentId = (v: string | undefined): AccentId => (ACCENTS.some((a) => a.id === v) ? (v as AccentId) : (LEGACY[v ?? ''] ?? 'ion'));

const clampHue = (h: unknown) => (typeof h === 'number' && Number.isFinite(h) ? ((Math.round(h) % 360) + 360) % 360 : 222);

function accentLch(t: ProbeTheme) {
  if (t.accent === 'custom') return { l: 0.78, c: 0.13, h: clampHue(t.hue) };
  return ACCENTS.find((a) => a.id === t.accent) ?? ACCENTS[0];
}

/** CSS custom properties for a theme; set on :root or scoped to one element. */
export function themeVars(t: ProbeTheme): Record<string, string> {
  const { l, c, h } = accentLch(t);
  const accent = `oklch(${l} ${c} ${h})`;
  return {
    '--accent': accent,
    '--accent-hover': `oklch(${Math.min(0.94, l + 0.05)} ${c} ${h})`,
    '--accent-ink': `oklch(0.2 ${Math.min(c, 0.05)} ${h})`,
    '--tint-h': String(t.tinted ? h : 255),
    '--tint-c': t.tinted ? String(Math.min(0.02, Math.max(0.008, c * 0.14))) : '0.012',
  };
}

export const themeStyle = (t: ProbeTheme) => themeVars(t) as CSSProperties;

type ThemeState = {
  probes: Record<string, ProbeTheme>;
  set: (probeId: string, theme: ProbeTheme) => void;
  clear: (probeId: string) => void;
};

const valid = (t: unknown): t is ProbeTheme => {
  const o = t as ProbeTheme;
  return !!o && typeof o === 'object' && (o.accent === 'custom' || ACCENTS.some((a) => a.id === o.accent));
};

export const useThemes = create<ThemeState>()(
  persist(
    (set) => ({
      probes: {},
      set: (probeId, theme) => set((s) => ({ probes: { ...s.probes, [probeId]: { accent: theme.accent, hue: theme.accent === 'custom' ? clampHue(theme.hue) : undefined, tinted: !!theme.tinted } } })),
      clear: (probeId) =>
        set((s) => {
          const probes = { ...s.probes };
          delete probes[probeId];
          return { probes };
        }),
    }),
    {
      name: 'guppi2.themes',
      storage: safeStorage,
      version: 1,
      merge: (persisted, current) => {
        const raw = (persisted as { probes?: Record<string, unknown> })?.probes ?? {};
        const probes = Object.fromEntries(Object.entries(raw).filter(([, t]) => valid(t))) as Record<string, ProbeTheme>;
        return { ...current, probes };
      },
    },
  ),
);

/** Key under which the app-wide default theme is stored. */
export const DEFAULT_THEME = '*';

/** The app-wide default theme (Settings → Appearance); older saves only had an accent name. */
export function useDefaultTheme(): ProbeTheme {
  const saved = useThemes((s) => s.probes[DEFAULT_THEME]);
  const legacy = accentId(useSettings((s) => s.accent));
  return saved ?? { accent: legacy };
}

/** The theme a probe shows: its own, else the app default. */
export function useProbeTheme(probeId: string | null | undefined): ProbeTheme {
  const own = useThemes((s) => (probeId ? s.probes[probeId] : undefined));
  const fallback = useDefaultTheme();
  return own ?? fallback;
}

/** Apply the theme of the probe in command to the whole window. */
export function applyTheme(t: ProbeTheme, el: HTMLElement = document.documentElement) {
  for (const [k, v] of Object.entries(themeVars(t))) el.style.setProperty(k, v);
}
