/**
 * An interactive 3D view of known space: visited sectors, archived scans,
 * bookmarks, outposts, fleet positions and active jumps.
 *
 * Movement: drag to orbit (any direction), right-drag or Shift-drag to pan,
 * scroll to zoom, double-click a sector to orbit around it. With the map
 * focused, W A S D fly across the lattice, Q / E move down / up, the arrow keys
 * rotate, + / − zoom, C recentres on the probe and F toggles full screen.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Maximize2, Minimize2, Minus, Plus, RotateCcw } from 'lucide-react';
import { isMoving, label, type Coord, type Probe } from '@/core/models';
import { coordKey, sameCoord, formatCoord } from '@/core/lattice';
import { fmtDuration } from '@/core/format';
import type { Bookmark, SectorSummary } from '@/state/archive';
import { accentColor, useThemes } from '@/state/theme';
import { useNow } from '@/state/hooks';
import { Tip, cn } from './ui/primitives';

export type MapOutpost = { coord: Coord; name: string; probeId: string; active: boolean };

type Props = {
  probes: Probe[];
  selectedProbeId: string;
  visited: Coord[];
  scans: SectorSummary[];
  bookmarks: Bookmark[];
  outposts?: MapOutpost[];
  focus?: Coord;
  target?: Coord | null;
  /** Glide the orbit centre to this sector whenever it changes. */
  flyTo?: Coord | null;
  route?: Coord[];
  onPick?: (c: Coord) => void;
  className?: string;
};

type Vec = { x: number; y: number; z: number };
type Point = { c: Coord; visited?: boolean; scan?: SectorSummary; bookmark?: Bookmark; probes: Probe[]; outposts: MapOutpost[]; home?: boolean };
type Hover = { x: number; y: number; point?: Point; probe?: Probe };

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
  field: 'var(--color-ink-2)',
  unknown: 'var(--color-ink-4)',
  moving: 'var(--color-info)',
  scut: 'var(--color-info)',
  outpost: 'var(--color-warn)',
  refuel: 'var(--color-ok)',
};

const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** What a sector dot says about the sector: colour by the most important known fact. */
function classify(p: Point) {
  const s = p.scan;
  if (s?.danger) return { color: COLORS.danger, hollow: !!s.estimated, text: s.estimated ? 'Hazard signature (estimate)' : 'Hazard' };
  if (s && s.habitable > 0) return { color: COLORS.habitable, hollow: false, text: n(s.habitable, 'habitable world') };
  if (s && s.stars > 0) return { color: COLORS.star, hollow: !!s.estimated, text: s.estimated ? 'Stellar signature (estimate)' : n(s.stars, 'star system') };
  if (s && s.asteroids > 0) return { color: COLORS.field, hollow: !!s.estimated, text: s.estimated ? 'Asteroid signature (estimate)' : 'Asteroid field' };
  if (s && !s.estimated) return { color: COLORS.visited, hollow: false, text: 'Scanned · empty space' };
  if (s?.estimated) return { color: COLORS.unknown, hollow: true, text: 'Passive estimate · nothing detected' };
  if (p.visited) return { color: COLORS.visited, hollow: false, text: 'Visited · not scanned' };
  return { color: COLORS.unknown, hollow: true, text: 'Not yet observed' };
}

/** Where a travelling probe is along its jump, 0 at departure and 1 at arrival. */
function progress(p: Probe, now: number) {
  const m = p.movement;
  const a = m?.departedAt ? Date.parse(m.departedAt) : NaN;
  const b = m?.arrivalAt ? Date.parse(m.arrivalAt) : NaN;
  if (Number.isFinite(a) && Number.isFinite(b) && b > a) return Math.max(0.02, Math.min(0.98, (now - a) / (b - a)));
  if (Number.isFinite(b) && m?.secondsRemaining !== undefined) return 0.5;
  return 0.3;
}

