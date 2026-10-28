import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Builds one merged, vertex-coloured geometry from many primitives (one draw call per body part). */
class ColoredBuilder {
  private readonly parts: THREE.BufferGeometry[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();

  add(geometry: THREE.BufferGeometry, color: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): this {
    this.euler.set(rx, ry, rz);
    this.quaternion.setFromEuler(this.euler);
    this.matrix.compose(new THREE.Vector3(x, y, z), this.quaternion, new THREE.Vector3(sx, sy, sz));
    geometry.applyMatrix4(this.matrix);
    this.push(geometry, color);
    return this;
  }

  limb(a: THREE.Vector3, b: THREE.Vector3, radius: number, color: number): this {
    const dir = new THREE.Vector3().subVectors(b, a);
    const geometry = new THREE.CapsuleGeometry(radius, Math.max(0.001, dir.length()), 3, 10);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
    geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    this.push(geometry, color);
    return this;
  }

  build(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.parts, false);
    if (!merged) throw new Error('Enemy geometry merge failed');
    for (const p of this.parts) p.dispose();
    merged.computeBoundingSphere();
    return merged;
  }

  private push(geometry: THREE.BufferGeometry, hex: number): void {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    const color = new THREE.Color(hex);
    const count = flat.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.push(flat);
  }
}

const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

const C = {
  fabric: 0x3b4033,
  fabricDark: 0x2b2f26,
  armor: 0x1e2124,
  pouch: 0x454536,
  boots: 0x151515,
  gloves: 0x24211e,
  helmet: 0x30352d,
  balaclava: 0x1b1c1e,
  gun: 0x161718,
  gunMetal: 0x2b2d30,
  pad: 0x262829,
  droneBody: 0x2d3136,
  droneDark: 0x18191b,
  droneAccent: 0xc8641e,
} as const;

interface SoldierGeometry {
  readonly leg: THREE.BufferGeometry;
  readonly torso: THREE.BufferGeometry;
  readonly arms: THREE.BufferGeometry;
  readonly visor: THREE.BufferGeometry;
}

interface DroneGeometry {
  readonly body: THREE.BufferGeometry;
  readonly rotor: THREE.BufferGeometry;
  readonly eye: THREE.BufferGeometry;
}

let soldierGeometry: SoldierGeometry | null = null;
let droneGeometry: DroneGeometry | null = null;

