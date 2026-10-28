import * as THREE from 'three';
import { PICKUPS } from '../config';
import type { PickupKind, PickupSpawn } from '../level/LevelConstructor';
import type { TextureLibrary } from '../level/ProceduralTextures';

export interface Pickup {
  readonly kind: PickupKind;
  readonly amount: number;
  readonly group: THREE.Group;
  readonly base: THREE.Vector3;
  active: boolean;
  phase: number;
}

export interface PickupReceiver {
  /** Returns how much of the pickup was actually used (0 leaves it on the floor). */
  receive(kind: PickupKind, amount: number): number;
}

/** Ammo cans and trauma kits: placed by the map, dropped by fallen riflemen. */
export class PickupManager {
  readonly pickups: Pickup[] = [];
  private readonly root = new THREE.Group();
  private readonly ammoMaterial: THREE.MeshStandardMaterial;
  private readonly medMaterial: THREE.MeshStandardMaterial;
  private readonly ammoRing: THREE.MeshBasicMaterial;
  private readonly medRing: THREE.MeshBasicMaterial;
  private readonly ammoGeometry = new THREE.BoxGeometry(0.46, 0.26, 0.24);
  private readonly medGeometry = new THREE.BoxGeometry(0.42, 0.22, 0.3);
  private readonly ringGeometry: THREE.RingGeometry;

  constructor(scene: THREE.Scene, textures: TextureLibrary) {
    scene.add(this.root);
    this.ammoMaterial = new THREE.MeshStandardMaterial({ map: textures.ammoCrate, roughness: 0.6, metalness: 0.2, emissive: 0x3a2a08, emissiveIntensity: 1 });
    this.medMaterial = new THREE.MeshStandardMaterial({ map: textures.medkit, roughness: 0.55, metalness: 0.05, emissive: 0x0a2a14, emissiveIntensity: 1 });
    const ring = (color: number): THREE.MeshBasicMaterial =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.ammoRing = ring(0xffb23a);
    this.medRing = ring(0x5dff9a);
    this.ringGeometry = new THREE.RingGeometry(0.42, 0.55, 40);
    this.ringGeometry.rotateX(-Math.PI / 2);
  }

  reset(spawns: readonly PickupSpawn[]): void {
    for (const pickup of this.pickups) this.root.remove(pickup.group);
    this.pickups.length = 0;
    for (const spawn of spawns) {
      this.spawn(spawn.kind, spawn.position, spawn.kind === 'ammo' ? PICKUPS.ammoAmount : PICKUPS.medkitAmount);
    }
  }

  spawn(kind: PickupKind, position: THREE.Vector3, amount: number): void {
    const group = new THREE.Group();
    const box = new THREE.Mesh(kind === 'ammo' ? this.ammoGeometry : this.medGeometry, kind === 'ammo' ? this.ammoMaterial : this.medMaterial);
    box.position.y = 0.35;
    box.receiveShadow = true;
    const ring = new THREE.Mesh(this.ringGeometry, kind === 'ammo' ? this.ammoRing : this.medRing);
    ring.position.y = 0.012;
    ring.renderOrder = 2;
    group.add(box, ring);
    group.position.set(position.x, 0, position.z);
    this.root.add(group);
    this.pickups.push({ kind, amount, group, base: new THREE.Vector3(position.x, 0, position.z), active: true, phase: Math.random() * Math.PI * 2 });
  }

  update(dt: number, time: number, playerPosition: THREE.Vector3, playerAlive: boolean, receiver: PickupReceiver): Pickup | null {
    const pulse = 0.35 + 0.25 * Math.sin(time * 3);
    this.ammoRing.opacity = pulse;
    this.medRing.opacity = pulse;
    let collected: Pickup | null = null;
    for (const pickup of this.pickups) {
      if (!pickup.active) continue;
      const box = pickup.group.children[0];
      box.rotation.y += dt * 0.9;
      box.position.y = 0.35 + Math.sin(time * 2 + pickup.phase) * 0.05;
      if (!playerAlive || collected) continue;
      const dx = playerPosition.x - pickup.base.x;
      const dz = playerPosition.z - pickup.base.z;
      if (dx * dx + dz * dz > PICKUPS.collectRadius * PICKUPS.collectRadius) continue;
      if (receiver.receive(pickup.kind, pickup.amount) > 0) {
        pickup.active = false;
        pickup.group.visible = false;
        collected = pickup;
      }
    }
    return collected;
  }
}
