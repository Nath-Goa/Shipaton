import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WORLD } from '../config';
import { Random } from '../utils/Random';
import { CollisionWorld } from './CollisionWorld';
import { NavGrid } from './NavGrid';
import { EXIT_SIGNS, LAMPS, LEVEL_MAP, START_HEADING_DEGREES } from './LevelLayout';
import type { TextureLibrary } from './ProceduralTextures';

export type CellKind = 'wall' | 'floor' | 'door' | 'crate' | 'lowCrate' | 'barrels' | 'barrier' | 'column';
export type PickupKind = 'ammo' | 'medkit';

export interface PickupSpawn {
  readonly kind: PickupKind;
  readonly position: THREE.Vector3;
}

export interface LevelData {
  readonly collision: CollisionWorld;
  readonly nav: NavGrid;
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;
  readonly cells: readonly CellKind[];
  readonly width: number;
  readonly depth: number;
  readonly playerStart: { readonly position: THREE.Vector3; readonly yaw: number };
  readonly soldierSpawns: readonly THREE.Vector3[];
  readonly droneSpawns: readonly THREE.Vector3[];
  readonly pickupSpawns: readonly PickupSpawn[];
  /** Centre and radii of the main hall, used by the menu fly-through camera. */
  readonly overview: { readonly center: THREE.Vector3; readonly radiusX: number; readonly radiusZ: number };
}

interface LampRuntime {
  readonly light: THREE.SpotLight;
  readonly bulb: THREE.MeshStandardMaterial;
  readonly cone: THREE.ShaderMaterial;
  readonly baseIntensity: number;
  readonly flicker: boolean;
  level: number;
  timer: number;
}

const LAMP_COLOR = 0xffcf94;
const LAMP_INTENSITY = 85;
const BULB_EMISSIVE = 7;
const CONE_INTENSITY = 0.13;
const HANG_Y = 4.7;

/** Planar UVs in world metres, picked per face from the dominant normal axis. */
function worldUV(geometry: THREE.BufferGeometry, tile: number): THREE.BufferGeometry {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < position.count; i++) {
    const ax = Math.abs(normal.getX(i));
    const ay = Math.abs(normal.getY(i));
    const az = Math.abs(normal.getZ(i));
    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) {
      u = position.getX(i);
      v = position.getZ(i);
    } else if (ax >= az) {
      u = position.getZ(i);
      v = position.getY(i);
    } else {
      u = position.getX(i);
      v = position.getY(i);
    }
    uv.setXY(i, u / tile, v / tile);
  }
  uv.needsUpdate = true;
  return geometry;
}

/** Baked vertical occlusion: dark where walls meet the floor, slightly dark at the roof line. */
function verticalShade(geometry: THREE.BufferGeometry, stops: readonly (readonly [number, number])[]): THREE.BufferGeometry {
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    let shade = stops[stops.length - 1][1];
    for (let s = 0; s < stops.length - 1; s++) {
      const [y0, v0] = stops[s];
      const [y1, v1] = stops[s + 1];
      if (y <= y0) {
        shade = v0;
        break;
      }
      if (y <= y1) {
        shade = v0 + ((y - y0) / (y1 - y0)) * (v1 - v0);
        break;
      }
    }
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function merge(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const anyIndexed = geometries.some((g) => g.index !== null);
  const anyPlain = geometries.some((g) => g.index === null);
  const uniform = anyIndexed && anyPlain ? geometries.map((g) => (g.index ? g.toNonIndexed() : g)) : geometries;
  const merged = mergeGeometries(uniform, false);
  if (!merged) throw new Error('Geometry merge failed: attribute sets differ');
  for (const g of geometries) g.dispose();
  return merged;
}

/** Cylinder of radius r running from a to b (for pipes, rods and hangers). */
function cylinderBetween(a: THREE.Vector3, b: THREE.Vector3, radius: number, segments: number, open: boolean, uvTile: number): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(b, a);
  const length = dir.length();
  const geometry = new THREE.CylinderGeometry(radius, radius, length, segments, 1, open);
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (length / uvTile));
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  geometry.applyQuaternion(quaternion);
  geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return geometry;
}

const LIGHT_CONE_VERTEX = /* glsl */ `
  varying float vFade;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vFade = uv.y;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const LIGHT_CONE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying float vFade;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float facing = abs(dot(normalize(vNormal), normalize(vView)));
    float a = pow(facing, 1.6) * vFade * vFade * uIntensity;
    gl_FragColor = vec4(uColor * a, 1.0);
  }
`;

