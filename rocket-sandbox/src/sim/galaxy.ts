import catalogJson from '../data/hyg-subset.json';
import { AU, BodyDef, LY, RGB, SOL, SystemDef, TerrainDef } from './bodies';
import { gaussian, hashInts, hashString, mulberry32, Rng } from './rng';

/** Star records and deterministic generated systems. Positions are galactic Cartesian light-years, Sol at the origin. */
export interface StarRec {
  id: string;
  name: string;
  x: number; y: number; z: number;
  absMag: number;
  colorIndex: number;
  spectral: string;
  mag: number;
  /** In the bundled HYG catalog (observed) versus procedurally generated filler */
  real: boolean;
  hip: number;
}

const G = 6.6743e-11;
const M_SUN = 1.98847e30;
const M_EARTH = 5.972e24;
const R_EARTH = 6.371e6;
const R_SUN = 6.957e8;

export const SECTOR_LY = 25;

interface CatalogFile { stars: [number, string, number, number, number, number, number, string, number, number][] }

function buildCatalog(): StarRec[] {
  const out: StarRec[] = [{ id: 'sol', name: 'Sol', x: 0, y: 0, z: 0, absMag: 4.85, colorIndex: 0.65, spectral: 'G2', mag: -26.7, real: true, hip: 0 }];
  for (const s of (catalogJson as unknown as CatalogFile).stars) {
    out.push({ id: `hyg:${s[0]}`, name: s[1], x: s[2], y: s[3], z: s[4], absMag: s[5], colorIndex: s[6], spectral: s[7], mag: s[8], real: true, hip: s[9] });
  }
  return out;
}

export const CATALOG: StarRec[] = buildCatalog();
const byId = new Map(CATALOG.map((s) => [s.id, s]));

export const SOL_STAR = CATALOG[0];

