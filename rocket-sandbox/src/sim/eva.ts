import { Vector3 } from 'three';
import { toInertial } from './frame';
import { groundHeight, isOcean } from './terrain';
import { note, World, Eva } from './world';
import { Vessel } from './vessel';

export const EVA_LEASH = 3000;
const WALK = 2.8;
const RUN = 5.5;
const JUMP_SPEED = 4.2;
const HEIGHT = 1.8;

export function canEva(w: World, v: Vessel): string | null {
  if (v.destroyed) return 'Vessel destroyed.';
  if (!v.landed) return 'Land first.';
  if (v.derived.crew <= 0) return 'This vessel carries no crew.';
  if (w.idx.get(v.body).gasGiant || w.idx.get(v.body).luminous) return 'No ground here.';
  if (v.landedOn === 'water') return 'Cannot exit onto open water.';
  return null;
}

export function localBasis(dir: Vector3): { up: Vector3; east: Vector3; north: Vector3 } {
  const up = dir.clone().normalize();
  let east = new Vector3().crossVectors(new Vector3(0, 1, 0), up);
  if (east.lengthSq() < 1e-8) east = new Vector3(1, 0, 0);
  east.normalize();
  const north = new Vector3().crossVectors(up, east).normalize();
  return { up, east, north };
}

export function startEva(w: World, v: Vessel): boolean {
  const why = canEva(w, v);
  if (why) { note(w, why, 'warn'); return false; }
  const body = w.idx.get(v.body);
  const { east, north } = localBasis(v.surfDir);
  const heading = Math.PI / 3;
  const off = east.clone().multiplyScalar(Math.cos(heading) * 4).addScaledVector(north, Math.sin(heading) * 4);
  const dir = v.surfDir.clone().multiplyScalar(body.radius).add(off).normalize();
  w.eva = { body: v.body, dir, heading, vel: new Vector3(), height: 0, vessel: v.id, flagsLeft: 99 } as Eva;
  w.warpIndex = 0;
  note(w, 'Astronaut on the surface. WASD to walk, Space to jump, F to plant a flag, B to board.', 'info');
  return true;
}

export interface EvaInput { forward: number; turn: number; strafe: number; run: boolean; jump: boolean }

export function stepEva(w: World, dt: number, input: EvaInput): void {
  const e = w.eva;
  if (!e) return;
  const body = w.idx.get(e.body);
  const g = body.mu / (body.radius * body.radius);
  e.heading -= input.turn * 1.8 * dt;
  const { east, north } = localBasis(e.dir);
  const fwd = east.clone().multiplyScalar(Math.cos(e.heading)).addScaledVector(north, Math.sin(e.heading));
  const right = east.clone().multiplyScalar(Math.sin(e.heading)).addScaledVector(north, -Math.cos(e.heading));
  const speed = input.run ? RUN : WALK;
  const move = fwd.multiplyScalar(input.forward).addScaledVector(right, input.strafe);
  if (move.lengthSq() > 1) move.normalize();
  const grounded = e.height <= 0.02;
  const ds = move.multiplyScalar(speed * dt * (grounded ? 1 : 0.8));
  if (ds.lengthSq() > 0) {
    const nd = e.dir.clone().multiplyScalar(body.radius).add(ds).normalize();
    const vessel = w.vessels.find((q) => q.id === e.vessel);
    const farEnough = vessel ? nd.clone().sub(vessel.surfDir).length() * body.radius > EVA_LEASH : false;
    if (!isOcean(body, nd) && !farEnough) {
      const hNow = groundHeight(body, e.dir);
      const hNew = groundHeight(body, nd);
      const slope = Math.abs(hNew - hNow) / Math.max(0.01, ds.length());
      if (slope < 1.4) e.dir.copy(nd);
    }
  }
  e.vel.y -= g * dt;
  if (grounded && input.jump) e.vel.y = JUMP_SPEED;
  e.height += e.vel.y * dt;
  if (e.height < 0) { e.height = 0; e.vel.y = 0; }
}

export function evaGroundPoint(w: World, e: Eva): Vector3 {
  const body = w.idx.get(e.body);
  return e.dir.clone().multiplyScalar(body.radius + groundHeight(body, e.dir));
}

/** Inertial position of the astronaut's feet. */
export function evaInertial(w: World, e: Eva): Vector3 {
  const body = w.idx.get(e.body);
  const p = evaGroundPoint(w, e).add(e.dir.clone().multiplyScalar(e.height));
  return toInertial(body, p, w.t);
}

export function plantFlag(w: World): boolean {
  const e = w.eva;
  if (!e) return false;
  if (e.height > 0.1) { note(w, 'Stand on the ground to plant a flag.', 'warn'); return false; }
  const body = w.idx.get(e.body);
  const id = w.nextFlag++;
  w.flags.push({ id, body: e.body, dir: e.dir.clone(), name: `${body.name} flag ${w.flags.filter((f) => f.body === e.body).length + 1}`, t: w.t });
  note(w, `Flag planted on ${body.name}.`, 'good');
  return true;
}

export function boardRange(w: World): number {
  const e = w.eva;
  if (!e) return Infinity;
  const v = w.vessels.find((q) => q.id === e.vessel);
  if (!v) return Infinity;
  const body = w.idx.get(e.body);
  return e.dir.clone().sub(v.surfDir).length() * body.radius;
}

export function boardVessel(w: World): boolean {
  const e = w.eva;
  if (!e) return false;
  if (boardRange(w) > 12) { note(w, 'Too far from the vessel to board (12 m).', 'warn'); return false; }
  w.eva = null;
  note(w, 'Back aboard.', 'good');
  return true;
}

export const EVA_EYE_HEIGHT = HEIGHT;
