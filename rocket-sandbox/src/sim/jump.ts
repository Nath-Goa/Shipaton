import { distanceLy, StarRec, starById, systemForStar } from './galaxy';
import { atmosphereTop } from './bodies';
import { altitudeOf } from './flight';
import { enterSystem } from './sim';
import { note, World } from './world';
import { Vessel } from './vessel';

export interface JumpCheck { ok: boolean; reason: string; distance: number }

export function currentStar(w: World): StarRec {
  return starById(w.system.starId)!;
}

export function checkJump(w: World, v: Vessel, target: StarRec): JumpCheck {
  const here = currentStar(w);
  const distance = distanceLy(here, target);
  if (target.id === here.id) return { ok: false, reason: 'Already here.', distance };
  if (!v.derived.hasJump) return { ok: false, reason: 'This ship has no jump drive.', distance };
  if (v.landed) return { ok: false, reason: 'Lift off first.', distance };
  const body = w.idx.get(v.body);
  if (altitudeOf(w, v) < atmosphereTop(body) + 1000) return { ok: false, reason: 'Jump from outside the atmosphere.', distance };
  if (!w.assists.unlimitedFuel && v.jumpCharge < distance) {
    return { ok: false, reason: `Needs ${distance.toFixed(1)} ly of charge; ${v.jumpCharge.toFixed(1)} ly stored (recharges 1 ly per minute — use time acceleration).`, distance };
  }
  if (distance > v.derived.jumpRange * 1.0001 && !w.assists.unlimitedFuel) return { ok: false, reason: `Beyond one jump (${v.derived.jumpRange.toFixed(0)} ly). Hop in stages.`, distance };
  return { ok: true, reason: '', distance };
}

export function doJump(w: World, v: Vessel, target: StarRec): boolean {
  const chk = checkJump(w, v, target);
  if (!chk.ok) { note(w, chk.reason, 'warn'); return false; }
  if (!w.assists.unlimitedFuel) v.jumpCharge -= chk.distance;
  const system = systemForStar(target);
  enterSystem(w, system, v);
  w.warpIndex = 0;
  note(w, `Jump complete: arrived in the ${system.name}.`, 'good');
  return true;
}
