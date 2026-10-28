import * as THREE from 'three';
import { clamp } from '../utils/math';

export type Surface = 'concrete' | 'brick' | 'metal' | 'crate';

export interface RayHit {
  distance: number;
  readonly point: THREE.Vector3;
  readonly normal: THREE.Vector3;
  surface: Surface;
}

export function createRayHit(): RayHit {
  return { distance: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), surface: 'concrete' };
}

/** Axis index: 0 = X, 1 = Y, 2 = Z. */
export type Axis = 0 | 1 | 2;

interface BoxCollider {
  readonly kind: 'box';
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly hx: number;
  readonly hy: number;
  readonly hz: number;
  /** Yaw of the box around +Y, stored as cos/sin. */
  readonly cos: number;
  readonly sin: number;
  readonly surface: Surface;
  readonly boundRadius: number;
}

interface CylinderCollider {
  readonly kind: 'cylinder';
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly axis: Axis;
  readonly radius: number;
  readonly half: number;
  readonly surface: Surface;
  readonly boundRadius: number;
}

type Collider = BoxCollider | CylinderCollider;

/**
 * Analytic collision for the level: oriented boxes and axis-aligned cylinders.
 * Bullets, enemy line-of-sight and character movement all query the same shapes,
 * so cover that stops the player's rounds also stops the enemy's.
 */
export class CollisionWorld {
  private readonly colliders: Collider[] = [];
  private readonly cells: number[][];
  private readonly cols: number;
  private readonly rows: number;
  private stamps: Int32Array = new Int32Array(0);
  private stampId = 0;
  private readonly scratchNormal = new THREE.Vector3();
  private readonly segmentHit = createRayHit();
  private readonly segmentDir = new THREE.Vector3();
  private readonly slabOrigin = new Float64Array(3);
  private readonly slabDir = new Float64Array(3);
  private readonly slabHalf = new Float64Array(3);

  constructor(
    readonly width: number,
    readonly depth: number,
    readonly ceilingY: number,
    private readonly cellSize: number,
  ) {
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(depth / cellSize);
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
  }

  get count(): number {
    return this.colliders.length;
  }

  addBox(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, yaw: number, surface: Surface): void {
    const collider: BoxCollider = {
      kind: 'box',
      cx,
      cy,
      cz,
      hx,
      hy,
      hz,
      cos: Math.cos(yaw),
      sin: Math.sin(yaw),
      surface,
      boundRadius: Math.sqrt(hx * hx + hy * hy + hz * hz),
    };
    const reach = yaw === 0 ? 0 : Math.hypot(hx, hz);
    const rx = yaw === 0 ? hx : reach;
    const rz = yaw === 0 ? hz : reach;
    this.insert(collider, cx - rx, cz - rz, cx + rx, cz + rz);
  }

  addCylinder(cx: number, cy: number, cz: number, axis: Axis, radius: number, half: number, surface: Surface): void {
    const collider: CylinderCollider = {
      kind: 'cylinder',
      cx,
      cy,
      cz,
      axis,
      radius,
      half,
      surface,
      boundRadius: Math.hypot(radius, half),
    };
    const rx = axis === 0 ? half : radius;
    const rz = axis === 2 ? half : radius;
    this.insert(collider, cx - rx, cz - rz, cx + rx, cz + rz);
  }

