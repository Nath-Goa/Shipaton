import { Quaternion, Vector3 } from 'three';
import { atmosphereTop, G0 } from './bodies';
import { activateStage, inAtmosphere, radarAltitude, toggleLegs, armChutes } from './flight';
import { surfaceVelocity } from './frame';
import { bodyStateRel, elements, keplerStep } from './orbit';
import { note, World } from './world';
import { Vessel } from './vessel';

const Y = new Vector3(0, 1, 0);
const DEG = Math.PI / 180;

function clamp(x: number, a: number, b: number): number { return Math.max(a, Math.min(b, x)); }

export function stopAutopilot(w: World, v: Vessel, why?: string): void {
  if (v.ap && why) note(w, why, 'info');
  v.ap = null;
}

export function startAutopilot(w: World, v: Vessel, kind: 'ascent' | 'circularize' | 'land' | 'transfer' | 'deorbit', opts: { target?: string; targetAlt?: number } = {}): string | null {
  if (!v.derived.hasControl) return 'This vessel has no command pod.';
  if (kind === 'land' && !w.assists.landing) return 'Enable landing assistance in settings first.';
  if (kind !== 'land' && !w.assists.orbitGuidance) return 'Enable orbit guidance in settings first.';
  const body = w.idx.get(v.body);
  const targetAlt = opts.targetAlt ?? (body.atmosphere ? Math.max(120e3, atmosphereTop(body) * 1.3) : 40e3);
  v.ap = {
    kind,
    phase: kind === 'ascent' ? 'launch' : kind === 'land' ? 'plan' : 'start',
    target: opts.target,
    targetAlt,
    note: 'Engaging…',
    data: {},
  };
  v.sas.mode = 'hold';
  note(w, `Autopilot: ${kind}`, 'info');
  return null;
}

// ------------------------------------------------------------------ helpers

interface Frame { up: Vector3; east: Vector3; north: Vector3; alt: number; r: number }

function localFrame(w: World, v: Vessel): Frame {
  const body = w.idx.get(v.body);
  const r = v.pos.length();
  const up = v.pos.clone().divideScalar(r);
  let east = new Vector3().crossVectors(Y, up);
  if (east.lengthSq() < 1e-8) east = new Vector3(1, 0, 0);
  east.normalize();
  const north = new Vector3().crossVectors(up, east).normalize();
  return { up, east, north, alt: r - body.radius, r };
}

function point(v: Vessel, dir: Vector3): void {
  const axis = new Vector3(0, 1, 0).applyQuaternion(v.quat);
  const q = new Quaternion().setFromUnitVectors(axis, dir.clone().normalize());
  v.sas.mode = 'hold';
  v.sas.hold.copy(q.multiply(v.quat));
}

function alignment(v: Vessel, dir: Vector3): number {
  const axis = new Vector3(0, 1, 0).applyQuaternion(v.quat);
  return Math.acos(clamp(axis.dot(dir.clone().normalize()), -1, 1));
}

function usableEngines(v: Vessel) {
  return v.parts.filter((p) => (p.def.kind === 'engine' || p.def.kind === 'srb') && p.ignited && !p.flameout);
}

/** Vacuum thrust of whatever is lit, in newtons. */
function thrustAvail(w: World, v: Vessel): number {
  let f = 0;
  for (const p of usableEngines(v)) {
    if (!w.assists.unlimitedFuel && p.def.kind === 'srb' && p.fuel <= 0) continue;
    f += p.def.thrust ?? 0;
  }
  return f;
}

/** Light the next stage when nothing usable is burning. Returns true when an engine is available. */
function ensureEngines(w: World, v: Vessel): boolean {
  for (let guard = 0; guard < 6; guard++) {
    if (thrustAvail(w, v) > 0) return true;
    if (v.stageIdx >= v.stages.length) {
      // last resort: light every engine we have
      let any = false;
      for (const p of v.parts) if (p.def.kind === 'engine' && (w.assists.unlimitedFuel || (v.feeds.get(p.id) ?? []).some((t) => t.fuel > 1))) { p.ignited = true; p.flameout = false; any = true; }
      return any;
    }
    activateStage(w, v);
  }
  return thrustAvail(w, v) > 0;
}

