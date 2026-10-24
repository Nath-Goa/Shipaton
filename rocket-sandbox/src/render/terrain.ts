import {
  BufferAttribute, BufferGeometry, Color, Group, Material, Mesh, MeshStandardMaterial, Quaternion, Vector3,
} from 'three';
import { BodyDef } from '../sim/bodies';
import { rotY } from '../sim/frame';
import { terrainColor, terrainHeight } from '../sim/terrain';

/** Cube-sphere quadtree terrain. Every chunk stores vertices relative to its own centre so that float32 is plenty. */

const N = 16; // quads per chunk edge
const FACES: [Vector3, Vector3, Vector3][] = [
  [new Vector3(1, 0, 0), new Vector3(0, 0, -1), new Vector3(0, 1, 0)],
  [new Vector3(-1, 0, 0), new Vector3(0, 0, 1), new Vector3(0, 1, 0)],
  [new Vector3(0, 1, 0), new Vector3(1, 0, 0), new Vector3(0, 0, -1)],
  [new Vector3(0, -1, 0), new Vector3(1, 0, 0), new Vector3(0, 0, 1)],
  [new Vector3(0, 0, 1), new Vector3(1, 0, 0), new Vector3(0, 1, 0)],
  [new Vector3(0, 0, -1), new Vector3(-1, 0, 0), new Vector3(0, 1, 0)],
];

function cubeDir(face: number, u: number, v: number, out: Vector3): Vector3 {
  const [n, a, b] = FACES[face];
  const tu = Math.tan((u * Math.PI) / 4);
  const tv = Math.tan((v * Math.PI) / 4);
  return out.set(n.x + a.x * tu + b.x * tv, n.y + a.y * tu + b.y * tv, n.z + a.z * tu + b.z * tv).normalize();
}

export interface TerrainQuality {
  /** Larger = more detail near the camera. */
  splitFactor: number;
  /** Smallest vertex spacing in metres. */
  minSpacing: number;
  buildPerFrame: number;
}

class Chunk {
  mesh: Mesh | null = null;
  water: Mesh | null = null;
  children: Chunk[] | null = null;
  center = new Vector3();
  centerDir = new Vector3();
  size = 0;
  angRadius = 0;
  lastUsed = 0;
  shown = false;
  constructor(readonly face: number, readonly level: number, readonly i: number, readonly j: number) {}
}

const tmpA = new Vector3();
const tmpB = new Vector3();

export class TerrainTree {
  readonly group = new Group();
  private roots: Chunk[] = [];
  private frame = 0;
  private landMat: MeshStandardMaterial;
  private seaMat: MeshStandardMaterial | null = null;
  private maxLevel: number;
  private buildQueue: Chunk[] = [];
  private theta = 0;
  private camBF = new Vector3();
  private all = new Set<Chunk>();
  private rotQ = new Quaternion();

