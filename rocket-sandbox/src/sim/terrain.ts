import { Vector3 } from 'three';
import { BodyDef, RGB } from './bodies';
import { Simplex3 } from './noise';
import { hashInts } from './rng';

/** Procedural terrain shared by physics (collision, walking) and rendering (chunk meshes). */

const noiseCache = new Map<number, Simplex3>();
function noiseFor(seed: number): Simplex3 {
  let n = noiseCache.get(seed);
  if (!n) { n = new Simplex3(seed); noiseCache.set(seed, n); }
  return n;
}

/** Flat launch/landing areas, keyed by body id. Direction is in the body-fixed frame. */
const pads = new Map<string, Vector3>();
export const PAD_RADIUS = 700;
export function setPad(bodyId: string, dir: Vector3 | null): void {
  if (dir) pads.set(bodyId, dir.clone().normalize()); else pads.delete(bodyId);
}
export function padOf(bodyId: string): Vector3 | undefined { return pads.get(bodyId); }

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const PERSIST = 0.574; // octave amplitude ratio (roughness exponent 0.8)

function craterField(noise: Simplex3, dir: Vector3, radius: number, scale: number, depthFrac: number, seed: number): number {
  // one crater per lattice cell; cell edge in dir-space is 1/scale
  const px = dir.x * scale;
  const py = dir.y * scale;
  const pz = dir.z * scale;
  const cx = Math.floor(px);
  const cy = Math.floor(py);
  const cz = Math.floor(pz);
  const sx = px - cx > 0.5 ? 1 : -1;
  const sy = py - cy > 0.5 ? 1 : -1;
  const sz = pz - cz > 0.5 ? 1 : -1;
  void noise;
  let h = 0;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      for (let k = 0; k < 2; k++) {
        const ix = cx + i * sx;
        const iy = cy + j * sy;
        const iz = cz + k * sz;
        const hs = hashInts(ix, iy, iz, seed);
        const jx = ((hs & 1023) / 1023) * 0.6 + 0.2;
        const jy = (((hs >>> 10) & 1023) / 1023) * 0.6 + 0.2;
        const jz = (((hs >>> 20) & 1023) / 1023) * 0.6 + 0.2;
        const size = 0.08 + (((hs >>> 5) & 255) / 255) * 0.3; // fraction of cell
        if (((hs >>> 3) & 7) === 0) continue; // empty cells
        const dx = px - (ix + jx);
        const dy = py - (iy + jy);
        const dz = pz - (iz + jz);
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) / size; // 0 at centre, 1 at rim
        if (d > 1.6) continue;
        const rr = (size / scale) * radius; // crater radius in metres (approx)
        const depth = depthFrac * rr;
        let v: number;
        if (d < 1) v = -depth * (1 - d * d) * (1 - d * d * 0.2);
        else v = depth * 0.22 * Math.exp(-(((d - 1) / 0.22) ** 2));
        h += v;
      }
    }
  }
  return h;
}

export interface TerrainSample { h: number; ground: number }

/** Raw terrain height above the reference radius in metres. May be negative (ocean floor). */
export function terrainHeight(body: BodyDef, dir: Vector3, maxOctave = 40): number {
  const T = body.terrain;
  if (!T) return 0;
  const noise = noiseFor(T.seed);
  const R = body.radius;
  const kMax = Math.min(maxOctave, Math.floor(Math.log2(R / (T.frequency * 1.2))));
  let sum = 0;
  let amp = T.amplitude * 0.55;
  let norm = 0;
  let f = T.frequency;
  let continents = 0;
  for (let k = 0; k <= kMax; k++) {
    const n = noise.noise(dir.x * f, dir.y * f, dir.z * f);
    if (k === 0) continents = n;
    if (k <= 4) {
      // ridged mountains where land is high
      const ridged = 1 - Math.abs(noise.noise(dir.x * f * 3 + 17, dir.y * f * 3, dir.z * f * 3));
      sum += amp * (n * 0.65 + (ridged - 0.5) * 0.7 * smoothstep(-0.1, 0.4, continents));
    } else sum += amp * n * (1 + 0.5 * smoothstep(0.0, 0.5, continents));
    norm += amp;
    amp *= PERSIST;
    f *= 2;
  }
  void norm;
  let h = sum;
  if (T.seaLevel !== undefined) h -= T.amplitude * 0.12; // bias the land fraction towards ~30%
  if (T.craters) {
    const c = T.craters;
    h += craterField(noise, dir, R, 5, 0.1 * c, T.seed + 1);
    h += craterField(noise, dir, R, 24, 0.12 * c, T.seed + 2);
    h += craterField(noise, dir, R, 110, 0.14 * c, T.seed + 3);
    if (R < 5e6) h += craterField(noise, dir, R, 520, 0.14 * c, T.seed + 4);
  }
  const pad = pads.get(body.id);
  if (pad) {
    const d = Math.acos(Math.min(1, Math.max(-1, pad.dot(dir)))) * R;
    if (d < PAD_RADIUS * 3) {
      const padH = padHeight(body);
      const w = 1 - smoothstep(PAD_RADIUS, PAD_RADIUS * 3, d);
      h = h * (1 - w) + padH * w;
    }
  }
  return h;
}