/** If the lit engines have run dry and there is a later stage, fire it. */
function autoStage(w: World, v: Vessel): void {
  const lit = v.parts.filter((p) => (p.def.kind === 'engine' || p.def.kind === 'srb') && p.ignited);
  if (!lit.length) return;
  if (lit.every((p) => p.flameout) && v.stageIdx < v.stages.length) activateStage(w, v);
  // spent solid boosters hold the stack back: drop them when the next stage is waiting
}

function accelMax(w: World, v: Vessel): number {
  return thrustAvail(w, v) / v.derived.mass;
}

function finish(w: World, v: Vessel, text: string): void {
  v.throttle = 0;
  v.ap = null;
  v.sas.mode = 'prograde';
  note(w, text, 'good');
}

function throttleForDv(dvLeft: number, aMax: number): number {
  return clamp(dvLeft / Math.max(0.5, aMax * 1.5), 0.04, 1);
}

// ------------------------------------------------------------------ main entry

export function runAutopilot(w: World, v: Vessel, dt: number): void {
  const ap = v.ap;
  if (!ap || v.destroyed) return;
  void dt;
  switch (ap.kind) {
    case 'ascent': return ascent(w, v);
    case 'circularize': return circularize(w, v);
    case 'deorbit': return deorbit(w, v);
    case 'land': return land(w, v);
    case 'transfer': return transfer(w, v);
  }
}

// ------------------------------------------------------------------ ascent

