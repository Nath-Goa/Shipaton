import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { SOL } from '../src/sim/bodies';
import { addRadial, addStack, autoStage, emptyDesign } from '../src/sim/design';
import { activateStage } from '../src/sim/flight';
import { searchStars, nearestStar, systemForStar } from '../src/sim/galaxy';
import { checkJump, doJump } from '../src/sim/jump';
import { PRESETS } from '../src/sim/presets';
import { advance, createWorld, spawnInOrbit, spawnOnPad, updateWarpCap } from '../src/sim/sim';
import { deserializeWorld, serializeWorld } from '../src/sim/save';
import { activeVessel, WARP_LEVELS } from '../src/sim/world';
import { SasMode } from '../src/sim/vessel';

const preset = (id: string) => PRESETS.find((p) => p.id === id)!.build();

describe('acceptance: staging and detached parts', () => {
  it('separates boosters, burns fuel and lets the detached piece keep its motion', () => {
    const w = createWorld(SOL);
    const v = spawnOnPad(w, preset('sparrow'), 'earth');
    activateStage(w, v);
    v.throttle = 1;
    const fuel0 = v.derived.fuel;
    for (let i = 0; i < 60 * 12; i++) advance(w, 1 / 60);
    expect(v.derived.fuel).toBeLessThan(fuel0);
    const speed = v.vel.length();
    activateStage(w, v); // booster separation
    const pieces = w.vessels.filter((q) => q.id !== v.id);
    expect(pieces.length).toBeGreaterThan(0);
    for (const p of pieces) expect(p.vel.distanceTo(v.vel)).toBeLessThan(40);
    for (const p of pieces) expect(p.vel.length()).toBeGreaterThan(speed * 0.5);
    const before = pieces[0].pos.clone();
    for (let i = 0; i < 60; i++) advance(w, 1 / 60);
    expect(pieces[0].pos.distanceTo(before)).toBeGreaterThan(20);
  });
  it('a hand-built multistage rocket stages in sequence', () => {
    let d = emptyDesign('custom');
    d = addStack(d, null, 'bottom', 'pod_s1')!.design;
    let last = d.root;
    for (const id of ['dec_s1', 'tank_s1_1_2', 'eng_spark']) {
      const m = addStack(d, last, 'bottom', id)!;
      d = m.design;
      last = m.added[0];
    }
    d.stages = autoStage(d);
    expect(d.stages.length).toBeGreaterThanOrEqual(1);
    expect(addRadial(d, d.root, 'chute_s1', 2, 0)).not.toBeNull();
  });
});

describe('acceptance: atmospheres, pressure and time acceleration', () => {
  it('a vessel dives into Jupiter until its tanks are crushed', () => {
    const w = createWorld(SOL);
    const v = spawnInOrbit(w, preset('meridian'), 'earth', 400e3);
    v.body = 'jupiter';
    v.pos.set(6.9911e7 + 30e3, 0, 0);
    v.vel.set(0, 0, -300);
    v.sas.mode = 'retrograde' as SasMode;
    let crushed = false;
    for (let i = 0; i < 60 * 900 && !crushed; i++) { advance(w, 1 / 60); crushed = !!v.destroyed; }
    expect(v.destroyed).toBeTruthy();
    expect(/pressure|breakup|burned/.test(v.destroyed ?? '')).toBe(true);
  });
  it('time acceleration is capped near the atmosphere and while engines fire', () => {
    const w = createWorld(SOL);
    const v = spawnInOrbit(w, preset('selene'), 'earth', 300e3);
    updateWarpCap(w);
    expect(WARP_LEVELS[w.warpCap]).toBeGreaterThanOrEqual(100000);
    v.vel.multiplyScalar(0.9); // periapsis now deep inside the atmosphere
    updateWarpCap(w);
    expect(WARP_LEVELS[w.warpCap]).toBeLessThan(100000);
    const w2 = createWorld(SOL);
    const v2 = spawnOnPad(w2, preset('sparrow'), 'earth');
    activateStage(w2, v2);
    v2.throttle = 1;
    for (let i = 0; i < 120; i++) advance(w2, 1 / 60);
    updateWarpCap(w2);
    expect(WARP_LEVELS[w2.warpCap]).toBeLessThanOrEqual(4);
  });
});

describe('acceptance: the galaxy', () => {
  it('visits a catalog star and a generated system; they and the save reload identically', () => {
    const w = createWorld(SOL);
    w.assists.unlimitedFuel = true;
    const v = spawnInOrbit(w, preset('odyssey'), 'earth', 400e3);
    const prox = searchStars('proxima')[0];
    expect(checkJump(w, v, prox).ok).toBe(true);
    expect(doJump(w, v, prox)).toBe(true);
    expect(w.system.starId).toBe(prox.id);
    expect(w.system.provenance).toBe('mixed');
    const save = JSON.parse(JSON.stringify(serializeWorld(w)));
    const gen = nearestStar(60, -40, 20)!;
    expect(gen.real).toBe(false);
    const sys1 = JSON.stringify(systemForStar(gen));
    expect(doJump(w, activeVessel(w)!, gen)).toBe(true);
    expect(w.system.provenance).toBe('generated');
    const w2 = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))))!;
    expect(w2.system.id).toBe(gen.id);
    expect(JSON.stringify(w2.system)).toBe(sys1);
    const back = deserializeWorld(save)!;
    expect(back.system.starId).toBe(prox.id);
    expect(back.visitedSystems.has('sol')).toBe(true);
    expect(activeVessel(w2)!.pos.distanceTo(activeVessel(w)!.pos)).toBeLessThan(1e-3);
    void Vector3;
  });
  it('requires charge unless unlimited fuel is enabled', () => {
    const w = createWorld(SOL);
    const v = spawnInOrbit(w, preset('odyssey'), 'earth', 400e3);
    const far = nearestStar(300, 0, 0)!;
    v.jumpCharge = 5;
    expect(checkJump(w, v, far).ok).toBe(false);
  });
});
