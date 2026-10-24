import { Vector3 } from 'three';
import { SystemIndex } from './bodies';

export interface StateVec { pos: Vector3; vel: Vector3 }

const TWO_PI = Math.PI * 2;

export function solveKepler(M: number, e: number): number {
  M = ((M % TWO_PI) + TWO_PI) % TWO_PI;
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 30; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}

/** Position/velocity of a body relative to its parent at game time t (ecliptic frame, +Y up). */
export function bodyStateRel(idx: SystemIndex, id: string, t: number, out: StateVec = { pos: new Vector3(), vel: new Vector3() }): StateVec {
  const b = idx.get(id);
  if (!b.orbit || !b.parent) { out.pos.set(0, 0, 0); out.vel.set(0, 0, 0); return out; }
  const { a, e, argPeri, M0 } = b.orbit;
  const mu = idx.get(b.parent).mu;
  const n = Math.sqrt(mu / (a * a * a)) * (b.orbit.retrograde ? -1 : 1);
  const E = solveKepler(M0 + n * t, e);
  const sE = Math.sin(E);
  const cE = Math.cos(E);
  const bsm = a * Math.sqrt(1 - e * e);
  const Edot = n / (1 - e * cE);
  const xp = a * (cE - e);
  const yp = bsm * sE;
  const vxp = -a * sE * Edot;
  const vyp = bsm * cE * Edot;
  const cw = Math.cos(argPeri);
  const sw = Math.sin(argPeri);
  out.pos.set(xp * cw - yp * sw, 0, -(xp * sw + yp * cw));
  out.vel.set(vxp * cw - vyp * sw, 0, -(vxp * sw + vyp * cw));
  return out;
}

const tmpS: StateVec = { pos: new Vector3(), vel: new Vector3() };

/** Position of a body relative to the system's star. */
export function bodyPosAbs(idx: SystemIndex, id: string, t: number, out = new Vector3()): Vector3 {
  out.set(0, 0, 0);
  let cur: string | null = id;
  while (cur) {
    const b = idx.get(cur);
    if (!b.parent) break;
    bodyStateRel(idx, cur, t, tmpS);
    out.add(tmpS.pos);
    cur = b.parent;
  }
  return out;
}

export function bodyVelAbs(idx: SystemIndex, id: string, t: number, out = new Vector3()): Vector3 {
  out.set(0, 0, 0);
  let cur: string | null = id;
  while (cur) {
    const b = idx.get(cur);
    if (!b.parent) break;
    bodyStateRel(idx, cur, t, tmpS);
    out.add(tmpS.vel);
    cur = b.parent;
  }
  return out;
}

export function rotationAngle(period: number, t: number): number {
  return (TWO_PI * t) / period;
}

function stumpffC(z: number): number {
  if (z > 1e-8) return (1 - Math.cos(Math.sqrt(z))) / z;
  if (z < -1e-8) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
  return 0.5 - z / 24;
}
function stumpffS(z: number): number {
  if (z > 1e-8) { const s = Math.sqrt(z); return (s - Math.sin(s)) / (s * s * s); }
  if (z < -1e-8) { const s = Math.sqrt(-z); return (Math.sinh(s) - s) / (s * s * s); }
  return 1 / 6 - z / 120;
}

/** Universal-variable two-body propagation. Valid for ellipses, parabolas and hyperbolas. */
export function keplerStep(r0v: Vector3, v0v: Vector3, mu: number, dt: number, outR = new Vector3(), outV = new Vector3()): { r: Vector3; v: Vector3 } {
  const r0 = r0v.length();
  const v0sq = v0v.lengthSq();
  const alpha = 2 / r0 - v0sq / mu;
  if (alpha > 1e-14) {
    const period = TWO_PI / Math.sqrt(mu * alpha * alpha * alpha);
    dt = dt % period;
  }
  const sqmu = Math.sqrt(mu);
  const vr0 = r0v.dot(v0v) / r0;
  const A = (r0 * vr0) / sqmu;
  const B = 1 - alpha * r0;
  let chi: number;
  if (alpha > 1e-14) chi = sqmu * alpha * dt;
  else if (alpha < -1e-14) {
    const a = 1 / alpha;
    const sgn = Math.sign(dt) || 1;
    const arg = (-2 * mu * alpha * dt) / (r0v.dot(v0v) + sgn * Math.sqrt(-mu * a) * (1 - r0 * alpha));
    chi = arg > 0 ? sgn * Math.sqrt(-a) * Math.log(arg) : (sqmu * dt) / r0;
  } else chi = (sqmu * dt) / r0;
  for (let i = 0; i < 60; i++) {
    const z = alpha * chi * chi;
    const C = stumpffC(z);
    const S = stumpffS(z);
    const f = A * chi * chi * C + B * chi * chi * chi * S + r0 * chi - sqmu * dt;
    const fp = A * chi * (1 - z * S) + B * chi * chi * C + r0;
    let d = f / fp;
    const lim = Math.max(1, Math.abs(chi)) * 2;
    if (d > lim) d = lim; else if (d < -lim) d = -lim;
    chi -= d;
    if (Math.abs(d) < 1e-9 * Math.max(1, Math.abs(chi))) break;
  }
  const z = alpha * chi * chi;
  const C = stumpffC(z);
  const S = stumpffS(z);
  const f = 1 - (chi * chi * C) / r0;
  const g = dt - (chi * chi * chi * S) / sqmu;
  const r = outR.copy(r0v).multiplyScalar(f).addScaledVector(v0v, g);
  const rl = r.length();
  const fd = (sqmu / (rl * r0)) * (z * chi * S - chi);
  const gd = 1 - (chi * chi * C) / rl;
  const v = outV.copy(r0v).multiplyScalar(fd).addScaledVector(v0v, gd);
  return { r, v };
}

