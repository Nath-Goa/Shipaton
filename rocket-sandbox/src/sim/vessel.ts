import { Matrix4, Quaternion, Vector3 } from 'three';
import { Design, Edge, StageAction, layout } from './design';
import { PartDef, partDef } from './parts';
import { G0 } from './bodies';

export type ChuteState = 'stowed' | 'armed' | 'reefed' | 'inflating' | 'full' | 'cut';

export interface PartRT {
  id: number;
  def: PartDef;
  /** Centre of the part in the vessel's design space (the frame the vessel was built in) */
  pos: Vector3;
  radius: number;
  yTop: number;
  yBottom: number;
  /** Radial parts: direction around the vertical axis */
  angle: number;
  fuel: number;
  ignited: boolean;
  flameout: boolean;
  /** 0..1 current thrust fraction (for effects) */
  burn: number;
  chute: ChuteState;
  chuteT: number;
  /** 0 retracted .. 1 deployed */
  leg: number;
  legTarget: 0 | 1;
  jettisoned: boolean;
  /** Fairings keep a structural ring after jettison: the shell mass leaves with the halves */
  massFactor: number;
  /** Debris fairing half: 1 or 2, with the shell height it had when released */
  half: 0 | 1 | 2;
  shellH: number;
}

export type SasMode = 'off' | 'hold' | 'prograde' | 'retrograde' | 'radialOut' | 'radialIn' | 'up';

export interface SasState { mode: SasMode; hold: Quaternion }

export type AutopilotKind = 'ascent' | 'circularize' | 'land' | 'transfer' | 'deorbit';
export interface AutopilotState {
  kind: AutopilotKind;
  phase: string;
  target?: string;
  targetAlt?: number;
  note: string;
  data: Record<string, number>;
}

export interface Derived {
  mass: number;
  dry: number;
  fuel: number;
  com: Vector3;
  ixx: number; iyy: number; izz: number;
  areaFront: number;
  cdFront: number;
  copY: number;
  maxPressure: number;
  hasShield: boolean;
  shieldBottom: boolean;
  ctrlTorque: number;
  hasControl: boolean;
  crew: number;
  hasJump: boolean;
  jumpRange: number;
  top: number;
  bottom: number;
  radiusMax: number;
}

export interface Vessel {
  id: number;
  name: string;
  body: string;
  /** Centre of mass relative to the body, inertial axes */
  pos: Vector3;
  vel: Vector3;
  quat: Quaternion;
  /** Angular velocity in the vessel frame, rad/s */
  angVel: Vector3;
  parts: PartRT[];
  edges: Edge[];
  stages: StageAction[][];
  stageIdx: number;
  throttle: number;
  input: { pitch: number; yaw: number; roll: number };
  sas: SasState;
  ap: AutopilotState | null;
  landed: boolean;
  landedOn: 'ground' | 'water';
  surfDir: Vector3;
  surfR: number;
  surfQuat: Quaternion;
  destroyed: string | null;
  destroyedAt: number;
  heat: number;
  jumpCharge: number;
  missionTime: number;
  born: number;
  derived: Derived;
  contacts: Vector3[];
  contactsDirty: boolean;
  topologyDirty: boolean;
  /** engine part id -> tanks that feed it */
  feeds: Map<number, PartRT[]>;
  /** previously-seen centre of mass (design space) so that burning fuel doesn't teleport the hull */
  lastCom: Vector3;
  maxQ: number;
  warn: string;
  /** Seconds after liftoff during which ground contact is ignored */
  grace: number;
  /** Non-gravitational acceleration last step, in g */
  gLoad: number;
}

export function emptyDerived(): Derived {
  return {
    mass: 1, dry: 1, fuel: 0, com: new Vector3(), ixx: 1, iyy: 1, izz: 1, areaFront: 1, cdFront: 0.5, copY: 0,
    maxPressure: 1e9, hasShield: false, shieldBottom: false, ctrlTorque: 0, hasControl: false, crew: 0, hasJump: false,
    jumpRange: 0, top: 0, bottom: 0, radiusMax: 1,
  };
}

let nextVesselId = 1;
export function newVesselId(): number { return nextVesselId++; }
export function setVesselIdCounter(n: number): void { nextVesselId = Math.max(nextVesselId, n); }

