/**
 * An interactive 3D view of known space: visited sectors, archived scans,
 * bookmarks, fleet positions and active jumps.
 *
 * Movement: drag to orbit (any direction), right-drag or Shift-drag to pan,
 * scroll to zoom, double-click a sector to orbit around it. With the map
 * focused, W A S D fly across the lattice, Q / E move down / up, the arrow keys
 * rotate, + / − zoom, C recentres on the probe and F toggles full screen.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Maximize2, Minimize2, Minus, Plus, RotateCcw } from 'lucide-react';
import type { Coord, Probe } from '@/core/models';
import { coordKey, sameCoord, formatCoord } from '@/core/lattice';
import type { Bookmark, SectorSummary } from '@/state/archive';
import { Tip, cn } from './ui/primitives';

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

type Vec = { x: number; y: number; z: number };
const HOME_VIEW = { yaw: -0.6, pitch: 0.45, zoom: 1 };
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 40;
const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
/** Keep angles in (-π, π] so they never grow without bound. */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

const COLORS = {
  fleet: 'var(--color-ink-2)',
  star: 'oklch(0.84 0.13 85)',
  habitable: 'var(--color-ok)',
  danger: 'var(--color-bad)',
  visited: 'var(--color-ink-3)',
  unknown: 'var(--color-ink-4)',
  moving: 'var(--color-info)',
};

