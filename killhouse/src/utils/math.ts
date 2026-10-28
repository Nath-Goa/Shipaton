export const TAU = Math.PI * 2;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Frame-rate independent exponential approach of `current` toward `target`. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function easeOutCubic(t: number): number {
  const u = 1 - clamp(t, 0, 1);
  return 1 - u * u * u;
}

export function easeInQuad(t: number): number {
  const c = clamp(t, 0, 1);
  return c * c;
}

/** Rises over [a, b], falls over [b, c], zero outside. */
export function bump(a: number, b: number, c: number, x: number): number {
  if (x <= a || x >= c) return 0;
  return x < b ? smoothstep(a, b, x) : 1 - smoothstep(b, c, x);
}

/** Wraps an angle into (-PI, PI]. */
export function wrapAngle(angle: number): number {
  let a = (angle + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Turns `current` toward `target` along the shortest arc, by at most `maxStep` radians. */
export function approachAngle(current: number, target: number, maxStep: number): number {
  const delta = wrapAngle(target - current);
  if (Math.abs(delta) <= maxStep) return current + delta;
  return current + Math.sign(delta) * maxStep;
}

/** Yaw that turns a +Z-facing model toward the XZ direction (dx, dz). */
export function yawToward(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

/** Damped spring that always rests at zero; kicks are applied to `value` or `velocity`. */
export class Spring {
  value = 0;
  velocity = 0;

  constructor(
    private readonly stiffness: number,
    private readonly damping: number,
  ) {}

  update(dt: number): number {
    const accel = -this.stiffness * this.value - this.damping * this.velocity;
    this.velocity += accel * dt;
    this.value += this.velocity * dt;
    return this.value;
  }

  reset(): void {
    this.value = 0;
    this.velocity = 0;
  }
}