export function makePart(id: number, defId: string, pos: Vector3, angle: number): PartRT {
  const def = partDef(defId);
  return {
    id, def, pos: pos.clone(), radius: def.dia / 2, yTop: pos.y + def.length / 2, yBottom: pos.y - def.length / 2, angle,
    fuel: def.fuel ?? 0, ignited: false, flameout: false, burn: 0,
    chute: 'stowed', chuteT: 0, leg: 0, legTarget: 0, jettisoned: false, massFactor: 1, half: 0, shellH: 0,
  };
}

export function blankVessel(name: string, body: string): Vessel {
  return {
    id: newVesselId(), name, body, pos: new Vector3(), vel: new Vector3(), quat: new Quaternion(), angVel: new Vector3(),
    parts: [], edges: [], stages: [], stageIdx: 0, throttle: 0, input: { pitch: 0, yaw: 0, roll: 0 },
    sas: { mode: 'hold', hold: new Quaternion() }, ap: null, landed: false, landedOn: 'ground',
    surfDir: new Vector3(1, 0, 0), surfR: 0, surfQuat: new Quaternion(), destroyed: null, destroyedAt: 0, heat: 0,
    jumpCharge: 0, missionTime: 0, born: 0, derived: emptyDerived(), contacts: [], contactsDirty: true, topologyDirty: true,
    feeds: new Map(), lastCom: new Vector3(), maxQ: 0, warn: '', grace: 0, gLoad: 0,
  };
}

/** Builds a flight-ready vessel from a design. Position and velocity are filled in by the caller. */
export function vesselFromDesign(d: Design, body: string): Vessel {
  const v = blankVessel(d.name, body);
  const placed = layout(d);
  for (const pl of placed.values()) {
    v.parts.push(makePart(pl.inst.id, pl.inst.partId, pl.pos, pl.inst.angle ?? Math.atan2(pl.pos.z, pl.pos.x)));
  }
  v.edges = d.edges.map((e) => ({ ...e }));
  v.stages = d.stages.map((s) => s.map((a) => ({ ...a })));
  refreshDerived(v, true);
  v.lastCom.copy(v.derived.com);
  return v;
}

export function aliveParts(v: Vessel): PartRT[] {
  return v.parts;
}

function isDecouplerTop(v: Vessel, id: number, node: string): boolean {
  const p = v.parts.find((q) => q.id === id);
  return !!p && p.def.kind === 'decoupler' && node === 'top';
}

/** Which tanks feed which engines: everything linked without crossing a decoupler. */
function rebuildFeeds(v: Vessel): void {
  v.feeds.clear();
  const byId = new Map(v.parts.map((p) => [p.id, p]));
  const adj = new Map<number, number[]>();
  for (const e of v.edges) {
    if (!byId.has(e.a) || !byId.has(e.b)) continue;
    if (isDecouplerTop(v, e.a, e.an) || isDecouplerTop(v, e.b, e.bn)) continue;
    (adj.get(e.a) ?? adj.set(e.a, []).get(e.a)!).push(e.b);
    (adj.get(e.b) ?? adj.set(e.b, []).get(e.b)!).push(e.a);
  }
  for (const p of v.parts) {
    if (p.def.kind !== 'engine') continue;
    const seen = new Set<number>([p.id]);
    const q = [p.id];
    const tanks: PartRT[] = [];
    while (q.length) {
      const cur = q.shift()!;
      for (const n of adj.get(cur) ?? []) {
        if (seen.has(n)) continue;
        seen.add(n);
        q.push(n);
        const np = byId.get(n)!;
        if (np.def.kind === 'tank') tanks.push(np);
      }
    }
    v.feeds.set(p.id, tanks);
  }
  v.topologyDirty = false;
}

const tmp = new Vector3();

