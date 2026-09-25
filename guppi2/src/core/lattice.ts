/**
 * Sector geometry. Sectors sit on a face-centred cubic lattice (x + y + z even);
 * each sector has exactly twelve neighbours.
 */
import type { Coord } from './models';

export const coordKey = (p: Coord) => `${p.x},${p.y},${p.z}`;
export const sameCoord = (a?: Coord, b?: Coord) => !!a && !!b && a.x === b.x && a.y === b.y && a.z === b.z;
export const formatCoord = (p?: Coord) => (p ? `${p.x}, ${p.y}, ${p.z}` : '—');

export function isValidSector(p: unknown): p is Coord {
  const c = p as Coord;
  return (
    !!c &&
    [c.x, c.y, c.z].every((n) => Number.isSafeInteger(n) && Math.abs(n) <= 1_000_000) &&
    (c.x + c.y + c.z) % 2 === 0
  );
}

export function parseCoord(values: [string, string, string]): Coord {
  if (values.some((v) => !/^\s*-?\d+\s*$/.test(v))) throw new Error('Enter whole numbers for X, Y and Z.');
  const [x, y, z] = values.map((v) => Number(v.trim()));
  const c = { x, y, z };
  if (!isValidSector(c)) throw new Error('X + Y + Z must be even (and within ±1,000,000).');
  return c;
}

export const NEIGHBOR_OFFSETS: Coord[] = (() => {
  const out: Coord[] = [];
  for (let zero = 0; zero < 3; zero++)
    for (const a of [-1, 1])
      for (const b of [-1, 1]) {
        const v = [0, 0, 0];
        const axes = [0, 1, 2].filter((i) => i !== zero);
        v[axes[0]] = a;
        v[axes[1]] = b;
        out.push({ x: v[0], y: v[1], z: v[2] });
      }
  return out;
})();

export const neighbors = (p: Coord) => NEIGHBOR_OFFSETS.map((d) => ({ x: p.x + d.x, y: p.y + d.y, z: p.z + d.z }));

/** Minimum number of neighbour hops between two lattice sectors. */
export function hops(a: Coord, b: Coord) {
  const d = [Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z)];
  return Math.max(d[0], d[1], d[2], (d[0] + d[1] + d[2]) / 2);
}

export const euclid = (a: Coord, b: Coord) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** A straight-line course of neighbour hops, used to preview multi-leg routes. */
export function plotCourse(from: Coord, to: Coord, limit = 400): Coord[] {
  if (!isValidSector(from) || !isValidSector(to)) throw new Error('Invalid course coordinates.');
  const total = hops(from, to);
  if (total > limit) throw new Error(`Destination is ${total} hops away — plot a closer leg (max ${limit}).`);
  const path = [from];
  let current = from;
  while (!sameCoord(current, to)) {
    const remaining = hops(current, to);
    const step = path.length / total;
    const ideal = { x: from.x + (to.x - from.x) * step, y: from.y + (to.y - from.y) * step, z: from.z + (to.z - from.z) * step };
    const next = neighbors(current)
      .filter((n) => hops(n, to) === remaining - 1)
      .sort((a, b) => euclid(a, ideal) - euclid(b, ideal))[0];
    if (!next) throw new Error('Unable to plot a course.');
    path.push(next);
    current = next;
  }
  return path;
}
