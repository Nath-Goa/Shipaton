/** Celestial body data. SI units. Orbits are coplanar with the ecliptic (the XZ plane) and spin axes are
 *  vertical (+Y): a deliberate simplification so every system uses the same simple frame. */
export type RGB = [number, number, number];

export interface AtmosphereDef {
  /** Density at the reference level (sea level / 1 bar level for gas giants), kg/m^3 */
  density0: number;
  /** Pressure at the reference level, Pa */
  pressure0: number;
  scaleHeight: number;
  /** Colour of the daytime sky seen from inside */
  sky: RGB;
  /** Colour of the limb glow seen from space */
  glow: RGB;
}

export interface TerrainDef {
  seed: number;
  /** Peak-to-peak relief of the large-scale terrain, metres */
  amplitude: number;
  /** Base noise frequency in cycles per body radius */
  frequency: number;
  octaves: number;
  /** Ocean surface height relative to the radius (metres); undefined means a dry body */
  seaLevel?: number;
  oceanColor?: RGB;
  craters?: number;
  palette: { low: RGB; mid: RGB; high: RGB; peak: RGB };
  /** Bright polar caps, 0..1 */
  ice?: number;
}

export interface BodyDef {
  id: string;
  name: string;
  parent: string | null;
  kind: 'star' | 'planet' | 'moon' | 'dwarf';
  /** Standard gravitational parameter GM, m^3/s^2 */
  mu: number;
  radius: number;
  /** Sidereal rotation period, s (negative = retrograde) */
  rotationPeriod: number;
  orbit?: { a: number; e: number; argPeri: number; M0: number; retrograde?: boolean };
  atmosphere?: AtmosphereDef;
  terrain?: TerrainDef;
  gasGiant?: boolean;
  /** Representative colour, used by maps and distant rendering */
  color: RGB;
  bands?: RGB[];
  rings?: { inner: number; outer: number; color: RGB };
  luminous?: boolean;
  /** Provenance of the physical data */
  provenance: 'observed' | 'generated';
  blurb?: string;
}

export interface SystemDef {
  id: string;
  name: string;
  /** Star record id in the galaxy catalog, or 'sol' */
  starId: string;
  provenance: 'observed' | 'generated' | 'mixed';
  bodies: BodyDef[];
  /** Where a freshly arrived ship appears: body and circular orbit altitude (m) */
  arrival: { body: string; altitude: number };
  /** Star luminosity in solar units (for lighting and habitable-zone placement) */
  luminosity: number;
}

export const AU = 1.495978707e11;
export const G0 = 9.80665;
export const DAY = 86400;
export const LY = 9.4607304725808e15;

const deg = (d: number) => (d * Math.PI) / 180;

/** Sphere of influence radius for a body orbiting a parent */
export function soiRadius(body: BodyDef, parent: BodyDef): number {
  if (!body.orbit) return Infinity;
  return body.orbit.a * Math.pow(body.mu / parent.mu, 0.4);
}

export function atmosphereTop(body: BodyDef): number {
  const a = body.atmosphere;
  if (!a) return 0;
  return a.scaleHeight * Math.log(a.density0 / 1e-8);
}

export function atmosphereDensity(body: BodyDef, altitude: number): number {
  const a = body.atmosphere;
  if (!a) return 0;
  if (altitude > atmosphereTop(body)) return 0;
  return a.density0 * Math.exp(-altitude / a.scaleHeight);
}

export function atmospherePressure(body: BodyDef, altitude: number): number {
  const a = body.atmosphere;
  if (!a) return 0;
  return a.pressure0 * Math.exp(-altitude / a.scaleHeight);
}

export function surfaceGravity(body: BodyDef): number {
  return body.mu / (body.radius * body.radius);
}

const rock = (low: RGB, mid: RGB, high: RGB, peak: RGB) => ({ low, mid, high, peak });

function moon(
  id: string, name: string, parent: string, mu: number, radius: number, a: number, e: number, periodDays: number,
  M0: number, terrain: Partial<TerrainDef> & { palette: TerrainDef['palette'] }, color: RGB,
  extra: Partial<BodyDef> = {},
): BodyDef {
  return {
    id, name, parent, kind: 'moon', mu, radius,
    rotationPeriod: extra.rotationPeriod ?? periodDays * DAY,
    orbit: { a, e, argPeri: deg(M0 * 0.7), M0: deg(M0), retrograde: periodDays < 0 },
    terrain: { seed: Math.abs(Math.floor(mu % 9973)) + 7, amplitude: radius * 0.012, frequency: 3, octaves: 8, craters: 0.5, ...terrain },
    color, provenance: 'observed', ...extra,
  };
}

