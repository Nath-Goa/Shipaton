import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { SOL, SystemIndex } from '../src/sim/bodies';
import { bodyPosAbs, elements, keplerStep, predictEvents } from '../src/sim/orbit';

describe('kepler propagation', () => {
  const mu = 3.986004418e14;
  it('returns to start after one period (circular LEO)', () => {
    const r = new Vector3(6.771e6, 0, 0);
    const v = new Vector3(0, 0, -Math.sqrt(mu / 6.771e6));
    const T = elements(r, v, mu).period;
    const { r: r1 } = keplerStep(r, v, mu, T * 0.5 + 0);
    expect(r1.x).toBeCloseTo(-6.771e6, -2);
    const { r: r2 } = keplerStep(r, v, mu, T * 3);
    expect(r2.distanceTo(r)).toBeLessThan(5);
  });
  it('conserves energy on a hyperbola', () => {
    const r = new Vector3(7e6, 0, 0);
    const v = new Vector3(0, 0, -12000);
    const e0 = elements(r, v, mu).energy;
    const { r: r1, v: v1 } = keplerStep(r, v, mu, 50000);
    expect(elements(r1, v1, mu).energy).toBeCloseTo(e0, -1);
  });
  it('reports apoapsis/periapsis of an elliptical orbit', () => {
    const r = new Vector3(6.571e6, 0, 0);
    const v = new Vector3(0, 0, -9000);
    const el = elements(r, v, mu);
    expect(el.rp).toBeCloseTo(6.571e6, -1);
    expect(el.ra).toBeGreaterThan(el.rp);
  });
});

describe('solar system', () => {
  const idx = new SystemIndex(SOL);
  it('places Earth about 1 AU from the Sun and the Moon about 384,000 km from Earth', () => {
    const e = bodyPosAbs(idx, 'earth', 0).length();
    expect(e / 1.496e11).toBeGreaterThan(0.98);
    expect(e / 1.496e11).toBeLessThan(1.02);
    const m = bodyPosAbs(idx, 'moon', 0).sub(bodyPosAbs(idx, 'earth', 0)).length();
    expect(m).toBeGreaterThan(3.6e8);
    expect(m).toBeLessThan(4.1e8);
  });
  it('has the expected sphere of influence for Earth (~0.92 million km)', () => {
    const soi = idx.soi.get('earth')!;
    expect(soi).toBeGreaterThan(8e8);
    expect(soi).toBeLessThan(1e9);
  });
  it('predicts an impact for a suborbital trajectory', () => {
    const r = new Vector3(6.571e6, 0, 0);
    const v = new Vector3(0, 0, -5000);
    expect(predictEvents(idx, 'earth', r, v, 0, 20000)?.kind).toBe('impact');
  });
});