function ascent(w: World, v: Vessel): void {
  const ap = v.ap!;
  const body = w.idx.get(v.body);
  const f = localFrame(w, v);
  const el = elements(v.pos, v.vel, body.mu);
  const target = ap.targetAlt ?? 150e3;
  const vs = surfaceVelocity(body, v.pos, new Vector3());
  const vAir = v.vel.clone().sub(vs);
  const q = body.atmosphere ? 0.5 * Math.exp(-f.alt / body.atmosphere.scaleHeight) * body.atmosphere.density0 * vAir.lengthSq() : 0;
  const apAlt = el.bound ? el.ra - body.radius : Infinity;

  autoStage(w, v);

  switch (ap.phase) {
    case 'launch': {
      if (!ensureEngines(w, v)) { stopAutopilot(w, v, 'Autopilot: no engine available.'); return; }
      v.throttle = 1;
      point(v, f.up);
      ap.note = 'Lifting off';
      if (!v.landed && f.alt > 600) ap.phase = 'turn';
      break;
    }
    case 'turn': {
      v.throttle = clamp(1 - (q - 38000) / 14000, 0.35, 1);
      const kickEnd = 4000;
      if (f.alt < kickEnd) {
        const tilt = 10 * DEG * clamp((f.alt - 600) / (kickEnd - 600), 0, 1);
        point(v, f.up.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(f.east, Math.sin(tilt)));
      } else {
        // follow the surface velocity, nudged toward the horizon to match a target flight-path profile
        const ref = vAir.lengthSq() > 1600 ? vAir : v.vel;
        const gamma = Math.asin(clamp(ref.dot(f.up) / Math.max(1, ref.length()), -1, 1));
        const x = clamp((f.alt - 1000) / 60000, 0, 1);
        const gammaD = (90 * Math.pow(1 - x, 1.6)) * DEG;
        const bias = clamp((gamma - gammaD) * 0.9, -4 * DEG, 14 * DEG);
        const hz = ref.clone().addScaledVector(f.up, -ref.dot(f.up));
        if (hz.lengthSq() < 1e-6) hz.copy(f.east);
        hz.normalize();
        const dirP = ref.clone().normalize();
        const axis = new Vector3().crossVectors(dirP, hz);
        if (axis.lengthSq() > 1e-9) dirP.applyAxisAngle(axis.normalize(), bias);
        point(v, dirP);
      }
      // don't loft far past the target while the air is still thick: coast up instead
      if (apAlt > target * 1.2 && f.alt < 60e3) v.throttle = 0;
      ap.note = `Gravity turn · apoapsis ${(Math.max(0, apAlt) / 1000).toFixed(0)} km`;
      if (!body.atmosphere || (q < 900 && f.alt > 25e3) || f.alt > atmosphereTop(body) * 0.55) ap.phase = 'vac';
      break;
    }
    case 'vac': {
      if (!ensureEngines(w, v)) { stopAutopilot(w, v, 'Autopilot: out of propellant before reaching orbit.'); return; }
      const hdir = v.vel.clone().addScaledVector(f.up, -v.vel.dot(f.up));
      if (hdir.lengthSq() < 1) hdir.copy(f.east);
      const vh = hdir.length();
      hdir.normalize();
      const vz = v.vel.dot(f.up);
      const aT = Math.max(1, accelMax(w, v));
      const gEff = body.mu / (f.r * f.r) - (vh * vh) / f.r;
      const vCirc = Math.sqrt(body.mu / f.r);
      const dvLeft = vCirc - vh;
      const vzDes = clamp(0.02 * (target - f.alt), -40, 120) * clamp(dvLeft / Math.max(300, 0.3 * vCirc), 0, 1);
      const azCmd = gEff + 0.6 * (vzDes - vz);
      const beta = Math.asin(clamp(azCmd / aT, -0.25, 0.96));
      const dir = hdir.multiplyScalar(Math.cos(beta)).addScaledVector(f.up, Math.sin(beta));
      point(v, dir);
      const aligned = alignment(v, dir) < 10 * DEG;
      v.throttle = aligned ? throttleForDv(dvLeft, aT) : 0.1;
      ap.note = `Insertion burn · ${Math.max(0, dvLeft).toFixed(0)} m/s to go · Pe ${((el.rp - body.radius) / 1000).toFixed(0)} km`;
      const peAlt = el.bound ? el.rp - body.radius : -1;
      if (el.bound && peAlt >= target * 0.97 && apAlt < target * 1.4) finishAscent(w, v);
      else if (dvLeft < 1.5) {
        v.throttle = 0;
        v.ap = { kind: 'circularize', phase: 'start', note: 'Circularising', data: {} };
      }
      break;
    }
  }
}

function finishAscent(w: World, v: Vessel): void {
  const body = w.idx.get(v.body);
  const el = elements(v.pos, v.vel, body.mu);
  finish(w, v, `Orbit achieved: ${((el.rp - body.radius) / 1000).toFixed(0)} × ${((el.ra - body.radius) / 1000).toFixed(0)} km.`);
}

// ------------------------------------------------------------------ circularise from anywhere

