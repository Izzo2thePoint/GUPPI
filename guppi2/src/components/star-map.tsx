/**
 * An interactive 3D projection of known space: visited sectors, archived scans,
 * bookmarks, fleet positions and active jumps. Drag to rotate, scroll to zoom.
 */
import { useMemo, useRef, useState } from 'react';
import type { Coord, Probe } from '@/core/models';
import { coordKey, sameCoord, formatCoord } from '@/core/lattice';
import type { Bookmark, SectorSummary } from '@/state/archive';
import { cn } from './ui/primitives';

type Props = {
  probes: Probe[];
  selectedProbeId: string;
  visited: Coord[];
  scans: SectorSummary[];
  bookmarks: Bookmark[];
  focus?: Coord;
  target?: Coord | null;
  route?: Coord[];
  onPick?: (c: Coord) => void;
  className?: string;
};

export function StarMap({ probes, selectedProbeId, visited, scans, bookmarks, focus, target, route, onPick, className }: Props) {
  const [yaw, setYaw] = useState(-0.6);
  const [pitch, setPitch] = useState(0.45);
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const W = 800,
    H = 520;
  const center = focus ?? { x: 0, y: 0, z: 0 };

  const points = useMemo(() => {
    const map = new Map<string, { c: Coord; visited?: boolean; scan?: SectorSummary; bookmark?: Bookmark; probes: Probe[] }>();
    const at = (c: Coord) => {
      const k = coordKey(c);
      if (!map.has(k)) map.set(k, { c, probes: [] });
      return map.get(k)!;
    };
    visited.forEach((c) => (at(c).visited = true));
    scans.forEach((s) => (at(s.coord).scan = s));
    bookmarks.forEach((b) => (at(b.coord).bookmark = b));
    probes.forEach((p) => p.sector && at(p.sector).probes.push(p));
    return [...map.values()];
  }, [visited, scans, bookmarks, probes]);

  const span = useMemo(() => {
    let m = 4;
    for (const p of points) m = Math.max(m, Math.abs(p.c.x - center.x), Math.abs(p.c.y - center.y), Math.abs(p.c.z - center.z));
    return m;
  }, [points, center.x, center.y, center.z]);

  const scale = ((Math.min(W, H) * 0.42) / span) * zoom;
  const project = (c: Coord) => {
    const x = c.x - center.x,
      y = c.y - center.y,
      z = c.z - center.z;
    const cy = Math.cos(yaw),
      sy = Math.sin(yaw),
      cp = Math.cos(pitch),
      sp = Math.sin(pitch);
    const x1 = x * cy - y * sy;
    const y1 = x * sy + y * cy;
    const y2 = y1 * cp - z * sp;
    const depth = y1 * sp + z * cp;
    return { sx: W / 2 + x1 * scale, sy: H / 2 + y2 * scale * 0.9, depth };
  };

  const sorted = points.map((p) => ({ ...p, ...project(p.c) })).sort((a, b) => a.depth - b.depth);
  const axis = (d: Coord, color: string, name: string) => {
    const a = project({ x: center.x - d.x * span, y: center.y - d.y * span, z: center.z - d.z * span });
    const b = project({ x: center.x + d.x * span, y: center.y + d.y * span, z: center.z + d.z * span });
    return (
      <g key={name}>
        <line x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} stroke={color} strokeOpacity={0.18} strokeDasharray="2 4" />
        <text x={b.sx} y={b.sy} fill={color} fillOpacity={0.5} fontSize={10} className="num">
          {name}
        </text>
      </g>
    );
  };

  const moving = probes.filter((p) => p.movement?.origin && p.movement?.target);

  return (
    <div className={cn('relative select-none overflow-hidden rounded-xl border border-line bg-[radial-gradient(ellipse_at_center,#0d1424,#05070c_70%)]', className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, moved: false };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dx = e.clientX - drag.current.x,
            dy = e.clientY - drag.current.y;
          if (Math.abs(dx) + Math.abs(dy) > 2) drag.current.moved = true;
          drag.current.x = e.clientX;
          drag.current.y = e.clientY;
          setYaw((v) => v + dx * 0.008);
          setPitch((v) => Math.max(-1.4, Math.min(1.4, v + dy * 0.008)));
        }}
        onPointerUp={() => setTimeout(() => (drag.current = null))}
        onWheel={(e) => setZoom((z) => Math.max(0.3, Math.min(6, z * (e.deltaY > 0 ? 0.9 : 1.1))))}
      >
        {axis({ x: 1, y: 0, z: 0 }, '#f87171', 'X')}
        {axis({ x: 0, y: 1, z: 0 }, '#34d399', 'Y')}
        {axis({ x: 0, y: 0, z: 1 }, '#60a5fa', 'Z')}

        {route && route.length > 1 && (
          <polyline points={route.map((c) => project(c)).map((p) => `${p.sx},${p.sy}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4 4" strokeOpacity={0.8} />
        )}
        {moving.map((p) => {
          const a = project(p.movement!.origin!),
            b = project(p.movement!.target!);
          return <line key={p.id} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} stroke="#60a5fa" strokeWidth={1.5} strokeOpacity={0.7} />;
        })}

        {sorted.map((p) => {
          const k = coordKey(p.c);
          const selected = p.probes.some((x) => x.id === selectedProbeId);
          const isTarget = target && sameCoord(target, p.c);
          const color = p.scan?.danger ? '#f87171' : p.scan?.habitable ? '#34d399' : p.scan?.stars ? '#fbbf24' : p.visited ? '#94a3b8' : '#475269';
          const r = p.probes.length ? 6 : p.scan?.stars ? 4 : 3;
          const fade = 0.45 + 0.55 * Math.max(0, Math.min(1, (p.depth / span + 1) / 2));
          return (
            <g
              key={k}
              transform={`translate(${p.sx} ${p.sy})`}
              opacity={fade}
              className="cursor-pointer"
              onClick={() => !drag.current?.moved && onPick?.(p.c)}
            >
              <title>
                {formatCoord(p.c)}
                {p.scan?.names.length ? ` · ${p.scan.names.join(', ')}` : ''}
                {p.probes.length ? ` · ${p.probes.map((x) => x.name).join(', ')}` : ''}
                {p.bookmark ? ` · ★ ${p.bookmark.name}` : ''}
              </title>
              <circle r={14} fill="transparent" />
              {p.probes.length > 0 && <circle r={selected ? 13 : 10} fill={selected ? 'var(--accent)' : '#a78bfa'} opacity={0.18} />}
              <circle r={r} fill={p.probes.length ? (selected ? 'var(--accent)' : '#a78bfa') : color} />
              {p.bookmark && <path d="M0 -12 l2.4 4.8 5.2 .8 -3.8 3.7 .9 5.2 -4.7-2.5 -4.7 2.5 .9-5.2 -3.8-3.7 5.2-.8z" transform="scale(.7) translate(0 -6)" fill="#fbbf24" />}
              {isTarget && <circle r={11} fill="none" stroke="var(--accent-2)" strokeWidth={1.5} strokeDasharray="3 3" />}
              {p.probes.length > 0 && (
                <text x={12} y={4} fontSize={11} fill="#e6ebf5" fontWeight={600}>
                  {p.probes.map((x) => x.name).join(', ')}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-3 text-[10px] text-ink-3">
        {[
          ['var(--accent)', 'Selected probe'],
          ['#a78bfa', 'Fleet'],
          ['#fbbf24', 'Star system'],
          ['#34d399', 'Habitable'],
          ['#f87171', 'Danger'],
          ['#94a3b8', 'Visited'],
        ].map(([c, t]) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: c }} />
            {t}
          </span>
        ))}
      </div>
      <div className="absolute right-3 top-3 flex gap-1">
        {[
          ['+', () => setZoom((z) => Math.min(6, z * 1.25))],
          ['−', () => setZoom((z) => Math.max(0.3, z / 1.25))],
          ['⟲', () => (setYaw(-0.6), setPitch(0.45), setZoom(1))],
        ].map(([t, fn]) => (
          <button key={t as string} onClick={fn as () => void} className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-panel/80 text-sm text-ink-2 backdrop-blur hover:text-ink">
            {t as string}
          </button>
        ))}
      </div>
    </div>
  );
}