function buildSoldierGeometry(): SoldierGeometry {
  const leg = new ColoredBuilder()
    .limb(V(0, 0, 0), V(0, -0.42, 0.02), 0.085, C.fabric)
    .add(new THREE.BoxGeometry(0.1, 0.11, 0.06), C.pad, 0, -0.44, 0.085)
    .limb(V(0, -0.44, 0.02), V(0, -0.82, -0.01), 0.068, C.fabric)
    .add(new THREE.BoxGeometry(0.12, 0.11, 0.27), C.boots, 0, -0.87, 0.04)
    .build();

  const torso = new ColoredBuilder()
    .add(new THREE.BoxGeometry(0.34, 0.17, 0.21), C.fabricDark, 0, 0.02, 0)
    .add(new THREE.BoxGeometry(0.38, 0.44, 0.22), C.fabric, 0, 0.31, 0)
    .add(new THREE.BoxGeometry(0.43, 0.36, 0.29), C.armor, 0, 0.34, 0.005)
    .add(new THREE.BoxGeometry(0.09, 0.12, 0.06), C.pouch, -0.12, 0.25, 0.17)
    .add(new THREE.BoxGeometry(0.09, 0.12, 0.06), C.pouch, 0, 0.25, 0.17)
    .add(new THREE.BoxGeometry(0.09, 0.12, 0.06), C.pouch, 0.12, 0.25, 0.17)
    .add(new THREE.BoxGeometry(0.07, 0.16, 0.08), C.pouch, -0.24, 0.3, 0.02)
    .add(new THREE.BoxGeometry(0.3, 0.36, 0.13), C.fabricDark, 0, 0.36, -0.2)
    .add(new THREE.SphereGeometry(0.08, 10, 8), C.fabric, -0.225, 0.5, 0)
    .add(new THREE.SphereGeometry(0.08, 10, 8), C.fabric, 0.225, 0.5, 0)
    .add(new THREE.CylinderGeometry(0.055, 0.06, 0.1, 10), C.balaclava, 0, 0.6, 0)
    .add(new THREE.SphereGeometry(0.108, 14, 12), C.balaclava, 0, 0.715, 0.005)
    .add(new THREE.SphereGeometry(0.132, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), C.helmet, 0, 0.73, -0.005, 0, 0, 0, 1, 0.85, 1)
    .add(new THREE.BoxGeometry(0.05, 0.04, 0.03), C.gunMetal, 0, 0.79, 0.12)
    .add(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 10), C.armor, -0.115, 0.705, 0, 0, 0, Math.PI / 2)
    .add(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 10), C.armor, 0.115, 0.705, 0, 0, 0, Math.PI / 2)
    .build();

  const arms = new ColoredBuilder()
    .limb(V(0.22, 0, 0), V(0.2, -0.24, 0.1), 0.058, C.fabric)
    .limb(V(0.2, -0.24, 0.1), V(0.08, -0.15, 0.33), 0.05, C.fabric)
    .add(new THREE.SphereGeometry(0.046, 8, 6), C.gloves, 0.08, -0.15, 0.35)
    .limb(V(-0.22, 0, 0), V(-0.19, -0.22, 0.16), 0.058, C.fabric)
    .limb(V(-0.19, -0.22, 0.16), V(-0.02, -0.12, 0.5), 0.05, C.fabric)
    .add(new THREE.SphereGeometry(0.046, 8, 6), C.gloves, -0.01, -0.12, 0.52)
    .add(new THREE.BoxGeometry(0.05, 0.075, 0.3), C.gun, 0.03, -0.1, 0.42)
    .add(new THREE.BoxGeometry(0.045, 0.05, 0.22), C.gun, 0.03, -0.095, 0.66)
    .add(new THREE.CylinderGeometry(0.011, 0.011, 0.2, 8), C.gunMetal, 0.03, -0.09, 0.86, Math.PI / 2)
    .add(new THREE.BoxGeometry(0.03, 0.13, 0.06), C.gun, 0.03, -0.18, 0.38, 0.2)
    .add(new THREE.BoxGeometry(0.045, 0.09, 0.2), C.gun, 0.03, -0.11, 0.18)
    .add(new THREE.BoxGeometry(0.035, 0.04, 0.08), C.gunMetal, 0.03, -0.04, 0.42)
    .build();

  const visor = new THREE.BoxGeometry(0.17, 0.034, 0.03);
  visor.translate(0, 0.722, 0.1);
  return { leg, torso, arms, visor };
}

function buildDroneGeometry(): DroneGeometry {
  const builder = new ColoredBuilder()
    .add(new THREE.SphereGeometry(0.26, 18, 12), C.droneBody, 0, 0, 0, 0, 0, 0, 1, 0.48, 1.18)
    .add(new THREE.SphereGeometry(0.17, 14, 10), C.droneDark, 0, 0.08, -0.02, 0, 0, 0, 1, 0.5, 1.2)
    .add(new THREE.BoxGeometry(0.92, 0.035, 0.06), C.droneDark, 0, 0.02, 0, 0, Math.PI / 4)
    .add(new THREE.BoxGeometry(0.92, 0.035, 0.06), C.droneDark, 0, 0.02, 0, 0, -Math.PI / 4)
    .add(new THREE.CylinderGeometry(0.075, 0.075, 0.07, 14), C.droneDark, 0, -0.03, 0.26, Math.PI / 2)
    .add(new THREE.BoxGeometry(0.06, 0.05, 0.14), C.droneDark, 0, -0.11, 0.04)
    .add(new THREE.CylinderGeometry(0.018, 0.018, 0.26, 8), C.droneBody, 0, -0.13, 0.15, Math.PI / 2)
    .add(new THREE.BoxGeometry(0.02, 0.02, 0.42), C.droneDark, -0.14, -0.21, 0)
    .add(new THREE.BoxGeometry(0.02, 0.02, 0.42), C.droneDark, 0.14, -0.21, 0)
    .add(new THREE.BoxGeometry(0.02, 0.1, 0.02), C.droneDark, -0.12, -0.16, 0.1)
    .add(new THREE.BoxGeometry(0.02, 0.1, 0.02), C.droneDark, 0.12, -0.16, 0.1)
    .add(new THREE.BoxGeometry(0.02, 0.1, 0.02), C.droneDark, -0.12, -0.16, -0.1)
    .add(new THREE.BoxGeometry(0.02, 0.1, 0.02), C.droneDark, 0.12, -0.16, -0.1)
    .add(new THREE.BoxGeometry(0.2, 0.012, 0.05), C.droneAccent, 0, 0.03, -0.27);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      builder
        .add(new THREE.CylinderGeometry(0.045, 0.05, 0.07, 12), C.droneAccent, sx * 0.32, 0.03, sz * 0.32)
        .add(new THREE.TorusGeometry(0.165, 0.011, 6, 26), C.droneDark, sx * 0.32, 0.06, sz * 0.32, Math.PI / 2);
    }
  }
  const body = builder.build();

  const rotor = new ColoredBuilder()
    .add(new THREE.BoxGeometry(0.29, 0.006, 0.03), C.droneDark, 0, 0, 0)
    .add(new THREE.CylinderGeometry(0.02, 0.02, 0.025, 8), C.droneBody, 0, 0, 0)
    .build();

  const eye = new THREE.SphereGeometry(0.052, 14, 10);
  eye.translate(0, -0.03, 0.3);
  return { body, rotor, eye };
}