export interface Elements {
  a: number; e: number; rp: number; ra: number; period: number; inclination: number;
  h: Vector3; evec: Vector3; nu: number; energy: number; bound: boolean;
  /** seconds until periapsis / apoapsis (apoapsis only for bound orbits) */
  tPe: number; tAp: number;
}

export function elements(r: Vector3, v: Vector3, mu: number): Elements {
  const rl = r.length();
  const h = new Vector3().crossVectors(r, v);
  const hl = h.length();
  const evec = new Vector3().crossVectors(v, h).divideScalar(mu).addScaledVector(r, -1 / rl);
  const e = evec.length();
  const energy = v.lengthSq() / 2 - mu / rl;
  const bound = energy < 0;
  const a = Math.abs(energy) < 1e-12 ? Infinity : -mu / (2 * energy);
  const p = (hl * hl) / mu;
  const rp = p / (1 + e);
  const ra = bound ? a * (1 + e) : Infinity;
  let nu: number;
  if (e < 1e-9) {
    nu = Math.atan2(r.z, r.x);
  } else {
    nu = Math.acos(Math.max(-1, Math.min(1, evec.dot(r) / (e * rl))));
    if (r.dot(v) < 0) nu = TWO_PI - nu;
  }
  const inclination = hl > 0 ? Math.acos(Math.max(-1, Math.min(1, h.y / hl))) : 0;
  let period = Infinity;
  let tPe = Infinity;
  let tAp = Infinity;
  if (bound) {
    period = TWO_PI * Math.sqrt((a * a * a) / mu);
    const n = TWO_PI / period;
    const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
    const M = (((E - e * Math.sin(E)) % TWO_PI) + TWO_PI) % TWO_PI;
    tPe = ((TWO_PI - M) % TWO_PI) / n;
    tAp = ((((Math.PI - M) % TWO_PI) + TWO_PI) % TWO_PI) / n;
  } else if (e > 1) {
    const nuS = nu > Math.PI ? nu - TWO_PI : nu;
    const F = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nuS / 2));
    const M = e * Math.sinh(F) - F;
    const n = Math.sqrt(mu / Math.pow(-a, 3));
    tPe = -M / n;
  }
  return { a, e, rp, ra, period, inclination, h, evec, nu, energy, bound, tPe, tAp };
}

/** Points on the conic for drawing, in the body frame. Open orbits are clipped at maxR. */
export function sampleConic(r: Vector3, v: Vector3, mu: number, n = 180, maxR = Infinity): Vector3[] {
  const el = elements(r, v, mu);
  const hl = el.h.length();
  if (hl < 1e-6) return [];
  const p = (hl * hl) / mu;
  const P = el.e > 1e-9 ? el.evec.clone().normalize() : r.clone().normalize();
  const Q = new Vector3().crossVectors(el.h, P).normalize();
  let lim = Math.PI;
  if (el.e >= 1 || (Number.isFinite(maxR) && el.ra > maxR)) {
    const rClip = Number.isFinite(maxR) ? maxR : p * 50;
    const c = Math.max(-1, Math.min(1, (p / rClip - 1) / el.e));
    lim = Math.min(Math.acos(c), el.e >= 1 ? Math.acos(-1 / el.e) * 0.999 : Math.PI);
  }
  const pts: Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const nu = -lim + (2 * lim * i) / n;
    const rr = p / (1 + el.e * Math.cos(nu));
    if (rr < 0) continue;
    pts.push(P.clone().multiplyScalar(rr * Math.cos(nu)).addScaledVector(Q, rr * Math.sin(nu)));
  }
  return pts;
}

export interface Encounter {
  kind: 'encounter' | 'escape' | 'impact';
  body: string;
  /** Seconds from now */
  dt: number;
}

/** Walks the current conic forward, looking for sphere-of-influence changes or a ground impact. */
export function predictEvents(idx: SystemIndex, bodyId: string, r: Vector3, v: Vector3, t: number, horizon: number): Encounter | null {
  const body = idx.get(bodyId);
  const kids = idx.children.get(bodyId) ?? [];
  const soi = idx.soi.get(bodyId) ?? Infinity;
  const el = elements(r, v, body.mu);
  let step = el.bound ? el.period / 240 : Math.max(20, Math.min(3600, r.length() / Math.max(50, v.length()) / 4));
  step = Math.min(step, horizon / 100);
  const rr = new Vector3();
  const vv = new Vector3();
  const cp = new Vector3();
  const nsteps = Math.min(2000, Math.ceil(horizon / step));
  for (let i = 1; i <= nsteps; i++) {
    const dt = i * step;
    keplerStep(r, v, body.mu, dt, rr, vv);
    if (rr.length() < body.radius) return { kind: 'impact', body: bodyId, dt };
    if (rr.length() > soi) return { kind: 'escape', body: body.parent ?? bodyId, dt };
    for (const k of kids) {
      bodyStateRel(idx, k.id, t + dt, tmpS);
      cp.copy(rr).sub(tmpS.pos);
      if (cp.length() < (idx.soi.get(k.id) ?? 0)) return { kind: 'encounter', body: k.id, dt };
    }
  }
  return null;
}
