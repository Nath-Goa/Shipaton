import { describe, it } from 'vitest';
import { Vector3 } from 'three';
import { SOL } from '../src/sim/bodies';
import { PRESETS } from '../src/sim/presets';
import { advance, createWorld, spawnInOrbit } from '../src/sim/sim';
import { startAutopilot } from '../src/sim/guidance';
import { activeVessel } from '../src/sim/world';
import { altitudeOf, radarAltitude } from '../src/sim/flight';
import { Design } from '../src/sim/design';
import { addStack, addRadial, emptyDesign, autoStage } from '../src/sim/design';

function capsule(): Design {
  let d = emptyDesign('cap');
  d = addStack(d, null, 'bottom', 'pod_s2')!.design;
  const pod = d.root;
  const sh = addStack(d, pod, 'bottom', 'shield_s2')!;
  d = sh.design;
  d = addRadial(d, pod, 'chute_s2', 2, 0)!.design;
  d.stages = autoStage(d);
  return d;
}

describe('reentry', () => {
  it('capsule from LEO', () => {
    const w = createWorld(SOL);
    w.assists.landing = true;
    void PRESETS;
    const v = spawnInOrbit(w, capsule(), 'earth', 150e3);
    // retro burn: drop periapsis by hand
    v.vel.multiplyScalar(0.985);
    startAutopilot(w, v, 'land');
    let last = -100;
    for (let t = 0; t < 4000; t += 1 / 30) {
      advance(w, 1 / 30);
      const av = activeVessel(w)!;
      if (av.destroyed || av.landed) break;
      if (t - last >= (altitudeOf(w, av) < 62e3 ? 1 : 20) && altitudeOf(w, av) < 130e3) {
        last = t;
        const ax = new Vector3(0, 1, 0).applyQuaternion(av.quat);
        const vr = av.vel.clone().normalize();
        console.log(`t=${t.toFixed(0)} alt=${(altitudeOf(w, av) / 1000).toFixed(1)} v=${av.vel.length().toFixed(0)} heat=${av.heat.toFixed(2)} g=${av.gLoad.toFixed(1)} cosShield=${(-ax.dot(vr)).toFixed(2)} w=${av.angVel.length().toFixed(2)} chute=${av.parts.filter((p) => p.def.kind === 'chute').map((p) => p.chute).join(',')} radar=${radarAltitude(w, av).toFixed(0)}`);
      }
    }
    const av = activeVessel(w)!;
    console.log('END', av.destroyed, av.landed, av.landedOn);
  });
});