/** Recomputes mass properties. When the centre of mass moves relative to the hull the world position follows it. */
export function refreshDerived(v: Vessel, initial = false): void {
  if (v.topologyDirty) rebuildFeeds(v);
  const d = v.derived;
  let m = 0;
  let dry = 0;
  let fuel = 0;
  const c = tmp.set(0, 0, 0);
  for (const p of v.parts) {
    const pm = p.def.mass * p.massFactor + p.fuel;
    m += pm;
    dry += p.def.mass * p.massFactor;
    fuel += p.fuel;
    c.addScaledVector(p.pos, pm);
  }
  if (m <= 0) m = 1;
  c.divideScalar(m);
  const prev = v.lastCom;
  if (!initial) {
    // hull stays put: move the CoM state by how far the CoM slid within the hull
    const shift = new Vector3().subVectors(c, prev).applyQuaternion(v.quat);
    if (v.landed) v.surfR += shift.dot(v.pos.clone().normalize());
    else v.pos.add(shift);
  }
  d.com.copy(c);
  v.lastCom.copy(c);
  d.mass = m;
  d.dry = dry;
  d.fuel = fuel;
  let ixx = 0, iyy = 0, izz = 0;
  let areaSide = 0;
  let copNum = 0;
  let maxR = 0;
  let top = -Infinity;
  let bottom = Infinity;
  let torque = 0;
  let crew = 0;
  let maxP = Infinity;
  let shield = false;
  let hasJump = false;
  let jumpRange = 0;
  let stackBottom = Infinity;
  let shieldY = Infinity;
  let topCd = 0.8;
  let topY = -Infinity;
  let radialArea = 0;
  for (const p of v.parts) {
    const pm = p.def.mass * p.massFactor + p.fuel;
    const dx = p.pos.x - c.x, dy = p.pos.y - c.y, dz = p.pos.z - c.z;
    const r = p.radius, h = p.def.length;
    const rodXZ = (3 * r * r + h * h) / 12;
    ixx += pm * (dy * dy + dz * dz + rodXZ);
    izz += pm * (dx * dx + dy * dy + rodXZ);
    iyy += pm * (dx * dx + dz * dz + (r * r) / 2);
    const isStack = p.def.attach === 'stack';
    if (isStack) {
      maxR = Math.max(maxR, r);
      stackBottom = Math.min(stackBottom, p.yBottom);
      if (p.yTop > topY) { topY = p.yTop; topCd = p.def.cd; }
    } else if (p.def.kind === 'srb') radialArea += Math.PI * r * r;
    const a = 2 * r * h * (p.def.kind === 'engine' ? 1.6 : p.def.kind === 'nose' ? 0.5 : 1);
    areaSide += a;
    copNum += a * p.pos.y;
    top = Math.max(top, p.yTop);
    bottom = Math.min(bottom, p.yBottom);
    torque += p.def.torque ?? 0;
    crew += p.def.crew ?? 0;
    if (p.def.kind === 'shield') { shield = true; shieldY = Math.min(shieldY, p.yBottom); }
    if (p.def.kind === 'jump') { hasJump = true; jumpRange = Math.max(jumpRange, p.def.jumpRangeLy ?? 0); }
    maxP = Math.min(maxP, p.def.maxPressure);
  }
  d.ixx = Math.max(1, ixx);
  d.iyy = Math.max(1, iyy);
  d.izz = Math.max(1, izz);
  d.areaFront = Math.PI * maxR * maxR + radialArea;
  d.cdFront = 0.15 + 0.7 * topCd;
  d.copY = areaSide > 0 ? copNum / areaSide : c.y;
  d.maxPressure = maxP;
  d.hasShield = shield;
  d.shieldBottom = shield && shieldY <= stackBottom + 0.01;
  // a shield counts when nothing but engines/legs sticks out below it
  if (shield && !d.shieldBottom) {
    let blocked = false;
    for (const p of v.parts) if (p.def.attach === 'stack' && p.def.kind !== 'engine' && p.def.kind !== 'shield' && p.yBottom < shieldY - 0.01) blocked = true;
    d.shieldBottom = !blocked && !v.parts.some((p) => p.def.kind === 'engine' && p.yBottom < shieldY - 0.01);
  }
  d.ctrlTorque = torque;
  d.hasControl = v.parts.some((p) => p.def.kind === 'pod');
  d.crew = crew;
  d.hasJump = hasJump;
  d.jumpRange = jumpRange;
  d.top = top;
  d.bottom = bottom;
  d.radiusMax = maxR;
  if (v.contactsDirty) rebuildContacts(v);
}

