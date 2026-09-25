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
      solar_system: 'text-amber-300 bg-amber-300/10',
      star: 'text-amber-300 bg-amber-300/10',
      planet: 'text-sky-300 bg-sky-300/10',
      asteroid: 'text-stone-300 bg-stone-300/10',
      others_mothership_wreck: 'text-rose-300 bg-rose-300/10',
      others_standard_ship: 'text-rose-300 bg-rose-300/10',
      black_hole: 'text-fuchsia-300 bg-fuchsia-300/10',
      dust_cloud: 'text-slate-300 bg-slate-300/10',
    }[type] ?? 'text-ink-2 bg-white/5'
  );
}

export const RESOURCE_COLORS: Record<string, string> = {
  metals: '#94a3b8',
  ice: '#7dd3fc',
  carbon_compounds: '#a3e635',
  deuterium: '#c084fc',
};

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#0a0e17" stroke="rgb(148 163 184 / .18)" />
      <circle cx="32" cy="32" r="16" fill="none" stroke="url(#lg)" strokeWidth="4" />
      <circle cx="32" cy="32" r="5" fill="url(#lg)" />
      <path d="M32 7v8M32 49v8M7 32h8M49 32h8" stroke="url(#lg)" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}