export function StarMap({ probes, selectedProbeId, visited, scans, bookmarks, focus, target, route, onPick, className }: Props) {
  const [view, setView] = useState(HOME_VIEW);
  const [pan, setPan] = useState<Vec>({ x: 0, y: 0, z: 0 });
  const [size, setSize] = useState({ w: 800, h: 520 });
  const [full, setFull] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; sx: number; sy: number; moved: boolean; pan: boolean } | null>(null);
  const home = focus ?? { x: 0, y: 0, z: 0 };
  const center = { x: home.x + pan.x, y: home.y + pan.y, z: home.z + pan.z };
  const { yaw, pitch, zoom } = view;
  const W = size.w,
    H = size.h;

  // Draw at the real pixel size of the box (and of the screen in full-screen mode).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      if (r.width > 10 && r.height > 10) setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    const onFs = () => setFull(document.fullscreenElement === el);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      ro.disconnect();
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, []);

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

  // Fit known space around the probe; zoom scales from there.
  const span = useMemo(() => {
    let m = 4;
    for (const p of points) m = Math.max(m, Math.abs(p.c.x - home.x), Math.abs(p.c.y - home.y), Math.abs(p.c.z - home.z));
    return m;
  }, [points, home.x, home.y, home.z]);

  const scale = ((Math.min(W, H) * 0.42) / span) * zoom;
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw),
    cp = Math.cos(pitch),
    sp = Math.sin(pitch);
  // A gentle perspective: nearer sectors spread out and grow, far ones shrink.
  const camera = span * 3.2;
  const project = (c: Vec) => {
    const x = c.x - center.x,
      y = c.y - center.y,
      z = c.z - center.z;
    const x1 = x * cy - y * sy;
    const y1 = x * sy + y * cy;
    const y2 = y1 * cp - z * sp;
    const depth = y1 * sp + z * cp;
    const persp = Math.max(0.25, Math.min(3, camera / Math.max(camera * 0.2, camera - depth)));
    return { sx: W / 2 + x1 * scale * persp, sy: H / 2 + y2 * scale * persp, depth, persp };
  };
  /** Screen movement → world movement in the view plane (inverse of the rotation). */
  const unproject = useCallback(
    (dx: number, dy: number): Vec => {
      const x1 = dx / scale,
        y2 = dy / scale;
      const y1 = y2 * cp;
      const z = -y2 * sp;
      return { x: x1 * cy + y1 * sy, y: -x1 * sy + y1 * cy, z };
    },
    [scale, cp, sp, cy, sy],
  );

  // Smoothly move the orbit centre (double-click, recentre).
  const anim = useRef(0);
  const glide = useCallback((to: Vec) => {
    cancelAnimationFrame(anim.current);
    const from = { ...panRef.current };
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 260);
      const e = 1 - Math.pow(1 - k, 3);
      setPan({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, z: from.z + (to.z - from.z) * e });
      if (k < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }, []);
  const panRef = useRef(pan);
  panRef.current = pan;
  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  const zoomBy = (f: number) => setView((v) => ({ ...v, zoom: clampZoom(v.zoom * f) }));
  const recenter = () => glide({ x: 0, y: 0, z: 0 });
  const reset = () => {
    setView(HOME_VIEW);
    glide({ x: 0, y: 0, z: 0 });
  };
  const toggleFull = () => {
    const el = box.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => undefined);
  };

  // Wheel zoom needs a non-passive listener so the page does not scroll too.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      setView((v) => ({ ...v, zoom: clampZoom(v.zoom * f) }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key.toLowerCase();
    // Fly one sector per press (more with Shift), relative to where the camera faces.
    const stepN = e.shiftKey ? 5 : 1;
    const flat = (dx: number, dy: number) => {
      const d = unproject(dx, dy);
      const len = Math.hypot(d.x, d.y) || 1;
      return { x: (d.x / len) * stepN, y: (d.y / len) * stepN };
    };
    let handled = true;
    if (k === 'w' || k === 's') {
      // Forward is "up the screen" projected onto the lattice plane.
      const f = flat(0, k === 'w' ? -1 : 1);
      setPan((p) => ({ ...p, x: p.x + f.x, y: p.y + f.y }));
    } else if (k === 'a' || k === 'd') {
      const f = flat(k === 'a' ? -1 : 1, 0);
      setPan((p) => ({ ...p, x: p.x + f.x, y: p.y + f.y }));
    } else if (k === 'q' || k === 'e') setPan((p) => ({ ...p, z: p.z + (k === 'e' ? stepN : -stepN) }));
    else if (k === 'arrowleft' || k === 'arrowright') setView((v) => ({ ...v, yaw: wrap(v.yaw + (k === 'arrowleft' ? -0.12 : 0.12)) }));
    else if (k === 'arrowup' || k === 'arrowdown') setView((v) => ({ ...v, pitch: wrap(v.pitch + (k === 'arrowup' ? -0.12 : 0.12)) }));
    else if (k === '+' || k === '=') zoomBy(1.2);
    else if (k === '-' || k === '_') zoomBy(1 / 1.2);
    else if (k === 'c') recenter();
    else if (k === 'f') toggleFull();
    else if (k === '0') reset();
    else handled = false;
    if (handled) e.preventDefault();
  };

  const sorted = points.map((p) => ({ ...p, ...project(p.c) })).sort((a, b) => a.depth - b.depth);

  // A faint lattice on the orbit centre's plane gives a sense of scale and heading.
  const grid = useMemo(() => {
    const reach = Math.ceil(span / Math.max(0.35, Math.min(1, zoom)));
    const step = Math.max(1, Math.round(reach / 8));
    const cx = Math.round(center.x / step) * step,
      cyy = Math.round(center.y / step) * step;
    const lines: [Vec, Vec][] = [];
    for (let i = -reach; i <= reach; i += step) {
      lines.push([{ x: cx + i, y: cyy - reach, z: center.z }, { x: cx + i, y: cyy + reach, z: center.z }]);
      lines.push([{ x: cx - reach, y: cyy + i, z: center.z }, { x: cx + reach, y: cyy + i, z: center.z }]);
    }
    return lines;
  }, [span, zoom, center.x, center.y, center.z]);

  const axis = (d: Coord, color: string, name: string) => {
    const a = project({ x: center.x - d.x * span, y: center.y - d.y * span, z: center.z - d.z * span });
    const b = project({ x: center.x + d.x * span, y: center.y + d.y * span, z: center.z + d.z * span });
    return (
      <g key={name}>
        <line x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} stroke={color} strokeOpacity={0.35} strokeDasharray="2 5" />
        <text x={b.sx + 4} y={b.sy + 4} fill={color} fillOpacity={0.8} fontSize={11} fontWeight={600}>
          {name}
        </text>
      </g>
    );
  };

  const moving = probes.filter((p) => p.movement?.origin && p.movement?.target);
  const panned = Math.abs(pan.x) + Math.abs(pan.y) + Math.abs(pan.z) > 0.01;

  return (
    <div
      ref={box}
      tabIndex={0}
      onKeyDown={onKey}
      aria-label="Star map. Drag to orbit, right-drag to pan, scroll to zoom. Keys: W A S D fly, Q E down and up, arrows rotate, C recentre, F full screen."
      className={cn('relative select-none overflow-hidden rounded-lg border border-line bg-void outline-none focus-visible:border-accent', full && 'rounded-none border-0', className)}
    >
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 h-full w-full cursor-grab touch-none active:cursor-grabbing"
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          // No pointer capture yet: a plain click must still reach the sector under the cursor.
          drag.current = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, pan: e.button === 2 || e.button === 1 || e.shiftKey };
          box.current?.focus({ preventScroll: true });
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x,
            dy = e.clientY - d.y;
          if (!d.moved && Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 4) {
            // Now it is a drag: keep receiving moves even if the pointer leaves the map.
            d.moved = true;
            (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          }
          if (!d.moved) return;
          d.x = e.clientX;
          d.y = e.clientY;
          if (d.pan) {
            const w = unproject(dx, dy);
            setPan((p) => ({ x: p.x - w.x, y: p.y - w.y, z: p.z - w.z }));
          } else setView((v) => ({ ...v, yaw: wrap(v.yaw + dx * 0.008), pitch: wrap(v.pitch + dy * 0.008) }));
        }}
        onPointerUp={() => setTimeout(() => (drag.current = null))}
      >
        {grid.map(([a, b], i) => {
          const p = project(a),
            q = project(b);
          return <line key={i} x1={p.sx} y1={p.sy} x2={q.sx} y2={q.sy} stroke="var(--color-line)" strokeOpacity={0.7} strokeWidth={1} />;
        })}
        {axis({ x: 1, y: 0, z: 0 }, 'oklch(0.72 0.14 25)', 'X')}
        {axis({ x: 0, y: 1, z: 0 }, 'oklch(0.78 0.13 158)', 'Y')}
        {axis({ x: 0, y: 0, z: 1 }, 'oklch(0.76 0.11 245)', 'Z')}

        {route && route.length > 1 && (
          <polyline points={route.map((c) => project(c)).map((p) => `${p.sx},${p.sy}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={1.75} strokeDasharray="5 4" />
        )}
        {moving.map((p) => {
          const a = project(p.movement!.origin!),
            b = project(p.movement!.target!);
          return <line key={p.id} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} stroke={COLORS.moving} strokeWidth={1.5} strokeOpacity={0.75} />;
        })}

        {sorted.map((p) => {
          const k = coordKey(p.c);
          const selected = p.probes.some((x) => x.id === selectedProbeId);
          const isTarget = target && sameCoord(target, p.c);
          const color = p.scan?.danger ? COLORS.danger : p.scan?.habitable ? COLORS.habitable : p.scan?.stars ? COLORS.star : p.visited ? COLORS.visited : COLORS.unknown;
          const r = (p.probes.length ? 6 : p.scan?.stars ? 4 : 3) * Math.min(1.8, Math.max(0.6, p.persp));
          const fade = 0.4 + 0.6 * Math.max(0, Math.min(1, (p.depth / span + 1) / 2));
          return (
            <g
              key={k}
              transform={`translate(${p.sx} ${p.sy})`}
              opacity={fade}
              className="cursor-pointer"
              onClick={() => !drag.current?.moved && onPick?.(p.c)}
              onDoubleClick={() => glide({ x: p.c.x - home.x, y: p.c.y - home.y, z: p.c.z - home.z })}
            >
              <title>
                {formatCoord(p.c)}
                {p.scan?.names.length ? ` · ${p.scan.names.join(', ')}` : ''}
                {p.probes.length ? ` · ${p.probes.map((x) => x.name).join(', ')}` : ''}
                {p.bookmark ? ` · ★ ${p.bookmark.name}` : ''}
              </title>
              <circle r={14} fill="transparent" />
              {selected && <circle r={r + 5} fill="none" stroke="var(--accent)" strokeWidth={1.5} />}
              <circle r={r} fill={p.probes.length ? (selected ? 'var(--accent)' : COLORS.fleet) : color} />
              {p.bookmark && <path d="M0 -12 l2.4 4.8 5.2 .8 -3.8 3.7 .9 5.2 -4.7-2.5 -4.7 2.5 .9-5.2 -3.8-3.7 5.2-.8z" transform="scale(.7) translate(0 -6)" fill={COLORS.star} />}
              {isTarget && <circle r={r + 7} fill="none" stroke="var(--color-ink)" strokeWidth={1.5} strokeDasharray="3 3" />}
              {p.probes.length > 0 && (
                <text x={r + 8} y={4} fontSize={12} fill="var(--color-ink)" fontWeight={600} paintOrder="stroke" stroke="var(--color-void)" strokeWidth={3}>
                  {p.probes.map((x) => x.name).join(', ')}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[55%] flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-3">
        {[
          ['var(--accent)', 'Probe in command'],
          [COLORS.fleet, 'Fleet'],
          [COLORS.star, 'Star system'],
          [COLORS.habitable, 'Habitable'],
          [COLORS.danger, 'Danger'],
          [COLORS.visited, 'Visited'],
        ].map(([c, t]) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: c }} />
            {t}
          </span>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex items-end justify-between gap-4 text-[12px] text-ink-3">
        <div>
          Orbit centre <span className="mono text-ink-2">{formatCoord({ x: Math.round(center.x), y: Math.round(center.y), z: Math.round(center.z) })}</span> · <span className="num">{zoom.toFixed(zoom < 1 ? 2 : 1)}×</span>
        </div>
        {W > 700 && <div className="text-right">Drag to orbit · Right-drag to pan · Scroll to zoom · W A S D Q E to fly · Double-click to centre</div>}
      </div>

      <div className="absolute right-3 top-3 z-10 flex gap-1">
        {(
          [
            ['Zoom in (+)', <Plus key="i" />, () => zoomBy(1.25)],
            ['Zoom out (−)', <Minus key="o" />, () => zoomBy(1 / 1.25)],
            ['Recentre on the probe (C)', <Crosshair key="c" />, recenter, !panned],
            ['Reset the view (0)', <RotateCcw key="r" />, reset],
            [full ? 'Exit full screen (F)' : 'Full screen (F)', full ? <Minimize2 key="f" /> : <Maximize2 key="f" />, toggleFull],
          ] as [string, React.ReactNode, () => void, boolean?][]
        ).map(([label, icon, fn, disabled]) => (
          <Tip key={label} content={label} side="bottom">
            <button
              onClick={fn}
              disabled={disabled}
              aria-label={label}
              className="grid h-8 w-8 place-items-center rounded-md border border-line-strong bg-panel text-ink-2 transition-colors hover:bg-raised hover:text-ink disabled:opacity-40 [&>svg]:h-3.5 [&>svg]:w-3.5"
            >
              {icon}
            </button>
          </Tip>
        ))}
      </div>
    </div>
  );
}
