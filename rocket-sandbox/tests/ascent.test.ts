import { describe, expect, it } from 'vitest';
import { SOL } from '../src/sim/bodies';
import { PRESETS } from '../src/sim/presets';
import { advance, createWorld, spawnOnPad } from '../src/sim/sim';
import { startAutopilot } from '../src/sim/guidance';
import { activeVessel } from '../src/sim/world';
import { altitudeOf, radarAltitude } from '../src/sim/flight';
import { elements } from '../src/sim/orbit';

function run(w: ReturnType<typeof createWorld>, seconds: number, onTick?: (t: number) => void) {
  const dt = 1 / 30;
  for (let t = 0; t < seconds; t += dt) {
    advance(w, dt);
    onTick?.(t);
  }
}

describe('ascent to orbit', () => {
  it('Meridian reaches orbit with the autopilot', () => {
    const w = createWorld(SOL);
    w.assists.orbitGuidance = true;
    const preset = PRESETS.find((p) => p.id === 'meridian')!;
    const v = spawnOnPad(w, preset.build(), 'earth');
    expect(startAutopilot(w, v, 'ascent', { targetAlt: 160e3 })).toBeNull();
    let lastLog = -100;
    run(w, 1100, (t) => {
      const av = activeVessel(w)!;
      if (t - lastLog >= 30 && !av.destroyed) {
        lastLog = t;
        const el = elements(av.pos, av.vel, 3.986004418e14);
        console.log(`t=${t.toFixed(0)} ${av.ap?.phase} alt=${(altitudeOf(w, av) / 1000).toFixed(1)}km v=${av.vel.length().toFixed(0)} thr=${av.throttle.toFixed(2)} pe=${((el.rp - 6.371e6) / 1000).toFixed(0)} ap=${((el.ra - 6.371e6) / 1000).toFixed(0)} mass=${(av.derived.mass / 1000).toFixed(1)}t stage=${av.stageIdx} ${av.destroyed ?? ''} ${av.ap?.note ?? ''}`);
      }
    });
    const av = activeVessel(w)!;
    expect(av.destroyed).toBeNull();
    const el = elements(av.pos, av.vel, 3.986004418e14);
    expect(el.bound).toBe(true);
    expect(el.rp - 6.371e6).toBeGreaterThan(100e3);
    void radarAltitude;
  }, 60000);
});

describe('return from orbit', () => {
  it('Meridian capsule re-enters, opens its parachutes and survives touchdown', () => {
    const w = createWorld(SOL);
    w.assists.orbitGuidance = true;
    w.assists.landing = true;
    const preset = PRESETS.find((p) => p.id === 'meridian')!;
    const v = spawnOnPad(w, preset.build(), 'earth');
    startAutopilot(w, v, 'ascent', { targetAlt: 160e3 });
    let phaseLog = '';
    run(w, 900);
    const av0 = activeVessel(w)!;
    expect(av0.destroyed).toBeNull();
    // let the stage burn for the deorbit; then autopilot lands us
    startAutopilot(w, av0, 'land');
    let lastLog = -100;
    run(w, 4000, (t) => {
      const av = activeVessel(w)!;
      if (av.landed || av.destroyed) return;
      if (t - lastLog >= 60) {
        lastLog = t;
        const ra = radarAltitude(w, av);
        console.log(`R t=${t.toFixed(0)} ${av.ap?.phase} alt=${(altitudeOf(w, av) / 1000).toFixed(1)}km radar=${ra.toFixed(0)} v=${av.vel.length().toFixed(0)} heat=${av.heat.toFixed(2)} parts=${av.parts.length} chute=${av.parts.filter((p) => p.def.kind === 'chute').map((p) => p.chute).join(',')} ${av.ap?.note ?? ''}`);
      }
    });
    phaseLog = '';
    void phaseLog;
    const av = activeVessel(w)!;
    console.log('end', av.destroyed, av.landed, av.landedOn, w.events.filter((e) => e.type === 'msg').map((e) => (e as any).text).slice(-6));
    expect(av.destroyed).toBeNull();
    expect(av.landed).toBe(true);
  }, 120000);
});
