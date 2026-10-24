import { Quaternion, Vector3 } from 'three';
import { atmosphereDensity, atmospherePressure, atmosphereTop, BodyDef, G0 } from './bodies';
import { bodyOmega, bodyAngle, rotY, surfaceVelocity, toBodyFixed } from './frame';
import { groundHeight, isOcean } from './terrain';
import { emit, note, World } from './world';
import {
  blankVessel, makePart, PartRT, rebuildContacts, refreshDerived, Vessel, fairingShellHeight,
} from './vessel';
import { StageAction } from './design';

const Y = new Vector3(0, 1, 0);
const P_SEA = 101325;
const BASE_HEAT_TOL = 4e5;
const SHIELD_HEAT_TOL = 1.2e7;

const v1 = new Vector3();
const v2 = new Vector3();
const v3 = new Vector3();
const q1 = new Quaternion();
const q2 = new Quaternion();

export function terrainThreshold(body: BodyDef): number {
  return (body.terrain ? body.terrain.amplitude * 1.2 + 4000 : 0) + 3000;
}

export function inAtmosphere(body: BodyDef, alt: number): boolean {
  return !!body.atmosphere && alt < atmosphereTop(body);
}

// ---------------------------------------------------------------- mechanisms

function updateMechanisms(v: Vessel, dt: number): void {
  for (const p of v.parts) {
    if (p.def.kind === 'leg' && p.leg !== p.legTarget) {
      const before = p.leg > 0.5;
      p.leg += Math.sign(p.legTarget - p.leg) * Math.min(Math.abs(p.legTarget - p.leg), dt / 1.6);
      if (before !== p.leg > 0.5) v.contactsDirty = true;
    }
  }
}

// ---------------------------------------------------------------- staging

export function stageCount(v: Vessel): number { return v.stages.length - v.stageIdx; }

/** Fire the next stage. */
export function activateStage(w: World, v: Vessel): void {
  if (v.destroyed) return;
  const stage = v.stages[v.stageIdx];
  if (!stage) { note(w, 'No more stages.', 'info'); return; }
  v.stageIdx++;
  emit(w, { type: 'stage', vessel: v.id });
  for (const a of stage) runAction(w, v, a);
}

function runAction(w: World, v: Vessel, a: StageAction): void {
  const p = v.parts.find((q) => q.id === a.part);
  if (!p) return;
  switch (a.kind) {
    case 'ignite':
      p.ignited = true;
      p.flameout = false;
      if (p.def.kind === 'engine' && v.throttle <= 0 && !v.landed) v.throttle = Math.max(v.throttle, 0);
      break;
    case 'legs': p.legTarget = 1; break;
    case 'chute': if (p.chute === 'stowed') p.chute = 'armed'; break;
    case 'jettison': jettisonFairing(w, v, p); break;
    case 'detach': detachPart(w, v, p); break;
  }
}

export function toggleLegs(v: Vessel): void {
  const legs = v.parts.filter((p) => p.def.kind === 'leg');
  if (!legs.length) return;
  const target: 0 | 1 = legs.some((l) => l.legTarget === 0) ? 1 : 0;
  for (const l of legs) l.legTarget = target;
}

export function armChutes(v: Vessel): void {
  for (const p of v.parts) if (p.def.kind === 'chute' && p.chute === 'stowed') p.chute = 'armed';
}

export function chutesState(v: Vessel): 'none' | 'stowed' | 'armed' | 'open' | 'cut' {
  const cs = v.parts.filter((p) => p.def.kind === 'chute');
  if (!cs.length) return 'none';
  if (cs.some((c) => c.chute === 'full' || c.chute === 'inflating' || c.chute === 'reefed')) return 'open';
  if (cs.some((c) => c.chute === 'armed')) return 'armed';
  if (cs.every((c) => c.chute === 'cut')) return 'cut';
  return 'stowed';
}

