import { Quaternion, Vector3 } from 'three';
import { atmosphereTop, SystemDef, SystemIndex } from './bodies';
import { Design } from './design';
import { bodyAngle, rotY, surfaceVelocity } from './frame';
import { altitudeOf, inAtmosphere, radarAltitude, stepVessel, terrainThreshold } from './flight';
import { bodyPosAbs, bodyStateRel, elements, keplerStep } from './orbit';
import { padHeight, setPad } from './terrain';
import { DEFAULT_ASSISTS, activeVessel, note, World, WARP_LEVELS } from './world';
import { rebuildContacts, Vessel, vesselFromDesign } from './vessel';
import { runAutopilot } from './guidance';

const Y = new Vector3(0, 1, 0);
export const PHYS_DT = 1 / 60;

export function createWorld(system: SystemDef): World {
  return {
    system, idx: new SystemIndex(system), t: 0, vessels: [], activeId: -1, assists: { ...DEFAULT_ASSISTS },
    events: [], flags: [], eva: null, nextFlag: 1, discovered: new Set(['earth', 'sun']), visitedSystems: new Set([system.id]),
    padBody: 'earth', padDir: new Vector3(1, 0, 0), warpIndex: 0, warpCap: WARP_LEVELS.length - 1, warpReason: '', paused: false,
  };
}

// --------------------------------------------------------------------- spawning

/** Picks a morning-sun spot on the equator for the launch pad. */
export function choosePad(w: World, bodyId: string): Vector3 {
  const body = w.idx.get(bodyId);
  const sun = bodyPosAbs(w.idx, bodyId, w.t).negate().normalize();
  const psi = Math.atan2(-sun.z, sun.x);
  const phi = psi - (60 * Math.PI) / 180;
  const inertial = new Vector3(Math.cos(phi), 0, -Math.sin(phi));
  const bf = rotY(inertial.clone(), -bodyAngle(body, w.t));
  return bf.normalize();
}

function setUpright(v: Vessel, dir: Vector3, theta: number): void {
  const up = dir.clone().applyAxisAngle(Y, theta);
  v.quat.setFromUnitVectors(Y, up);
  v.surfQuat.copy(v.quat).premultiply(new Quaternion().setFromAxisAngle(Y, -theta));
}

export function spawnOnPad(w: World, design: Design, bodyId = 'earth'): Vessel {
  const body = w.idx.get(bodyId);
  const dir = choosePad(w, bodyId);
  w.padBody = bodyId;
  w.padDir.copy(dir);
  setPad(bodyId, dir);
  const v = vesselFromDesign(design, bodyId);
  rebuildContacts(v);
  const theta = bodyAngle(body, w.t);
  let minY = Infinity;
  for (const p of v.contacts) minY = Math.min(minY, p.y);
  if (!Number.isFinite(minY)) minY = v.derived.bottom;
  const height = v.derived.com.y - minY + 0.05;
  v.landed = true;
  v.surfDir.copy(dir);
  v.surfR = body.radius + padHeight(body) + height;
  setUpright(v, dir, theta);
  v.pos.copy(dir).multiplyScalar(v.surfR);
  rotY(v.pos, theta);
  surfaceVelocity(body, v.pos, v.vel);
  v.sas.hold.copy(v.quat);
  v.sas.mode = 'hold';
  v.jumpCharge = v.derived.jumpRange;
  w.vessels.push(v);
  w.activeId = v.id;
  return v;
}

export function spawnInOrbit(w: World, design: Design, bodyId: string, altitude: number, phase = 0): Vessel {
  const body = w.idx.get(bodyId);
  const v = vesselFromDesign(design, bodyId);
  const r = body.radius + altitude;
  v.pos.set(Math.cos(phase) * r, 0, -Math.sin(phase) * r);
  const speed = Math.sqrt(body.mu / r);
  v.vel.set(-Math.sin(phase) * speed, 0, -Math.cos(phase) * speed);
  v.quat.setFromUnitVectors(Y, v.vel.clone().normalize());
  v.sas.hold.copy(v.quat);
  v.sas.mode = 'prograde';
  v.jumpCharge = v.derived.jumpRange;
  w.vessels.push(v);
  w.activeId = v.id;
  return v;
}