const DUST_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  uniform float uLamp[${LAMPS.length}];
  attribute float aPhase;
  attribute float aLamp;
  varying float vAlpha;
  void main() {
    vec3 p = position + vec3(
      sin(uTime * 0.23 + aPhase * 6.283) * 0.22,
      sin(uTime * 0.17 + aPhase * 12.1) * 0.12,
      cos(uTime * 0.19 + aPhase * 9.7) * 0.22
    );
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.0, 0.016 * uScale / max(-mv.z, 0.1));
    float twinkle = 0.55 + 0.45 * sin(uTime * 1.3 + aPhase * 40.0);
    vAlpha = twinkle * uLamp[int(aLamp + 0.5)];
  }
`;

const DUST_FRAGMENT = /* glsl */ `
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c) * 4.0;
    if (d > 1.0) discard;
    gl_FragColor = vec4(vec3(1.0, 0.86, 0.66) * (1.0 - d) * vAlpha * 0.55, 1.0);
  }
`;

/**
 * Turns LEVEL_MAP into the playable compound: merged and instanced render
 * geometry, the analytic collision world, the navigation grid, lamps and spawns.
 */
export class LevelConstructor {
  private readonly lamps: LampRuntime[] = [];
  private dust: THREE.ShaderMaterial | null = null;
  private readonly rng: Random;
  private readonly cs = WORLD.cellSize;
  private readonly wallHeight = WORLD.wallHeight;
  private cols = 0;
  private rows = 0;
  private cells: CellKind[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly textures: TextureLibrary,
    seed: number,
  ) {
    this.rng = new Random(seed);
  }

  build(): LevelData {
    this.rows = LEVEL_MAP.length;
    this.cols = LEVEL_MAP[0].length;
    for (const row of LEVEL_MAP) {
      if (row.length !== this.cols) throw new Error(`Level row "${row}" is ${row.length} cells, expected ${this.cols}`);
    }
    const width = this.cols * this.cs;
    const depth = this.rows * this.cs;
    const collision = new CollisionWorld(width, depth, this.wallHeight, this.cs);

    let playerCell: [number, number] | null = null;
    const soldierSpawns: THREE.Vector3[] = [];
    const droneSpawns: THREE.Vector3[] = [];
    const pickupSpawns: PickupSpawn[] = [];
    this.cells = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const ch = LEVEL_MAP[r][c];
        const center = this.cellCenter(c, r);
        let kind: CellKind = 'floor';
        switch (ch) {
          case '#': kind = 'wall'; break;
          case '=': kind = 'door'; break;
          case 'C': kind = 'crate'; break;
          case 'c': kind = 'lowCrate'; break;
          case 'B': kind = 'barrels'; break;
          case 'J': kind = 'barrier'; break;
          case 'P': kind = 'column'; break;
          case 'S': playerCell = [c, r]; break;
          case 'E': soldierSpawns.push(center); break;
          case 'Q': droneSpawns.push(center); break;
          case 'A': pickupSpawns.push({ kind: 'ammo', position: center }); break;
          case 'H': pickupSpawns.push({ kind: 'medkit', position: center }); break;
          case '.': break;
          default: throw new Error(`Unknown level glyph "${ch}" at ${c},${r}`);
        }
        this.cells.push(kind);
      }
    }
    if (!playerCell) throw new Error('Level has no player start (S)');

    this.buildFloor(width, depth);
    this.buildRoof(width, depth);
    this.buildWalls(collision);
    this.buildCrates(collision);
    this.buildBarrels(collision);
    this.buildBarriers(collision);
    this.buildColumns(collision);
    this.buildPipes(width, depth);
    this.buildLamps();
    this.buildExitSigns();
    this.buildFloorMarkings();

    const walkable = new Uint8Array(this.cols * this.rows);
    for (let i = 0; i < walkable.length; i++) walkable[i] = this.cells[i] === 'floor' || this.cells[i] === 'door' ? 1 : 0;
    const nav = new NavGrid(this.cols, this.rows, this.cs, walkable);

    const start = this.cellCenter(playerCell[0], playerCell[1]);
    const yaw = -THREE.MathUtils.degToRad(START_HEADING_DEGREES);

    return {
      collision,
      nav,
      cols: this.cols,
      rows: this.rows,
      cellSize: this.cs,
      cells: this.cells,
      width,
      depth,
      playerStart: { position: start, yaw },
      soldierSpawns,
      droneSpawns,
      pickupSpawns,
      overview: { center: new THREE.Vector3(28, 0, 18), radiusX: 10, radiusZ: 12 },
    };
  }

  /** Lamp flicker, dust drift; `pointScale` converts world size to pixels at 1 m. */
  update(dt: number, elapsed: number, pointScale: number): void {
    for (let i = 0; i < this.lamps.length; i++) {
      const lamp = this.lamps[i];
      if (lamp.flicker) {
        lamp.timer -= dt;
        if (lamp.timer <= 0) {
          const on = this.rng.chance(0.78);
          lamp.level = on ? this.rng.range(0.85, 1) : this.rng.range(0, 0.08);
          lamp.timer = on ? this.rng.range(0.25, 3.2) : this.rng.range(0.03, 0.16);
        }
      }
      lamp.light.intensity = lamp.baseIntensity * lamp.level;
      lamp.bulb.emissiveIntensity = BULB_EMISSIVE * lamp.level;
      lamp.cone.uniforms.uIntensity.value = CONE_INTENSITY * lamp.level;
      if (this.dust) (this.dust.uniforms.uLamp.value as number[])[i] = lamp.level;
    }
    if (this.dust) {
      this.dust.uniforms.uTime.value = elapsed;
      this.dust.uniforms.uScale.value = pointScale;
    }
  }

  /** Cell kind at grid coordinates; outside the map counts as wall. */
  private cell(c: number, r: number): CellKind {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return 'wall';
    return this.cells[r * this.cols + c];
  }

  private cellCenter(c: number, r: number): THREE.Vector3 {
    return new THREE.Vector3((c + 0.5) * this.cs, 0, (r + 0.5) * this.cs);
  }

  private addMesh(geometry: THREE.BufferGeometry, material: THREE.Material, castShadow: boolean, receiveShadow: boolean): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.scene.add(mesh);
    return mesh;
  }

  private buildFloor(width: number, depth: number): void {
    const t = this.textures.concrete;
    const geometry = new THREE.PlaneGeometry(width, depth);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(width / 2, 0, depth / 2);
    worldUV(geometry, 4);
    const material = new THREE.MeshStandardMaterial({
      map: t.map,
      normalMap: t.normalMap,
      roughnessMap: t.roughnessMap,
      roughness: 1,
      metalness: 0,
      normalScale: new THREE.Vector2(0.9, 0.9),
    });
    this.addMesh(geometry, material, false, true);
  }

  private buildRoof(width: number, depth: number): void {
    const H = this.wallHeight;
    const t = this.textures.corrugated;
    const ceiling = new THREE.PlaneGeometry(width, depth);
    ceiling.rotateX(Math.PI / 2);
    ceiling.translate(width / 2, H, depth / 2);
    worldUV(ceiling, 2);
    this.addMesh(
      ceiling,
      new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, color: 0x9a9a9a, metalness: 0.35 }),
      false,
      true,
    );

    const steel: THREE.BufferGeometry[] = [];
    for (let x = 6; x < width; x += 6) {
      const top = new THREE.BoxGeometry(0.26, 0.03, depth);
      top.translate(x, H - 0.015, depth / 2);
      const web = new THREE.BoxGeometry(0.025, 0.34, depth);
      web.translate(x, H - 0.2, depth / 2);
      const bottom = new THREE.BoxGeometry(0.26, 0.03, depth);
      bottom.translate(x, H - 0.385, depth / 2);
      steel.push(top, web, bottom);
    }
    for (let z = 4; z < depth; z += 4) {
      const purlin = new THREE.BoxGeometry(width, 0.07, 0.08);
      purlin.translate(width / 2, H - 0.07, z);
      steel.push(purlin);
    }
    this.addMesh(merge(steel), new THREE.MeshStandardMaterial({ color: 0x33383d, metalness: 0.6, roughness: 0.55 }), false, true);

    const skylightMaterial = new THREE.MeshBasicMaterial({ color: 0x24313d });
    for (const [x, z] of [[21, 12], [33, 24]] as const) {
      const pane = new THREE.PlaneGeometry(3.6, 7);
      pane.rotateX(Math.PI / 2);
      pane.translate(x, H - 0.01, z);
      this.addMesh(pane, skylightMaterial, false, false);
    }
  }

  private buildWalls(collision: CollisionWorld): void {
    const H = this.wallHeight;
    const cs = this.cs;
    const doorH = WORLD.doorHeight;
    const shade = [[0, 0.42], [0.3, 0.68], [1.5, 1], [4.5, 0.94], [6, 0.66]] as const;
    const geometries: THREE.BufferGeometry[] = [];
    const visited = new Uint8Array(this.cols * this.rows);

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.cell(c, r) !== 'wall' || visited[r * this.cols + c]) continue;
        let w = 1;
        while (c + w < this.cols && this.cell(c + w, r) === 'wall' && !visited[r * this.cols + c + w]) w++;
        let h = 1;
        grow: while (r + h < this.rows) {
          for (let k = 0; k < w; k++) {
            if (this.cell(c + k, r + h) !== 'wall' || visited[(r + h) * this.cols + c + k]) break grow;
          }
          h++;
        }
        for (let rr = r; rr < r + h; rr++) for (let cc = c; cc < c + w; cc++) visited[rr * this.cols + cc] = 1;

        const sx = w * cs;
        const sz = h * cs;
        const cx = c * cs + sx / 2;
        const cz = r * cs + sz / 2;
        const box = new THREE.BoxGeometry(sx, H, sz, 1, 4, 1);
        box.translate(cx, H / 2, cz);
        geometries.push(verticalShade(worldUV(box, 2), shade));
        collision.addBox(cx, H / 2, cz, sx / 2, H / 2, sz / 2, 0, 'brick');
      }
    }

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.cell(c, r) !== 'door') continue;
        const center = this.cellCenter(c, r);
        const lintelH = H - doorH;
        const lintel = new THREE.BoxGeometry(cs, lintelH, cs, 1, 2, 1);
        lintel.translate(center.x, doorH + lintelH / 2, center.z);
        geometries.push(verticalShade(worldUV(lintel, 2), shade));
        collision.addBox(center.x, doorH + lintelH / 2, center.z, cs / 2, lintelH / 2, cs / 2, 0, 'brick');
      }
    }

    const t = this.textures.brick;
    this.addMesh(
      merge(geometries),
      new THREE.MeshStandardMaterial({
        map: t.map,
        normalMap: t.normalMap,
        roughnessMap: t.roughnessMap,
        roughness: 1,
        metalness: 0,
        vertexColors: true,
      }),
      true,
      true,
    );
  }

  private buildCrates(collision: CollisionWorld): void {
    const rng = this.rng;
    const t = this.textures.crate;
    const perVariant: THREE.Matrix4[][] = t.variants.map(() => []);
    const quaternion = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);

    const place = (x: number, y: number, z: number, size: number, yaw: number): void => {
      quaternion.setFromAxisAngle(yAxis, yaw);
      const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), quaternion, new THREE.Vector3(size, size, size));
      perVariant[rng.int(0, perVariant.length - 1)].push(matrix);
      collision.addBox(x, y, z, size / 2, size / 2, size / 2, yaw, 'crate');
    };

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const kind = this.cell(c, r);
        const center = this.cellCenter(c, r);
        if (kind === 'crate') {
          const base = rng.range(1.45, 1.6);
          let x = center.x + rng.range(-0.12, 0.12);
          let z = center.z + rng.range(-0.12, 0.12);
          place(x, base / 2, z, base, rng.range(-0.15, 0.15));
          let top = base;
          let below = base;
          if (rng.chance(0.72)) {
            const size = rng.range(1.05, 1.3);
            const slack = (below - size) * 0.4;
            x += rng.range(-slack, slack);
            z += rng.range(-slack, slack);
            place(x, top + size / 2, z, size, rng.range(-0.3, 0.3));
            top += size;
            below = size;
            if (rng.chance(0.4)) {
              const small = rng.range(0.75, 0.95);
              const s2 = (below - small) * 0.4;
              place(x + rng.range(-s2, s2), top + small / 2, z + rng.range(-s2, s2), small, rng.range(-0.4, 0.4));
            }
          }
        } else if (kind === 'lowCrate') {
          const size = rng.range(1.05, 1.15);
          const alongX = rng.chance(0.5);
          const side = rng.sign();
          const ox = alongX ? -0.32 * side : rng.range(-0.1, 0.1);
          const oz = alongX ? rng.range(-0.1, 0.1) : -0.32 * side;
          place(center.x + ox, size / 2, center.z + oz, size, rng.range(-0.12, 0.12));
          if (rng.chance(0.6)) {
            const small = rng.range(0.5, 0.6);
            const sx = alongX ? 0.62 * side : rng.range(-0.3, 0.3);
            const sz = alongX ? rng.range(-0.3, 0.3) : 0.62 * side;
            place(center.x + sx, small / 2, center.z + sz, small, rng.range(-0.5, 0.5));
          }
        }
      }
    }

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    perVariant.forEach((matrices, index) => {
      if (matrices.length === 0) return;
      const material = new THREE.MeshStandardMaterial({
        map: t.variants[index],
        normalMap: t.normalMap,
        roughnessMap: t.ormMap,
        metalnessMap: t.ormMap,
        roughness: 1,
        metalness: 1,
      });
      const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
      matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
    });
  }

  private buildBarrels(collision: CollisionWorld): void {
    const rng = this.rng;
    const radius = 0.3;
    const height = 0.88;
    const profile = [
      [0, 0], [0.275, 0], [0.29, 0.015], [0.29, 0.28], [0.302, 0.292], [0.302, 0.308], [0.29, 0.32],
      [0.29, 0.56], [0.302, 0.572], [0.302, 0.588], [0.29, 0.6], [0.29, 0.865], [0.278, 0.88], [0.255, 0.872], [0, 0.872],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const geometry = new THREE.LatheGeometry(profile, 22);
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 2);

    const palette = [0x1f3f78, 0x8a2a1c, 0x232528, 0xb08a1c, 0x2f4a33].map((hex) => new THREE.Color(hex));
    const matrices: THREE.Matrix4[] = [];
    const colors: THREE.Color[] = [];
    const up = new THREE.Matrix4();
    const rot = new THREE.Matrix4();
    const center = new THREE.Matrix4();

    const upright = (x: number, z: number): void => {
      matrices.push(new THREE.Matrix4().makeRotationY(rng.range(0, Math.PI * 2)).setPosition(x, 0, z));
      colors.push(rng.pick(palette));
      collision.addCylinder(x, height / 2, z, 1, radius, height / 2, 'metal');
    };
    const tipped = (x: number, z: number, alongX: boolean): void => {
      up.makeTranslation(0, -height / 2, 0);
      if (alongX) rot.makeRotationZ(Math.PI / 2);
      else rot.makeRotationX(Math.PI / 2);
      center.makeTranslation(x, radius, z);
      matrices.push(new THREE.Matrix4().multiplyMatrices(center, rot).multiply(up));
      colors.push(rng.pick(palette));
      collision.addCylinder(x, radius, z, alongX ? 0 : 2, radius, height / 2, 'metal');
    };

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.cell(c, r) !== 'barrels') continue;
        const p = this.cellCenter(c, r);
        const j = (): number => rng.range(-0.06, 0.06);
        if (rng.chance(0.5)) {
          upright(p.x - 0.45 + j(), p.z - 0.45 + j());
          upright(p.x + 0.22 + j(), p.z - 0.5 + j());
          upright(p.x - 0.4 + j(), p.z + 0.22 + j());
          if (rng.chance(0.6)) upright(p.x + 0.32 + j(), p.z + 0.28 + j());
        } else {
          upright(p.x - 0.5 + j(), p.z - 0.5 + j());
          upright(p.x + 0.15 + j(), p.z - 0.55 + j());
          tipped(p.x - 0.1, p.z + 0.48, true);
        }
      }
    }

    const t = this.textures.paintedMetal;
    const material = new THREE.MeshStandardMaterial({
      map: t.map,
      normalMap: t.normalMap,
      roughnessMap: t.ormMap,
      metalnessMap: t.ormMap,
      roughness: 1,
      metalness: 1,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, colors[i]);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    this.scene.add(mesh);
  }

  private buildBarriers(collision: CollisionWorld): void {
    const profile = new THREE.Shape(
      [
        [-0.3, 0], [0.3, 0], [0.3, 0.075], [0.19, 0.3], [0.085, 0.81], [-0.085, 0.81], [-0.19, 0.3], [-0.3, 0.075],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
    );
    const geometries: THREE.BufferGeometry[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.cell(c, r) !== 'barrier') continue;
        const p = this.cellCenter(c, r);
        const vertical = this.cell(c, r - 1) === 'barrier' || this.cell(c, r + 1) === 'barrier';
        const horizontal = this.cell(c - 1, r) === 'barrier' || this.cell(c + 1, r) === 'barrier';
        const alongX = horizontal || !vertical;
        const geometry = new THREE.ExtrudeGeometry(profile, { depth: 1.9, bevelEnabled: false, steps: 1 });
        geometry.translate(0, 0, -0.95);
        if (alongX) geometry.rotateY(Math.PI / 2);
        geometry.translate(p.x, 0, p.z);
        geometries.push(verticalShade(worldUV(geometry, 2), [[0, 0.55], [0.25, 1], [0.81, 1]]));
        collision.addBox(p.x, 0.405, p.z, alongX ? 0.95 : 0.3, 0.405, alongX ? 0.3 : 0.95, 0, 'concrete');
      }
    }
    if (geometries.length === 0) return;
    const t = this.textures.concrete;
    this.addMesh(
      merge(geometries),
      new THREE.MeshStandardMaterial({
        map: t.map,
        normalMap: t.normalMap,
        roughnessMap: t.roughnessMap,
        color: 0xc9c4b8,
        roughness: 1,
        vertexColors: true,
      }),
      true,
      true,
    );
  }

  private buildColumns(collision: CollisionWorld): void {
    const H = this.wallHeight;
    const steel: THREE.BufferGeometry[] = [];
    const sleeves: THREE.BufferGeometry[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.cell(c, r) !== 'column') continue;
        const p = this.cellCenter(c, r);
        for (const dz of [-0.17, 0.17]) {
          const flange = new THREE.BoxGeometry(0.36, H, 0.035, 1, 3, 1);
          flange.translate(p.x, H / 2, p.z + dz);
          steel.push(worldUV(flange, 1.5));
        }
        const web = new THREE.BoxGeometry(0.03, H, 0.31, 1, 3, 1);
        web.translate(p.x, H / 2, p.z);
        steel.push(worldUV(web, 1.5));
        const sleeve = new THREE.BoxGeometry(0.5, 1.3, 0.5);
        sleeve.translate(p.x, 0.65, p.z);
        sleeves.push(worldUV(sleeve, 0.7));
        collision.addBox(p.x, H / 2, p.z, 0.25, H / 2, 0.25, 0, 'metal');
      }
    }
    if (steel.length === 0) return;
    const t = this.textures.paintedMetal;
    this.addMesh(
      merge(steel),
      new THREE.MeshStandardMaterial({
        map: t.map,
        normalMap: t.normalMap,
        roughnessMap: t.ormMap,
        metalnessMap: t.ormMap,
        color: 0x59604f,
        roughness: 1,
        metalness: 1,
      }),
      true,
      true,
    );
    this.addMesh(merge(sleeves), new THREE.MeshStandardMaterial({ map: this.textures.hazard, roughness: 0.7 }), true, true);
  }

  private buildPipes(width: number, depth: number): void {
    const H = this.wallHeight;
    const rng = this.rng;
    type PipeColor = 'red' | 'grey' | 'yellow' | 'green';
    const buckets: Record<PipeColor | 'hardware', THREE.BufferGeometry[]> = { red: [], grey: [], yellow: [], green: [], hardware: [] };
    const runs: { axis: 'x' | 'z'; at: number; y: number; r: number; color: PipeColor }[] = [
      { axis: 'x', at: 3.0, y: 5.32, r: 0.16, color: 'red' },
      { axis: 'x', at: 3.45, y: 5.4, r: 0.1, color: 'grey' },
      { axis: 'x', at: 3.8, y: 5.45, r: 0.07, color: 'yellow' },
      { axis: 'x', at: 23.2, y: 5.25, r: 0.13, color: 'green' },
      { axis: 'x', at: 23.6, y: 5.3, r: 0.09, color: 'grey' },
      { axis: 'z', at: 29.6, y: 4.95, r: 0.12, color: 'grey' },
      { axis: 'z', at: 29.2, y: 5.0, r: 0.08, color: 'yellow' },
    ];

    for (const run of runs) {
      const length = run.axis === 'x' ? width : depth;
      const at = (s: number): THREE.Vector3 =>
        run.axis === 'x' ? new THREE.Vector3(s, run.y, run.at) : new THREE.Vector3(run.at, run.y, s);
      buckets[run.color].push(cylinderBetween(at(0.05), at(length - 0.05), run.r, 14, true, 1.5));
      for (let s = 3; s < length - 1; s += 6) {
        buckets[run.color].push(cylinderBetween(at(s - 0.025), at(s + 0.025), run.r * 1.38, 14, false, 1));
      }
      for (let s = 1.5; s < length; s += 3) {
        const p = at(s);
        buckets.hardware.push(cylinderBetween(new THREE.Vector3(p.x, p.y + run.r, p.z), new THREE.Vector3(p.x, H, p.z), 0.011, 5, false, 1));
        const strap = new THREE.TorusGeometry(run.r + 0.012, 0.009, 4, 12, Math.PI);
        strap.rotateZ(Math.PI);
        if (run.axis === 'x') strap.rotateY(Math.PI / 2);
        strap.translate(p.x, p.y, p.z);
        buckets.hardware.push(strap);
      }
    }

    // Fire-riser stations bolted to interior wall faces, each with a gate valve.
    const candidates: { x: number; z: number; nx: number; nz: number }[] = [];
    for (let r = 1; r < this.rows - 1; r++) {
      for (let c = 1; c < this.cols - 1; c++) {
        if (this.cell(c, r) !== 'wall') continue;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          if (this.cell(c + dc, r + dr) !== 'floor') continue;
          if (this.cell(c + dr, r + dc) === 'door' || this.cell(c - dr, r - dc) === 'door') continue;
          const center = this.cellCenter(c, r);
          candidates.push({
            x: center.x + dc * (this.cs / 2 + 0.17),
            z: center.z + dr * (this.cs / 2 + 0.17),
            nx: dc,
            nz: dr,
          });
        }
      }
    }
    for (let i = 0; i < 4 && candidates.length > 0; i++) {
      const spot = candidates.splice(rng.int(0, candidates.length - 1), 1)[0];
      const base = new THREE.Vector3(spot.x, 0.05, spot.z);
      const top = new THREE.Vector3(spot.x, H, spot.z);
      buckets.red.push(cylinderBetween(base, top, 0.075, 12, false, 1.5));
      buckets.red.push(cylinderBetween(new THREE.Vector3(spot.x, 0.35, spot.z), new THREE.Vector3(spot.x, 0.4, spot.z), 0.105, 12, false, 1));
      const valveY = 1.35;
      const stemOut = new THREE.Vector3(spot.x + spot.nx * 0.2, valveY, spot.z + spot.nz * 0.2);
      buckets.hardware.push(cylinderBetween(new THREE.Vector3(spot.x, valveY, spot.z), stemOut, 0.014, 6, false, 1));
      const wheel = new THREE.TorusGeometry(0.15, 0.016, 6, 20);
      if (spot.nx !== 0) wheel.rotateY(Math.PI / 2);
      wheel.translate(stemOut.x, stemOut.y, stemOut.z);
      buckets.red.push(wheel);
      for (const angle of [0, Math.PI / 2]) {
        const spoke = new THREE.BoxGeometry(0.29, 0.016, 0.016);
        spoke.rotateZ(angle);
        if (spot.nx !== 0) spoke.rotateY(Math.PI / 2);
        spoke.translate(stemOut.x, stemOut.y, stemOut.z);
        buckets.red.push(spoke);
      }
    }

    const t = this.textures.paintedMetal;
    const colors: Record<PipeColor | 'hardware', number> = { red: 0x8c1f17, grey: 0x6d7378, yellow: 0xb08a1c, green: 0x2f5a3a, hardware: 0x2c3034 };
    for (const key of Object.keys(buckets) as (PipeColor | 'hardware')[]) {
      const list = buckets[key];
      if (list.length === 0) continue;
      this.addMesh(
        merge(list),
        new THREE.MeshStandardMaterial({
          color: colors[key],
          map: t.map,
          normalMap: t.normalMap,
          roughnessMap: t.ormMap,
          metalnessMap: t.ormMap,
          roughness: 1,
          metalness: 1,
        }),
        false,
        true,
      );
    }
  }

  private buildLamps(): void {
    const H = this.wallHeight;
    const housings: THREE.BufferGeometry[] = [];
    const dustPositions: number[] = [];
    const dustPhase: number[] = [];
    const dustLamp: number[] = [];
    const coneGeometry = new THREE.CylinderGeometry(0.36, 2.9, HANG_Y - 0.3, 28, 1, true);
    coneGeometry.translate(0, -(HANG_Y - 0.3) / 2, 0);

    LAMPS.forEach((spec, index) => {
      const p = this.cellCenter(spec.col, spec.row);
      housings.push(cylinderBetween(new THREE.Vector3(p.x, HANG_Y + 0.3, p.z), new THREE.Vector3(p.x, H, p.z), 0.012, 6, false, 1));
      const shade = new THREE.CylinderGeometry(0.13, 0.44, 0.3, 22, 1, true);
      shade.translate(p.x, HANG_Y + 0.15, p.z);
      housings.push(shade);
      const cap = new THREE.CylinderGeometry(0.1, 0.13, 0.08, 14);
      cap.translate(p.x, HANG_Y + 0.33, p.z);
      housings.push(cap);

      const bulbMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0xffd9a0, emissiveIntensity: BULB_EMISSIVE });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), bulbMaterial);
      bulb.position.set(p.x, HANG_Y + 0.07, p.z);
      this.scene.add(bulb);

      const light = new THREE.SpotLight(LAMP_COLOR, LAMP_INTENSITY, 17, 0.92, 0.6, 2);
      light.position.set(p.x, HANG_Y, p.z);
      light.target.position.set(p.x, 0, p.z);
      light.layers.enableAll();
      if (spec.shadow) {
        light.castShadow = true;
        light.shadow.mapSize.set(512, 512);
        light.shadow.camera.near = 0.3;
        light.shadow.camera.far = 12;
        light.shadow.bias = -0.0005;
        light.shadow.normalBias = 0.035;
        light.shadow.radius = 4;
        light.shadow.autoUpdate = false;
        light.shadow.needsUpdate = true;
      }
      this.scene.add(light, light.target);

      const coneMaterial = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(1, 0.84, 0.62) }, uIntensity: { value: CONE_INTENSITY } },
        vertexShader: LIGHT_CONE_VERTEX,
        fragmentShader: LIGHT_CONE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const cone = new THREE.Mesh(coneGeometry, coneMaterial);
      cone.position.set(p.x, HANG_Y, p.z);
      cone.renderOrder = 2;
      this.scene.add(cone);

      for (let i = 0; i < 70; i++) {
        const y = this.rng.range(0.4, HANG_Y - 0.3);
        const coneRadius = 0.36 + (2.9 - 0.36) * ((HANG_Y - y) / (HANG_Y - 0.3));
        const angle = this.rng.range(0, Math.PI * 2);
        const radius = Math.sqrt(this.rng.next()) * coneRadius * 0.8;
        dustPositions.push(p.x + Math.cos(angle) * radius, y, p.z + Math.sin(angle) * radius);
        dustPhase.push(this.rng.next());
        dustLamp.push(index);
      }

      this.lamps.push({
        light,
        bulb: bulbMaterial,
        cone: coneMaterial,
        baseIntensity: LAMP_INTENSITY,
        flicker: spec.flicker,
        level: 1,
        timer: 0,
      });
    });

    this.addMesh(
      merge(housings),
      new THREE.MeshStandardMaterial({ color: 0x2c3a2e, metalness: 0.5, roughness: 0.45, side: THREE.DoubleSide }),
      false,
      false,
    );

    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dustPositions, 3));
    dustGeometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(dustPhase, 1));
    dustGeometry.setAttribute('aLamp', new THREE.Float32BufferAttribute(dustLamp, 1));
    this.dust = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: 400 }, uLamp: { value: LAMPS.map(() => 1) } },
      vertexShader: DUST_VERTEX,
      fragmentShader: DUST_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dust = new THREE.Points(dustGeometry, this.dust);
    dust.frustumCulled = false;
    dust.renderOrder = 3;
    this.scene.add(dust);
  }

  private buildExitSigns(): void {
    const signMaterial = new THREE.MeshBasicMaterial({ map: this.textures.exitSign, color: new THREE.Color(1.5, 1.5, 1.5) });
    const backingMaterial = new THREE.MeshStandardMaterial({ color: 0x1b1d1f, roughness: 0.6 });
    const glowMaterial = new THREE.MeshBasicMaterial({
      map: this.textures.softGlow,
      color: 0x2bff8a,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const y = WORLD.doorHeight + 0.3;
    for (const spec of EXIT_SIGNS) {
      if (this.cell(spec.col, spec.row) !== 'door') continue;
      const center = this.cellCenter(spec.col, spec.row);
      const wallAlongZ = this.cell(spec.col, spec.row - 1) === 'wall' && this.cell(spec.col, spec.row + 1) === 'wall';
      let nx = 0;
      let nz = 0;
      if (wallAlongZ) nx = this.cell(spec.col + 1, spec.row) !== 'wall' ? 1 : -1;
      else nz = this.cell(spec.col, spec.row + 1) !== 'wall' ? 1 : -1;
      const yaw = Math.atan2(nx, nz);
      const face = new THREE.Vector3(center.x + nx * (this.cs / 2), y, center.z + nz * (this.cs / 2));

      const group = new THREE.Group();
      group.position.copy(face);
      group.rotation.y = yaw;
      const backing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.38, 0.05), backingMaterial);
      backing.position.z = 0.025;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.31), signMaterial);
      sign.position.z = 0.052;
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.75), glowMaterial);
      glow.position.z = 0.06;
      group.add(backing, sign, glow);
      this.scene.add(group);
    }
  }

  private buildFloorMarkings(): void {
    const rng = this.rng;
    const strips: THREE.BufferGeometry[] = [];
    const addStrip = (x0: number, z0: number, x1: number, z1: number): void => {
      const length = Math.hypot(x1 - x0, z1 - z0);
      const strip = new THREE.PlaneGeometry(0.1, length);
      const uv = strip.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (length / 2));
      strip.rotateX(-Math.PI / 2);
      strip.rotateY(Math.atan2(x1 - x0, z1 - z0));
      strip.translate((x0 + x1) / 2, 0.004, (z0 + z1) / 2);
      strips.push(strip);
    };
    addStrip(14.6, 2.6, 41.4, 2.6);
    addStrip(14.6, 33.4, 41.4, 33.4);
    addStrip(14.6, 2.6, 14.6, 33.4);
    addStrip(41.4, 2.6, 41.4, 33.4);
    addStrip(22.4, 6.3, 22.4, 29.6);
    addStrip(33.6, 6.3, 33.6, 29.6);
    this.addMesh(
      merge(strips),
      new THREE.MeshStandardMaterial({
        map: this.textures.safetyPaint,
        alphaTest: 0.5,
        roughness: 0.55,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
      false,
      true,
    );

    const floorCells: number[] = [];
    this.cells.forEach((kind, i) => {
      if (kind === 'floor') floorCells.push(i);
    });
    const count = 22;
    const stainGeometry = new THREE.PlaneGeometry(1, 1);
    stainGeometry.rotateX(-Math.PI / 2);
    const stains = new THREE.InstancedMesh(
      stainGeometry,
      new THREE.MeshStandardMaterial({
        map: this.textures.oilStain,
        transparent: true,
        depthWrite: false,
        roughness: 0.22,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      count,
    );
    const q = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      const cellIndex = rng.pick(floorCells);
      const c = cellIndex % this.cols;
      const r = Math.floor(cellIndex / this.cols);
      const p = this.cellCenter(c, r);
      const size = rng.range(0.9, 2.8);
      q.setFromAxisAngle(yAxis, rng.range(0, Math.PI * 2));
      stains.setMatrixAt(
        i,
        new THREE.Matrix4().compose(
          new THREE.Vector3(p.x + rng.range(-0.6, 0.6), 0.002 + i * 0.0002, p.z + rng.range(-0.6, 0.6)),
          q,
          new THREE.Vector3(size, 1, size * rng.range(0.7, 1.2)),
        ),
      );
    }
    stains.instanceMatrix.needsUpdate = true;
    stains.receiveShadow = true;
    stains.computeBoundingSphere();
    stains.renderOrder = 1;
    this.scene.add(stains);
  }
}