function jettisonFairing(w: World, v: Vessel, f: PartRT): void {
  if (f.jettisoned) return;
  const shellH = fairingShellHeight(v, f);
  f.jettisoned = true;
  const shellMass = f.def.mass * 0.8;
  f.massFactor = 0.2;
  refreshDerived(v);
  // two debris halves flying apart
  const axisW = new Vector3(0, 1, 0).applyQuaternion(v.quat);
  for (let i = 0; i < 2; i++) {
    const dir = new Vector3(Math.cos(f.angle + i * Math.PI), 0, Math.sin(f.angle + i * Math.PI)).applyQuaternion(v.quat);
    const d = blankVessel(`${f.def.name} half`, v.body);
    d.born = w.t;
    const half = makePart(f.id * 10 + i + 1, f.def.id, new Vector3(0, f.yTop + shellH / 2 - f.def.length / 2, 0), i * Math.PI);
    half.half = (i + 1) as 1 | 2;
    half.shellH = shellH;
    half.massFactor = (shellMass / 2) / f.def.mass;
    d.parts = [half];
    d.topologyDirty = true;
    refreshDerived(d, true);
    d.lastCom.copy(d.derived.com);
    d.quat.copy(v.quat);
    // the half's centre in the parent's frame, then to world
    const local = new Vector3(0, f.yTop + shellH / 2, 0).sub(v.derived.com).applyQuaternion(v.quat).add(v.pos);
    d.pos.copy(local).addScaledVector(dir, f.radius * 0.6);
    d.vel.copy(v.vel).addScaledVector(dir, 3.5).addScaledVector(axisW, 0.5);
    d.angVel.set(0.3 * (i ? 1 : -1), 0.1, 0.4);
    d.sas.mode = 'off';
    w.vessels.push(d);
  }
  emit(w, { type: 'separation', vessel: v.id });
}

/** Cuts the link that `releaser` holds and spins off whichever side doesn't hold the controls. */
function detachPart(w: World, v: Vessel, releaser: PartRT): void {
  let cut: { a: number; b: number; an: string; bn: string } | undefined;
  if (releaser.def.attach === 'radial') cut = v.edges.find((e) => e.b === releaser.id && e.bn === 'radial');
  else if (releaser.def.kind === 'decoupler') cut = v.edges.find((e) => (e.a === releaser.id && e.an === 'top') || (e.b === releaser.id && e.bn === 'top'));
  if (!cut) return;
  const side = new Set<number>([releaser.id]);
  const q = [releaser.id];
  while (q.length) {
    const cur = q.shift()!;
    for (const e of v.edges) {
      if (e === cut) continue;
      let o = -1;
      if (e.a === cur) o = e.b; else if (e.b === cur) o = e.a;
      if (o >= 0 && !side.has(o)) { side.add(o); q.push(o); }
    }
  }
  const ctrl = v.parts.find((p) => p.def.kind === 'pod' && (p.def.crew ?? 0) > 0) ?? v.parts.find((p) => p.def.kind === 'pod');
  let leaving: Set<number>;
  if (ctrl) {
    leaving = side.has(ctrl.id) ? new Set(v.parts.filter((p) => !side.has(p.id)).map((p) => p.id)) : side;
  } else {
    const m = (ids: Set<number>) => v.parts.filter((p) => ids.has(p.id)).reduce((s, p) => s + p.def.mass + p.fuel, 0);
    const other = new Set(v.parts.filter((p) => !side.has(p.id)).map((p) => p.id));
    leaving = m(side) <= m(other) ? side : other;
  }
  splitVessel(w, v, leaving, releaser.def.attach === 'radial' ? 2.0 : 1.4);
}