// --------------------------------------------------------------------- SOI

const tmpState = { pos: new Vector3(), vel: new Vector3() };

export function checkSoi(w: World, v: Vessel): void {
  const idx = w.idx;
  const cur = idx.get(v.body);
  const soi = idx.soi.get(v.body) ?? Infinity;
  if (cur.parent && v.pos.length() > soi) {
    bodyStateRel(idx, v.body, w.t, tmpState);
    v.pos.add(tmpState.pos);
    v.vel.add(tmpState.vel);
    v.body = cur.parent;
    if (v.id === w.activeId) note(w, `Left ${cur.name}'s sphere of influence — now orbiting ${idx.get(cur.parent).name}.`, 'info');
    return;
  }
  for (const k of idx.children.get(v.body) ?? []) {
    bodyStateRel(idx, k.id, w.t, tmpState);
    const rel = v.pos.clone().sub(tmpState.pos);
    if (rel.length() < (idx.soi.get(k.id) ?? 0)) {
      v.pos.copy(rel);
      v.vel.sub(tmpState.vel);
      v.body = k.id;
      if (v.id === w.activeId) {
        note(w, `Entered ${k.name}'s sphere of influence.`, 'good');
        w.discovered.add(k.id);
      }
      return;
    }
  }
}

// --------------------------------------------------------------------- rails

export function railsEligible(w: World, v: Vessel): boolean {
  if (v.landed) return true;
  if (v.throttle > 0 && v.parts.some((p) => p.ignited && !p.flameout && p.burn > 0)) return false;
  const body = w.idx.get(v.body);
  const alt = altitudeOf(w, v);
  if (inAtmosphere(body, alt)) return false;
  if (body.gasGiant) return alt > 0 || !body.atmosphere;
  return alt > 0;
}

function railsAttitude(w: World, v: Vessel): void {
  v.angVel.set(0, 0, 0);
  const body = w.idx.get(v.body);
  let aim: Vector3 | null = null;
  switch (v.sas.mode) {
    case 'prograde': aim = v.vel.clone().normalize(); break;
    case 'retrograde': aim = v.vel.clone().normalize().negate(); break;
    case 'radialOut': case 'up': aim = v.pos.clone().normalize(); break;
    case 'radialIn': aim = v.pos.clone().normalize().negate(); break;
    default: break;
  }
  void body;
  if (aim && v.derived.hasControl) {
    const axis = new Vector3(0, 1, 0).applyQuaternion(v.quat);
    v.quat.premultiply(new Quaternion().setFromUnitVectors(axis, aim)).normalize();
    v.sas.hold.copy(v.quat);
  }
}

const rr = new Vector3();
const vv = new Vector3();

function railsStep(w: World, v: Vessel, dt: number): void {
  const body = w.idx.get(v.body);
  if (v.landed) {
    const theta = bodyAngle(body, w.t);
    v.pos.copy(v.surfDir).multiplyScalar(v.surfR);
    rotY(v.pos, theta);
    v.quat.copy(v.surfQuat).premultiply(new Quaternion().setFromAxisAngle(Y, theta));
    surfaceVelocity(body, v.pos, v.vel);
    return;
  }
  keplerStep(v.pos, v.vel, body.mu, dt, rr, vv);
  v.pos.copy(rr);
  v.vel.copy(vv);
  v.missionTime += dt;
  if (v.derived.hasJump) v.jumpCharge = Math.min(v.derived.jumpRange, v.jumpCharge + dt / 60);
  railsAttitude(w, v);
}

// --------------------------------------------------------------------- warp

export function warpFactor(w: World): number {
  return WARP_LEVELS[Math.min(w.warpIndex, w.warpCap, WARP_LEVELS.length - 1)];
}