export function distanceLy(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

// ------------------------------------------------------------------ galactic density model

const R_SUN_GAL = 26000; // ly from the centre
/** Relative stellar density at a position (1.0 near the Sun). Thin disc + bulge, zero beyond the disc edge. */
export function galacticDensity(x: number, y: number, z: number): number {
  // +x points from the Sun toward the galactic centre, 26,000 ly away
  const cx = x - R_SUN_GAL;
  const rr = Math.hypot(cx, y);
  if (rr > 52000) return 0;
  const disc = Math.exp(-(rr - R_SUN_GAL) / 11000) * Math.exp(-Math.abs(z) / 450);
  const bulge = 40 * Math.exp(-Math.hypot(cx, y, z * 1.5) / 1800);
  return disc + bulge;
}

// ------------------------------------------------------------------ generated filler stars

const sectorCache = new Map<string, StarRec[]>();

export function sectorKey(sx: number, sy: number, sz: number): string { return `${sx},${sy},${sz}`; }

/** Generated stars for one 25 ly sector. Deterministic. */
export function sectorStars(sx: number, sy: number, sz: number): StarRec[] {
  const key = sectorKey(sx, sy, sz);
  const hit = sectorCache.get(key);
  if (hit) return hit;
  const cx = (sx + 0.5) * SECTOR_LY;
  const cy = (sy + 0.5) * SECTOR_LY;
  const cz = (sz + 0.5) * SECTOR_LY;
  const dens = galacticDensity(cx, cy, cz);
  const rng = mulberry32(hashInts(sx, sy, sz, 0x5eed));
  const expected = 0.0039 * 0.5 * SECTOR_LY ** 3 * dens; // half the true space density: the catalog supplies the rest
  const n = dens <= 0 ? 0 : Math.max(0, Math.round(expected + Math.sqrt(expected) * gaussian(rng) * 0.5));
  const out: StarRec[] = [];
  for (let i = 0; i < n; i++) {
    const x = (sx + rng()) * SECTOR_LY;
    const y = (sy + rng()) * SECTOR_LY;
    const z = (sz + rng()) * SECTOR_LY;
    const cls = starClass(rng);
    const absMag = cls.absMag + gaussian(rng) * 0.3;
    const dist = Math.hypot(x, y, z);
    const mag = absMag + 5 * Math.log10(Math.max(dist, 0.01) / 3.2616) ;
    out.push({
      id: `g:${sx}:${sy}:${sz}:${i}`,
      name: generatedName(sx, sy, sz, i),
      x, y, z, absMag, colorIndex: cls.ci, spectral: cls.spectral, mag, real: false, hip: 0,
    });
  }
  sectorCache.set(key, out);
  if (sectorCache.size > 4000) sectorCache.delete(sectorCache.keys().next().value as string);
  return out;
}

function starClass(rng: Rng): { spectral: string; absMag: number; ci: number } {
  const r = rng();
  if (r < 0.74) return { spectral: 'M' + Math.floor(rng() * 9), absMag: 9 + rng() * 6, ci: 1.4 + rng() * 0.5 };
  if (r < 0.88) return { spectral: 'K' + Math.floor(rng() * 9), absMag: 6 + rng() * 3, ci: 0.9 + rng() * 0.5 };
  if (r < 0.96) return { spectral: 'G' + Math.floor(rng() * 9), absMag: 4.2 + rng() * 1.8, ci: 0.6 + rng() * 0.3 };
  if (r < 0.985) return { spectral: 'F' + Math.floor(rng() * 9), absMag: 2.8 + rng() * 1.4, ci: 0.35 + rng() * 0.25 };
  return { spectral: 'A' + Math.floor(rng() * 9), absMag: 0.8 + rng() * 2, ci: 0.05 + rng() * 0.25 };
}

const NAME_A = ['Ar', 'Bel', 'Cor', 'Dra', 'Eld', 'Fen', 'Gal', 'Hes', 'Ith', 'Jor', 'Kal', 'Lyr', 'Mor', 'Nev', 'Ost', 'Pol', 'Quo', 'Ras', 'Sol', 'Tar', 'Ul', 'Vel', 'Wyn', 'Xan', 'Yor', 'Zen'];
const NAME_B = ['a', 'e', 'i', 'o', 'u', 'ae', 'io', 'ya'];
const NAME_C = ['ris', 'lon', 'nar', 'thys', 'dex', 'mir', 'vos', 'kan', 'pheus', 'tune', 'gard', 'rin'];

function generatedName(sx: number, sy: number, sz: number, i: number): string {
  const r = mulberry32(hashInts(sx, sy, sz, i + 91));
  return `${NAME_A[Math.floor(r() * NAME_A.length)]}${NAME_B[Math.floor(r() * NAME_B.length)]}${NAME_C[Math.floor(r() * NAME_C.length)]} ${Math.abs(sx * 31 + sy * 17 + sz * 7 + i) % 900 + 100}`;
}

export function starById(id: string): StarRec | undefined {
  const c = byId.get(id);
  if (c) return c;
  if (id.startsWith('g:')) {
    const [, sx, sy, sz, i] = id.split(':');
    return sectorStars(+sx, +sy, +sz)[+i];
  }
  return undefined;
}

/** Generated plus catalog stars inside a sphere, nearest first. `limit` bounds the cost on big views. */
export function starsWithin(cx: number, cy: number, cz: number, radius: number, limit = 6000): StarRec[] {
  const out: StarRec[] = [];
  const r2 = radius * radius;
  for (const s of CATALOG) {
    const dx = s.x - cx, dy = s.y - cy, dz = s.z - cz;
    if (dx * dx + dy * dy + dz * dz <= r2) out.push(s);
  }
  if (radius <= 160) {
    const x0 = Math.floor((cx - radius) / SECTOR_LY), x1 = Math.floor((cx + radius) / SECTOR_LY);
    const y0 = Math.floor((cy - radius) / SECTOR_LY), y1 = Math.floor((cy + radius) / SECTOR_LY);
    const z0 = Math.floor((cz - radius) / SECTOR_LY), z1 = Math.floor((cz + radius) / SECTOR_LY);
    for (let sx = x0; sx <= x1; sx++) for (let sy = y0; sy <= y1; sy++) for (let sz = z0; sz <= z1; sz++) {
      for (const s of sectorStars(sx, sy, sz)) {
        const dx = s.x - cx, dy = s.y - cy, dz = s.z - cz;
        if (dx * dx + dy * dy + dz * dz <= r2) out.push(s);
      }
    }
  }
  if (out.length > limit) {
    out.sort((a, b) => (a.x - cx) ** 2 + (a.y - cy) ** 2 + (a.z - cz) ** 2 - ((b.x - cx) ** 2 + (b.y - cy) ** 2 + (b.z - cz) ** 2));
    out.length = limit;
  }
  return out;
}

/** The generated star nearest to an arbitrary point in space (searches the point's sector and its neighbours). */
export function nearestStar(x: number, y: number, z: number): StarRec | undefined {
  let best: StarRec | undefined;
  let bd = Infinity;
  const sx = Math.floor(x / SECTOR_LY), sy = Math.floor(y / SECTOR_LY), sz = Math.floor(z / SECTOR_LY);
  for (let r = 0; r <= 3 && !best; r++) {
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
      for (const s of sectorStars(sx + dx, sy + dy, sz + dz)) {
        const d = (s.x - x) ** 2 + (s.y - y) ** 2 + (s.z - z) ** 2;
        if (d < bd) { bd = d; best = s; }
      }
    }
  }
  for (const s of CATALOG) {
    const d = (s.x - x) ** 2 + (s.y - y) ** 2 + (s.z - z) ** 2;
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

export function searchStars(query: string, limit = 12): StarRec[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: StarRec[] = [];
  for (const s of CATALOG) {
    if (s.name.toLowerCase().includes(q)) { out.push(s); if (out.length >= limit) break; }
  }
  return out;
}

// ------------------------------------------------------------------ frames

const OBLIQUITY = (23.4392911 * Math.PI) / 180;
// rows of the galactic -> equatorial rotation (transpose of the equatorial -> galactic matrix used by the catalog build)
const G2E = [
  [-0.0548755604, 0.4941094279, -0.867666149],
  [-0.8734370902, -0.44482963, -0.1980763734],
  [-0.4838350155, 0.7469822445, 0.4559837762],
];

/** Converts a galactic-frame direction into the simulator's frame (ecliptic plane = XZ, north = +Y). */
export function galacticToWorld(x: number, y: number, z: number): [number, number, number] {
  const ex = G2E[0][0] * x + G2E[0][1] * y + G2E[0][2] * z;
  const ey = G2E[1][0] * x + G2E[1][1] * y + G2E[1][2] * z;
  const ez = G2E[2][0] * x + G2E[2][1] * y + G2E[2][2] * z;
  const xe = ex;
  const ye = ey * Math.cos(OBLIQUITY) + ez * Math.sin(OBLIQUITY);
  const ze = -ey * Math.sin(OBLIQUITY) + ez * Math.cos(OBLIQUITY);
  return [xe, ze, -ye];
}

// ------------------------------------------------------------------ star physical properties

export function starRGB(ci: number): RGB {
  // Ballesteros' B-V to temperature, then a blackbody-ish tint
  const bv = Math.max(-0.4, Math.min(2.0, ci));
  const T = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  const t = T / 100;
  let r: number, g: number, b: number;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
  else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255; }
  const c = (x: number) => Math.max(0, Math.min(255, x)) / 255;
  return [c(r), c(g), c(b)];
}

export function starTemperature(ci: number): number {
  const bv = Math.max(-0.4, Math.min(2.0, ci));
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}

export function starPhysics(s: StarRec): { luminosity: number; radius: number; mass: number; temperature: number } {
  const luminosity = Math.pow(10, (4.85 - s.absMag) / 2.5);
  const temperature = starTemperature(s.colorIndex);
  const radiusSolar = Math.min(2000, Math.max(0.08, Math.sqrt(luminosity) / Math.pow(temperature / 5772, 2)));
  let mass = Math.pow(luminosity, 1 / 3.5);
  if (luminosity < 0.03) mass = Math.pow(luminosity / 0.23, 1 / 2.3);
  mass = Math.min(60, Math.max(0.08, mass));
  return { luminosity, radius: radiusSolar * R_SUN, mass: mass * M_SUN, temperature };
}

// ------------------------------------------------------------------ known exoplanets (names and orbits are observed; the rest is generated)

interface KnownPlanet { name: string; aAU: number; massEarth: number; periodDays: number; note: string }
const KNOWN: Record<number, KnownPlanet[]> = {
  70890: [
    { name: 'b', aAU: 0.0485, massEarth: 1.07, periodDays: 11.19, note: 'Temperate-zone planet around the nearest star.' },
    { name: 'd', aAU: 0.029, massEarth: 0.26, periodDays: 5.12, note: 'Sub-Earth-mass world, very close to Proxima.' },
  ],
  87937: [{ name: 'b', aAU: 0.0229, massEarth: 0.37, periodDays: 3.15, note: 'Sub-Earth detected around Barnard\'s Star.' }],
  8102: [
    { name: 'e', aAU: 0.538, massEarth: 3.9, periodDays: 162.9, note: 'Inner candidate in the Tau Ceti system.' },
    { name: 'f', aAU: 1.334, massEarth: 3.9, periodDays: 636, note: 'Candidate near the outer habitable-zone edge.' },
  ],
  16537: [{ name: 'b', aAU: 3.4, massEarth: 200, periodDays: 2690, note: 'Jupiter-mass planet around a young orange dwarf.' }],
  113357: [{ name: 'b', aAU: 0.0527, massEarth: 150, periodDays: 4.23, note: 'The first "hot Jupiter" found around a Sun-like star.' }],
  43587: [
    { name: 'e', aAU: 0.0154, massEarth: 8, periodDays: 0.74, note: 'Lava world with a year of under 18 hours.' },
    { name: 'd', aAU: 5.7, massEarth: 1200, periodDays: 5200, note: 'Cold gas giant.' },
  ],
};

// ------------------------------------------------------------------ system generation

const ROCK_PALETTES: TerrainDef['palette'][] = [
  { low: [0.45, 0.22, 0.12], mid: [0.67, 0.37, 0.2], high: [0.78, 0.52, 0.34], peak: [0.95, 0.9, 0.85] },
  { low: [0.3, 0.3, 0.32], mid: [0.5, 0.5, 0.52], high: [0.66, 0.66, 0.68], peak: [0.85, 0.85, 0.88] },
  { low: [0.55, 0.45, 0.28], mid: [0.75, 0.62, 0.4], high: [0.85, 0.75, 0.55], peak: [0.95, 0.92, 0.85] },
  { low: [0.2, 0.28, 0.3], mid: [0.32, 0.45, 0.46], high: [0.5, 0.62, 0.62], peak: [0.85, 0.92, 0.95] },
  { low: [0.34, 0.2, 0.3], mid: [0.5, 0.32, 0.45], high: [0.66, 0.5, 0.6], peak: [0.9, 0.82, 0.9] },
];
const GAS_BANDS: RGB[][] = [
  [[0.85, 0.75, 0.6], [0.7, 0.5, 0.35], [0.9, 0.82, 0.7]],
  [[0.6, 0.75, 0.9], [0.45, 0.6, 0.85], [0.7, 0.82, 0.95]],
  [[0.8, 0.5, 0.4], [0.9, 0.7, 0.55], [0.65, 0.4, 0.35]],
  [[0.55, 0.8, 0.6], [0.4, 0.65, 0.5], [0.7, 0.88, 0.72]],
];

function planetBody(
  rng: Rng, starId: string, parentId: string, name: string, idBase: string, aMeters: number, massEarth: number,
  tempK: number, parentMu: number, isMoon: boolean, forceGas = false,
): BodyDef {
  const gas = forceGas || massEarth > 25;
  const iceGiant = gas && massEarth < 100;
  let radius: number;
  if (gas) radius = (iceGiant ? 3.8 : 8 + Math.min(4, massEarth / 150)) * R_EARTH * (0.9 + rng() * 0.2);
  else radius = R_EARTH * Math.pow(massEarth, 0.28) * (0.95 + rng() * 0.1);
  const mu = G * massEarth * M_EARTH;
  const e = Math.min(0.3, Math.abs(gaussian(rng)) * 0.07);
  const base: BodyDef = {
    id: idBase, name, parent: parentId, kind: isMoon ? 'moon' : 'planet', mu, radius,
    rotationPeriod: (6 + rng() * 60) * 3600 * (isMoon ? 3 : 1),
    orbit: { a: aMeters, e, argPeri: rng() * Math.PI * 2, M0: rng() * Math.PI * 2, retrograde: rng() < 0.06 },
    color: [0.6, 0.55, 0.5], provenance: 'generated',
  };
  void starId;
  void parentMu;
  if (gas) {
    const bands = GAS_BANDS[Math.floor(rng() * GAS_BANDS.length)];
    base.gasGiant = true;
    base.color = bands[0];
    base.bands = bands;
    base.atmosphere = {
      density0: 0.1 + rng() * 0.5, pressure0: 1e5, scaleHeight: 15000 + rng() * 50000,
      sky: bands[0], glow: bands[2],
    };
    if (massEarth > 80 && rng() < 0.4) base.rings = { inner: radius * 1.3, outer: radius * 2.2, color: [0.8, 0.74, 0.62] };
    return base;
  }
  const palette = ROCK_PALETTES[Math.floor(rng() * ROCK_PALETTES.length)];
  const habitable = tempK > 230 && tempK < 330 && massEarth > 0.4 && !isMoon;
  const ocean = habitable && rng() < 0.6;
  const seed = Math.floor(rng() * 1e9);
  base.terrain = {
    seed, amplitude: Math.min(14000, radius * (0.0012 + rng() * 0.0015)) * (ocean ? 1.2 : 1),
    frequency: 1.3 + rng() * 1.5, octaves: 10, craters: ocean ? 0 : rng() < 0.6 ? 0.2 + rng() * 0.8 : 0,
    palette: ocean ? { low: [0.76, 0.7, 0.5], mid: [0.22 + rng() * 0.2, 0.42, 0.2], high: [0.4, 0.35, 0.28], peak: [0.95, 0.96, 0.98] } : palette,
    seaLevel: ocean ? 0 : undefined, oceanColor: ocean ? [0.04, 0.2 + rng() * 0.1, 0.42] : undefined,
    ice: tempK < 260 ? 0.8 : ocean ? 0.7 : 0,
  };
  base.color = palette.mid;
  const gSurf = mu / (radius * radius);
  if (massEarth > 0.25 && gSurf > 3 && tempK < 900 && rng() < 0.7 && !isMoon) {
    const dens = Math.pow(10, -2 + rng() * 3.4) * (ocean ? 1 : 1);
    const H = 7000 + rng() * 9000;
    base.atmosphere = {
      density0: dens, pressure0: dens * 8000, scaleHeight: H,
      sky: ocean ? [0.35, 0.58, 0.95] : [0.7 + rng() * 0.2, 0.5 + rng() * 0.2, 0.4 + rng() * 0.2], glow: [0.5, 0.65, 1.0],
    };
  }
  return base;
}

const systemCache = new Map<string, SystemDef>();

/** Builds the planetary system around a star. Deterministic per star id. */
export function systemForStar(star: StarRec): SystemDef {
  if (star.id === 'sol') return SOL;
  const hit = systemCache.get(star.id);
  if (hit) return hit;
  const rng = mulberry32(hashString(star.id));
  const phys = starPhysics(star);
  const starBody: BodyDef = {
    id: 'star', name: star.name, parent: null, kind: 'star', mu: G * phys.mass, radius: phys.radius,
    rotationPeriod: (5 + rng() * 30) * 86400, color: starRGB(star.colorIndex), luminous: true,
    provenance: star.real ? 'observed' : 'generated',
    blurb: `${star.spectral} star, ${phys.luminosity.toExponential(1)} L☉, ~${Math.round(phys.temperature)} K.`,
  };
  const bodies: BodyDef[] = [starBody];
  const known = star.hip ? KNOWN[star.hip] : undefined;
  const snow = 2.7 * Math.sqrt(phys.luminosity);
  const temp = (aAU: number) => 278 * Math.pow(phys.luminosity, 0.25) / Math.sqrt(Math.max(0.01, aAU));
  let provenance: SystemDef['provenance'] = star.real ? 'mixed' : 'generated';
  const letters = 'bcdefghijk';
  let count = 0;
  const addPlanet = (aAU: number, massEarth: number, nm: string, forceGas = false, periodDays?: number) => {
    const id = `p${count}`;
    const a = aAU * AU;
    const b = planetBody(rng, star.id, 'star', `${star.name} ${nm}`, id, a, massEarth, temp(aAU), starBody.mu, false, forceGas);
    if (periodDays) {
      // keep the observed period: the semi-major axis is already consistent with Kepler's third law
      b.orbit!.a = Math.cbrt((starBody.mu * (periodDays * 86400) ** 2) / (4 * Math.PI ** 2));
    }
    bodies.push(b);
    count++;
    // moons
    const nMoons = b.gasGiant ? Math.floor(rng() * 4) : massEarth > 0.8 && rng() < 0.3 ? 1 : 0;
    let ma = b.radius * (4 + rng() * 3);
    for (let m = 0; m < nMoons; m++) {
      const mm = planetBody(rng, star.id, id, `${b.name} ${['I', 'II', 'III', 'IV'][m]}`, `${id}m${m}`, ma, 0.002 + rng() * (b.gasGiant ? 0.03 : 0.01), temp(aAU), b.mu, true);
      mm.orbit!.e = Math.min(mm.orbit!.e, 0.05);
      bodies.push(mm);
      ma *= 2 + rng() * 1.5;
    }
    return b;
  };
  if (known) {
    provenance = 'mixed';
    known.forEach((k) => {
      const planet = addPlanet(k.aAU, k.massEarth, k.name, k.massEarth > 60, k.periodDays);
      planet.blurb = `${k.note} Observed: orbit and minimum mass. Generated: surface, atmosphere and rotation.`;
    });
  } else {
    const nPlanets = Math.max(0, Math.round(2.6 + gaussian(rng) * 1.9));
    let a = (0.06 + rng() * 0.4) * Math.sqrt(phys.luminosity);
    a = Math.max(0.02, a);
    for (let i = 0; i < nPlanets && a < 60; i++) {
      const beyond = a > snow;
      const mass = beyond ? (rng() < 0.55 ? 15 + rng() * 300 : 0.2 + rng() * 6) : 0.05 + Math.pow(rng(), 1.7) * 6;
      addPlanet(a, mass, letters[i] ?? String(i));
      a *= 1.45 + rng() * 0.8;
    }
  }
  // Arrival orbit: first planet, or a wide orbit about the star
  const firstPlanet = bodies.find((b) => b.parent === 'star' && !b.gasGiant) ?? bodies.find((b) => b.parent === 'star');
  const sys: SystemDef = {
    id: star.id, name: `${star.name} system`, starId: star.id, provenance, bodies,
    arrival: firstPlanet
      ? { body: firstPlanet.id, altitude: Math.max(firstPlanet.radius * 0.5, firstPlanet.atmosphere ? 150e3 : 60e3) }
      : { body: 'star', altitude: starBody.radius * 8 },
    luminosity: phys.luminosity,
  };
  systemCache.set(star.id, sys);
  void LY;
  return sys;
}