const grey = rock([0.32, 0.31, 0.3], [0.52, 0.5, 0.48], [0.68, 0.66, 0.63], [0.82, 0.81, 0.8]);
const iceRock = rock([0.55, 0.58, 0.62], [0.78, 0.8, 0.82], [0.9, 0.92, 0.94], [0.97, 0.98, 1]);

const sunBody: BodyDef = {
  id: 'sun', name: 'Sun', parent: null, kind: 'star', mu: 1.32712440018e20, radius: 6.957e8,
  rotationPeriod: 25.05 * DAY, color: [1, 0.86, 0.55], luminous: true, provenance: 'observed',
  blurb: 'G2V yellow dwarf containing 99.86% of the Solar System\'s mass.',
};

export const SOL_BODIES: BodyDef[] = [
  sunBody,
  {
    id: 'mercury', name: 'Mercury', parent: 'sun', kind: 'planet', mu: 2.2032e13, radius: 2.4397e6,
    rotationPeriod: 58.646 * DAY, orbit: { a: 5.7909e10, e: 0.2056, argPeri: deg(77.46 - 48.3), M0: deg(174.8) },
    terrain: { seed: 11, amplitude: 9000, frequency: 2.5, octaves: 9, craters: 0.9, palette: rock([0.28, 0.27, 0.26], [0.45, 0.43, 0.41], [0.6, 0.58, 0.55], [0.72, 0.7, 0.68]) },
    color: [0.5, 0.47, 0.44], provenance: 'observed', blurb: 'Smallest planet; scorched by day, frozen by night, no atmosphere.',
  },
  {
    id: 'venus', name: 'Venus', parent: 'sun', kind: 'planet', mu: 3.24859e14, radius: 6.0518e6,
    rotationPeriod: -243.02 * DAY, orbit: { a: 1.08208e11, e: 0.0068, argPeri: deg(131.5 - 76.7), M0: deg(50.1) },
    atmosphere: { density0: 65, pressure0: 9.2e6, scaleHeight: 15900, sky: [0.85, 0.65, 0.35], glow: [0.95, 0.8, 0.5] },
    terrain: { seed: 22, amplitude: 11000, frequency: 2, octaves: 9, palette: rock([0.35, 0.28, 0.2], [0.5, 0.4, 0.28], [0.62, 0.5, 0.35], [0.72, 0.6, 0.45]) },
    color: [0.9, 0.75, 0.45], provenance: 'observed', blurb: 'Crushing 92-bar CO2 atmosphere; the hottest planet.',
  },
  {
    id: 'earth', name: 'Earth', parent: 'sun', kind: 'planet', mu: 3.986004418e14, radius: 6.371e6,
    rotationPeriod: 86164.1, orbit: { a: AU, e: 0.0167, argPeri: deg(102.9 - 0), M0: deg(357.5) },
    atmosphere: { density0: 1.225, pressure0: 101325, scaleHeight: 8500, sky: [0.35, 0.58, 0.95], glow: [0.35, 0.6, 1.0] },
    terrain: {
      seed: 33, amplitude: 9000, frequency: 1.4, octaves: 10, seaLevel: 0, oceanColor: [0.04, 0.2, 0.42], ice: 0.9,
      palette: rock([0.76, 0.7, 0.5], [0.22, 0.42, 0.2], [0.4, 0.35, 0.28], [0.95, 0.96, 0.98]),
    },
    color: [0.2, 0.4, 0.75], provenance: 'observed', blurb: 'Home. Launch site on the equator at 0° longitude.',
  },
  moon('moon', 'Moon', 'earth', 4.9048695e12, 1.7374e6, 3.844e8, 0.0549, 27.322, 30, { amplitude: 8000, craters: 1, frequency: 2.2, palette: grey }, [0.6, 0.6, 0.58], { blurb: 'Earth\'s only natural satellite; tidally locked.' }),
  {
    id: 'mars', name: 'Mars', parent: 'sun', kind: 'planet', mu: 4.282837e13, radius: 3.3895e6,
    rotationPeriod: 88642.7, orbit: { a: 2.27956e11, e: 0.0934, argPeri: deg(336.1 - 49.6), M0: deg(19.4) },
    atmosphere: { density0: 0.02, pressure0: 610, scaleHeight: 11100, sky: [0.75, 0.55, 0.4], glow: [0.8, 0.55, 0.4] },
    terrain: { seed: 44, amplitude: 14000, frequency: 1.8, octaves: 10, craters: 0.35, ice: 0.5, palette: rock([0.45, 0.22, 0.12], [0.67, 0.37, 0.2], [0.78, 0.52, 0.34], [0.95, 0.9, 0.85]) },
    color: [0.72, 0.38, 0.22], provenance: 'observed', blurb: 'Cold desert world with a thin CO2 atmosphere and the Solar System\'s tallest volcano.',
  },
  moon('phobos', 'Phobos', 'mars', 7.087e5, 11267, 9.376e6, 0.0151, 0.3189, 80, { amplitude: 1500, craters: 0.9, frequency: 1.5, palette: rock([0.22, 0.2, 0.19], [0.34, 0.31, 0.29], [0.45, 0.42, 0.4], [0.55, 0.52, 0.5]) }, [0.35, 0.32, 0.3]),
  moon('deimos', 'Deimos', 'mars', 98, 6200, 2.3463e7, 0.0005, 1.263, 200, { amplitude: 700, craters: 0.5, frequency: 1.5, palette: rock([0.3, 0.27, 0.24], [0.42, 0.38, 0.34], [0.52, 0.48, 0.44], [0.6, 0.57, 0.53]) }, [0.4, 0.37, 0.33]),
  {
    id: 'jupiter', name: 'Jupiter', parent: 'sun', kind: 'planet', mu: 1.26686534e17, radius: 6.9911e7,
    rotationPeriod: 35730, orbit: { a: 7.7857e11, e: 0.0489, argPeri: deg(14.3 - 100.5), M0: deg(20) },
    atmosphere: { density0: 0.16, pressure0: 1e5, scaleHeight: 27000, sky: [0.75, 0.6, 0.45], glow: [0.85, 0.7, 0.5] },
    gasGiant: true, color: [0.8, 0.65, 0.5],
    bands: [[0.85, 0.75, 0.6], [0.7, 0.5, 0.35], [0.9, 0.82, 0.7], [0.62, 0.42, 0.3], [0.88, 0.78, 0.62]],
    provenance: 'observed', blurb: 'Gas giant; "surface" is the 1-bar level. No solid ground — pressure will crush a hull.',
  },
  moon('io', 'Io', 'jupiter', 5.959916e12, 1.8216e6, 4.217e8, 0.004, 1.769, 10, { amplitude: 9000, craters: 0.05, frequency: 3, palette: rock([0.6, 0.5, 0.15], [0.85, 0.75, 0.3], [0.9, 0.85, 0.55], [0.97, 0.95, 0.85]) }, [0.85, 0.75, 0.3]),
  moon('europa', 'Europa', 'jupiter', 3.202739e12, 1.5608e6, 6.711e8, 0.009, 3.551, 120, { amplitude: 1500, craters: 0.1, frequency: 3, palette: rock([0.5, 0.4, 0.3], [0.8, 0.77, 0.7], [0.9, 0.88, 0.84], [0.97, 0.97, 0.97]) }, [0.82, 0.78, 0.7]),
  moon('ganymede', 'Ganymede', 'jupiter', 9.887834e12, 2.6341e6, 1.0704e9, 0.0013, 7.155, 250, { amplitude: 5000, craters: 0.6, frequency: 2.5, palette: rock([0.3, 0.27, 0.24], [0.5, 0.46, 0.42], [0.68, 0.66, 0.62], [0.85, 0.85, 0.85]) }, [0.5, 0.47, 0.43]),
  moon('callisto', 'Callisto', 'jupiter', 7.179289e12, 2.4103e6, 1.8827e9, 0.0074, 16.689, 300, { amplitude: 4500, craters: 1, frequency: 2.5, palette: rock([0.2, 0.18, 0.16], [0.34, 0.31, 0.28], [0.5, 0.47, 0.44], [0.7, 0.68, 0.66]) }, [0.35, 0.32, 0.29]),
  {
    id: 'saturn', name: 'Saturn', parent: 'sun', kind: 'planet', mu: 3.7931187e16, radius: 5.8232e7,
    rotationPeriod: 38362, orbit: { a: 1.43353e12, e: 0.0565, argPeri: deg(93.1 - 113.7), M0: deg(317) },
    atmosphere: { density0: 0.19, pressure0: 1e5, scaleHeight: 59500, sky: [0.85, 0.75, 0.55], glow: [0.9, 0.82, 0.6] },
    gasGiant: true, color: [0.88, 0.8, 0.6], bands: [[0.9, 0.82, 0.62], [0.82, 0.72, 0.52], [0.93, 0.87, 0.7], [0.78, 0.68, 0.5]],
    rings: { inner: 7.4e7, outer: 1.4e8, color: [0.8, 0.74, 0.62] },
    provenance: 'observed', blurb: 'Ringed gas giant, lighter than water on average.',
  },
  moon('titan', 'Titan', 'saturn', 8.978138e12, 2.5747e6, 1.22187e9, 0.0288, 15.945, 40, {
    amplitude: 1500, craters: 0.05, frequency: 2, palette: rock([0.4, 0.3, 0.12], [0.62, 0.45, 0.2], [0.72, 0.55, 0.28], [0.8, 0.65, 0.4]),
  }, [0.75, 0.55, 0.25], { atmosphere: { density0: 5.3, pressure0: 146700, scaleHeight: 20000, sky: [0.8, 0.5, 0.2], glow: [0.9, 0.6, 0.25] }, blurb: 'Thick nitrogen atmosphere — parachutes work wonderfully in 1.45 bar.' }),
  moon('rhea', 'Rhea', 'saturn', 1.5394e11, 7.638e5, 5.27108e8, 0.001, 4.518, 160, { amplitude: 2500, craters: 0.9, palette: iceRock }, [0.8, 0.8, 0.8]),
  moon('iapetus', 'Iapetus', 'saturn', 1.2056e11, 7.346e5, 3.5608e9, 0.0276, 79.32, 210, { amplitude: 6000, craters: 0.8, palette: rock([0.12, 0.1, 0.09], [0.25, 0.22, 0.2], [0.7, 0.7, 0.68], [0.95, 0.95, 0.95]) }, [0.5, 0.48, 0.45]),
  moon('enceladus', 'Enceladus', 'saturn', 7.2095e9, 2.521e5, 2.3802e8, 0.0047, 1.370, 300, { amplitude: 900, craters: 0.3, palette: iceRock }, [0.95, 0.96, 0.98]),
  {
    id: 'uranus', name: 'Uranus', parent: 'sun', kind: 'planet', mu: 5.793939e15, radius: 2.5362e7,
    rotationPeriod: -62064, orbit: { a: 2.87246e12, e: 0.0457, argPeri: deg(173 - 74), M0: deg(142.2) },
    atmosphere: { density0: 0.42, pressure0: 1e5, scaleHeight: 27700, sky: [0.45, 0.75, 0.8], glow: [0.55, 0.85, 0.9] },
    gasGiant: true, color: [0.6, 0.85, 0.88], bands: [[0.6, 0.85, 0.88], [0.55, 0.8, 0.84], [0.66, 0.9, 0.92]],
    provenance: 'observed', blurb: 'Ice giant with a featureless blue-green atmosphere.',
  },
  moon('titania', 'Titania', 'uranus', 2.269e11, 7.884e5, 4.363e8, 0.0011, 8.706, 20, { amplitude: 3000, craters: 0.7, palette: rock([0.28, 0.26, 0.25], [0.46, 0.43, 0.41], [0.6, 0.57, 0.55], [0.75, 0.73, 0.72]) }, [0.5, 0.47, 0.45]),
  moon('oberon', 'Oberon', 'uranus', 2.053e11, 7.614e5, 5.835e8, 0.0014, 13.463, 140, { amplitude: 3000, craters: 0.9, palette: rock([0.24, 0.22, 0.21], [0.4, 0.37, 0.35], [0.55, 0.52, 0.5], [0.7, 0.68, 0.66]) }, [0.45, 0.42, 0.4]),
  moon('miranda', 'Miranda', 'uranus', 4.4e9, 2.357e5, 1.299e8, 0.0013, 1.413, 260, { amplitude: 4000, craters: 0.5, palette: iceRock }, [0.7, 0.7, 0.72]),
  {
    id: 'neptune', name: 'Neptune', parent: 'sun', kind: 'planet', mu: 6.836529e15, radius: 2.4622e7,
    rotationPeriod: 57996, orbit: { a: 4.49506e12, e: 0.0113, argPeri: deg(48.1 - 131.8), M0: deg(256.2) },
    atmosphere: { density0: 0.45, pressure0: 1e5, scaleHeight: 19700, sky: [0.2, 0.35, 0.85], glow: [0.3, 0.5, 1] },
    gasGiant: true, color: [0.25, 0.4, 0.9], bands: [[0.22, 0.38, 0.88], [0.3, 0.46, 0.92], [0.18, 0.32, 0.8]],
    provenance: 'observed', blurb: 'Windiest planet; supersonic storms in a deep blue atmosphere.',
  },
  moon('triton', 'Triton', 'neptune', 1.428e12, 1.3534e6, 3.5476e8, 0.00002, -5.877, 90, {
    amplitude: 1500, craters: 0.15, ice: 0.8, palette: rock([0.55, 0.5, 0.5], [0.8, 0.75, 0.74], [0.9, 0.86, 0.85], [0.97, 0.96, 0.96]),
  }, [0.85, 0.8, 0.78], { atmosphere: { density0: 1.2e-5, pressure0: 1.4, scaleHeight: 14000, sky: [0.3, 0.3, 0.4], glow: [0.5, 0.5, 0.6] } }),
  {
    id: 'pluto', name: 'Pluto', parent: 'sun', kind: 'dwarf', mu: 8.71e11, radius: 1.1883e6,
    rotationPeriod: -6.387 * DAY, orbit: { a: 5.90638e12, e: 0.2488, argPeri: deg(224.1 - 110.3), M0: deg(14.9) },
    atmosphere: { density0: 1.0e-5, pressure0: 1, scaleHeight: 50000, sky: [0.3, 0.35, 0.55], glow: [0.45, 0.5, 0.75] },
    terrain: { seed: 99, amplitude: 5000, frequency: 2.2, octaves: 9, craters: 0.3, ice: 0.7, palette: rock([0.4, 0.28, 0.22], [0.7, 0.58, 0.48], [0.88, 0.8, 0.72], [0.97, 0.95, 0.93]) },
    color: [0.78, 0.66, 0.55], provenance: 'observed', blurb: 'Dwarf planet with a nitrogen-ice heart.',
  },
  moon('charon', 'Charon', 'pluto', 1.0588e11, 6.06e5, 1.9591e7, 0.0, 6.387, 100, { amplitude: 3500, craters: 0.5, palette: rock([0.3, 0.28, 0.27], [0.5, 0.47, 0.46], [0.65, 0.62, 0.6], [0.8, 0.78, 0.76]) }, [0.55, 0.52, 0.5]),
];

export const SOL: SystemDef = {
  id: 'sol', name: 'Solar System', starId: 'sol', provenance: 'observed', bodies: SOL_BODIES,
  arrival: { body: 'earth', altitude: 400e3 }, luminosity: 1,
};

/** Look-ups over a system. Cheap enough to build once per system and keep around. */
export class SystemIndex {
  readonly byId = new Map<string, BodyDef>();
  readonly children = new Map<string, BodyDef[]>();
  readonly soi = new Map<string, number>();
  readonly star: BodyDef;

  constructor(readonly sys: SystemDef) {
    for (const b of sys.bodies) this.byId.set(b.id, b);
    for (const b of sys.bodies) {
      if (b.parent) {
        const list = this.children.get(b.parent) ?? [];
        list.push(b);
        this.children.set(b.parent, list);
        this.soi.set(b.id, soiRadius(b, this.byId.get(b.parent)!));
      } else this.soi.set(b.id, Infinity);
    }
    this.star = sys.bodies.find((b) => b.parent === null)!;
  }

  get(id: string): BodyDef {
    const b = this.byId.get(id);
    if (!b) throw new Error(`unknown body ${id}`);
    return b;
  }
}