/** Seconds until the vessel's current conic falls below `radius` (relative to its body), or Infinity. */
export function timeToRadius(w: World, v: Vessel, radius: number, horizon = 3 * 86400): number {
  const body = w.idx.get(v.body);
  const r0 = v.pos.length();
  if (r0 < radius) return 0;
  const el = elements(v.pos, v.vel, body.mu);
  if (el.rp > radius) return Infinity;
  if (v.pos.dot(v.vel) > 0 && el.bound === false) return Infinity;
  // coarse march then refine
  const period = el.bound ? el.period : horizon;
  const span = Math.min(horizon, period);
  const n = 160;
  let prev = 0;
  for (let i = 1; i <= n; i++) {
    const t = (span * i) / n;
    keplerStep(v.pos, v.vel, body.mu, t, rr, vv);
    if (rr.length() < radius) {
      let lo = prev;
      let hi = t;
      for (let k = 0; k < 24; k++) {
        const mid = (lo + hi) / 2;
        keplerStep(v.pos, v.vel, body.mu, mid, rr, vv);
        if (rr.length() < radius) hi = mid; else lo = mid;
      }
      return hi;
    }
    prev = t;
  }
  return Infinity;
}

/** Works out the fastest time acceleration that is currently safe. Cheap enough to call a few times a second. */
export function updateWarpCap(w: World): void {
  let cap = WARP_LEVELS.length - 1;
  let reason = '';
  const av = activeVessel(w);
  const limit = (idx: number, why: string) => { if (idx < cap) { cap = idx; reason = why; } };
  if (w.eva) limit(0, 'Astronaut outside');
  if (!av || av.destroyed) { limit(0, 'No vessel'); w.warpCap = cap; w.warpReason = reason; return; }
  for (const v of w.vessels) {
    if (v.destroyed || v.landed) continue;
    const body = w.idx.get(v.body);
    const alt = altitudeOf(w, v);
    const isMain = v.id === av.id;
    if (!v.derived.hasControl && !isMain) continue;
    const firing = v.throttle > 0 && v.parts.some((p) => p.ignited && !p.flameout);
    if (firing && isMain) limit(2, 'Engines firing: physics time acceleration only (4x)');
    if (inAtmosphere(body, alt)) { limit(2, `In ${body.name}'s atmosphere (4x max)`); continue; }
    const margin = body.atmosphere ? atmosphereTop(body) : terrainThreshold(body) * 0.5;
    const entry = timeToRadius(w, v, body.radius + margin + 2000);
    if (Number.isFinite(entry)) {
      const maxWarp = Math.max(1, entry / 12);
      let idx = 0;
      for (let i = 0; i < WARP_LEVELS.length; i++) if (WARP_LEVELS[i] <= maxWarp) idx = i;
      limit(idx, `${body.atmosphere ? 'Atmosphere' : 'Surface'} contact in ${Math.round(entry)} s`);
    }
    if (!body.atmosphere && !body.gasGiant) {
      const ra = radarAltitude(w, v);
      if (Number.isFinite(ra) && ra < 20000) limit(2, 'Close to the surface (4x max)');
    }
  }
  w.warpCap = cap;
  w.warpReason = reason;
  if (w.warpIndex > cap) w.warpIndex = cap;
}

// --------------------------------------------------------------------- advance

const MAX_PHYSICS_STEPS = 10;

/** Advance the simulation by `dtReal` seconds of wall time. */
export function advance(w: World, dtReal: number): void {
  if (w.paused) return;
  dtReal = Math.min(dtReal, 0.25);
  const warp = warpFactor(w);
  const av = activeVessel(w);
  if (warp <= 4) {
    let steps = Math.round((dtReal * warp) / PHYS_DT);
    if (steps < 1) steps = dtReal > 0 ? 1 : 0;
    steps = Math.min(steps, MAX_PHYSICS_STEPS * Math.max(1, warp));
    for (let i = 0; i < steps; i++) physicsStep(w, PHYS_DT);
  } else {
    // rails: debris and anything not eligible cannot ride along
    for (const v of w.vessels) {
      if (v.destroyed) continue;
      if (!railsEligible(w, v)) {
        if (v.derived.hasControl && v === av) { w.warpIndex = 0; note(w, 'Time acceleration stopped.', 'warn'); return; }
        if (!v.derived.hasControl) v.destroyed = 'removed';
      }
    }
    let remaining = dtReal * warp;
    let chunks = 0;
    while (remaining > 1e-6 && chunks < 500) {
      chunks++;
      let step = remaining;
      for (const v of w.vessels) {
        if (v.destroyed || v.landed) continue;
        const body = w.idx.get(v.body);
        const speed = Math.max(1, v.vel.length());
        const alt = Math.max(100, altitudeOf(w, v) - (body.atmosphere ? atmosphereTop(body) : 0));
        step = Math.min(step, Math.max(0.5, Math.min(0.03 * v.pos.length() / speed, 0.2 * alt / speed)));
      }
      railsChunk(w, step);
      remaining -= step;
      if (w.warpIndex === 0) break;
    }
  }
  cleanup(w);
}