export function StarMap({ probes, selectedProbeId, visited, scans, bookmarks, outposts = [], focus, target, flyTo, route, onPick, className }: Props) {
  const [view, setView] = useState(HOME_VIEW);
  const [pan, setPan] = useState<Vec>({ x: 0, y: 0, z: 0 });
  const [size, setSize] = useState({ w: 800, h: 520 });
  const [full, setFull] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; sx: number; sy: number; moved: boolean; pan: boolean } | null>(null);
  const themes = useThemes((s) => s.probes);
  const now = useNow(10_000);
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

  // Probes under way are drawn along their jump line, the rest at their sector.
  const stationary = useMemo(() => probes.filter((p) => p.sector && !(isMoving(p) && p.movement?.origin && p.movement?.target)), [probes]);
  const transit = useMemo(() => probes.filter((p) => isMoving(p) && p.movement?.origin && p.movement?.target), [probes]);

  const points = useMemo(() => {
    const map = new Map<string, Point>();
    const at = (c: Coord) => {
      const k = coordKey(c);
      if (!map.has(k)) map.set(k, { c, probes: [], outposts: [] });
      return map.get(k)!;
    };
    at({ x: 0, y: 0, z: 0 }).home = true;
    visited.forEach((c) => (at(c).visited = true));
    scans.forEach((s) => (at(s.coord).scan = s));
    bookmarks.forEach((b) => (at(b.coord).bookmark = b));
    outposts.forEach((o) => at(o.coord).outposts.push(o));
    stationary.forEach((p) => at(p.sector!).probes.push(p));
    transit.forEach((p) => {
      at(p.movement!.origin!);
      at(p.movement!.target!);
    });
    return [...map.values()];
  }, [visited, scans, bookmarks, outposts, stationary, transit]);

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
  const homeRef = useRef(home);
  homeRef.current = home;
  useEffect(() => {
    if (flyTo) glide({ x: flyTo.x - homeRef.current.x, y: flyTo.y - homeRef.current.y, z: flyTo.z - homeRef.current.z });
  }, [flyTo, glide]);

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

  /** Each probe's marker colour: the accent while in command, its own theme otherwise, else the neutral fleet tone. */
  const probeColor = (p: Probe) => (p.id === selectedProbeId ? 'var(--accent)' : themes[p.id] ? accentColor(themes[p.id]) : COLORS.fleet);

  const sorted = points.map((p) => ({ ...p, ...project(p.c) })).sort((a, b) => a.depth - b.depth);
  // Names only when there is room to read them: zoomed in, or a small archive.
  const showNames = zoom >= 1.4 || points.length <= 16;

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

  const panned = Math.abs(pan.x) + Math.abs(pan.y) + Math.abs(pan.z) > 0.01;
  const hoverAt = (e: React.PointerEvent, h: Omit<Hover, 'x' | 'y'>) => {
    if (drag.current?.moved) return;
    const r = box.current?.getBoundingClientRect();
    setHover({ x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0), ...h });
  };

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
            setHover(null);
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
        onPointerLeave={() => setHover(null)}
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
        {transit.map((p) => {
          const a = project(p.movement!.origin!),
            b = project(p.movement!.target!);
          return <line key={p.id} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} stroke={probeColor(p)} strokeWidth={1.5} strokeOpacity={0.6} strokeDasharray="6 4" />;
        })}

        {sorted.map((p) => {
          const k = coordKey(p.c);
          const selected = p.probes.some((x) => x.id === selectedProbeId);
          const lead = p.probes.find((x) => x.id === selectedProbeId) ?? p.probes[0];
          const isTarget = target && sameCoord(target, p.c);
          const kind = classify(p);
          const r = (p.probes.length ? 6 : p.scan?.stars || p.scan?.habitable ? 4 : p.home ? 3.5 : 3) * Math.min(1.8, Math.max(0.6, p.persp));
          const fade = 0.4 + 0.6 * Math.max(0, Math.min(1, (p.depth / span + 1) / 2));
          const name = p.probes.length ? p.probes.map((x) => x.name).join(', ') : showNames ? (p.bookmark?.name ?? p.scan?.names[0] ?? (p.home ? 'Home' : '')) : '';
          return (
            <g
              key={k}
              transform={`translate(${p.sx} ${p.sy})`}
              opacity={fade}
              className="cursor-pointer"
              onClick={() => !drag.current?.moved && onPick?.(p.c)}
              onDoubleClick={() => glide({ x: p.c.x - home.x, y: p.c.y - home.y, z: p.c.z - home.z })}
              onPointerEnter={(e) => hoverAt(e, { point: p })}
              onPointerMove={(e) => hoverAt(e, { point: p })}
              onPointerLeave={() => setHover(null)}
            >
              <title>
                {formatCoord(p.c)}
                {p.scan?.names.length ? ` · ${p.scan.names.join(', ')}` : ''}
                {p.probes.length ? ` · ${p.probes.map((x) => x.name).join(', ')}` : ''}
                {p.bookmark ? ` · ★ ${p.bookmark.name}` : ''}
              </title>
              <circle r={14} fill="transparent" />
              {p.home && <path d="M-7 0h14M0 -7v14" stroke={COLORS.unknown} strokeWidth={1} strokeOpacity={0.9} />}
              {p.scan?.scut && <circle r={r + 4} fill="none" stroke={COLORS.scut} strokeWidth={1} strokeDasharray="2 2" strokeOpacity={0.9} />}
              {p.outposts.length > 0 && <rect x={-r - 6} y={-r - 6} width={2 * r + 12} height={2 * r + 12} fill="none" stroke={COLORS.outpost} strokeWidth={1.25} opacity={p.outposts.some((o) => o.active) ? 1 : 0.5} />}
              {selected && <circle r={r + 5} fill="none" stroke="var(--accent)" strokeWidth={1.5} />}
              {lead && p.scan && <circle r={r + 2} fill="none" stroke={kind.color} strokeWidth={2} />}
              {lead ? (
                <circle r={r} fill={probeColor(lead)} />
              ) : kind.hollow ? (
                <circle r={r} fill="none" stroke={kind.color} strokeWidth={1.5} />
              ) : (
                <circle r={r} fill={kind.color} />
              )}
              {p.scan?.refuel && <rect x={-r - 7} y={r + 1} width={4} height={4} fill={COLORS.refuel} />}
              {p.bookmark && <path d="M0 -12 l2.4 4.8 5.2 .8 -3.8 3.7 .9 5.2 -4.7-2.5 -4.7 2.5 .9-5.2 -3.8-3.7 5.2-.8z" transform="scale(.7) translate(0 -6)" fill={COLORS.star} />}
              {isTarget && <circle r={r + 7} fill="none" stroke="var(--color-ink)" strokeWidth={1.5} strokeDasharray="3 3" />}
              {name && (
                <text x={r + 8} y={4} fontSize={p.probes.length ? 12 : 11} fill={p.probes.length ? 'var(--color-ink)' : 'var(--color-ink-3)'} fontWeight={p.probes.length ? 600 : 500} paintOrder="stroke" stroke="var(--color-void)" strokeWidth={3}>
                  {name}
                </text>
              )}
            </g>
          );
        })}

        {transit.map((p) => {
          const o = p.movement!.origin!,
            t = p.movement!.target!;
          const f = progress(p, now);
          const at = project({ x: o.x + (t.x - o.x) * f, y: o.y + (t.y - o.y) * f, z: o.z + (t.z - o.z) * f });
          const to = project(t);
          const angle = (Math.atan2(to.sy - at.sy, to.sx - at.sx) * 180) / Math.PI + 90;
          const selected = p.id === selectedProbeId;
          return (
            <g
              key={`transit-${p.id}`}
              transform={`translate(${at.sx} ${at.sy})`}
              className="cursor-pointer"
              onClick={() => !drag.current?.moved && onPick?.(t)}
              onPointerEnter={(e) => hoverAt(e, { probe: p })}
              onPointerMove={(e) => hoverAt(e, { probe: p })}
              onPointerLeave={() => setHover(null)}
            >
              <title>{`${p.name} · ${formatCoord(o)} → ${formatCoord(t)}`}</title>
              <circle r={14} fill="transparent" />
              {selected && <circle r={11} fill="none" stroke="var(--accent)" strokeWidth={1.5} />}
              <path d="M0 -7 L6 6 L0 3 L-6 6 Z" transform={`rotate(${angle})`} fill={probeColor(p)} />
              <text x={14} y={4} fontSize={12} fill="var(--color-ink)" fontWeight={600} paintOrder="stroke" stroke="var(--color-void)" strokeWidth={3}>
                {p.name}
              </text>
            </g>
          );
        })}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-20 w-max max-w-[260px] rounded-lg border border-line-strong bg-panel px-3 py-2 text-[12px] leading-relaxed text-ink-2"
          style={hover.y > H * 0.55 ? { left: Math.min(hover.x + 14, W - 272), bottom: H - hover.y + 14 } : { left: Math.min(hover.x + 14, W - 272), top: hover.y + 14 }}
        >
          {hover.probe ? <TransitCard probe={hover.probe} /> : hover.point ? <SectorCard point={hover.point} /> : null}
        </div>
      )}

      <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[60%] flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-3">
        {(
          [
            ['var(--accent)', 'Probe in command'],
            [COLORS.fleet, 'Fleet'],
            [COLORS.star, 'Star system'],
            [COLORS.habitable, 'Habitable'],
            [COLORS.danger, 'Hazard'],
            [COLORS.visited, 'Visited'],
            [COLORS.visited, 'Estimated', 'hollow'],
            [COLORS.scut, 'SCUT coverage', 'ring'],
            [COLORS.outpost, 'Outpost', 'square'],
            [COLORS.refuel, 'Refuel station', 'tick'],
          ] as [string, string, string?][]
        ).map(([c, t, shape]) => (
          <span key={t} className="flex items-center gap-1.5">
            {shape === 'hollow' || shape === 'ring' ? (
              <span className={cn('h-2.5 w-2.5 rounded-full border', shape === 'ring' && 'border-dashed')} style={{ borderColor: c }} />
            ) : shape === 'square' ? (
              <span className="h-2.5 w-2.5 border" style={{ borderColor: c }} />
            ) : shape === 'tick' ? (
              <span className="h-1.5 w-1.5" style={{ background: c }} />
            ) : (
              <span className="h-2 w-2 rounded-full" style={{ background: c }} />
            )}
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

function SectorCard({ point: p }: { point: Point }) {
  const s = p.scan;
  const kind = classify(p);
  const title = s?.names.length ? s.names.join(', ') : (p.bookmark?.name ?? (p.home ? 'Home sector' : 'Sector'));
  const facts: string[] = [];
  if (s && !s.estimated) facts.push([s.stars && n(s.stars, 'star system'), s.planets && n(s.planets, 'planet'), s.asteroids && n(s.asteroids, 'asteroid')].filter(Boolean).join(' · '));
  if (s?.estimated) facts.push([s.stars && 'stellar signature', s.asteroids && n(s.asteroids, 'asteroid signature')].filter(Boolean).join(' · '));
  if (s?.inhabited) facts.push(n(s.inhabited, 'inhabited world'));
  if (s?.mineable) facts.push(n(s.mineable, 'mineable body', 'mineable bodies'));
  if (s?.risk && !/^(low|none|minimal)$/i.test(s.risk)) facts.push(`Risk: ${label(s.risk)}`);
  return (
    <>
      <div className="font-medium text-ink">
        {title} <span className="mono font-normal text-ink-3">{formatCoord(p.c)}</span>
      </div>
      <div style={{ color: kind.color }}>{kind.text}</div>
      {facts.filter(Boolean).map((f) => (
        <div key={f}>{f}</div>
      ))}
      {s?.resources.length ? <div className="text-ink-3">{s.resources.map(label).join(', ')}</div> : null}
      {(s?.scut || s?.refuel) && <div className="text-ink-3">{[s.scut && 'SCUT coverage', s.refuel && 'Deuterium refuel station'].filter(Boolean).join(' · ')}</div>}
      {p.probes.length > 0 && <div>Here: {p.probes.map((x) => x.name).join(', ')}</div>}
      {p.outposts.map((o) => (
        <div key={o.name} className="text-warn">
          Outpost {o.name}
          {o.active ? '' : ' (paused)'}
        </div>
      ))}
      {p.bookmark && (
        <div className="text-ink-3">
          ★ {p.bookmark.name}
          {p.bookmark.note ? ` · ${p.bookmark.note}` : ''}
        </div>
      )}
      <div className="mt-1 text-[11px] text-ink-4">Click to set as destination · double-click to centre</div>
    </>
  );
}

function TransitCard({ probe: p }: { probe: Probe }) {
  const m = p.movement!;
  const eta = m.arrivalAt ? Math.max(0, (Date.parse(m.arrivalAt) - Date.now()) / 1000) : m.secondsRemaining;
  return (
    <>
      <div className="font-medium text-ink">{p.name}</div>
      <div className="text-info">{label(p.status)}</div>
      <div>
        <span className="mono">{formatCoord(m.origin)}</span> → <span className="mono">{formatCoord(m.target)}</span>
      </div>
      {eta !== undefined && Number.isFinite(eta) && <div className="text-ink-3">Arrives in {fmtDuration(eta)}</div>}
      <div className="mt-1 text-[11px] text-ink-4">Click to target its destination</div>
    </>
  );
}