export function rebuildContacts(v: Vessel): void {
  const pts: Vector3[] = [];
  for (const p of v.parts) {
    const r = p.radius;
    if (p.def.kind === 'leg') {
      if (p.leg > 0.5) {
        const L = p.def.legLength ?? 1.5;
        const out = new Vector3(Math.cos(p.angle), 0, Math.sin(p.angle));
        pts.push(new Vector3(p.pos.x + out.x * L * 0.45, p.pos.y - L, p.pos.z + out.z * L * 0.45));
      }
      continue;
    }
    if (p.def.kind === 'chute') continue;
    if (p.def.attach === 'radial') {
      pts.push(new Vector3(p.pos.x, p.yBottom, p.pos.z));
      continue;
    }
    pts.push(new Vector3(p.pos.x, p.yBottom, p.pos.z));
    pts.push(new Vector3(p.pos.x + r, p.yBottom, p.pos.z));
    pts.push(new Vector3(p.pos.x - r, p.yBottom, p.pos.z));
    pts.push(new Vector3(p.pos.x, p.yBottom, p.pos.z + r));
    pts.push(new Vector3(p.pos.x, p.yBottom, p.pos.z - r));
  }
  v.contacts = pts;
  v.contactsDirty = false;
}

/** World-space position of the design-space origin of the vessel (used for rendering). */
export function originWorld(v: Vessel, out = new Vector3()): Vector3 {
  return out.copy(v.derived.com).negate().applyQuaternion(v.quat).add(v.pos);
}

export function partWorld(v: Vessel, p: PartRT, out = new Vector3()): Vector3 {
  return out.copy(p.pos).sub(v.derived.com).applyQuaternion(v.quat).add(v.pos);
}

export function localToWorldMatrix(v: Vessel): Matrix4 {
  const m = new Matrix4();
  m.compose(originWorld(v), v.quat, new Vector3(1, 1, 1));
  return m;
}

export function totalFuelFraction(v: Vessel): number {
  let cap = 0;
  let cur = 0;
  for (const p of v.parts) {
    if (p.def.kind === 'tank') { cap += p.def.fuel ?? 0; cur += p.fuel; }
  }
  return cap > 0 ? cur / cap : 0;
}

export function propellantRemaining(v: Vessel): number {
  let f = 0;
  for (const p of v.parts) if (p.def.kind === 'tank' || p.def.kind === 'srb') f += p.fuel;
  return f;
}

/** Rough delta-v left, using whichever engines are currently lit (or the best engine if none are). */
export function deltaVRemaining(v: Vessel, vacuum = true): number {
  let ispNum = 0;
  let ispDen = 0;
  for (const p of v.parts) {
    if (p.def.kind !== 'engine' && p.def.kind !== 'srb') continue;
    if (!p.ignited && v.parts.some((q) => q.ignited)) continue;
    const f = p.def.thrust ?? 0;
    ispNum += f;
    ispDen += f / ((vacuum ? p.def.ispVac : p.def.ispAtm) ?? 300);
  }
  if (ispDen <= 0) return 0;
  const isp = ispNum / ispDen;
  const m0 = v.derived.mass;
  const usable = propellantRemaining(v);
  if (m0 - usable <= 0) return 0;
  return isp * G0 * Math.log(m0 / (m0 - usable));
}

/** Height of the fairing shell: from the ring up to the top of everything it encloses. */
export function fairingShellHeight(v: Vessel, f: PartRT): number {
  if (f.half) return f.shellH;
  const byId = new Map(v.parts.map((p) => [p.id, p]));
  const seen = new Set<number>([f.id]);
  const q: number[] = [];
  for (const e of v.edges) {
    if (e.a === f.id && e.an === 'top') q.push(e.b);
    else if (e.b === f.id && e.bn === 'top') q.push(e.a);
  }
  let top = f.yTop;
  while (q.length) {
    const id = q.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const p = byId.get(id);
    if (!p) continue;
    top = Math.max(top, p.yTop);
    for (const e of v.edges) {
      if (e.a === id && !seen.has(e.b)) q.push(e.b);
      else if (e.b === id && !seen.has(e.a)) q.push(e.a);
    }
  }
  return top - f.yTop + f.def.dia * 0.9;
}
