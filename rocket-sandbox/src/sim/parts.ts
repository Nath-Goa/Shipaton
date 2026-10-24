export type PartKind =
  | 'pod' | 'tank' | 'engine' | 'srb' | 'decoupler' | 'adapter' | 'nose' | 'fairing'
  | 'chute' | 'leg' | 'shield' | 'jump';

export type PartCategory = 'Command' | 'Fuel' | 'Engines' | 'Boosters' | 'Structural' | 'Recovery' | 'Special';

export interface PartDef {
  id: string;
  name: string;
  kind: PartKind;
  category: PartCategory;
  attach: 'stack' | 'radial';
  /** Body diameter (m) */
  dia: number;
  /** Node diameters; null means the node does not exist */
  topDia: number | null;
  bottomDia: number | null;
  length: number;
  /** Dry mass, kg */
  mass: number;
  /** Propellant capacity, kg */
  fuel?: number;
  thrust?: number;
  ispVac?: number;
  ispAtm?: number;
  gimbal?: number;
  crew?: number;
  /** Reaction-wheel torque, N*m */
  torque?: number;
  chuteArea?: number;
  legLength?: number;
  /** Heat tolerance as a multiplier on the base hull tolerance */
  heatShield?: number;
  jumpRangeLy?: number;
  /** Highest ambient pressure the part survives, Pa */
  maxPressure: number;
  /** Touchdown speed the part tolerates, m/s */
  impactTol: number;
  /** Drag shaping: <1 streamlined, >1 blunt */
  cd: number;
  desc: string;
}

const FUEL_DENSITY = 950;

function tank(dia: number, len: number): PartDef {
  const tag = dia < 2 ? 'S1' : dia < 3 ? 'S2' : 'S3';
  const fuel = Math.round(Math.PI * (dia / 2) ** 2 * len * FUEL_DENSITY);
  return {
    id: `tank_${tag.toLowerCase()}_${String(len).replace('.', '_')}`,
    name: `${tag} Tank ${len} m`,
    kind: 'tank', category: 'Fuel', attach: 'stack', dia, topDia: dia, bottomDia: dia, length: len,
    mass: Math.round(fuel * 0.075 + 25 * dia), fuel,
    maxPressure: 6e5, impactTol: 3, cd: 1,
    desc: `Liquid propellant tank holding ${fuel.toLocaleString()} kg.`,
  };
}