function railsChunk(w: World, dt: number): void {
  for (const v of w.vessels) {
    if (v.destroyed) continue;
    railsStep(w, v, dt);
  }
  w.t += dt;
  for (const v of w.vessels) {
    if (v.destroyed) continue;
    if (!v.landed) checkSoi(w, v);
    if (!v.landed) {
      const body = w.idx.get(v.body);
      const alt = altitudeOf(w, v);
      if (alt < 0 || inAtmosphere(body, alt)) {
        // entered the dangerous zone while time-warping: drop back to real time
        if (v.id === w.activeId || v.derived.hasControl) {
          w.warpIndex = 0;
          note(w, 'Time acceleration stopped: entering atmosphere.', 'warn');
        }
      }
    }
  }
}

function physicsStep(w: World, dt: number): void {
  // autopilots first so that they steer this step
  for (const v of w.vessels) if (!v.destroyed && v.ap) runAutopilot(w, v, dt);
  for (const v of w.vessels) {
    if (v.destroyed) continue;
    stepVessel(w, v, dt);
  }
  w.t += dt;
  for (const v of w.vessels) {
    if (v.destroyed) continue;
    if (!v.landed) checkSoi(w, v);
  }
}

const DEBRIS_LIFETIME = 120;

function cleanup(w: World): void {
  const keep: Vessel[] = [];
  for (const v of w.vessels) {
    if (v.destroyed) {
      if (v.id === w.activeId) { keep.push(v); continue; }
      if (v.destroyed === 'removed' || w.t - v.destroyedAt > 6) continue;
      keep.push(v);
      continue;
    }
    // debris that has come to rest on the ground fades away after a while
    if (!v.derived.hasControl && v.landed && w.t - v.born > DEBRIS_LIFETIME) continue;
    keep.push(v);
  }
  // cap the number of loose pieces
  const loose = keep.filter((v) => !v.derived.hasControl && v.id !== w.activeId && !v.destroyed);
  if (loose.length > 30) {
    loose.sort((a, b) => a.born - b.born);
    const drop = new Set(loose.slice(0, loose.length - 30).map((v) => v.id));
    w.vessels = keep.filter((v) => !drop.has(v.id));
  } else w.vessels = keep;
}

// --------------------------------------------------------------------- vessel switching

export function controllableVessels(w: World): Vessel[] {
  return w.vessels.filter((v) => !v.destroyed && v.derived.hasControl);
}

export function switchVessel(w: World): void {
  const list = controllableVessels(w);
  if (list.length < 2) { note(w, 'No other controllable vessel.', 'info'); return; }
  const i = list.findIndex((v) => v.id === w.activeId);
  const next = list[(i + 1) % list.length];
  w.activeId = next.id;
  note(w, `Now controlling ${next.name}.`, 'info');
}

// --------------------------------------------------------------------- jumping between stars

export function enterSystem(w: World, system: SystemDef, v: Vessel): void {
  w.system = system;
  w.idx = new SystemIndex(system);
  w.visitedSystems.add(system.id);
  w.vessels = [v];
  w.activeId = v.id;
  w.eva = null;
  const arrival = system.arrival;
  const body = w.idx.get(arrival.body);
  const r = body.radius + arrival.altitude;
  const phase = 0.3;
  v.body = arrival.body;
  v.landed = false;
  v.pos.set(Math.cos(phase) * r, 0, -Math.sin(phase) * r);
  const sp = Math.sqrt(body.mu / r);
  v.vel.set(-Math.sin(phase) * sp, 0, -Math.cos(phase) * sp);
  v.quat.setFromUnitVectors(Y, v.vel.clone().normalize());
  v.angVel.set(0, 0, 0);
  v.throttle = 0;
  v.heat = 0;
  v.sas.hold.copy(v.quat);
  v.sas.mode = 'prograde';
  v.ap = null;
  w.discovered.add(arrival.body);
  w.warpIndex = 0;
}