/** One tick of the circularisation routine. Returns true once the orbit is round. */
function circularizeStep(w: World, v: Vessel, ap: NonNullable<Vessel['ap']>, store: Record<string, number>): boolean {
  const body = w.idx.get(v.body);
  const el = elements(v.pos, v.vel, body.mu);
  if (!el.bound) { stopAutopilot(w, v, 'Autopilot: orbit is not bound.'); return false; }
  autoStage(w, v);
  const atApo = el.tAp < el.tPe;
  const tNext = atApo ? el.tAp : el.tPe;
  const rNext = atApo ? el.ra : el.rp;
  const vNext = Math.sqrt(body.mu * (2 / rNext - 1 / el.a));
  const vCirc = Math.sqrt(body.mu / rNext);
  const dv = vCirc - vNext;
  const dir = v.vel.clone().normalize().multiplyScalar(Math.sign(dv) || 1);
  if (!ensureEngines(w, v)) { stopAutopilot(w, v, 'Autopilot: no engine available.'); return false; }
  const aMax = Math.max(0.5, accelMax(w, v));
  const err = Math.abs(el.ra - el.rp);
  if (err < Math.max(1500, el.a * 0.0015)) { v.throttle = 0; delete store.wakeAt; return true; }
  if (!store.burning) {
    v.throttle = 0;
    point(v, dir);
    ap.note = `Waiting for ${atApo ? 'apoapsis' : 'periapsis'} (${tNext.toFixed(0)} s)`;
    store.wakeAt = w.t + tNext - Math.abs(dv) / aMax / 2 - 40;
    if (tNext <= Math.abs(dv) / aMax / 2 + 5) { store.burning = 1; delete store.wakeAt; }
    return false;
  }
  point(v, dir);
  const aligned = alignment(v, dir) < 8 * DEG;
  v.throttle = aligned ? clamp(err / (body.radius * 0.05), 0.05, 1) : 0;
  ap.note = `Circularising · ${(err / 1000).toFixed(0)} km spread`;
  return false;
}

function circularize(w: World, v: Vessel): void {
  const ap = v.ap!;
  if (ap.phase === 'start' && ap.data.burning) ap.phase = 'burn';
  const done = circularizeStep(w, v, ap, ap.data);
  if (done) {
    const body = w.idx.get(v.body);
    const el = elements(v.pos, v.vel, body.mu);
    finish(w, v, `Circular orbit at ${((el.a - body.radius) / 1000).toFixed(0)} km.`);
  }
}

// ------------------------------------------------------------------ deorbit

function deorbit(w: World, v: Vessel): void {
  const ap = v.ap!;
  const body = w.idx.get(v.body);
  const el = elements(v.pos, v.vel, body.mu);
  const targetPe = body.atmosphere ? Math.min(40e3, atmosphereTop(body) * 0.3) : 10e3;
  autoStage(w, v);
  if (!ensureEngines(w, v)) { stopAutopilot(w, v, 'Autopilot: no engine available.'); return; }
  const retro = v.vel.clone().normalize().negate();
  point(v, retro);
  const aligned = alignment(v, retro) < 8 * DEG;
  const pe = el.rp - body.radius;
  v.throttle = aligned ? clamp((pe - targetPe) / 60e3, 0.05, 1) : 0;
  ap.note = `De-orbit burn · periapsis ${(pe / 1000).toFixed(0)} km → ${(targetPe / 1000).toFixed(0)} km`;
  if (pe <= targetPe) {
    v.throttle = 0;
    v.ap = null;
    note(w, 'De-orbit burn complete.', 'good');
    if (w.assists.landing) startAutopilot(w, v, 'land');
    else { v.sas.mode = 'retrograde'; armChutes(v); }
  }
}

// ------------------------------------------------------------------ landing

function lowOrbitAltitude(body: ReturnType<World['idx']['get']>): number {
  return body.terrain ? body.terrain.amplitude * 0.8 + 8000 : 20000;
}