  constructor(private body: BodyDef, private quality: TerrainQuality, envMapIntensity = 0.25) {
    this.landMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, envMapIntensity });
    if (body.terrain?.seaLevel !== undefined) {
      this.seaMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.0, envMapIntensity: 0.35 });
    }
    this.maxLevel = this.levelFor(quality.minSpacing);
    // start at level 2 (96 chunks) so that the silhouette is round even from far away
    for (let f = 0; f < 6; f++) {
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          const c = new Chunk(f, 2, i, j);
          this.initChunk(c);
          this.build(c);
          this.roots.push(c);
        }
      }
    }
  }

  setQuality(q: TerrainQuality): void {
    this.quality = q;
    this.maxLevel = this.levelFor(q.minSpacing);
  }

  private levelFor(spacing: number): number {
    const faceEdge = (Math.PI / 2) * this.body.radius;
    return Math.max(2, Math.floor(Math.log2(faceEdge / (N * spacing))));
  }

  private initChunk(c: Chunk): void {
    const n = 1 << c.level;
    const u = -1 + (2 * (c.i + 0.5)) / n;
    const v = -1 + (2 * (c.j + 0.5)) / n;
    cubeDir(c.face, u, v, c.centerDir);
    c.center.copy(c.centerDir).multiplyScalar(this.body.radius);
    c.size = ((Math.PI / 2) * this.body.radius) / n;
    c.angRadius = (c.size * 0.75) / this.body.radius;
  }

  private build(c: Chunk): void {
    const R = this.body.radius;
    const body = this.body;
    const n = 1 << c.level;
    const M = N + 3; // padded height grid for normals
    const heights = new Float32Array(M * M);
    const dirs: Vector3[] = new Array(M * M);
    const pad = 1;
    const octaveCap = Math.min(40, Math.floor(Math.log2(R / (body.terrain!.frequency * 1.2))));
    // limit octaves to those that are resolvable at this vertex spacing
    const spacing = c.size / N;
    const maxOct = Math.min(octaveCap, Math.ceil(Math.log2(R / (body.terrain!.frequency * spacing * 1.6))));
    for (let jj = 0; jj < M; jj++) {
      for (let ii = 0; ii < M; ii++) {
        const u = -1 + (2 * (c.i + (ii - pad) / N)) / n;
        const v = -1 + (2 * (c.j + (jj - pad) / N)) / n;
        const d = cubeDir(c.face, u, v, new Vector3());
        dirs[jj * M + ii] = d;
        heights[jj * M + ii] = terrainHeight(body, d, maxOct);
      }
    }
    const sea = body.terrain?.seaLevel;
    const V = N + 1;
    const skirt = c.size * 0.04 + 5;
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const idx: number[] = [];
    const pos = new Vector3();
    const nrm = new Vector3();
    const col = new Color();
    const vp = (ii: number, jj: number) => {
      const d = dirs[(jj + pad) * M + (ii + pad)];
      const h = heights[(jj + pad) * M + (ii + pad)];
      const hh = sea !== undefined ? Math.max(h, sea - 30) : h;
      return tmpA.copy(d).multiplyScalar(R + hh).sub(c.center);
    };
    let anyWater = false;
    for (let jj = 0; jj < V; jj++) {
      for (let ii = 0; ii < V; ii++) {
        pos.copy(vp(ii, jj));
        // normal from the padded neighbourhood
        const pl = vp(ii - 1, jj).clone();
        const pr = vp(ii + 1, jj).clone();
        const pd = vp(ii, jj - 1).clone();
        const pu = vp(ii, jj + 1).clone();
        nrm.crossVectors(pr.sub(pl), pu.sub(pd)).normalize();
        const d = dirs[(jj + pad) * M + (ii + pad)];
        if (nrm.dot(d) < 0) nrm.negate();
        const h = heights[(jj + pad) * M + (ii + pad)];
        if (sea !== undefined && h < sea) anyWater = true;
        const slope = 1 - Math.max(0, Math.min(1, nrm.dot(d)));
        const rgb = terrainColor(body, d, h, slope, spacing);
        col.setRGB(rgb[0], rgb[1], rgb[2]);
        positions.push(pos.x, pos.y, pos.z);
        normals.push(nrm.x, nrm.y, nrm.z);
        colors.push(col.r, col.g, col.b);
      }
    }
    for (let jj = 0; jj < N; jj++) {
      for (let ii = 0; ii < N; ii++) {
        const a = jj * V + ii;
        idx.push(a, a + 1, a + V, a + 1, a + V + 1, a + V);
      }
    }
    // skirts: drop the border vertices straight down
    const border: number[] = [];
    for (let ii = 0; ii < V; ii++) border.push(ii);
    for (let jj = 1; jj < V; jj++) border.push(jj * V + N);
    for (let ii = V - 2; ii >= 0; ii--) border.push(N * V + ii);
    for (let jj = V - 2; jj >= 1; jj--) border.push(jj * V);
    const base = positions.length / 3;
    for (const b of border) {
      const x = positions[b * 3], y = positions[b * 3 + 1], z = positions[b * 3 + 2];
      const dd = tmpB.set(x, y, z).add(c.center).normalize();
      positions.push(x - dd.x * skirt, y - dd.y * skirt, z - dd.z * skirt);
      normals.push(normals[b * 3], normals[b * 3 + 1], normals[b * 3 + 2]);
      colors.push(colors[b * 3], colors[b * 3 + 1], colors[b * 3 + 2]);
    }
    for (let k = 0; k < border.length; k++) {
      const k2 = (k + 1) % border.length;
      const a = border[k], b = border[k2];
      idx.push(a, base + k, b, b, base + k, base + k2);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    c.mesh = new Mesh(g, this.landMat);
    c.mesh.frustumCulled = true;
    c.mesh.visible = false;
    this.group.add(c.mesh);

    if (anyWater && this.seaMat) {
      const wp: number[] = [];
      const wn: number[] = [];
      const wc: number[] = [];
      const oc = body.terrain!.oceanColor ?? [0.04, 0.2, 0.42];
      for (let jj = 0; jj < V; jj++) {
        for (let ii = 0; ii < V; ii++) {
          const d = dirs[(jj + pad) * M + (ii + pad)];
          const h = heights[(jj + pad) * M + (ii + pad)];
          const p = tmpA.copy(d).multiplyScalar(R + (sea ?? 0)).sub(c.center);
          wp.push(p.x, p.y, p.z);
          wn.push(d.x, d.y, d.z);
          const depth = Math.max(0, (sea ?? 0) - h);
          const t = 1 - Math.exp(-depth / 220);
          const shallow = [0.1, 0.46, 0.52];
          wc.push(shallow[0] + (oc[0] - shallow[0]) * t, shallow[1] + (oc[1] - shallow[1]) * t, shallow[2] + (oc[2] - shallow[2]) * t);
        }
      }
      const wi: number[] = [];
      for (let jj = 0; jj < N; jj++) for (let ii = 0; ii < N; ii++) {
        const a = jj * V + ii;
        wi.push(a, a + 1, a + V, a + 1, a + V + 1, a + V);
      }
      const wg = new BufferGeometry();
      wg.setAttribute('position', new BufferAttribute(new Float32Array(wp), 3));
      wg.setAttribute('normal', new BufferAttribute(new Float32Array(wn), 3));
      wg.setAttribute('color', new BufferAttribute(new Float32Array(wc), 3));
      wg.setIndex(wi);
      wg.computeBoundingSphere();
      c.water = new Mesh(wg, this.seaMat);
      c.water.visible = false;
      this.group.add(c.water);
    }
    this.all.add(c);
  }

  private setShown(c: Chunk, on: boolean): void {
    c.shown = on;
    if (c.mesh) c.mesh.visible = on;
    if (c.water) c.water.visible = on;
  }

  private place(c: Chunk): void {
    // position of the chunk centre relative to the camera, rotated into the inertial frame
    const rel = rotY(tmpA.copy(c.center), this.theta).sub(this.camInertial);
    if (c.mesh) { c.mesh.position.copy(rel); c.mesh.quaternion.copy(this.rotQ); }
    if (c.water) { c.water.position.copy(rel); c.water.quaternion.copy(this.rotQ); }
  }

  private camInertial = new Vector3();

  private cull(c: Chunk): boolean {
    const camLen = this.camBF.length();
    const R = this.body.radius;
    const amp = (this.body.terrain?.amplitude ?? 0) * 1.2 + 2000;
    const cosCam = this.camBF.dot(c.centerDir) / camLen;
    const angle = Math.acos(Math.max(-1, Math.min(1, cosCam)));
    const horizon = Math.acos(Math.min(1, R / Math.max(camLen, R))) + Math.acos(R / (R + amp));
    return angle > horizon + c.angRadius;
  }

  private visit(c: Chunk): void {
    c.lastUsed = this.frame;
    if (this.cull(c)) { this.hideTree(c); return; }
    const d = tmpB.copy(this.camBF).sub(c.center).length();
    const want = c.level < this.maxLevel && d < c.size * this.quality.splitFactor;
    if (!want) { this.showSelf(c); this.hideChildren(c); return; }
    if (!c.children) {
      const nl = c.level + 1;
      c.children = [];
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
        const ch = new Chunk(c.face, nl, c.i * 2 + a, c.j * 2 + b);
        this.initChunk(ch);
        c.children.push(ch);
        this.buildQueue.push(ch);
      }
    }
    let ready = true;
    for (const ch of c.children) if (!ch.mesh) ready = false;
    if (!ready) { this.showSelf(c); return; }
    this.setShown(c, false);
    for (const ch of c.children) this.visit(ch);
  }

  private showSelf(c: Chunk): void {
    this.setShown(c, true);
    this.place(c);
  }

  private hideChildren(c: Chunk): void {
    if (!c.children) return;
    for (const ch of c.children) this.hideTree(ch);
  }

  private hideTree(c: Chunk): void {
    if (c.shown) this.setShown(c, false);
    this.hideChildren(c);
  }

  private reap(c: Chunk, parent: Chunk | null): void {
    if (!c.children) return;
    for (const ch of c.children) this.reap(ch, c);
    if (this.frame - c.lastUsed > 90) {
      for (const ch of c.children) this.dispose(ch);
      c.children = null;
    }
    void parent;
  }

  private dispose(c: Chunk): void {
    if (c.children) for (const ch of c.children) this.dispose(ch);
    for (const m of [c.mesh, c.water]) {
      if (m) { this.group.remove(m); m.geometry.dispose(); }
    }
    c.mesh = null;
    c.water = null;
    this.all.delete(c);
    const qi = this.buildQueue.indexOf(c);
    if (qi >= 0) this.buildQueue.splice(qi, 1);
  }

  /** camInertial: camera position relative to the body centre, inertial axes. */
  update(camInertial: Vector3, theta: number): void {
    this.frame++;
    this.theta = theta;
    this.camInertial.copy(camInertial);
    this.camBF.copy(camInertial);
    rotY(this.camBF, -theta);
    this.rotQ.setFromAxisAngle(new Vector3(0, 1, 0), theta);
    // nearest first
    this.buildQueue.sort((a, b) => tmpA.copy(this.camBF).sub(a.center).lengthSq() - tmpB.copy(this.camBF).sub(b.center).lengthSq());
    let budget = this.quality.buildPerFrame;
    while (budget > 0 && this.buildQueue.length) {
      const c = this.buildQueue.shift()!;
      if (!c.mesh) this.build(c);
      budget--;
    }
    for (const r of this.roots) this.visit(r);
    if (this.frame % 60 === 0) for (const r of this.roots) this.reap(r, null);
  }

  get chunkCount(): number { return this.all.size; }

  dispose_all(): void {
    for (const r of this.roots) this.dispose(r);
    this.landMat.dispose();
    this.seaMat?.dispose();
  }

  materials(): Material[] { return [this.landMat, ...(this.seaMat ? [this.seaMat] : [])]; }
}
