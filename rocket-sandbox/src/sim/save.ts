import { Quaternion, Vector3 } from 'three';
import { SOL, SystemIndex } from './bodies';
import { Design } from './design';
import { starById, systemForStar } from './galaxy';
import { setPad } from './terrain';
import { partDef } from './parts';
import { PartRT, refreshDerived, blankVessel, setVesselIdCounter, Vessel } from './vessel';
import { Assists, DEFAULT_ASSISTS, Eva, Flag, World } from './world';

export const SAVE_VERSION = 1;

type V3 = [number, number, number];
type Q4 = [number, number, number, number];

const v3 = (v: Vector3): V3 => [v.x, v.y, v.z];
const q4 = (q: Quaternion): Q4 => [q.x, q.y, q.z, q.w];
const toV3 = (a: V3) => new Vector3(a[0], a[1], a[2]);
const toQ = (a: Q4) => new Quaternion(a[0], a[1], a[2], a[3]);

interface PartSave {
  id: number; def: string; pos: V3; angle: number; fuel: number; ignited: boolean; flameout: boolean;
  chute: PartRT['chute']; chuteT: number; leg: number; legTarget: 0 | 1; jettisoned: boolean; massFactor: number;
  half: 0 | 1 | 2; shellH: number;
}

interface VesselSave {
  id: number; name: string; body: string; pos: V3; vel: V3; quat: Q4; angVel: V3;
  parts: PartSave[]; edges: Vessel['edges']; stages: Vessel['stages']; stageIdx: number; throttle: number;
  sas: { mode: Vessel['sas']['mode']; hold: Q4 }; landed: boolean; landedOn: Vessel['landedOn'];
  surfDir: V3; surfR: number; surfQuat: Q4; destroyed: string | null; heat: number; jumpCharge: number;
  missionTime: number; born: number; ap: Vessel['ap'];
}

export interface WorldSave {
  v: number;
  savedAt: number;
  starId: string;
  t: number;
  activeId: number;
  assists: Assists;
  vessels: VesselSave[];
  flags: { id: number; body: string; dir: V3; name: string; t: number }[];
  eva: { body: string; dir: V3; heading: number; vel: V3; height: number; vessel: number; flagsLeft: number } | null;
  nextFlag: number;
  discovered: string[];
  visitedSystems: string[];
  padBody: string;
  padDir: V3;
  label: string;
}

export function serializeWorld(w: World, label = ''): WorldSave {
  return {
    v: SAVE_VERSION, savedAt: Date.now(), starId: w.system.starId, t: w.t, activeId: w.activeId, assists: { ...w.assists },
    vessels: w.vessels.filter((v) => !v.destroyed).map((v) => ({
      id: v.id, name: v.name, body: v.body, pos: v3(v.pos), vel: v3(v.vel), quat: q4(v.quat), angVel: v3(v.angVel),
      parts: v.parts.map((p) => ({
        id: p.id, def: p.def.id, pos: v3(p.pos), angle: p.angle, fuel: p.fuel, ignited: p.ignited, flameout: p.flameout,
        chute: p.chute, chuteT: p.chuteT, leg: p.leg, legTarget: p.legTarget, jettisoned: p.jettisoned, massFactor: p.massFactor,
        half: p.half, shellH: p.shellH,
      })),
      edges: v.edges.map((e) => ({ ...e })), stages: v.stages.map((s) => s.map((a) => ({ ...a }))), stageIdx: v.stageIdx,
      throttle: v.throttle, sas: { mode: v.sas.mode, hold: q4(v.sas.hold) }, landed: v.landed, landedOn: v.landedOn,
      surfDir: v3(v.surfDir), surfR: v.surfR, surfQuat: q4(v.surfQuat), destroyed: v.destroyed, heat: v.heat,
      jumpCharge: v.jumpCharge, missionTime: v.missionTime, born: v.born, ap: v.ap ? { ...v.ap, data: { ...v.ap.data } } : null,
    })),
    flags: w.flags.map((f) => ({ id: f.id, body: f.body, dir: v3(f.dir), name: f.name, t: f.t })),
    eva: w.eva ? { body: w.eva.body, dir: v3(w.eva.dir), heading: w.eva.heading, vel: v3(w.eva.vel), height: w.eva.height, vessel: w.eva.vessel, flagsLeft: w.eva.flagsLeft } : null,
    nextFlag: w.nextFlag, discovered: [...w.discovered], visitedSystems: [...w.visitedSystems], padBody: w.padBody, padDir: v3(w.padDir), label,
  };
}