function land(w: World, v: Vessel): void {
  const ap = v.ap!;
  const body = w.idx.get(v.body);
  const f = localFrame(w, v);
  const vs = surfaceVelocity(body, v.pos, new Vector3());
  const vrel = v.vel.clone().sub(vs);
  const vz = vrel.dot(f.up);
  const vHvec = vrel.clone().addScaledVector(f.up, -vz);
  const vh = vHvec.length();
  const hasAtm = !!body.atmosphere;
  const radarRaw = radarAltitude(w, v);
  const radar = Number.isFinite(radarRaw) ? radarRaw : f.alt;
  const gLoc = body.mu / (f.r * f.r);
  const g = Math.max(0.05, gLoc - (vh * vh) / f.r);
  if (v.landed) { finish(w, v, 'Landed.'); return; }
  if (body.gasGiant) { stopAutopilot(w, v, 'Autopilot: gas giants have no surface to land on.'); return; }
  const el = elements(v.pos, v.vel, body.mu);
  const inAtm = inAtmosphere(body, f.alt);
  const atmoTop = hasAtm ? atmosphereTop(body) : 0;

  if (ap.phase === 'plan') {
    ap.phase = 'approach';
    if (hasAtm) armChutes(v);
  }

  // shed the service stage before the air gets thick, so the heat shield leads
  if (hasAtm && f.alt < atmoTop + 30e3 && !ap.data.sepDone) {
    for (let g2 = 0; g2 < 4 && !v.derived.shieldBottom && v.derived.hasShield && v.stageIdx < v.stages.length; g2++) {
      const next = v.stages[v.stageIdx];
      if (next.some((a) => a.kind === 'chute')) break;
      activateStage(w, v);
    }
    ap.data.sepDone = 1;
  }

  if (ap.phase === 'approach') {
    const hLow = lowOrbitAltitude(body);
    const entryPe = hasAtm ? Math.min(35e3, atmoTop * 0.3) : hLow;
    const peAlt = el.bound ? el.rp - body.radius : -1;
    const stillHigh = !inAtm && f.alt > (hasAtm ? atmoTop + 5e3 : hLow * 2.5);
    if (stillHigh && peAlt > entryPe + 3e3) {
      // lower the periapsis
      autoStage(w, v);
      if (!ensureEngines(w, v)) {
        if (hasAtm) { v.throttle = 0; point(v, vrel.lengthSq() > 4 ? vrel.clone().negate() : f.up); ap.note = 'No engine: waiting for the air to catch us'; return; }
        stopAutopilot(w, v, 'Autopilot: no engine for the de-orbit burn.');
        return;
      }
      const retro = v.vel.clone().normalize().negate();
      point(v, retro);
      v.throttle = alignment(v, retro) < 8 * DEG ? clamp((peAlt - entryPe) / 60e3, 0.04, 1) : 0;
      ap.note = `De-orbit burn · periapsis ${(peAlt / 1000).toFixed(0)} km → ${(entryPe / 1000).toFixed(0)} km`;
      return;
    }
    if (!hasAtm && stillHigh) {
      // coast down to the periapsis, then round the orbit off at low altitude
      const spread = el.bound ? el.ra - el.rp : Infinity;
      if (spread > 6000 + hLow) {
        if (!ap.data.lowcirc) ap.data.lowcirc = 1;
      }
      const done = circularizeStep(w, v, ap, ap.data);
      if (!done) return;
      ap.data.burning = 0;
    }
    v.throttle = 0;
    if (hasAtm) {
      if (v.parts.some((p) => p.def.kind === 'chute' && p.chute === 'stowed')) armChutes(v);
      point(v, vrel.lengthSq() > 4 ? vrel.clone().negate() : f.up);
      ap.note = inAtm ? 'Entry · riding the air down' : 'Coasting to entry';
      if (inAtm && f.alt < Math.min(atmoTop * 0.5, 40e3) && vrel.length() < 900) ap.phase = 'descent';
      else return;
    } else ap.phase = 'descent';
    delete ap.data.wakeAt;
  }

  // ---- descent: acceleration-command guidance
  const aMax = ensureEngines(w, v) ? accelMax(w, v) : 0;
  autoStage(w, v);
  const legs = v.parts.some((p) => p.def.kind === 'leg');
  if (legs && radar < 600 && v.parts.some((p) => p.def.kind === 'leg' && p.legTarget === 0)) toggleLegs(v);
  if (hasAtm && f.alt < atmoTop && v.parts.some((p) => p.def.kind === 'chute' && p.chute === 'stowed')) armChutes(v);

  const aDec = Math.max(0.3, 0.55 * (aMax - g));
  const vTouch = 1.2;
  const braking = vh > 40 && !hasAtm;
  let vzTarget: number;
  if (braking) vzTarget = clamp(0.1 * (4000 - radar), -25, 25);
  else vzTarget = -(Math.sqrt(2 * aDec * Math.max(0, radar - 2)) + vTouch);
  const acmd = new Vector3();
  if (vh > 2.5) {
    const hCancel = Math.min(vh * 0.8, aMax * 0.9);
    acmd.addScaledVector(vHvec.clone().normalize(), -hCancel);
  }
  // while braking we hold altitude (signed correction); in the final descent we only ever push up
  const sinkExcess = vzTarget - vz; // > 0 when sinking faster than the profile allows
  const upNeeded = braking ? g + 1.5 * (vzTarget - vz) : sinkExcess > 0 ? g + aDec + 2 * sinkExcess : 0;
  acmd.addScaledVector(f.up, upNeeded);

  const needBurn = braking || vz < vzTarget + 0.5 || vh > 6;
  const hover = radar < 40 && vh < 2;
  const dir = hover ? f.up.clone() : acmd.clone();
  if (dir.lengthSq() < 1e-6) dir.copy(f.up);
  if (aMax <= 0) {
    point(v, vrel.lengthSq() > 4 ? vrel.clone().negate() : f.up);
    v.throttle = 0;
    ap.note = `Gliding down · radar ${radar.toFixed(0)} m`;
    return;
  }
  if (radar < 3000 && !braking) {
    const ang = Math.acos(clamp(dir.clone().normalize().dot(f.up), -1, 1));
    if (ang > 60 * DEG) {
      const axis = new Vector3().crossVectors(f.up, dir).normalize();
      dir.copy(f.up).applyAxisAngle(axis, 60 * DEG);
    }
  }
  point(v, dir);
  const aligned = alignment(v, dir) < 12 * DEG;
  const tcmd = acmd.length() / aMax;
  if (!needBurn) v.throttle = 0;
  else if (!aligned) v.throttle = radar < 150 ? 0.4 : 0;
  else v.throttle = clamp(tcmd, 0.0, 1);
  if (!hasAtm && !braking && radar > 8000 && vz > -8 && vh < 15) v.throttle = 0;
  ap.note = braking
    ? `Braking burn · ${vh.toFixed(0)} m/s horizontal`
    : `Powered descent · radar ${radar.toFixed(0)} m · sink ${(-vz).toFixed(1)} m/s`;
  void G0;
}

