import * as THREE from 'three';
import { Random } from '../utils/Random';

const SQRT2 = Math.SQRT2;
const NEIGHBORS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

/** Binary min-heap of cell indices ordered by an external score array. */
class IndexHeap {
  private readonly items: number[] = [];

  constructor(private readonly scores: Float32Array) {}

  get size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items.length = 0;
  }

  push(index: number): void {
    const items = this.items;
    items.push(index);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.scores[items[parent]] <= this.scores[items[i]]) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  pop(): number {
    const items = this.items;
    const top = items[0];
    const last = items.pop() as number;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let smallest = i;
        if (l < items.length && this.scores[items[l]] < this.scores[items[smallest]]) smallest = l;
        if (r < items.length && this.scores[items[r]] < this.scores[items[smallest]]) smallest = r;
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i], items[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

/** 8-connected A* over the level's 2 m cells, with string-pulled waypoints. */
export class NavGrid {
  private readonly g: Float32Array;
  private readonly f: Float32Array;
  private readonly cameFrom: Int32Array;
  private readonly generation: Uint32Array;
  private readonly closed: Uint32Array;
  private readonly heap: IndexHeap;
  private searchId = 0;
  private readonly cellPath: number[] = [];

  constructor(
    readonly cols: number,
    readonly rows: number,
    readonly cellSize: number,
    private readonly walkable: Uint8Array,
  ) {
    const n = cols * rows;
    this.g = new Float32Array(n);
    this.f = new Float32Array(n);
    this.cameFrom = new Int32Array(n);
    this.generation = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.heap = new IndexHeap(this.f);
  }

  isWalkable(c: number, r: number): boolean {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows && this.walkable[r * this.cols + c] === 1;
  }

  isWalkableAt(x: number, z: number): boolean {
    return this.isWalkable(Math.floor(x / this.cellSize), Math.floor(z / this.cellSize));
  }

  cellCenter(c: number, r: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set((c + 0.5) * this.cellSize, 0, (r + 0.5) * this.cellSize);
  }

  /** Closest walkable cell index to (c, r), searching outward in rings. */
  nearestWalkable(c: number, r: number): number {
    if (this.isWalkable(c, r)) return r * this.cols + c;
    for (let ring = 1; ring <= 5; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
          if (this.isWalkable(c + dc, r + dr)) return (r + dr) * this.cols + (c + dc);
        }
      }
    }
    return -1;
  }

  /** True if a body of the given clearance can walk the straight segment. */
  hasClearWalk(ax: number, az: number, bx: number, bz: number, clearance: number): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    const length = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(length / 0.3));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = ax + dx * t;
      const z = az + dz * t;
      if (
        !this.isWalkableAt(x - clearance, z - clearance) ||
        !this.isWalkableAt(x + clearance, z - clearance) ||
        !this.isWalkableAt(x - clearance, z + clearance) ||
        !this.isWalkableAt(x + clearance, z + clearance)
      ) {
        return false;
      }
    }
    return true;
  }

  /**
   * Fills `out` with waypoints from `from` to `to` (start excluded, goal included).
   * Returns false when no route exists.
   */
  findPath(from: THREE.Vector3, to: THREE.Vector3, out: THREE.Vector3[], clearance = 0.36): boolean {
    out.length = 0;
    const start = this.nearestWalkable(Math.floor(from.x / this.cellSize), Math.floor(from.z / this.cellSize));
    const goalCellC = Math.floor(to.x / this.cellSize);
    const goalCellR = Math.floor(to.z / this.cellSize);
    const goalExact = this.isWalkable(goalCellC, goalCellR);
    const goal = this.nearestWalkable(goalCellC, goalCellR);
    if (start < 0 || goal < 0) return false;

    if (!this.search(start, goal)) return false;

    const cells = this.cellPath;
    cells.length = 0;
    for (let cur = goal; cur !== start; cur = this.cameFrom[cur]) cells.push(cur);
    cells.reverse();

    const raw: THREE.Vector3[] = [];
    for (const cell of cells) raw.push(this.cellCenter(cell % this.cols, Math.floor(cell / this.cols), new THREE.Vector3()));
    const goalPoint = goalExact ? new THREE.Vector3(to.x, 0, to.z) : this.cellCenter(goal % this.cols, Math.floor(goal / this.cols), new THREE.Vector3());
    if (raw.length === 0) raw.push(goalPoint);
    else raw[raw.length - 1] = goalPoint;

    let anchorX = from.x;
    let anchorZ = from.z;
    let i = 0;
    while (i < raw.length) {
      let j = raw.length - 1;
      while (j > i && !this.hasClearWalk(anchorX, anchorZ, raw[j].x, raw[j].z, clearance)) j--;
      out.push(raw[j]);
      anchorX = raw[j].x;
      anchorZ = raw[j].z;
      i = j + 1;
    }
    return true;
  }

  randomWalkableNear(x: number, z: number, radiusCells: number, rng: Random, out: THREE.Vector3): boolean {
    const c = Math.floor(x / this.cellSize);
    const r = Math.floor(z / this.cellSize);
    for (let attempt = 0; attempt < 24; attempt++) {
      const tc = c + rng.int(-radiusCells, radiusCells);
      const tr = r + rng.int(-radiusCells, radiusCells);
      if (this.isWalkable(tc, tr) && (tc !== c || tr !== r)) {
        this.cellCenter(tc, tr, out);
        out.x += rng.range(-0.4, 0.4);
        out.z += rng.range(-0.4, 0.4);
        return true;
      }
    }
    return false;
  }

  private search(start: number, goal: number): boolean {
    const id = ++this.searchId;
    const heap = this.heap;
    heap.clear();
    const gc = goal % this.cols;
    const gr = Math.floor(goal / this.cols);
    const heuristic = (index: number): number => {
      const dc = Math.abs((index % this.cols) - gc);
      const dr = Math.abs(Math.floor(index / this.cols) - gr);
      return Math.max(dc, dr) + (SQRT2 - 1) * Math.min(dc, dr);
    };

    this.generation[start] = id;
    this.g[start] = 0;
    this.f[start] = heuristic(start);
    this.cameFrom[start] = -1;
    heap.push(start);

    while (heap.size > 0) {
      const current = heap.pop();
      if (current === goal) return true;
      if (this.closed[current] === id) continue;
      this.closed[current] = id;
      const c = current % this.cols;
      const r = Math.floor(current / this.cols);
      for (const [dc, dr, cost] of NEIGHBORS) {
        const nc = c + dc;
        const nr = r + dr;
        if (!this.isWalkable(nc, nr)) continue;
        if (dc !== 0 && dr !== 0 && (!this.isWalkable(c + dc, r) || !this.isWalkable(c, r + dr))) continue;
        const next = nr * this.cols + nc;
        if (this.closed[next] === id) continue;
        const tentative = this.g[current] + cost;
        if (this.generation[next] !== id || tentative < this.g[next]) {
          this.generation[next] = id;
          this.g[next] = tentative;
          this.f[next] = tentative + heuristic(next);
          this.cameFrom[next] = current;
          heap.push(next);
        }
      }
    }
    return false;
  }
}
