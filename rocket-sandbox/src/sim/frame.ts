import { Vector3 } from 'three';
import { BodyDef } from './bodies';

/** Rotates about +Y by theta (counter-clockwise seen from above), in place. */
export function rotY(v: Vector3, theta: number): Vector3 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const x = v.x * c + v.z * s;
  const z = -v.x * s + v.z * c;
  v.x = x;
  v.z = z;
  return v;
}

export function bodyOmega(body: BodyDef): number {
  return (2 * Math.PI) / body.rotationPeriod;
}

/** Rotation angle of the body-fixed frame relative to the inertial one at time t. */
export function bodyAngle(body: BodyDef, t: number): number {
  return bodyOmega(body) * t;
}

/** Velocity of the surface (and co-rotating air) at an inertial position: omega x r. */
export function surfaceVelocity(body: BodyDef, pos: Vector3, out = new Vector3()): Vector3 {
  const w = bodyOmega(body);
  return out.set(w * pos.z, 0, -w * pos.x);
}

export function toBodyFixed(body: BodyDef, pos: Vector3, t: number, out = new Vector3()): Vector3 {
  return rotY(out.copy(pos), -bodyAngle(body, t));
}

export function toInertial(body: BodyDef, posBF: Vector3, t: number, out = new Vector3()): Vector3 {
  return rotY(out.copy(posBF), bodyAngle(body, t));
}