// ------------------------------------------------------------------ transfer to a moon / planet in the same frame

interface Plan { tBurn: number; dv: number; pe: number }

/** Finds an impulsive prograde burn that sends the vessel into a close flyby of a body orbiting the same parent. */
export function planTransfer(w: World, v: Vessel, targetId: string): Plan | null {
  const idx = w.idx;
  const body = idx.get(v.body);
  const target = idx.get(targetId);
  if (target.parent !== v.body) return null;
  const mu = body.mu;
  const r1 = v.pos.length();
  const r2 = target.orbit!.a;
  const soi = idx.soi.get(targetId)!;
  const aT = (r1 + r2) / 2;
  const dvHoh = Math.sqrt(mu * (2 / r1 - 1 / aT)) - Math.sqrt(mu / r1);
  const el = elements(v.pos, v.vel, mu);
  const orbitSpan = el.bound ? el.period : 7200;
  const tTransfer = Math.PI * Math.sqrt((aT * aT * aT) / mu);
  const wantPe = target.radius + 120e3;
  let best: Plan | null = null;
  let bestScore = Infinity;
  const rr = new Vector3();
  const vv = new Vector3();
  const r0 = new Vector3();
  const v0 = new Vector3();
  const tp = { pos: new Vector3(), vel: new Vector3() };
  const nT = 48;
  for (let i = 0; i < nT; i++) {
    const tb = (orbitSpan * i) / nT;
    keplerStep(v.pos, v.vel, mu, tb, r0, v0);
    const dir = v0.clone().normalize();
    for (const k of [0.97, 1.0, 1.03, 1.06, 1.1, 1.15]) {
      const dv = dvHoh * k;
      const vB = v0.clone().addScaledVector(dir, dv);
      // propagate until we cross the target's sphere of influence or give up
      const horizon = tTransfer * 1.6;
      const steps = 120;
      for (let s = 1; s <= steps; s++) {
        const dt = (horizon * s) / steps;
        keplerStep(r0, vB, mu, dt, rr, vv);
        bodyStateRel(idx, targetId, w.t + tb + dt, tp);
        const rel = rr.clone().sub(tp.pos);
        if (rel.length() < soi) {
          const relV = vv.clone().sub(tp.vel);
          const e2 = elements(rel, relV, target.mu);
          const pe = e2.rp;
          const score = Math.abs(pe - wantPe) / wantPe + dv / dvHoh * 0.05 + (tb / orbitSpan) * 0.01;
          if (pe > target.radius * 1.02 && score < bestScore) { bestScore = score; best = { tBurn: w.t + tb, dv, pe }; }
          break;
        }
        if (rr.length() > soi * 0 + r2 * 1.8) break;
      }
    }
  }
  return best;
}