/** Returns null when the save can't be understood (wrong version or unknown star). */
export function deserializeWorld(s: WorldSave): World | null {
  if (!s || s.v !== SAVE_VERSION) return null;
  let system = SOL;
  if (s.starId !== 'sol') {
    const star = starById(s.starId);
    if (!star) return null;
    system = systemForStar(star);
  }
  const w: World = {
    system, idx: new SystemIndex(system), t: s.t, vessels: [], activeId: s.activeId, assists: { ...DEFAULT_ASSISTS, ...s.assists },
    events: [], flags: [], eva: null, nextFlag: s.nextFlag, discovered: new Set(s.discovered), visitedSystems: new Set(s.visitedSystems),
    padBody: s.padBody, padDir: toV3(s.padDir), warpIndex: 0, warpCap: 9, warpReason: '', paused: false,
  };
  let maxId = 0;
  for (const vs of s.vessels) {
    const v = blankVessel(vs.name, vs.body);
    v.id = vs.id;
    maxId = Math.max(maxId, vs.id);
    v.pos.copy(toV3(vs.pos));
    v.vel.copy(toV3(vs.vel));
    v.quat.copy(toQ(vs.quat));
    v.angVel.copy(toV3(vs.angVel));
    v.parts = vs.parts.map((ps) => {
      const def = partDef(ps.def);
      const pos = toV3(ps.pos);
      const p: PartRT = {
        id: ps.id, def, pos, radius: def.dia / 2, yTop: pos.y + def.length / 2, yBottom: pos.y - def.length / 2, angle: ps.angle,
        fuel: ps.fuel, ignited: ps.ignited, flameout: ps.flameout, burn: 0, chute: ps.chute, chuteT: ps.chuteT, leg: ps.leg,
        legTarget: ps.legTarget, jettisoned: ps.jettisoned, massFactor: ps.massFactor, half: ps.half, shellH: ps.shellH,
      };
      return p;
    });
    v.edges = vs.edges;
    v.stages = vs.stages;
    v.stageIdx = vs.stageIdx;
    v.throttle = vs.throttle;
    v.sas = { mode: vs.sas.mode, hold: toQ(vs.sas.hold) };
    v.landed = vs.landed;
    v.landedOn = vs.landedOn;
    v.surfDir.copy(toV3(vs.surfDir));
    v.surfR = vs.surfR;
    v.surfQuat.copy(toQ(vs.surfQuat));
    v.destroyed = vs.destroyed;
    v.heat = vs.heat;
    v.jumpCharge = vs.jumpCharge;
    v.missionTime = vs.missionTime;
    v.born = vs.born;
    v.ap = vs.ap;
    v.topologyDirty = true;
    v.contactsDirty = true;
    refreshDerived(v, true);
    v.lastCom.copy(v.derived.com);
    w.vessels.push(v);
  }
  setVesselIdCounter(maxId + 1);
  w.flags = s.flags.map((f): Flag => ({ id: f.id, body: f.body, dir: toV3(f.dir), name: f.name, t: f.t }));
  w.eva = s.eva ? ({ body: s.eva.body, dir: toV3(s.eva.dir), heading: s.eva.heading, vel: toV3(s.eva.vel), height: s.eva.height, vessel: s.eva.vessel, flagsLeft: s.eva.flagsLeft } as Eva) : null;
  setPad(w.padBody, w.padDir);
  if (!w.vessels.some((v) => v.id === w.activeId)) w.activeId = w.vessels[0]?.id ?? -1;
  return w;
}

// ------------------------------------------------------------------ storage

export interface Settings {
  graphics: 'auto' | 'low' | 'medium' | 'high';
  touchControls: 'auto' | 'on' | 'off';
  invertPitch: boolean;
  showFps: boolean;
  sound: boolean;
  uiScale: number;
}

export const DEFAULT_SETTINGS: Settings = { graphics: 'auto', touchControls: 'auto', invertPitch: false, showFps: false, sound: true, uiScale: 1 };

export interface Store {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/** Lazily binds to IndexedDB through idb-keyval so that node-based tests can import this module. */
export async function idbStore(): Promise<Store> {
  const idb = await import('idb-keyval');
  const store = idb.createStore('orbital-sandbox', 'kv');
  return {
    get: (k) => idb.get(k, store),
    set: (k, v) => idb.set(k, v, store),
    del: (k) => idb.del(k, store),
    keys: async () => (await idb.keys(store)).map(String),
  };
}

export interface SavedDesign { id: string; design: Design; updated: number }

export interface ExportBundle {
  kind: 'orbital-sandbox-export';
  v: number;
  designs: SavedDesign[];
  settings: Settings;
  saves: Record<string, WorldSave>;
}