  private insert(collider: Collider, minX: number, minZ: number, maxX: number, maxZ: number): void {
    const index = this.colliders.length;
    this.colliders.push(collider);
    const c0 = clamp(Math.floor(minX / this.cellSize), 0, this.cols - 1);
    const c1 = clamp(Math.floor(maxX / this.cellSize), 0, this.cols - 1);
    const r0 = clamp(Math.floor(minZ / this.cellSize), 0, this.rows - 1);
    const r1 = clamp(Math.floor(maxZ / this.cellSize), 0, this.rows - 1);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) this.cells[r * this.cols + c].push(index);
    }
    this.stamps = new Int32Array(this.colliders.length);
    this.stampId = 0;
  }

  /** Nearest hit along a normalized direction, including floor and ceiling. */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDistance: number, out: RayHit): boolean {
    let best = maxDistance;
    let found = false;
    const ox = origin.x;
    const oy = origin.y;
    const oz = origin.z;
    const dx = dir.x;
    const dy = dir.y;
    const dz = dir.z;

    if (dy < -1e-6) {
      const t = -oy / dy;
      if (t >= 0 && t < best) {
        best = t;
        found = true;
        out.normal.set(0, 1, 0);
        out.surface = 'concrete';
      }
    } else if (dy > 1e-6) {
      const t = (this.ceilingY - oy) / dy;
      if (t >= 0 && t < best) {
        best = t;
        found = true;
        out.normal.set(0, -1, 0);
        out.surface = 'metal';
      }
    }

    for (const c of this.colliders) {
      const ex = c.cx - ox;
      const ey = c.cy - oy;
      const ez = c.cz - oz;
      const proj = ex * dx + ey * dy + ez * dz;
      if (proj < -c.boundRadius || proj - c.boundRadius > best) continue;
      const perpSq = ex * ex + ey * ey + ez * ez - proj * proj;
      if (perpSq > c.boundRadius * c.boundRadius) continue;
      const t =
        c.kind === 'box'
          ? this.rayBox(c, ox, oy, oz, dx, dy, dz, best, this.scratchNormal)
          : this.rayCylinder(c, ox, oy, oz, dx, dy, dz, best, this.scratchNormal);
      if (t >= 0 && t < best) {
        best = t;
        found = true;
        out.normal.copy(this.scratchNormal);
        out.surface = c.surface;
      }
    }

    if (found) {
      out.distance = best;
      out.point.set(ox + dx * best, oy + dy * best, oz + dz * best);
    }
    return found;
  }

  /** True when nothing solid sits between the two points. */
  isSegmentClear(a: THREE.Vector3, b: THREE.Vector3): boolean {
    this.segmentDir.subVectors(b, a);
    const length = this.segmentDir.length();
    if (length < 1e-4) return true;
    this.segmentDir.divideScalar(length);
    return !this.raycast(a, this.segmentDir, length - 0.05, this.segmentHit);
  }

  /**
   * Pushes a vertical character cylinder (XZ circle spanning minY..maxY) out of
   * every overlapping collider. Returns true if anything was touched.
   */
  resolveCircle(position: THREE.Vector3, radius: number, minY: number, maxY: number): boolean {
    let collided = false;
    for (let iteration = 0; iteration < 2; iteration++) {
      const stamp = ++this.stampId;
      const c0 = clamp(Math.floor((position.x - radius) / this.cellSize), 0, this.cols - 1);
      const c1 = clamp(Math.floor((position.x + radius) / this.cellSize), 0, this.cols - 1);
      const r0 = clamp(Math.floor((position.z - radius) / this.cellSize), 0, this.rows - 1);
      const r1 = clamp(Math.floor((position.z + radius) / this.cellSize), 0, this.rows - 1);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          for (const index of this.cells[r * this.cols + c]) {
            if (this.stamps[index] === stamp) continue;
            this.stamps[index] = stamp;
            const col = this.colliders[index];
            if (col.kind === 'box') {
              if (col.cy - col.hy >= maxY || col.cy + col.hy <= minY) continue;
              if (pushFromRect(col.cx, col.cz, col.hx, col.hz, col.cos, col.sin, position, radius)) collided = true;
            } else if (col.axis === 1) {
              if (col.cy - col.half >= maxY || col.cy + col.half <= minY) continue;
              const dx = position.x - col.cx;
              const dz = position.z - col.cz;
              const min = radius + col.radius;
              const d2 = dx * dx + dz * dz;
              if (d2 < min * min) {
                const d = Math.sqrt(d2) || 1e-4;
                position.x = col.cx + (dx / d) * min;
                position.z = col.cz + (dz / d) * min;
                collided = true;
              }
            } else {
              if (col.cy - col.radius >= maxY || col.cy + col.radius <= minY) continue;
              const hx = col.axis === 0 ? col.half : col.radius;
              const hz = col.axis === 2 ? col.half : col.radius;
              if (pushFromRect(col.cx, col.cz, hx, hz, 1, 0, position, radius)) collided = true;
            }
          }
        }
      }
    }
    position.x = clamp(position.x, radius, this.width - radius);
    position.z = clamp(position.z, radius, this.depth - radius);
    return collided;
  }

  private rayBox(
    b: BoxCollider,
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxT: number,
    normal: THREE.Vector3,
  ): number {
    const rx = ox - b.cx;
    const rz = oz - b.cz;
    const so = this.slabOrigin;
    const sd = this.slabDir;
    const sh = this.slabHalf;
    so[0] = b.cos * rx - b.sin * rz;
    so[1] = oy - b.cy;
    so[2] = b.sin * rx + b.cos * rz;
    sd[0] = b.cos * dx - b.sin * dz;
    sd[1] = dy;
    sd[2] = b.sin * dx + b.cos * dz;
    sh[0] = b.hx;
    sh[1] = b.hy;
    sh[2] = b.hz;

    let tmin = -Infinity;
    let tmax = Infinity;
    let axis = -1;
    let sign = 0;
    for (let a = 0; a < 3; a++) {
      const o = so[a];
      const d = sd[a];
      const h = sh[a];
      if (Math.abs(d) < 1e-9) {
        if (o < -h || o > h) return -1;
        continue;
      }
      const inv = 1 / d;
      let t1 = (-h - o) * inv;
      let t2 = (h - o) * inv;
      let s = -1;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
        s = 1;
      }
      if (t1 > tmin) {
        tmin = t1;
        axis = a;
        sign = s;
      }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    if (axis < 0 || tmin < 0 || tmin > maxT) return -1;

    const nx = axis === 0 ? sign : 0;
    const ny = axis === 1 ? sign : 0;
    const nz = axis === 2 ? sign : 0;
    normal.set(b.cos * nx + b.sin * nz, ny, -b.sin * nx + b.cos * nz);
    return tmin;
  }

  private rayCylinder(
    c: CylinderCollider,
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxT: number,
    normal: THREE.Vector3,
  ): number {
    const o0 = ox - c.cx;
    const o1 = oy - c.cy;
    const o2 = oz - c.cz;
    let oa: number, op: number, oq: number, da: number, dp: number, dq: number;
    if (c.axis === 1) {
      oa = o1; op = o0; oq = o2; da = dy; dp = dx; dq = dz;
    } else if (c.axis === 0) {
      oa = o0; op = o1; oq = o2; da = dx; dp = dy; dq = dz;
    } else {
      oa = o2; op = o0; oq = o1; da = dz; dp = dx; dq = dy;
    }
    const r = c.radius;
    const half = c.half;
    if (op * op + oq * oq < r * r && Math.abs(oa) < half) return -1;

    let best = Infinity;
    let np = 0;
    let nq = 0;
    let na = 0;
    const A = dp * dp + dq * dq;
    if (A > 1e-12) {
      const B = 2 * (op * dp + oq * dq);
      const C = op * op + oq * oq - r * r;
      const disc = B * B - 4 * A * C;
      if (disc >= 0) {
        const t = (-B - Math.sqrt(disc)) / (2 * A);
        if (t >= 0 && Math.abs(oa + da * t) <= half) {
          best = t;
          np = (op + dp * t) / r;
          nq = (oq + dq * t) / r;
        }
      }
    }
    if (Math.abs(da) > 1e-12) {
      for (let side = -1; side <= 1; side += 2) {
        const t = (side * half - oa) / da;
        if (t >= 0 && t < best) {
          const p = op + dp * t;
          const q = oq + dq * t;
          if (p * p + q * q <= r * r) {
            best = t;
            np = 0;
            nq = 0;
            na = side;
          }
        }
      }
    }
    if (best === Infinity || best > maxT) return -1;
    if (c.axis === 1) normal.set(np, na, nq);
    else if (c.axis === 0) normal.set(na, np, nq);
    else normal.set(np, nq, na);
    return best;
  }
}

/** Circle-vs-oriented-rectangle push-out in the XZ plane. */
function pushFromRect(
  cx: number,
  cz: number,
  hx: number,
  hz: number,
  cos: number,
  sin: number,
  position: THREE.Vector3,
  radius: number,
): boolean {
  const rx = position.x - cx;
  const rz = position.z - cz;
  const lx = cos * rx - sin * rz;
  const lz = sin * rx + cos * rz;
  const qx = clamp(lx, -hx, hx);
  const qz = clamp(lz, -hz, hz);
  const dx = lx - qx;
  const dz = lz - qz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return false;

  let nx: number;
  let nz: number;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    const push = radius - d;
    nx = lx + (dx / d) * push;
    nz = lz + (dz / d) * push;
  } else if (hx - Math.abs(lx) < hz - Math.abs(lz)) {
    nx = (lx < 0 ? -1 : 1) * (hx + radius);
    nz = lz;
  } else {
    nx = lx;
    nz = (lz < 0 ? -1 : 1) * (hz + radius);
  }
  position.x = cx + cos * nx + sin * nz;
  position.z = cz - sin * nx + cos * nz;
  return true;
}