/** Closest-approach distance (from the target's centre) if the vessel coasts from now, or null if there is no encounter. */
export function predictEncounterPe(w: World, v: Vessel, targetId: string): number | null {
  const idx = w.idx;
  const body = idx.get(v.body);
  const target = idx.get(targetId);
  const mu = body.mu;
  const soi = idx.soi.get(targetId)!;
  const el = elements(v.pos, v.vel, mu);
  if (!el.bound && el.e >= 1 && v.pos.dot(v.vel) < 0) return null;
  const horizon = Math.min(12 * 86400, el.bound ? el.period : 12 * 86400);
  const rr = new Vector3();
  const vv = new Vector3();
  const tp = { pos: new Vector3(), vel: new Vector3() };
  const steps = 200;
  for (let s = 1; s <= steps; s++) {
    const dt = (horizon * s) / steps;
    keplerStep(v.pos, v.vel, mu, dt, rr, vv);
    bodyStateRel(idx, targetId, w.t + dt, tp);
    const rel = rr.clone().sub(tp.pos);
    if (rel.length() < soi) {
      const e2 = elements(rel, vv.clone().sub(tp.vel), target.mu);
      return e2.rp;
    }
    if (rr.length() > soi * 0 + (target.orbit!.a * 1.6)) break;
  }
  return null;
}

