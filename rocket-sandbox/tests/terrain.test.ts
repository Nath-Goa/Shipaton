import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { SOL_BODIES } from '../src/sim/bodies';
import { groundHeight, setPad, terrainHeight } from '../src/sim/terrain';

const earth = SOL_BODIES.find((b) => b.id === 'earth')!;
const moon = SOL_BODIES.find((b) => b.id === 'moon')!;

describe('terrain', () => {
  it('is deterministic and finite', () => {
    const d = new Vector3(0.3, 0.2, 0.9).normalize();
    expect(terrainHeight(earth, d)).toBe(terrainHeight(earth, d));
    expect(Number.isFinite(terrainHeight(moon, d))).toBe(true);
  });
  it('flattens the launch pad', () => {
    const pad = new Vector3(1, 0, 0);
    setPad('earth', pad);
    expect(terrainHeight(earth, pad)).toBeCloseTo(22, 1);
    const near = new Vector3(1, 0, 300 / earth.radius).normalize();
    expect(Math.abs(terrainHeight(earth, near) - 22)).toBeLessThan(2);
  });
  it('has ocean and land with believable relief, and costs microseconds', () => {
    let land = 0, n = 4000, min = 1e9, max = -1e9;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      const d = new Vector3(Math.sin(i * 12.9898) , Math.cos(i * 78.233), Math.sin(i * 37.719)).normalize();
      const h = terrainHeight(earth, d);
      if (h > 0) land++;
      min = Math.min(min, h); max = Math.max(max, h);
      groundHeight(earth, d);
    }
    const dt = performance.now() - t0;
    console.log('land fraction', land / n, 'min', min.toFixed(0), 'max', max.toFixed(0), 'us/sample', ((dt / n / 2) * 1000).toFixed(1));
    expect(land / n).toBeGreaterThan(0.1);
    expect(land / n).toBeLessThan(0.7);
    expect(max).toBeLessThan(16000);
  });
});