export interface SoldierRig {
  readonly root: THREE.Group;
  /** Pivot at the feet; rotated as a whole for the death fall. */
  readonly body: THREE.Group;
  readonly torso: THREE.Group;
  readonly legL: THREE.Group;
  readonly legR: THREE.Group;
  readonly arms: THREE.Group;
  readonly muzzle: THREE.Object3D;
  readonly bodyMaterial: THREE.MeshStandardMaterial;
  readonly visorMaterial: THREE.MeshStandardMaterial;
  readonly meshes: readonly THREE.Mesh[];
}

export interface DroneRig {
  readonly root: THREE.Group;
  /** Tilts into the direction of travel. */
  readonly body: THREE.Group;
  readonly rotors: readonly THREE.Mesh[];
  readonly muzzle: THREE.Object3D;
  readonly bodyMaterial: THREE.MeshStandardMaterial;
  readonly eyeMaterial: THREE.MeshStandardMaterial;
  readonly meshes: readonly THREE.Mesh[];
}

/** OPFOR rifleman, ~1.8 m, model faces +Z. Geometry is shared; materials are per instance for hit flashes. */
export function createSoldierRig(): SoldierRig {
  soldierGeometry ??= buildSoldierGeometry();
  const g = soldierGeometry;
  const bodyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.08 });
  const visorMaterial = new THREE.MeshStandardMaterial({ color: 0x120000, emissive: 0xff2a14, emissiveIntensity: 3.2, roughness: 0.3 });

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const legL = new THREE.Group();
  legL.position.set(-0.1, 0.92, 0);
  const legR = new THREE.Group();
  legR.position.set(0.1, 0.92, 0);
  const meshL = new THREE.Mesh(g.leg, bodyMaterial);
  const meshR = new THREE.Mesh(g.leg, bodyMaterial);
  legL.add(meshL);
  legR.add(meshR);

  const torso = new THREE.Group();
  torso.position.y = 0.92;
  const torsoMesh = new THREE.Mesh(g.torso, bodyMaterial);
  const visor = new THREE.Mesh(g.visor, visorMaterial);
  torso.add(torsoMesh, visor);

  const arms = new THREE.Group();
  arms.position.y = 0.5;
  const armsMesh = new THREE.Mesh(g.arms, bodyMaterial);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0.03, -0.09, 0.97);
  arms.add(armsMesh, muzzle);
  torso.add(arms);
  body.add(legL, legR, torso);

  const meshes = [meshL, meshR, torsoMesh, armsMesh, visor];
  for (const mesh of meshes) {
    mesh.castShadow = mesh !== visor;
    mesh.receiveShadow = true;
  }
  return { root, body, torso, legL, legR, arms, muzzle, bodyMaterial, visorMaterial, meshes };
}

/** Quadrotor target drone with an orange training livery and a red sensor eye, faces +Z. */
export function createDroneRig(): DroneRig {
  droneGeometry ??= buildDroneGeometry();
  const g = droneGeometry;
  const bodyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.55 });
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x140000, emissive: 0xff2414, emissiveIntensity: 3, roughness: 0.2 });

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hull = new THREE.Mesh(g.body, bodyMaterial);
  const eye = new THREE.Mesh(g.eye, eyeMaterial);
  body.add(hull, eye);
  const rotors: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const rotor = new THREE.Mesh(g.rotor, bodyMaterial);
      rotor.position.set(sx * 0.32, 0.075, sz * 0.32);
      rotor.rotation.y = Math.random() * Math.PI;
      body.add(rotor);
      rotors.push(rotor);
    }
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -0.13, 0.29);
  body.add(muzzle);
  const meshes = [hull, eye, ...rotors];
  for (const mesh of meshes) {
    mesh.castShadow = mesh !== eye;
    mesh.receiveShadow = true;
  }
  return { root, body, rotors, muzzle, bodyMaterial, eyeMaterial, meshes };
}