/** Moves the listed parts into a new vessel with a small separation impulse. */
export function splitVessel(w: World, v: Vessel, ids: Set<number>, sepSpeed: number): Vessel | null {
  const moving = v.parts.filter((p) => ids.has(p.id));
  if (!moving.length || moving.length === v.parts.length) return null;
  const staying = v.parts.filter((p) => !ids.has(p.id));
  const d = blankVessel(`${v.name} stage`, v.body);
  d.born = w.t;
  d.parts = moving;
  d.edges = v.edges.filter((e) => ids.has(e.a) && ids.has(e.b)).map((e) => ({ ...e }));
  v.edges = v.edges.filter((e) => !ids.has(e.a) && !ids.has(e.b));
  v.parts = staying;
  d.stages = v.stages.map((s) => s.filter((a) => ids.has(a.part))).filter((s) => s.length);
  d.stageIdx = 0;
  v.stages = v.stages.map((s) => s.filter((a) => !ids.has(a.part)));
  v.topologyDirty = true;
  v.contactsDirty = true;
  d.topologyDirty = true;
  d.contactsDirty = true;

  // mass bookkeeping before/after
  const comOld = v.derived.com.clone();
  const mTotal = v.derived.mass;
  refreshDerived(d, true);
  d.lastCom.copy(d.derived.com);
  const mMoving = d.derived.mass;
  const keepPos = v.pos.clone();
  const keepVel = v.vel.clone();
  const quat = v.quat.clone();
  const angVel = v.angVel.clone();
  // world position of the new vessel's CoM computed from the old frame
  const comMove = d.derived.com.clone().sub(comOld).applyQuaternion(quat).add(keepPos);
  d.quat.copy(quat);
  d.angVel.copy(angVel);
  d.pos.copy(comMove);
  d.throttle = 0;
  d.sas = { mode: 'hold', hold: quat.clone() };
  d.landed = false;
  d.heat = v.heat;
  // remaining vessel: re-derive without teleporting hull (lastCom was the old combined CoM)
  v.lastCom.copy(comOld);
  refreshDerived(v);
  const dir = new Vector3().subVectors(d.pos, v.pos);
  if (dir.lengthSq() < 1e-6) dir.set(0, -1, 0).applyQuaternion(quat);
  dir.normalize();
  const mKeep = Math.max(1, mTotal - mMoving);
  d.vel.copy(keepVel).addScaledVector(dir, sepSpeed * (mKeep / mTotal));
  v.vel.addScaledVector(dir, -sepSpeed * (mMoving / mTotal));
  // spin imparted by the point of separation
  d.vel.addScaledVector(new Vector3().crossVectors(angVel.clone().applyQuaternion(quat), d.pos.clone().sub(keepPos)), 1);
  d.born = w.t;
  if (v.landed) { d.landed = false; d.vel.copy(v.vel); }
  w.vessels.push(d);
  emit(w, { type: 'separation', vessel: v.id });
  // a wrecked lump of metal should not keep a stale name
  d.name = d.derived.hasControl ? `${v.name} booster` : `${v.name} debris`;
  return d;
}

// ---------------------------------------------------------------- impact limits

function impactLimit(v: Vessel): number {
  const deployed = v.parts.filter((p) => p.def.kind === 'leg' && p.leg > 0.95);
  if (deployed.length >= 3) return Math.min(...deployed.map((l) => l.def.impactTol)) + 0.25 * (deployed.length - 3) + 1;
  let low = Infinity;
  for (const p of v.parts) if (p.yBottom < low && p.def.attach === 'stack') low = p.yBottom;
  let lim = 12;
  for (const p of v.parts) {
    if (p.def.attach === 'stack' && p.yBottom <= low + 0.5) lim = Math.min(lim, p.def.impactTol);
    else if (p.def.attach === 'radial' && p.def.kind === 'srb' && p.yBottom <= low + 0.5) lim = Math.min(lim, p.def.impactTol);
  }
  return lim;
}

// ---------------------------------------------------------------- the step

export interface StepOut {
  thrust: number;
  alt: number;
  rho: number;
  q: number;
}

function liftoffNow(v: Vessel): void {
  v.landed = false;
  v.grace = 1.5;
}

