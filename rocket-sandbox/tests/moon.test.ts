import { describe, expect, it } from 'vitest';
import { SOL } from '../src/sim/bodies';
import { PRESETS } from '../src/sim/presets';
import { advance, createWorld, spawnInOrbit, updateWarpCap } from '../src/sim/sim';
import { planTransfer, startAutopilot } from '../src/sim/guidance';
import { activeVessel, WARP_LEVELS } from '../src/sim/world';
import { altitudeOf, radarAltitude } from '../src/sim/flight';
import { elements } from '../src/sim/orbit';
import { boardVessel, plantFlag, startEva, stepEva } from '../src/sim/eva';

describe('Moon mission', () => {
  it('transfers, captures, lands, walks, plants a flag and relaunches', () => {
    const w = createWorld(SOL);
    w.assists.orbitGuidance = true;
    w.assists.landing = true;
    const v = spawnInOrbit(w, PRESETS.find((p) => p.id === 'selene')!.build(), 'earth', 300e3);
    console.log('mass', v.derived.mass, 'plan', planTransfer(w, v, 'moon'));
    expect(startAutopilot(w, v, 'transfer', { target: 'moon' })).toBeNull();
    let log = -1e9;
    const warpTo = (idx: number) => { w.warpIndex = idx; };
    let guard = 0;
    while (guard++ < 400000) {
      const av = activeVessel(w)!;
      if (av.destroyed) break;
      if (av.body === 'moon' && av.ap && av.ap.phase === 'capture' && w.t - log > 60) {
        const el0 = elements(av.pos, av.vel, 4.9048695e12);
        if (el0.tPe < 4000) { log = w.t; console.log(`C t=${w.t.toFixed(0)} tPe=${el0.tPe.toFixed(0)} thr=${av.throttle} warp=${w.warpIndex} cap=${w.warpCap} wake=${av.ap.data.wakeAt !== undefined ? (av.ap.data.wakeAt - w.t).toFixed(0) : '-'} ${av.ap.note}`); }
      }
      if (w.t - log > (av.body === "moon" ? (av.throttle > 0 ? 100 : 20000) : 3600) || (av.ap && av.ap.phase === 'burn' && w.t - log > 20)) {
        log = w.t;
        const body = w.idx.get(av.body);
        const el = elements(av.pos, av.vel, body.mu);
        console.log(`T+${(w.t / 3600).toFixed(2)}h body=${av.body} ap=${av.ap?.kind}/${av.ap?.phase} alt=${(altitudeOf(w, av) / 1000).toFixed(0)}km pe=${((el.rp - body.radius) / 1000).toFixed(0)} warp=${WARP_LEVELS[w.warpIndex]} e=${el.e.toFixed(3)} tPe=${el.tPe.toFixed(0)} ra=${((el.ra - body.radius) / 1000).toFixed(0)} thr=${av.throttle} f=${av.derived.mass.toFixed(0)} wake=${av.ap?.data.wakeAt !== undefined ? (av.ap.data.wakeAt - w.t).toFixed(0) : '-'} cap=${w.warpCap} ${w.warpReason} ${av.ap?.note ?? ''}`);
      }
      if (av.body === 'moon' && !(globalThis as any).__dbg) { (globalThis as any).__dbg = 1; console.log('ENTRY', av.pos.length() / 1000, av.vel.length(), av.pos.dot(av.vel) / av.pos.length() / av.vel.length(), elements(av.pos, av.vel, 4.9048695e12)); }
      updateWarpCap(w);
      // use warp while coasting
      const coasting = av.ap?.phase === 'cruise' || av.ap?.phase === 'wait' || (av.ap?.kind === 'transfer' && av.body === 'moon' && av.ap.phase === 'capture') || (av.ap?.kind === 'circularize' && av.ap.phase === 'start');
      if (coasting && av.throttle === 0 && (av.ap?.data.wakeAt === undefined || av.ap.data.wakeAt - w.t > 120)) warpTo(Math.min(w.warpCap, 7)); else if (av.throttle > 0) warpTo(0);
      advance(w, 1 / 30);
      if (!av.ap || av.ap.kind === 'circularize' && av.body === 'moon' && av.ap.phase !== 'start') { if (!av.ap) break; }
      if (w.t > 12 * 86400) break;
    }
    const av = activeVessel(w)!;
    const body = w.idx.get(av.body);
    const el = elements(av.pos, av.vel, body.mu);
    console.log('after transfer', av.body, av.destroyed, 'pe', (el.rp - body.radius) / 1000, 'ap', (el.ra - body.radius) / 1000, 'T+', w.t / 3600);
    expect(av.destroyed).toBeNull();
    expect(av.body).toBe('moon');
    // ---- land
    startAutopilot(w, av, 'land');
    let lastL = -1e9;
    for (let i = 0; i < 400000; i++) {
      const a = activeVessel(w)!;
      if (a.destroyed || a.landed) break;
      updateWarpCap(w);
      if (a.ap?.phase === 'approach' && a.throttle === 0 && radarAltitude(w, a) > 200000 && (a.ap.data.wakeAt === undefined)) w.warpIndex = Math.min(w.warpCap, 5);
      advance(w, 1 / 30);
      if (w.t - lastL > (a.ap?.phase === 'descent' ? (radarAltitude(w, a) < 3000 ? 1 : 8) : 600)) { lastL = w.t; console.log(`L t=${w.t.toFixed(0)} ${a.ap?.phase} radar=${radarAltitude(w, a).toFixed(0)} alt=${altitudeOf(w, a).toFixed(0)} vz=${(a.vel.dot(a.pos) / a.pos.length()).toFixed(1)} v=${a.vel.length().toFixed(0)} thr=${a.throttle.toFixed(2)} m=${a.derived.mass.toFixed(0)} eng=${a.parts.filter((p) => p.def.kind === 'engine').map((p) => `${p.ignited ? 'I' : '-'}${p.flameout ? 'F' : ''}${p.burn.toFixed(1)}`).join(',')} ${a.ap?.note}`); }
    }
    const a2 = activeVessel(w)!;
    console.log('LAND', a2.destroyed, a2.landed, a2.landedOn, w.events.filter((e) => e.type === 'msg').map((e) => (e as any).text).slice(-3));
    expect(a2.destroyed).toBeNull();
    expect(a2.landed).toBe(true);
    // ---- walk, flag, return
    expect(startEva(w, a2)).toBe(true);
    for (let i = 0; i < 300; i++) stepEva(w, 1 / 30, { forward: 1, turn: 0, strafe: 0, run: true, jump: i === 10 });
    expect(plantFlag(w)).toBe(true);
    expect(w.flags.length).toBe(1);
    for (let i = 0; i < 300; i++) stepEva(w, 1 / 30, { forward: -1, turn: 0, strafe: 0, run: true, jump: false });
    for (let i = 0; i < 400 && !boardVessel(w); i++) stepEva(w, 1 / 30, { forward: -1, turn: 0, strafe: 0, run: true, jump: false });
    expect(w.eva).toBeNull();
    // ---- relaunch
    const a3 = activeVessel(w)!;
    startAutopilot(w, a3, 'ascent', { targetAlt: 30e3 });
    for (let i = 0; i < 60 * 30 * 30; i++) {
      advance(w, 1 / 30);
      const q = activeVessel(w)!;
      if (i % 600 === 0) console.log(`U t=${(i / 30).toFixed(0)} ${q.ap?.phase} alt=${altitudeOf(w, q).toFixed(0)} v=${q.vel.length().toFixed(0)} thr=${q.throttle.toFixed(2)} m=${q.derived.mass.toFixed(0)} fuel=${q.derived.fuel.toFixed(0)} ${q.ap?.note}`);
      if (q.destroyed || !q.ap) break;
    }
    const a4 = activeVessel(w)!;
    const el4 = elements(a4.pos, a4.vel, 4.9048695e12);
    console.log('RELAUNCH', a4.destroyed, a4.landed, 'pe', (el4.rp - 1.7374e6) / 1000, 'ap', (el4.ra - 1.7374e6) / 1000);
    expect(a4.destroyed).toBeNull();
    expect(a4.landed).toBe(false);
    expect(el4.rp - 1.7374e6).toBeGreaterThan(10e3);
  }, 600000);
});
