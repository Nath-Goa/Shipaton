import { expect, it } from 'vitest';
import { SOL } from '../src/sim/bodies';
import { PRESETS } from '../src/sim/presets';
import { activateStage } from '../src/sim/flight';
import { advance, controllableVessels, createWorld, spawnOnPad, switchVessel } from '../src/sim/sim';
import { activeVessel } from '../src/sim/world';

it('the reusable booster separates as a second controllable vessel', () => {
  const w = createWorld(SOL);
  const v = spawnOnPad(w, PRESETS.find((p) => p.id === 'kestrel')!.build(), 'earth');
  activateStage(w, v);
  v.throttle = 1;
  for (let i = 0; i < 60 * 60; i++) advance(w, 1 / 60);
  activateStage(w, v); // boosters
  for (let i = 0; i < 60 * 20; i++) advance(w, 1 / 60);
  activateStage(w, v); // decoupler + upper stage ignition
  for (let i = 0; i < 60; i++) advance(w, 1 / 60);
  expect(v.destroyed).toBeNull();
  const ctl = controllableVessels(w);
  expect(ctl.length).toBe(2);
  const upperId = activeVessel(w)!.id;
  switchVessel(w);
  expect(activeVessel(w)!.id).not.toBe(upperId);
  const booster = activeVessel(w)!;
  expect(booster.parts.some((p) => p.def.id === 'probe_s3')).toBe(true);
  expect(booster.parts.some((p) => p.def.kind === 'leg')).toBe(true);
});
