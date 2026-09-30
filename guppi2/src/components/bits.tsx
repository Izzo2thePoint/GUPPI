import { Asterisk, Box, CircleDot, Cloud, Globe2, Hexagon, Orbit, Radar, Rocket, Satellite, Skull, Sparkles, Sun, Waypoints } from 'lucide-react';
import { Badge, type Tone } from './ui/primitives';
import { label } from '@/core/models';

export function statusTone(status?: string): Tone {
  if (!status) return 'neutral';
  if (['idle', 'orbiting'].includes(status)) return 'ok';
  if (['preparing', 'accelerating', 'cruising', 'decelerating'].includes(status)) return 'info';
  if (['out_of_scut_range', 'unknown'].includes(status)) return 'neutral';
  if (['dead', 'destroyed', 'disabled', 'trapped_by_black_hole'].includes(status)) return 'bad';
  return 'warn';
}

export function ProbeStatus({ status }: { status?: string }) {
  return (
    <Badge tone={statusTone(status)} dot>
      {label(status ?? 'unknown')}
    </Badge>
  );
}

export function taskTone(task?: string | null): Tone {
  if (task === null) return 'ok';
  if (task === undefined || task === 'unknown_too_far') return 'neutral';
  if (task === 'returning') return 'warn';
  return 'accent';
}

export function ObjectIcon({ type, className = 'h-4 w-4' }: { type: string; className?: string }) {
  const I =
    {
      solar_system: Sun,
      star: Sun,
      planet: Globe2,
      moon: CircleDot,
      asteroid: Hexagon,
      others_mothership_wreck: Skull,
      others_standard_ship: Rocket,
      dust_cloud: Cloud,
      black_hole: Orbit,
      detached_container: Box,
      dormant_structure: Sparkles,
      scut_relay: Satellite,
      waypoint_bookmark: Waypoints,
      probe: Radar,
    }[type] ?? Asterisk;
  return <I className={className} />;
}

export function objectTone(type: string): string {
  return (
    {
      solar_system: 'text-amber-300 bg-raised',
      star: 'text-amber-300 bg-raised',
      planet: 'text-sky-300 bg-raised',
      moon: 'text-slate-300 bg-raised',
      asteroid: 'text-stone-300 bg-raised',
      others_mothership_wreck: 'text-rose-300 bg-raised',
      others_standard_ship: 'text-rose-300 bg-raised',
      black_hole: 'text-fuchsia-300 bg-raised',
      dust_cloud: 'text-slate-300 bg-raised',
    }[type] ?? 'text-ink-2 bg-raised'
  );
}

export const RESOURCE_COLORS: Record<string, string> = {
  metals: 'oklch(0.75 0.02 250)',
  ice: 'oklch(0.82 0.09 215)',
  carbon_compounds: 'oklch(0.8 0.13 130)',
  deuterium: 'oklch(0.74 0.13 300)',
};

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect x="0.5" y="0.5" width="63" height="63" rx="14" fill="var(--color-void)" stroke="var(--color-line-strong)" />
      <circle cx="32" cy="32" r="16" fill="none" stroke="var(--accent)" strokeWidth="4" />
      <circle cx="32" cy="32" r="5" fill="var(--accent)" />
      <path d="M32 7v8M32 49v8M7 32h8M49 32h8" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}
