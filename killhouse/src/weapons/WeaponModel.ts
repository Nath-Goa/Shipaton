import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TextureLibrary } from '../level/ProceduralTextures';

/** Render layer for the first-person rig, drawn in its own pass over a cleared depth buffer. */
export const VIEWMODEL_LAYER = 1;

type MaterialKey = 'steel' | 'receiver' | 'polymer' | 'tan' | 'glove' | 'sleeve' | 'brass' | 'lens' | 'emitter';

/** Collects transformed primitives per material and merges them into one mesh each. */
class PartBuilder {
  private readonly parts = new Map<MaterialKey, THREE.BufferGeometry[]>();
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly scale = new THREE.Vector3(1, 1, 1);
  private readonly position = new THREE.Vector3();

  add(key: MaterialKey, geometry: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
    this.euler.set(rx, ry, rz);
    this.quaternion.setFromEuler(this.euler);
    this.position.set(x, y, z);
    this.matrix.compose(this.position, this.quaternion, this.scale);
    geometry.applyMatrix4(this.matrix);
    const list = this.parts.get(key) ?? [];
    list.push(geometry.index ? geometry.toNonIndexed() : geometry);
    this.parts.set(key, list);
  }

  /** Box between two points along Z is common enough to deserve a helper. */
  box(key: MaterialKey, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
    this.add(key, new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
  }

  /** Cylinder lying along Z. */
  tube(key: MaterialKey, radius: number, length: number, x: number, y: number, z: number, segments = 14, open = false): void {
    this.add(key, new THREE.CylinderGeometry(radius, radius, length, segments, 1, open), x, y, z, Math.PI / 2, 0, 0);
  }

  /** Capsule limb from a to b. */
  limb(key: MaterialKey, a: THREE.Vector3, b: THREE.Vector3, radius: number): void {
    const dir = new THREE.Vector3().subVectors(b, a);
    const length = dir.length();
    const geometry = new THREE.CapsuleGeometry(radius, Math.max(0.001, length), 4, 10);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
    geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    const list = this.parts.get(key) ?? [];
    list.push(geometry.index ? geometry.toNonIndexed() : geometry);
    this.parts.set(key, list);
  }

  build(target: THREE.Object3D, materials: Record<MaterialKey, THREE.Material>): void {
    for (const [key, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      if (!merged) throw new Error(`Viewmodel merge failed for ${key}`);
      for (const g of list) g.dispose();
      const mesh = new THREE.Mesh(merged, materials[key]);
      mesh.frustumCulled = false;
      target.add(mesh);
    }
    this.parts.clear();
  }
}

/**
 * Procedurally modelled M4-pattern carbine with a red-dot optic, weapon light
 * and gloved hands, built from boxes, cylinders and capsules with PBR metals.
 * Coordinates are metres in the weapon's frame: -Z is down the barrel.
 */
export class WeaponModel {
  readonly root = new THREE.Group();
  /** Moves out and back during a reload. */
  readonly magazine = new THREE.Group();
  readonly chargingHandle = new THREE.Group();
  /** Support hand + forearm; follows the magazine during a reload. */
  readonly leftArm = new THREE.Group();
  readonly muzzle = new THREE.Object3D();
  readonly ejectionPort = new THREE.Object3D();
  readonly flash = new THREE.Group();
  /** Height of the optic's axis above the receiver origin; ADS centres this on screen. */
  readonly sightHeight = 0.0745;
  readonly sightZ = -0.03;
  readonly casingMaterial: THREE.MeshStandardMaterial;
  private readonly flashMaterial: THREE.MeshBasicMaterial;
  private readonly flashPlanes: THREE.Mesh[] = [];

  constructor(textures: TextureLibrary, envMap: THREE.Texture) {
    const wear = textures.gunWear;
    const metal = (color: number, metalness: number, roughness: number): THREE.MeshStandardMaterial =>
      new THREE.MeshStandardMaterial({ color, metalness, roughness, roughnessMap: wear, envMap, envMapIntensity: 0.3, fog: false });
    const matte = (color: number, roughness: number): THREE.MeshStandardMaterial =>
      new THREE.MeshStandardMaterial({ color, metalness: 0.02, roughness, envMap, envMapIntensity: 0.25, fog: false });

    this.casingMaterial = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 1, roughness: 0.28, envMap, envMapIntensity: 0.9, fog: false });
    const materials: Record<MaterialKey, THREE.Material> = {
      steel: metal(0x26292c, 0.9, 1.35),
      receiver: metal(0x2e3236, 0.7, 1.6),
      polymer: matte(0x17191b, 0.62),
      tan: matte(0x7d6a4f, 0.72),
      glove: matte(0x2a2724, 0.85),
      sleeve: matte(0x3b4131, 0.9),
      brass: this.casingMaterial,
      lens: new THREE.MeshStandardMaterial({
        color: 0x0e2a24,
        metalness: 1,
        roughness: 0.05,
        transparent: true,
        opacity: 0.22,
        envMap,
        envMapIntensity: 1.2,
        fog: false,
        depthWrite: false,
      }),
      emitter: new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff3dc, emissiveIntensity: 2.2, fog: false }),
    };

    const body = new PartBuilder();
    // Upper receiver, rail and teeth.
    body.box('receiver', 0.052, 0.058, 0.24, 0, 0, 0);
    body.box('receiver', 0.026, 0.01, 0.24, 0, 0.034, 0);
    for (let z = -0.105; z <= 0.105; z += 0.014) body.box('receiver', 0.032, 0.006, 0.007, 0, 0.041, z);
    body.box('steel', 0.004, 0.016, 0.05, 0.0275, 0.004, -0.005);
    body.tube('receiver', 0.008, 0.02, 0.033, 0.012, 0.055);
    // Lower receiver, mag well, trigger group, grip.
    body.box('receiver', 0.046, 0.05, 0.19, 0, -0.052, 0.012);
    body.box('receiver', 0.04, 0.04, 0.062, 0, -0.088, -0.045);
    body.box('steel', 0.006, 0.006, 0.07, 0, -0.1, 0.035);
    body.box('steel', 0.004, 0.022, 0.006, 0, -0.087, 0.028, 0.25);
    body.box('polymer', 0.032, 0.105, 0.042, 0, -0.118, 0.088, -0.32);
    // Buffer tube, stock, butt pad.
    body.tube('steel', 0.016, 0.17, 0, -0.008, 0.2);
    body.box('tan', 0.042, 0.072, 0.15, 0, -0.022, 0.272);
    body.box('tan', 0.03, 0.02, 0.1, 0, 0.022, 0.26);
    body.box('polymer', 0.044, 0.09, 0.022, 0, -0.03, 0.355);
    // Handguard with top rail, barrel, gas block, muzzle brake.
    body.add('receiver', new THREE.CylinderGeometry(0.031, 0.031, 0.27, 8), 0, -0.004, -0.255, Math.PI / 2, Math.PI / 8, 0);
    body.box('receiver', 0.024, 0.008, 0.27, 0, 0.03, -0.255);
    for (let z = -0.36; z <= -0.15; z += 0.042) {
      for (const side of [-1, 1]) body.box('polymer', 0.003, 0.008, 0.026, side * 0.0292, -0.004, z);
    }
    body.tube('steel', 0.0095, 0.2, 0, 0, -0.485);
    body.box('steel', 0.022, 0.026, 0.03, 0, 0.002, -0.402);
    body.tube('steel', 0.0145, 0.056, 0, 0, -0.606, 16);
    for (const side of [-1, 1]) body.box('polymer', 0.004, 0.008, 0.01, side * 0.0135, 0.004, -0.606);
    body.box('steel', 0.006, 0.03, 0.01, 0, 0.026, -0.385);
    // Red-dot optic on a riser mount.
    body.box('receiver', 0.03, 0.018, 0.044, 0, 0.047, this.sightZ);
    body.tube('steel', 0.022, 0.07, 0, this.sightHeight, this.sightZ, 22, true);
    body.add('steel', new THREE.TorusGeometry(0.022, 0.0035, 6, 22), 0, this.sightHeight, this.sightZ - 0.035);
    body.add('steel', new THREE.TorusGeometry(0.022, 0.0035, 6, 22), 0, this.sightHeight, this.sightZ + 0.035);
    body.box('steel', 0.012, 0.01, 0.014, 0.026, this.sightHeight, this.sightZ);
    body.add('lens', new THREE.CircleGeometry(0.0205, 24), 0, this.sightHeight, this.sightZ - 0.033);
    // Weapon light on the right rail.
    body.tube('steel', 0.013, 0.075, 0.042, -0.006, -0.315);
    body.box('steel', 0.012, 0.014, 0.03, 0.03, -0.006, -0.3);
    body.add('emitter', new THREE.CircleGeometry(0.0115, 16), 0.042, -0.006, -0.3528, Math.PI, 0, 0);
    // Right (firing) hand around the grip, trigger finger indexed, forearm out to the elbow.
    body.box('glove', 0.05, 0.06, 0.07, 0.008, -0.118, 0.092, -0.32);
    body.box('glove', 0.04, 0.018, 0.045, 0.012, -0.088, 0.045, 0.1);
    body.limb('sleeve', new THREE.Vector3(0.02, -0.14, 0.12), new THREE.Vector3(0.16, -0.27, 0.38), 0.036);
    body.limb('glove', new THREE.Vector3(0.012, -0.13, 0.11), new THREE.Vector3(0.04, -0.16, 0.16), 0.03);
    body.build(this.root, materials);

    const mag = new PartBuilder();
    mag.box('tan', 0.026, 0.07, 0.062, 0, -0.035, 0, 0.05);
    mag.box('tan', 0.026, 0.068, 0.062, 0, -0.098, -0.008, 0.16);
    mag.box('tan', 0.026, 0.05, 0.064, 0, -0.152, -0.021, 0.28);
    mag.box('polymer', 0.031, 0.013, 0.07, 0, -0.18, -0.03, 0.3);
    for (let y = -0.03; y >= -0.12; y -= 0.03) mag.box('polymer', 0.028, 0.004, 0.05, 0, y, -0.004 + y * 0.1, 0.1);
    mag.build(this.magazine, materials);
    this.magazine.position.set(0, -0.095, -0.045);
    this.root.add(this.magazine);

    const handle = new PartBuilder();
    handle.box('steel', 0.03, 0.008, 0.022, 0, 0, 0);
    handle.box('steel', 0.05, 0.008, 0.01, 0, 0, 0.012);
    handle.build(this.chargingHandle, materials);
    this.chargingHandle.position.set(0, 0.023, 0.124);
    this.root.add(this.chargingHandle);

    const left = new PartBuilder();
    left.box('glove', 0.05, 0.045, 0.085, -0.006, -0.042, 0);
    left.box('glove', 0.014, 0.05, 0.03, 0.028, -0.02, 0.01, 0, 0, 0.3);
    left.limb('sleeve', new THREE.Vector3(-0.02, -0.06, 0.03), new THREE.Vector3(-0.17, -0.24, 0.24), 0.038);
    left.build(this.leftArm, materials);
    this.leftArm.position.set(0, 0, -0.285);
    this.root.add(this.leftArm);

    this.muzzle.position.set(0, 0, -0.64);
    this.ejectionPort.position.set(0.03, 0.004, -0.005);
    this.root.add(this.muzzle, this.ejectionPort);

    // Red dot: a tiny emissive disc plus a soft halo, on the optic's axis.
    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.0011, 12),
      new THREE.MeshBasicMaterial({ color: 0xff2a14, fog: false, depthWrite: false, transparent: true }),
    );
    dot.position.set(0, this.sightHeight, this.sightZ - 0.03);
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(0.008, 0.008),
      new THREE.MeshBasicMaterial({
        map: textures.softGlow,
        color: 0xff3a20,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    halo.position.set(0, this.sightHeight, this.sightZ - 0.0295);
    this.root.add(dot, halo);

    this.flashMaterial = new THREE.MeshBasicMaterial({
      map: textures.muzzleFlash,
      color: 0xffd9a8,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.17), this.flashMaterial);
    const sideA = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.26), this.flashMaterial);
    sideA.rotation.x = Math.PI / 2;
    sideA.position.z = -0.1;
    const sideB = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.26), this.flashMaterial);
    sideB.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    sideB.position.z = -0.1;
    this.flashPlanes.push(front, sideA, sideB);
    this.flash.add(front, sideA, sideB);
    this.flash.visible = false;
    this.muzzle.add(this.flash);

    this.root.traverse((object) => {
      object.layers.set(VIEWMODEL_LAYER);
      if (object instanceof THREE.Mesh) {
        object.frustumCulled = false;
        object.castShadow = false;
        object.receiveShadow = false;
        object.renderOrder = object.material === this.flashMaterial ? 10 : 1;
      }
    });
    dot.renderOrder = 11;
    halo.renderOrder = 11;
  }

  /** Randomized muzzle bloom for one frame of fire. */
  showFlash(intensity: number): void {
    this.flash.visible = true;
    this.flash.rotation.z = Math.random() * Math.PI * 2;
    const s = 0.75 + Math.random() * 0.5;
    this.flash.scale.set(s, s, 0.8 + Math.random() * 0.5);
    this.flashMaterial.opacity = intensity;
  }

  hideFlash(): void {
    this.flash.visible = false;
  }
}