function transfer(w: World, v: Vessel): void {
  const ap = v.ap!;
  const body = w.idx.get(v.body);
  const el = elements(v.pos, v.vel, body.mu);
  autoStage(w, v);
  const targetId = ap.target;
  if (!targetId) { stopAutopilot(w, v, 'Autopilot: no target.'); return; }

  // Captured by the target: brake into orbit around it
  if (v.body === targetId) {
    if (ap.phase !== 'capture' && ap.phase !== 'capcirc') { ap.phase = 'capture'; }
    const targetBody = body;
    if (!ensureEngines(w, v)) { stopAutopilot(w, v, 'Autopilot: no engine for orbit insertion.'); return; }
    const aMax = Math.max(0.3, accelMax(w, v));
    if (ap.phase === 'capture') {
      const vPe = el.e > 1 ? Math.sqrt(2 * (el.energy + targetBody.mu / el.rp)) : Math.sqrt(targetBody.mu * (2 / el.rp - 1 / el.a));
      const vCircPe = Math.sqrt(targetBody.mu / el.rp);
      const dv = Math.max(0, vPe - vCircPe * 1.0);
      const retro = v.vel.clone().normalize().negate();
      const tPe = el.tPe;
      const lead = dv / aMax / 2 + 8;
      if (el.bound && el.e < 0.12) { ap.phase = 'capcirc'; return; }
      if (tPe > lead && tPe < 1e12) {
        v.throttle = 0;
        point(v, retro);
        ap.note = `Captured soon · insertion burn in ${(tPe - lead).toFixed(0)} s (${dv.toFixed(0)} m/s)`;
        ap.data.wakeAt = w.t + tPe - lead - 40;
        return;
      }
      delete ap.data.wakeAt;
      point(v, retro);
      v.throttle = alignment(v, retro) < 8 * DEG ? throttleForDv(Math.abs(el.rp - el.ra) / 2000 + dv * 0.2, aMax) : 0;
      ap.note = 'Insertion burn';
      return;
    }
    // final circularisation handled by the generic routine
    v.ap = { kind: 'circularize', phase: 'start', note: 'Circularising', data: {} };
    return;
  }

  if (ap.phase === 'start') {
    if (!el.bound) { stopAutopilot(w, v, 'Autopilot: start from a bound orbit.'); return; }
    ap.note = 'Searching for a transfer window…';
    const plan = planTransfer(w, v, targetId);
    if (!plan) { stopAutopilot(w, v, 'Autopilot: no transfer found. Try a lower, circular orbit.'); return; }
    ap.data.tBurn = plan.tBurn;
    ap.data.dv = plan.dv;
    ap.data.pe = plan.pe;
    ap.phase = 'wait';
    note(w, `Transfer planned: ${plan.dv.toFixed(0)} m/s burn in ${((plan.tBurn - w.t) / 60).toFixed(0)} min, closest approach ${(plan.pe / 1000).toFixed(0)} km.`, 'good');
    return;
  }
  if (ap.phase === 'wait') {
    if (!ensureEngines(w, v)) { stopAutopilot(w, v, 'Autopilot: no engine available.'); return; }
    const aMax = Math.max(0.3, accelMax(w, v));
    const burnTime = ap.data.dv / aMax;
    const dir = v.vel.clone().normalize();
    point(v, dir);
    v.throttle = 0;
    const left = ap.data.tBurn - burnTime / 2 - w.t;
    ap.note = `Transfer burn in ${Math.max(0, left).toFixed(0)} s`;
    ap.data.wakeAt = ap.data.tBurn - burnTime / 2 - 40;
    if (left <= 0) {
      delete ap.data.wakeAt;
      ap.phase = 'burn';
    }
    return;
  }
  if (ap.phase === 'burn') {
    if (!ensureEngines(w, v)) { stopAutopilot(w, v, 'Autopilot: out of propellant mid-burn.'); return; }
    const dir = v.vel.clone().normalize();
    point(v, dir);
    const aligned = alignment(v, dir) < 8 * DEG;
    // re-plan continuously: stop as soon as coasting would carry us to a safe flyby
    ap.data.tick = (ap.data.tick ?? 0) + 1;
    let pe: number | null | undefined = ap.data.lastPe === undefined ? undefined : ap.data.lastPe;
    if (ap.data.tick % 8 === 0) {
      pe = predictEncounterPe(w, v, targetId);
      ap.data.lastPe = pe ?? -1;
    }
    const target = w.idx.get(targetId);
    const good = pe !== undefined && pe !== null && pe > target.radius * 1.05 && pe < target.radius * 2.6;
    const overshoot = el.bound && el.ra > target.orbit!.a * 1.25;
    v.throttle = aligned ? 1 : 0;
    ap.note = pe && pe > 0 ? `Transfer burn · predicted flyby ${((pe - target.radius) / 1000).toFixed(0)} km` : 'Transfer burn';
    if (good || overshoot) {
      v.throttle = 0;
      ap.phase = 'cruise';
      note(w, 'Transfer burn complete. Coasting to the target.', 'good');
    }
    return;
  }
  if (ap.phase === 'cruise') {
    v.throttle = 0;
    point(v, v.vel);
    ap.note = 'Coasting to the target — use time acceleration';
  }
}
