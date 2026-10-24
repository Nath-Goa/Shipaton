import { describe, expect, it } from 'vitest';
import { CATALOG, nearestStar, searchStars, sectorStars, starById, starsWithin, systemForStar } from '../src/sim/galaxy';
import { SystemIndex } from '../src/sim/bodies';

describe('galaxy', () => {
  it('bundles a real catalog including nearby named stars', () => {
    expect(CATALOG.length).toBeGreaterThan(9000);
    const prox = searchStars('proxima')[0];
    expect(prox).toBeDefined();
    const d = Math.hypot(prox.x, prox.y, prox.z);
    expect(d).toBeGreaterThan(4.1);
    expect(d).toBeLessThan(4.4);
  });
  it('generates identical sectors and systems every time', () => {
    const a = sectorStars(3, -2, 1);
    const b = sectorStars(3, -2, 1);
    expect(a).toBe(b);
    const s = a[0] ?? nearestStar(80, -50, 25)!;
    expect(starById(s.id)).toBeDefined();
    const sysA = systemForStar(s);
    const copy = JSON.stringify(sysA);
    const idx = new SystemIndex(sysA);
    expect(idx.star.luminous).toBe(true);
    expect(JSON.stringify(systemForStar(s))).toBe(copy);
  });
  it('knows observed planets around Proxima Centauri', () => {
    const prox = searchStars('proxima')[0];
    const sys = systemForStar(prox);
    expect(sys.provenance).toBe('mixed');
    expect(sys.bodies.filter((b) => b.parent === 'star').length).toBe(2);
  });
  it('finds many stars close to the Sun', () => {
    const near = starsWithin(0, 0, 0, 100);
    console.log('stars within 100 ly', near.length, 'of which real', near.filter((s) => s.real).length);
    expect(near.length).toBeGreaterThan(500);
  });
});
