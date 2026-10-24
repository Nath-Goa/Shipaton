import { Vector3 } from 'three';
import { SystemDef, SystemIndex } from './bodies';
import { Vessel } from './vessel';

export interface Assists {
  /** Reaction-wheel stability assistance (SAS) */
  stability: boolean;
  /** Ascent / circularise / transfer autopilots */
  orbitGuidance: boolean;
  /** Automatic powered-descent autopilot, legs and parachutes */
  landing: boolean;
  unlimitedFuel: boolean;
}

export const DEFAULT_ASSISTS: Assists = { stability: true, orbitGuidance: false, landing: false, unlimitedFuel: false };

export type GameEvent =
  | { type: 'explosion'; body: string; pos: Vector3; size: number }
  | { type: 'stage'; vessel: number }
  | { type: 'separation'; vessel: number }
  | { type: 'touchdown'; vessel: number; text: string }
  | { type: 'msg'; text: string; level: 'info' | 'warn' | 'bad' | 'good' }
  | { type: 'splash'; body: string; pos: Vector3 };

export interface Flag { id: number; body: string; dir: Vector3; name: string; t: number }

export interface Eva {
  body: string;
  /** Body-fixed unit direction and local offset (m) from the vessel hatch */
  dir: Vector3;
  heading: number;
  /** Surface-tangent velocity and vertical velocity, m/s */
  vel: Vector3;
  height: number;
  vessel: number;
  flagsLeft: number;
}

export interface World {
  system: SystemDef;
  idx: SystemIndex;
  /** Seconds since game epoch */
  t: number;
  vessels: Vessel[];
  activeId: number;
  assists: Assists;
  events: GameEvent[];
  flags: Flag[];
  eva: Eva | null;
  nextFlag: number;
  /** Bodies and systems the player has visited */
  discovered: Set<string>;
  visitedSystems: Set<string>;
  padBody: string;
  padDir: Vector3;
  /** Highest warp index permitted right now (recomputed by the sim) and why */
  warpIndex: number;
  warpCap: number;
  warpReason: string;
  paused: boolean;
}

export const WARP_LEVELS = [1, 2, 4, 10, 50, 100, 1000, 10000, 100000, 1000000];

export function activeVessel(w: World): Vessel | undefined {
  return w.vessels.find((v) => v.id === w.activeId);
}

export function emit(w: World, e: GameEvent): void {
  w.events.push(e);
  if (w.events.length > 200) w.events.splice(0, w.events.length - 200);
}

export function note(w: World, text: string, level: 'info' | 'warn' | 'bad' | 'good' = 'info'): void {
  emit(w, { type: 'msg', text, level });
}