export const PARTS: PartDef[] = [
  // --- Command ---
  {
    id: 'pod_s1', name: 'Voyager Capsule', kind: 'pod', category: 'Command', attach: 'stack', dia: 1.25, topDia: null, bottomDia: 1.25, length: 1.6,
    mass: 850, crew: 1, torque: 18000, maxPressure: 1.5e6, impactTol: 9, cd: 0.55,
    desc: 'One-astronaut capsule with reaction wheels. The classic.',
  },
  {
    id: 'pod_s2', name: 'Orbiter Capsule', kind: 'pod', category: 'Command', attach: 'stack', dia: 2.5, topDia: null, bottomDia: 2.5, length: 2.6,
    mass: 3600, crew: 3, torque: 90000, maxPressure: 2e6, impactTol: 9, cd: 0.55,
    desc: 'Three-astronaut capsule for orbital missions and the Moon.',
  },
  {
    id: 'lander_s2', name: 'Lunar Lander Cabin', kind: 'pod', category: 'Command', attach: 'stack', dia: 2.5, topDia: 2.5, bottomDia: 2.5, length: 2.2,
    mass: 2300, crew: 2, torque: 60000, maxPressure: 3e5, impactTol: 6, cd: 0.9,
    desc: 'Two-astronaut cabin with top and bottom nodes, light-weight for vacuum landings.',
  },
  {
    id: 'cabin_s3', name: 'Expedition Cabin', kind: 'pod', category: 'Command', attach: 'stack', dia: 3.75, topDia: null, bottomDia: 3.75, length: 3.4,
    mass: 9200, crew: 5, torque: 380000, maxPressure: 2e6, impactTol: 8, cd: 0.6,
    desc: 'Five-astronaut cabin with large reaction wheels for interplanetary ships.',
  },
  {
    id: 'probe_s1', name: 'Autonomous Probe Core', kind: 'pod', category: 'Command', attach: 'stack', dia: 1.25, topDia: 1.25, bottomDia: 1.25, length: 0.5,
    mass: 120, crew: 0, torque: 8000, maxPressure: 1e6, impactTol: 6, cd: 0.9,
    desc: 'Uncrewed control unit. Lets a detached booster stay flyable.',
  },
  {
    id: 'probe_s2', name: 'S2 Probe Core', kind: 'pod', category: 'Command', attach: 'stack', dia: 2.5, topDia: 2.5, bottomDia: 2.5, length: 0.5,
    mass: 260, crew: 0, torque: 40000, maxPressure: 1e6, impactTol: 6, cd: 0.9,
    desc: 'Uncrewed S2 control unit with stronger reaction wheels.',
  },
  {
    id: 'probe_s3', name: 'S3 Probe Core', kind: 'pod', category: 'Command', attach: 'stack', dia: 3.75, topDia: 3.75, bottomDia: 3.75, length: 0.6,
    mass: 450, crew: 0, torque: 140000, maxPressure: 1e6, impactTol: 6, cd: 0.9,
    desc: 'Uncrewed S3 control unit — lets a detached first stage stay flyable.',
  },

  // --- Tanks ---
  tank(1.25, 0.6), tank(1.25, 1.2), tank(1.25, 2.4),
  tank(2.5, 2), tank(2.5, 4), tank(2.5, 8),
  tank(3.75, 4), tank(3.75, 8), tank(3.75, 12),

  // --- Engines ---
  {
    id: 'eng_spark', name: 'Spark', kind: 'engine', category: 'Engines', attach: 'stack', dia: 1.25, topDia: 1.25, bottomDia: 1.25, length: 1.1,
    mass: 160, thrust: 65e3, ispVac: 310, ispAtm: 265, gimbal: 3, maxPressure: 8e5, impactTol: 4.5, cd: 1,
    desc: 'Compact S1 sea-level engine.',
  },
  {
    id: 'eng_wisp', name: 'Wisp (vacuum)', kind: 'engine', category: 'Engines', attach: 'stack', dia: 1.25, topDia: 1.25, bottomDia: 1.25, length: 1.4,
    mass: 125, thrust: 38e3, ispVac: 355, ispAtm: 90, gimbal: 1, maxPressure: 8e5, impactTol: 4.5, cd: 1,
    desc: 'Efficient S1 vacuum engine for upper stages and landers.',
  },
  {
    id: 'eng_hawk', name: 'Hawk', kind: 'engine', category: 'Engines', attach: 'stack', dia: 2.5, topDia: 2.5, bottomDia: 2.5, length: 2.2,
    mass: 1000, thrust: 260e3, ispVac: 335, ispAtm: 290, gimbal: 3, maxPressure: 8e5, impactTol: 5, cd: 1,
    desc: 'Workhorse S2 booster engine.',
  },
  {
    id: 'eng_owl', name: 'Owl (vacuum)', kind: 'engine', category: 'Engines', attach: 'stack', dia: 2.5, topDia: 2.5, bottomDia: 2.5, length: 2.6,
    mass: 800, thrust: 180e3, ispVac: 430, ispAtm: 110, gimbal: 2, maxPressure: 8e5, impactTol: 5, cd: 1,
    desc: 'High-efficiency S2 vacuum engine.',
  },
  {
    id: 'eng_phoenix', name: 'Phoenix (nuclear)', kind: 'engine', category: 'Engines', attach: 'stack', dia: 3.75, topDia: 3.75, bottomDia: 3.75, length: 4.2,
    mass: 5500, thrust: 180e3, ispVac: 820, ispAtm: 250, gimbal: 0.5, maxPressure: 8e5, impactTol: 4, cd: 1,
    desc: 'Nuclear thermal engine. Heavy, gentle, extremely efficient — ideal for interplanetary cruise.',
  },
  {
    id: 'eng_titan', name: 'Titan', kind: 'engine', category: 'Engines', attach: 'stack', dia: 3.75, topDia: 3.75, bottomDia: 3.75, length: 3.4,
    mass: 5200, thrust: 3000e3, ispVac: 345, ispAtm: 300, gimbal: 2.5, maxPressure: 8e5, impactTol: 6, cd: 1,
    desc: 'Heavy-lift S3 first-stage engine.',
  },
  {
    id: 'eng_condor', name: 'Condor (vacuum)', kind: 'engine', category: 'Engines', attach: 'stack', dia: 3.75, topDia: 3.75, bottomDia: 3.75, length: 4,
    mass: 2300, thrust: 420e3, ispVac: 450, ispAtm: 130, gimbal: 1.5, maxPressure: 8e5, impactTol: 6, cd: 1,
    desc: 'S3 vacuum engine for transfer stages.',
  },

  // --- Boosters (radial) ---
  {
    id: 'srb_s1', name: 'Thumper Booster', kind: 'srb', category: 'Boosters', attach: 'radial', dia: 0.9, topDia: null, bottomDia: null, length: 6,
    mass: 600, fuel: 6000, thrust: 300e3, ispVac: 250, ispAtm: 230, maxPressure: 8e5, impactTol: 5, cd: 1,
    desc: 'Solid rocket booster. Fires until burnt out; cannot be throttled or stopped.',
  },
  {
    id: 'srb_s2', name: 'Juggernaut Booster', kind: 'srb', category: 'Boosters', attach: 'radial', dia: 1.6, topDia: null, bottomDia: null, length: 12,
    mass: 3200, fuel: 36000, thrust: 1400e3, ispVac: 250, ispAtm: 225, maxPressure: 8e5, impactTol: 5, cd: 1,
    desc: 'Large solid booster for heavy lift.',
  },

  // --- Structural ---
  {
    id: 'dec_s1', name: 'S1 Decoupler', kind: 'decoupler', category: 'Structural', attach: 'stack', dia: 1.25, topDia: 1.25, bottomDia: 1.25, length: 0.2,
    mass: 50, maxPressure: 1e6, impactTol: 6, cd: 1, desc: 'Separates everything below it when staged.',
  },
  {
    id: 'dec_s2', name: 'S2 Decoupler', kind: 'decoupler', category: 'Structural', attach: 'stack', dia: 2.5, topDia: 2.5, bottomDia: 2.5, length: 0.3,
    mass: 200, maxPressure: 1e6, impactTol: 6, cd: 1, desc: 'Separates everything below it when staged.',
  },
  {
    id: 'dec_s3', name: 'S3 Decoupler', kind: 'decoupler', category: 'Structural', attach: 'stack', dia: 3.75, topDia: 3.75, bottomDia: 3.75, length: 0.4,
    mass: 550, maxPressure: 1e6, impactTol: 6, cd: 1, desc: 'Separates everything below it when staged.',
  },
  {
    id: 'adp_s1_s2', name: 'Adapter S1→S2', kind: 'adapter', category: 'Structural', attach: 'stack', dia: 2.5, topDia: 1.25, bottomDia: 2.5, length: 1,
    mass: 140, maxPressure: 1e6, impactTol: 6, cd: 1, desc: 'Widens a 1.25 m stack to 2.5 m.',
  },
  {
    id: 'adp_s2_s3', name: 'Adapter S2→S3', kind: 'adapter', category: 'Structural', attach: 'stack', dia: 3.75, topDia: 2.5, bottomDia: 3.75, length: 1.5,
    mass: 420, maxPressure: 1e6, impactTol: 6, cd: 1, desc: 'Widens a 2.5 m stack to 3.75 m.',
  },
  {
    id: 'nose_s1', name: 'S1 Nose Cone', kind: 'nose', category: 'Structural', attach: 'stack', dia: 1.25, topDia: null, bottomDia: 1.25, length: 1.4,
    mass: 40, maxPressure: 8e5, impactTol: 4, cd: 0.35, desc: 'Streamlined cap that cuts drag.',
  },
  {
    id: 'nose_s2', name: 'S2 Nose Cone', kind: 'nose', category: 'Structural', attach: 'stack', dia: 2.5, topDia: null, bottomDia: 2.5, length: 2.6,
    mass: 150, maxPressure: 8e5, impactTol: 4, cd: 0.35, desc: 'Streamlined cap that cuts drag.',
  },
  {
    id: 'nose_s3', name: 'S3 Nose Cone', kind: 'nose', category: 'Structural', attach: 'stack', dia: 3.75, topDia: null, bottomDia: 3.75, length: 3.6,
    mass: 380, maxPressure: 8e5, impactTol: 4, cd: 0.35, desc: 'Streamlined cap that cuts drag.',
  },
  {
    id: 'fairing_s1', name: 'S1 Payload Fairing', kind: 'fairing', category: 'Structural', attach: 'stack', dia: 1.25, topDia: 1.25, bottomDia: 1.25, length: 0.25,
    mass: 90, maxPressure: 8e5, impactTol: 3, cd: 0.35, desc: 'Encloses everything above it. Jettison once in thin air.',
  },
  {
    id: 'fairing_s2', name: 'S2 Payload Fairing', kind: 'fairing', category: 'Structural', attach: 'stack', dia: 2.5, topDia: 2.5, bottomDia: 2.5, length: 0.3,
    mass: 300, maxPressure: 8e5, impactTol: 3, cd: 0.35, desc: 'Encloses everything above it. Jettison once in thin air.',
  },
  {
    id: 'fairing_s3', name: 'S3 Payload Fairing', kind: 'fairing', category: 'Structural', attach: 'stack', dia: 3.75, topDia: 3.75, bottomDia: 3.75, length: 0.4,
    mass: 750, maxPressure: 8e5, impactTol: 3, cd: 0.35, desc: 'Encloses everything above it. Jettison once in thin air.',
  },

  // --- Recovery ---
  {
    id: 'chute_s1', name: 'Parachute (light)', kind: 'chute', category: 'Recovery', attach: 'radial', dia: 0.3, topDia: null, bottomDia: null, length: 0.5,
    mass: 60, chuteArea: 150, maxPressure: 8e5, impactTol: 6, cd: 1,
    desc: 'Opens in thin air and fully inflates lower down. Tears if deployed too fast.',
  },
  {
    id: 'chute_s2', name: 'Parachute (heavy)', kind: 'chute', category: 'Recovery', attach: 'radial', dia: 0.5, topDia: null, bottomDia: null, length: 0.8,
    mass: 220, chuteArea: 650, maxPressure: 8e5, impactTol: 6, cd: 1,
    desc: 'Large canopy for heavy capsules.',
  },
  {
    id: 'leg_s1', name: 'Landing Leg (light)', kind: 'leg', category: 'Recovery', attach: 'radial', dia: 0.2, topDia: null, bottomDia: null, length: 1,
    mass: 25, legLength: 1.6, maxPressure: 8e5, impactTol: 8, cd: 1,
    desc: 'Folding leg. Use in sets of three or four.',
  },
  {
    id: 'leg_s2', name: 'Landing Leg (heavy)', kind: 'leg', category: 'Recovery', attach: 'radial', dia: 0.4, topDia: null, bottomDia: null, length: 2,
    mass: 140, legLength: 3.4, maxPressure: 8e5, impactTol: 9, cd: 1,
    desc: 'Long shock-absorbing leg for big landers.',
  },
  {
    id: 'shield_s1', name: 'S1 Heat Shield', kind: 'shield', category: 'Recovery', attach: 'stack', dia: 1.25, topDia: 1.25, bottomDia: 1.25, length: 0.2,
    mass: 220, heatShield: 8, maxPressure: 1e6, impactTol: 6, cd: 1, desc: 'Ablative shield for re-entry. Point it into the airflow.',
  },
  {
    id: 'shield_s2', name: 'S2 Heat Shield', kind: 'shield', category: 'Recovery', attach: 'stack', dia: 2.5, topDia: 2.5, bottomDia: 2.5, length: 0.3,
    mass: 900, heatShield: 8, maxPressure: 1e6, impactTol: 6, cd: 1, desc: 'Ablative shield for re-entry. Point it into the airflow.',
  },
  {
    id: 'shield_s3', name: 'S3 Heat Shield', kind: 'shield', category: 'Recovery', attach: 'stack', dia: 3.75, topDia: 3.75, bottomDia: 3.75, length: 0.4,
    mass: 2700, heatShield: 8, maxPressure: 1e6, impactTol: 6, cd: 1, desc: 'Ablative shield for re-entry. Point it into the airflow.',
  },

  // --- Special ---
  {
    id: 'jump_drive', name: 'Fold-Space Jump Drive', kind: 'jump', category: 'Special', attach: 'stack', dia: 3.75, topDia: 3.75, bottomDia: 3.75, length: 2.6,
    mass: 5200, jumpRangeLy: 60, maxPressure: 6e5, impactTol: 3, cd: 1,
    desc: 'Fictional faster-than-light drive. Holds charge for a 60 ly jump and recharges while time passes.',
  },
];

export const PART_BY_ID = new Map(PARTS.map((p) => [p.id, p]));

export function partDef(id: string): PartDef {
  const p = PART_BY_ID.get(id);
  if (!p) throw new Error(`unknown part ${id}`);
  return p;
}
