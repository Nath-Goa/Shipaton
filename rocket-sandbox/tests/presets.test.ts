import { describe, expect, it } from 'vitest';
import { analyze } from '../src/sim/design';
import { PRESETS } from '../src/sim/presets';

describe('presets', () => {
  for (const p of PRESETS) {
    it(`${p.name} builds and has staging`, () => {
      const d = p.build();
      const s = analyze(d);
      console.log(p.id, 'mass', Math.round(s.mass), 'dvVac', Math.round(s.totalDvVac), 'twr', s.liftoffTwr.toFixed(2), 'h', s.height.toFixed(1), s.stages.map((x) => `${Math.round(x.dvVac)}/${x.twr.toFixed(2)}`).join(' | '), s.warnings);
      expect(d.stages.length).toBeGreaterThan(0);
      expect(s.warnings).toEqual([]);
    });
  }
});