/** Engine forces: world-space force, body-space torque. Consumes fuel. */
function engineForces(w: World, v: Vessel, dt: number, pressure: number, fWorld: Vector3, tBody: Vector3): { thrust: number; gimbal: number } {
  const com = v.derived.com;
  let thrustTotal = 0;
  let gimbal = 0;
  const pr = Math.min(1, pressure / P_SEA);
  const unlimited = w.assists.unlimitedFuel;
  for (const p of v.parts) {
    if (p.def.kind !== 'engine' && p.def.kind !== 'srb') continue;
    p.burn = 0;
    if (!p.ignited || p.flameout) continue;
    const thr = p.def.kind === 'srb' ? 1 : v.throttle;
    if (thr <= 0) continue;
    const ispVac = p.def.ispVac ?? 300;
    const ispAtm = p.def.ispAtm ?? ispVac;
    const isp = ispVac + (ispAtm - ispVac) * pr;
    const mdot = ((p.def.thrust ?? 0) * thr) / (ispVac * G0);
    let need = mdot * dt;
    let frac = 1;
    if (!unlimited) {
      if (p.def.kind === 'srb') {
        if (p.fuel <= 0) { p.flameout = true; continue; }
        const take = Math.min(p.fuel, need);
        frac = need > 0 ? take / need : 0;
        p.fuel -= take;
        if (p.fuel <= 0) p.flameout = true;
      } else {
        const tanks = v.feeds.get(p.id) ?? [];
        let pool = 0;
        for (const t of tanks) pool += t.fuel;
        if (pool <= 1e-6) { p.flameout = true; continue; }
        const take = Math.min(pool, need);
        frac = need > 0 ? take / need : 0;
        for (const t of tanks) t.fuel -= take * (t.fuel / pool);
        need = take;
      }
    }
    const f = (p.def.thrust ?? 0) * thr * (isp / ispVac) * frac;
    p.burn = thr * frac;
    thrustTotal += f;
    fWorld.add(v1.set(0, f, 0).applyQuaternion(v.quat));
    // torque from an off-axis engine
    const r = v3.copy(p.pos).sub(com);
    tBody.x += -r.z * f; // r x (0,f,0) = (-rz*f, 0, rx*f)
    tBody.z += r.x * f;
    if (p.def.kind === 'engine') gimbal += f * Math.sin(((p.def.gimbal ?? 0) * Math.PI) / 180) * Math.max(1, Math.abs(r.y));
  }
  return { thrust: thrustTotal, gimbal };
}

function clamp(x: number, a: number, b: number): number { return Math.max(a, Math.min(b, x)); }

/** Chooses the world-space direction SAS should point the nose at. */
function sasAim(v: Vessel, body: BodyDef, alt: number, vel: Vector3, vAir: Vector3, up: Vector3): Vector3 | null {
  const useSurface = inAtmosphere(body, alt) && vAir.length() > 15;
  const ref = useSurface ? vAir : vel;
  switch (v.sas.mode) {
    case 'prograde': return ref.lengthSq() > 0.01 ? ref.clone().normalize() : null;
    case 'retrograde': return ref.lengthSq() > 0.01 ? ref.clone().normalize().negate() : null;
    case 'radialOut': return up.clone();
    case 'radialIn': return up.clone().negate();
    case 'up': return up.clone();
    default: return null;
  }
}