/** Pad elevation: a little above sea level where there is an ocean, otherwise level with the reference radius. */
export function padHeight(body: BodyDef): number {
  return body.terrain?.seaLevel !== undefined ? 22 : 0;
}

/** Ground that things stand on: ocean surfaces count as ground at sea level. */
export function groundHeight(body: BodyDef, dir: Vector3): number {
  const h = terrainHeight(body, dir);
  const sl = body.terrain?.seaLevel;
  return sl !== undefined ? Math.max(h, sl) : h;
}

export function isOcean(body: BodyDef, dir: Vector3): boolean {
  const sl = body.terrain?.seaLevel;
  return sl !== undefined && terrainHeight(body, dir) <= sl;
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Surface colour for a vertex. `slope` is 0 (flat) .. 1 (vertical). */
export function terrainColor(body: BodyDef, dir: Vector3, h: number, slope: number): RGB {
  const T = body.terrain!;
  const P = T.palette;
  const noise = noiseFor(T.seed + 99);
  const patch = noise.noise(dir.x * 40, dir.y * 40, dir.z * 40) * 0.5 + noise.noise(dir.x * 400, dir.y * 400, dir.z * 400) * 0.35;
  const rel = h / Math.max(1, T.amplitude);
  let c: RGB;
  if (T.seaLevel !== undefined) {
    const above = h - T.seaLevel;
    if (above < 0) c = mix([0.12, 0.2, 0.28], P.low, smoothstep(-900, 0, above) * 0.6);
    else if (above < 40) c = mix(P.low, P.mid, smoothstep(0, 40, above) + patch * 0.15);
    else if (above < 2400) {
      c = mix(P.mid, [P.mid[0] * 1.3, P.mid[1] * 1.15, P.mid[2] * 0.7], Math.max(0, patch));
      c = mix(c, P.high, smoothstep(900, 2400, above + patch * 400));
    } else c = mix(P.high, P.peak, smoothstep(2400, 3600, above + patch * 300));
    // deserts near the tropics, ice caps near the poles
    const lat = Math.abs(dir.y);
    if (above > 0) {
      const desert = smoothstep(0.15, 0.35, lat) * (1 - smoothstep(0.35, 0.5, lat)) * (patch > 0 ? 1 : 0.3);
      c = mix(c, P.low, desert * 0.6);
    }
    const ice = (T.ice ?? 0) * smoothstep(0.82, 0.9, lat + patch * 0.03);
    c = mix(c, P.peak, ice);
  } else {
    const t = Math.max(0, Math.min(1, rel * 1.2 + 0.5 + patch * 0.25));
    c = t < 0.5 ? mix(P.low, P.mid, t * 2) : mix(P.mid, P.high, (t - 0.5) * 2);
    c = mix(c, P.peak, smoothstep(0.85, 1.0, t) * 0.5);
    if (T.ice) c = mix(c, P.peak, T.ice * smoothstep(0.85, 0.92, Math.abs(dir.y)));
  }
  // steep faces expose bare rock
  const rock = mix(P.high, P.low, 0.3);
  return mix(c, rock, smoothstep(0.25, 0.6, slope) * 0.7);
}
