import { describe, expect, it } from 'vitest';
import { SOL } from '../src/sim/bodies';
import { PRESETS } from '../src/sim/presets';
import { advance, createWorld, spawnOnPad } from '../src/sim/sim';
import { deserializeWorld, serializeWorld } from '../src/sim/save';
import { activateStage } from '../src/sim/flight';
import { activeVessel } from '../src/sim/world';

describe('saves', () => {
  it('round-trips a flight in progress', () => {
    const w = createWorld(SOL);
    const v = spawnOnPad(w, PRESETS[0].build(), 'earth');
    activateStage(w, v);
    v.throttle = 1;
    for (let i = 0; i < 600; i++) advance(w, 1 / 60);
    const json = JSON.parse(JSON.stringify(serializeWorld(w, 'test')));
    const w2 = deserializeWorld(json)!;
    const a = activeVessel(w)!;
    const b = activeVessel(w2)!;
    expect(b.pos.distanceTo(a.pos)).toBeLessThan(1e-6);
    expect(Math.abs(b.derived.mass - a.derived.mass) / a.derived.mass).toBeLessThan(0.001);
    for (let i = 0; i < 300; i++) { advance(w, 1 / 60); advance(w2, 1 / 60); }
    expect(activeVessel(w2)!.pos.distanceTo(activeVessel(w)!.pos)).toBeLessThan(1e-3);
  });
  it('rejects unknown versions', () => {
    expect(deserializeWorld({ v: 99 } as never)).toBeNull();
  });
});