function controlTorque(v: Vessel, body: BodyDef, alt: number, vel: Vector3, vAir: Vector3, up: Vector3, gimbal: number, sasOn: boolean, out: Vector3): void {
  const d = v.derived;
  if (!d.hasControl) return;
  const authPY = d.ctrlTorque + gimbal;
  const authR = d.ctrlTorque;
  const aMax = { x: authPY / d.ixx, y: authR / d.iyy, z: authPY / d.izz };
  const w = v.angVel;
  const inp = v.input;
  const manual = Math.abs(inp.pitch) + Math.abs(inp.yaw) + Math.abs(inp.roll) > 0.01;
  if (!sasOn || v.sas.mode === 'off') {
    out.x += inp.pitch * authPY;
    out.z += -inp.yaw * authPY;
    out.y += inp.roll * authR;
    return;
  }
  const rate = 0.45;
  const axisW = v1.set(0, 1, 0).applyQuaternion(v.quat);
  if (manual) {
    // commanded body rates, then track them
    const wd = { x: inp.pitch * rate, y: inp.roll * rate, z: -inp.yaw * rate };
    out.x += clamp(3 * (wd.x - w.x), -aMax.x, aMax.x) * d.ixx;
    out.y += clamp(3 * (wd.y - w.y), -aMax.y, aMax.y) * d.iyy;
    out.z += clamp(3 * (wd.z - w.z), -aMax.z, aMax.z) * d.izz;
    v.sas.hold.copy(v.quat);
    return;
  }
  const aim = sasAim(v, body, alt, vel, vAir, up);
  let target: Quaternion;
  if (aim) {
    target = q1.setFromUnitVectors(axisW, aim).multiply(v.quat);
  } else target = v.sas.hold;
  // rotation error in the world frame, then body frame
  q2.copy(target).multiply(v2q(v.quat));
  if (q2.w < 0) { q2.x *= -1; q2.y *= -1; q2.z *= -1; q2.w *= -1; }
  const s = Math.sqrt(1 - q2.w * q2.w);
  const ang = 2 * Math.atan2(s, q2.w);
  const e = s < 1e-6 ? v3.set(0, 0, 0) : v3.set(q2.x / s, q2.y / s, q2.z / s).multiplyScalar(ang);
  e.applyQuaternion(v2q(v.quat));
  const kp = 1.1;
  const kd = 3.2;
  const f = (err: number, am: number) => Math.sign(err) * Math.min(kp * Math.abs(err), Math.sqrt(Math.max(0, am) * Math.abs(err)));
  const wd = { x: f(e.x, aMax.x), y: f(e.y, aMax.y * 0.7), z: f(e.z, aMax.z) };
  out.x += clamp(kd * (wd.x - w.x), -aMax.x, aMax.x) * d.ixx;
  out.y += clamp(kd * (wd.y - w.y), -aMax.y, aMax.y) * d.iyy;
  out.z += clamp(kd * (wd.z - w.z), -aMax.z, aMax.z) * d.izz;
}

const qInv = new Quaternion();
function v2q(q: Quaternion): Quaternion { return qInv.copy(q).invert(); }

function breakUp(w: World, v: Vessel, reason: string): void {
  if (v.destroyed) return;
  v.destroyed = reason;
  v.destroyedAt = w.t;
  v.throttle = 0;
  const size = Math.sqrt(v.derived.mass) * 0.06 + 4;
  emit(w, { type: 'explosion', body: v.body, pos: v.pos.clone(), size });
  if (v.id === w.activeId) note(w, `Vessel lost: ${reason}.`, 'bad');
}

export function destroyVessel(w: World, v: Vessel, reason: string): void { breakUp(w, v, reason); }

