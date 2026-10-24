import { Vector3 } from 'three';
import { atmosphereDensity, atmospherePressure, atmosphereTop } from './bodies';
import { altitudeOf, radarAltitude } from './flight';
import { surfaceVelocity } from './frame';
import { elements } from './orbit';
import { propellantRemaining, deltaVRemaining, Vessel } from './vessel';
import { World } from './world';

export interface Telemetry {
  body: string;
  situation: string;
  alt: number;
  radar: number;
  speedSurf: number;
  speedOrb: number;
  vSpeed: number;
  hSpeed: number;
  rho: number;
  pressure: number;
  q: number;
  mass: number;
  thrust: number;
  twr: number;
  gLoad: number;
  throttle: number;
  fuel: number;
  fuelCap: number;
  dv: number;
  dvAtm: number;
  heat: number;
  apo: number;
  peri: number;
  period: number;
  ecc: number;
  inc: number;
  tAp: number;
  tPe: number;
  bound: boolean;
  missionTime: number;
  crew: number;
  stagesLeft: number;
  maxQ: number;
  jumpCharge: number;
  jumpRange: number;
  pitch: number;
  heading: number;
  roll: number;
}

const Y = new Vector3(0, 1, 0);

export function computeTelemetry(w: World, v: Vessel): Telemetry {
  const body = w.idx.get(v.body);
  const alt = altitudeOf(w, v);
  const vs = surfaceVelocity(body, v.pos, new Vector3());
  const vSurf = v.vel.clone().sub(vs);
  const up = v.pos.clone().normalize();
  const vSpeed = vSurf.dot(up);
  const hSpeed = Math.sqrt(Math.max(0, vSurf.lengthSq() - vSpeed * vSpeed));
  const rho = atmosphereDensity(body, alt);
  const el = elements(v.pos, v.vel, body.mu);
  let thrust = 0;
  const pressure = atmospherePressure(body, alt) * (alt < atmosphereTop(body) ? 1 : 0);
  const pr = Math.min(1, pressure / 101325);
  for (const p of v.parts) {
    if ((p.def.kind === 'engine' || p.def.kind === 'srb') && p.burn > 0) {
      const ispVac = p.def.ispVac ?? 300;
      const ispAtm = p.def.ispAtm ?? ispVac;
      thrust += (p.def.thrust ?? 0) * p.burn * ((ispVac + (ispAtm - ispVac) * pr) / ispVac);
    }
  }
  const g = body.mu / (v.pos.lengthSq());
  let situation = 'Flying';
  if (v.landed) situation = v.landedOn === 'water' ? 'Splashed down' : 'Landed';
  else if (alt > atmosphereTop(body) && el.bound && el.rp > body.radius + atmosphereTop(body)) situation = 'In orbit';
  else if (alt > atmosphereTop(body)) situation = el.bound ? 'Sub-orbital' : 'Escape trajectory';
  else if (alt > 18000 && body.atmosphere) situation = 'Upper atmosphere';
  // attitude relative to the local horizon
  const axis = new Vector3(0, 1, 0).applyQuaternion(v.quat);
  const east = new Vector3().crossVectors(Y, up);
  if (east.lengthSq() < 1e-9) east.set(1, 0, 0);
  east.normalize();
  const north = new Vector3().crossVectors(up, east).normalize();
  const pitch = Math.asin(Math.max(-1, Math.min(1, axis.dot(up))));
  const hx = axis.dot(north);
  const hy = axis.dot(east);
  const heading = (Math.atan2(hy, hx) + Math.PI * 2) % (Math.PI * 2);
  // roll: angle of the vessel's local +Z about the nose relative to the horizon plane
  const zAxis = new Vector3(0, 0, 1).applyQuaternion(v.quat);
  const rollRef = new Vector3().crossVectors(axis, up);
  const roll = rollRef.lengthSq() < 1e-6 ? 0 : Math.atan2(zAxis.dot(up), zAxis.dot(rollRef.normalize()));
  let fuelCap = 0;
  for (const p of v.parts) if (p.def.kind === 'tank' || p.def.kind === 'srb') fuelCap += p.def.fuel ?? 0;
  return {
    body: body.name, situation, alt, radar: radarAltitude(w, v), speedSurf: vSurf.length(), speedOrb: v.vel.length(), vSpeed, hSpeed,
    rho, pressure, q: 0.5 * rho * vSurf.lengthSq(), mass: v.derived.mass, thrust, twr: thrust / (v.derived.mass * g), gLoad: v.gLoad,
    throttle: v.throttle, fuel: propellantRemaining(v), fuelCap, dv: deltaVRemaining(v, true), dvAtm: deltaVRemaining(v, false), heat: v.heat,
    apo: el.bound ? el.ra - body.radius : Infinity, peri: el.rp - body.radius, period: el.period, ecc: el.e, inc: el.inclination,
    tAp: el.tAp, tPe: el.tPe, bound: el.bound, missionTime: v.missionTime, crew: v.derived.crew,
    stagesLeft: v.stages.length - v.stageIdx, maxQ: v.maxQ, jumpCharge: v.jumpCharge, jumpRange: v.derived.jumpRange,
    pitch, heading, roll,
  };
}