/** One physics step for one vessel. dt should be <= 1/30 s. */
export function stepVessel(w: World, v: Vessel, dt: number): void {
  if (v.destroyed) return;
  const body = w.idx.get(v.body);
  v.missionTime += dt;
  refreshDerived(v);
  const d = v.derived;
  if (d.hasJump) v.jumpCharge = Math.min(d.jumpRange, v.jumpCharge + dt / 60);
  updateMechanisms(v, dt);
  if (v.grace > 0) v.grace -= dt;
  if (v.contactsDirty) rebuildContacts(v);

  const R = body.radius;
  const theta = bodyAngle(body, w.t);

  if (body.luminous && v.pos.length() < R * 1.02) { breakUp(w, v, 'vaporised by the star'); return; }

  if (v.landed) { stepLanded(w, v, body, dt, theta); return; }

  const r = v.pos.length();
  const alt = r - R;
  const up = v1.copy(v.pos).divideScalar(r).clone();
  const rho = atmosphereDensity(body, alt);
  const pressure = atmospherePressure(body, alt) * (alt < atmosphereTop(body) ? 1 : 0);
  const vs = surfaceVelocity(body, v.pos, new Vector3());
  const vAir = new Vector3().subVectors(v.vel, vs);
  const speedAir = vAir.length();
  const q = 0.5 * rho * speedAir * speedAir;
  v.maxQ = Math.max(v.maxQ, q);

  const F = new Vector3();
  const tau = new Vector3();
  const eng = engineForces(w, v, dt, pressure, F, tau);

  const axisW = new Vector3(0, 1, 0).applyQuaternion(v.quat);

  // ---- aerodynamics
  if (rho > 0 && speedAir > 0.1) {
    const vhat = vAir.clone().divideScalar(speedAir);
    const cosA = clamp(axisW.dot(vhat), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    const sideArea = d.radiusMax * 2 * Math.max(1, d.top - d.bottom);
    const area = d.areaFront * Math.abs(cosA) + sideArea * sinA;
    const bluntFirst = d.shieldBottom && cosA < 0;
    const cd = (bluntFirst ? 1.3 : d.cdFront) * cosA * cosA + 1.1 * sinA * sinA;
    const drag = 0.5 * rho * speedAir * speedAir * cd * area;
    F.addScaledVector(vhat, -drag);
    // restoring (or destabilising) torque about the centre of mass
    const vb = vhat.clone().applyQuaternion(v2q(v.quat));
    // Stability: nose-first flight is stable when the centre of pressure trails the centre of mass.
    // A blunt heat shield is also stable going backwards, shield first, like a capsule.
    let lever = d.com.y - d.copY;
    if (vb.y < 0 && d.shieldBottom) lever = -(0.4 * d.radiusMax + 0.3);
    const k = 2 * q * (Math.PI * d.radiusMax * d.radiusMax) * lever;
    // yAxis x vb
    tau.x += k * (vb.z * 1 - 0);
    tau.z += k * (-vb.x);
    // damping of rotation in the airflow
    const L = Math.max(2, d.top - d.bottom);
    const damp = rho * speedAir * Math.PI * d.radiusMax * d.radiusMax * L * L * (d.shieldBottom ? 0.5 : 0.12);
    tau.x -= damp * v.angVel.x;
    tau.z -= damp * v.angVel.z;
    tau.y -= damp * 0.2 * v.angVel.y;
    if (q * sinA > 45000 && speedAir > 60 && !v.parts.some((p) => p.chute === 'full')) { breakUp(w, v, 'aerodynamic breakup'); return; }
    if (q > 160000) { breakUp(w, v, 'aerodynamic breakup'); return; }
    // heating
    const flux = 1.74e-4 * Math.sqrt(rho / Math.max(0.5, d.radiusMax)) * speedAir * speedAir * speedAir;
    const facing = d.shieldBottom && -axisW.dot(vhat) > 0.8;
    const tol = facing ? SHIELD_HEAT_TOL : BASE_HEAT_TOL;
    v.heat += (flux / tol - v.heat) * (1 - Math.exp(-dt / 6));
  } else {
    v.heat *= Math.exp(-dt / 40);
  }
  if (v.heat > 1) { breakUp(w, v, 'burned up on re-entry'); return; }
  if (pressure > d.maxPressure) { breakUp(w, v, 'crushed by atmospheric pressure'); return; }

  // ---- parachutes
  let chuteAlign = 0;
  for (const p of v.parts) {
    if (p.def.kind !== 'chute') continue;
    const A = p.def.chuteArea ?? 100;
    switch (p.chute) {
      case 'armed':
        if (rho > 0.01 && speedAir < 320) p.chute = 'reefed';
        break;
      case 'reefed':
        if (rho > 0.01 && speedAir > 380) { p.chute = 'cut'; note(w, 'Parachute torn away: deployed too fast.', 'bad'); }
        else if (rho > 0.2 && q < 25000) { p.chute = 'inflating'; p.chuteT = 0; }
        break;
      case 'inflating':
        p.chuteT += dt;
        if (q > 50000) { p.chute = 'cut'; note(w, 'Parachute torn away: dynamic pressure too high.', 'bad'); }
        else if (p.chuteT >= 3) p.chute = 'full';
        break;
      case 'full':
        if (q > 50000) { p.chute = 'cut'; note(w, 'Parachute torn away: dynamic pressure too high.', 'bad'); }
        break;
      default: break;
    }
    let frac = 0;
    if (p.chute === 'reefed') frac = 0.1;
    else if (p.chute === 'inflating') frac = 0.1 + 0.9 * Math.min(1, p.chuteT / 3);
    else if (p.chute === 'full') frac = 1;
    if (frac > 0 && speedAir > 0.5 && rho > 0) {
      const dragC = 0.5 * rho * speedAir * speedAir * 1.5 * A * frac;
      F.addScaledVector(vAir, -dragC / speedAir);
      chuteAlign = Math.max(chuteAlign, frac);
    }
  }
  if (chuteAlign > 0.5 && speedAir > 3) {
    // the canopy swings the load underneath it: nose up into the relative wind
    const wanted = vAir.clone().normalize().negate();
    const err = new Vector3().crossVectors(axisW, wanted).applyQuaternion(v2q(v.quat));
    tau.x += (3.0 * err.x - 2.2 * v.angVel.x) * d.ixx * chuteAlign;
    tau.z += (3.0 * err.z - 2.2 * v.angVel.z) * d.izz * chuteAlign;
  }

  // ---- landing assist and autopilots may have set throttle/sas already; control torque
  const sasOn = (w.assists.stability || v.ap != null) && d.hasControl;
  controlTorque(v, body, alt, v.vel, vAir, up, eng.thrust > 0 ? eng.gimbal : 0, sasOn, tau);

  // ---- integrate translation (velocity Verlet with piecewise-constant non-gravity force)
  const m = d.mass;
  const aNg = F.divideScalar(m);
  v.gLoad = aNg.length() / G0;
  const g1 = v.pos.clone().multiplyScalar(-body.mu / (r * r * r));
  v.pos.addScaledVector(v.vel, dt).addScaledVector(aNg.clone().add(g1), 0.5 * dt * dt);
  const r2 = v.pos.length();
  const g2 = v.pos.clone().multiplyScalar(-body.mu / (r2 * r2 * r2));
  v.vel.addScaledVector(aNg.clone().multiplyScalar(2).add(g1).add(g2), 0.5 * dt);

  // ---- integrate rotation (Euler's equations, diagonal inertia)
  const wv = v.angVel;
  const gyro = new Vector3(
    (d.iyy - d.izz) * wv.y * wv.z,
    (d.izz - d.ixx) * wv.z * wv.x,
    (d.ixx - d.iyy) * wv.x * wv.y,
  );
  wv.x += ((tau.x + gyro.x) / d.ixx) * dt;
  wv.y += ((tau.y + gyro.y) / d.iyy) * dt;
  wv.z += ((tau.z + gyro.z) / d.izz) * dt;
  const wl = wv.length();
  if (wl > 12) wv.multiplyScalar(12 / wl);
  q1.set(wv.x * dt * 0.5, wv.y * dt * 0.5, wv.z * dt * 0.5, 1);
  v.quat.multiply(q1).normalize();

  // ---- ground contact
  collide(w, v, body, theta);
}

function collide(w: World, v: Vessel, body: BodyDef, theta: number): void {
  const R = body.radius;
  const r = v.pos.length();
  if (body.gasGiant || body.luminous) return;
  if (r - R > terrainThreshold(body) + 200) return;
  const dirBF = rotY(v1.copy(v.pos).divideScalar(r), -theta).clone();
  const ground = groundHeight(body, dirBF);
  // lowest contact point relative to ground
  let minClear = Infinity;
  const com = v.derived.com;
  for (const p of v.contacts) {
    v2.copy(p).sub(com).applyQuaternion(v.quat).add(v.pos);
    const c = v2.length() - (R + ground);
    if (c < minClear) minClear = c;
  }
  if (!v.contacts.length) minClear = r - (R + ground);
  if (v.grace > 0 && minClear > -2) return;
  if (minClear > 0) return;
  const up = v3.copy(v.pos).divideScalar(r).clone();
  const vs = surfaceVelocity(body, v.pos, new Vector3());
  const vrel = new Vector3().subVectors(v.vel, vs);
  const vN = vrel.dot(up);
  if (vN > 1.0 && minClear > -3) return; // moving away (just lifted off)
  const vT = vrel.clone().addScaledVector(up, -vN).length();
  const axisW = new Vector3(0, 1, 0).applyQuaternion(v.quat);
  const tilt = Math.acos(clamp(axisW.dot(up), -1, 1));
  const ocean = isOcean(body, dirBF);
  const limit = impactLimit(v) * (ocean ? 1.8 : 1);
  const speed = Math.sqrt(vN * vN + 0.25 * vT * vT);
  if (speed > limit) { breakUp(w, v, `crashed at ${speed.toFixed(1)} m/s`); return; }
  if (tilt > (v.parts.filter((p) => p.def.kind === 'leg' && p.leg > 0.95).length >= 3 ? 0.62 : 0.5) && speed > 1.5) { breakUp(w, v, 'toppled over on touchdown'); return; }
  if (tilt > 0.85) { breakUp(w, v, 'toppled over'); return; }
  // settled
  q1.setFromUnitVectors(axisW, up);
  v.quat.premultiply(q1).normalize();
  v.landed = true;
  v.landedOn = ocean ? 'water' : 'ground';
  v.surfDir.copy(dirBF);
  v.surfR = r - minClear;
  v.surfQuat.copy(v.quat).premultiply(new Quaternion().setFromAxisAngle(Y, -theta));
  v.vel.copy(vs);
  v.angVel.set(0, 0, 0);
  v.throttle = 0;
  for (const p of v.parts) if (p.def.kind === 'chute' && (p.chute === 'full' || p.chute === 'inflating' || p.chute === 'reefed')) p.chute = 'cut';
  const text = `${ocean ? 'Splashdown' : 'Touchdown'} at ${speed.toFixed(1)} m/s`;
  emit(w, { type: 'touchdown', vessel: v.id, text });
  if (ocean) emit(w, { type: 'splash', body: v.body, pos: v.pos.clone() });
  if (v.id === w.activeId) note(w, text + ` on ${body.name}.`, 'good');
}

function stepLanded(w: World, v: Vessel, body: BodyDef, dt: number, theta: number): void {
  v.pos.copy(v.surfDir).multiplyScalar(v.surfR);
  rotY(v.pos, theta);
  v.quat.copy(v.surfQuat).premultiply(q2.setFromAxisAngle(Y, theta));
  surfaceVelocity(body, v.pos, v.vel);
  v.angVel.set(0, 0, 0);
  const F = new Vector3();
  const tau = new Vector3();
  const pressure = atmospherePressure(body, 0);
  const eng = engineForces(w, v, dt, pressure, F, tau);
  if (eng.thrust > 0) {
    const up = v.pos.clone().normalize();
    const g = body.mu / (v.surfR * v.surfR);
    const wOmega = bodyOmega(body);
    const gEff = g - wOmega * wOmega * v.surfR * (1 - up.y * up.y);
    const accUp = F.dot(up) / v.derived.mass;
    if (accUp > gEff * 1.0005) {
      liftoffNow(v);
      v.landedOn = 'ground';
      v.vel.copy(surfaceVelocity(body, v.pos, new Vector3()));
    }
  }
}

export function altitudeOf(w: World, v: Vessel): number {
  return v.pos.length() - w.idx.get(v.body).radius;
}

/** Height above the terrain below, or Infinity when far away or over gas. */
export function radarAltitude(w: World, v: Vessel): number {
  const body = w.idx.get(v.body);
  const r = v.pos.length();
  if (body.gasGiant || body.luminous) return r - body.radius;
  if (r - body.radius > terrainThreshold(body)) return Infinity;
  const dir = toBodyFixed(body, v.pos, w.t, new Vector3()).normalize();
  const ground = groundHeight(body, dir);
  let low = 0;
  const com = v.derived.com;
  let minClear = Infinity;
  for (const p of v.contacts) {
    const wp = p.clone().sub(com).applyQuaternion(v.quat).add(v.pos);
    minClear = Math.min(minClear, wp.length() - (body.radius + ground));
  }
  low = Number.isFinite(minClear) ? minClear : r - (body.radius + ground);
  return low;
}
