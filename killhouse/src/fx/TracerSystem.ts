import * as THREE from 'three';

interface Tracer {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  readonly start: THREE.Vector3;
  readonly dir: THREE.Vector3;
  length: number;
  travelled: number;
  speed: number;
  streak: number;
  active: boolean;
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Pooled tracer rounds: a short glowing streak that physically travels from the
 * muzzle to the impact point rather than a static line.
 */
export class TracerSystem {
  readonly group = new THREE.Group();
  private readonly pool: Tracer[] = [];
  private cursor = 0;
  private readonly tail = new THREE.Vector3();

  constructor(size: number) {
    const geometry = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
    geometry.translate(0, 0.5, 0);
    for (let i = 0; i < size; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffd28a,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 4;
      this.group.add(mesh);
      this.pool.push({
        mesh,
        material,
        start: new THREE.Vector3(),
        dir: new THREE.Vector3(),
        length: 0,
        travelled: 0,
        speed: 0,
        streak: 0,
        active: false,
      });
    }
  }

  fire(from: THREE.Vector3, to: THREE.Vector3, color: number, width: number, speed: number, streak: number): void {
    const tracer = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;
    tracer.start.copy(from);
    tracer.dir.subVectors(to, from);
    tracer.length = tracer.dir.length();
    if (tracer.length < 0.05) return;
    tracer.dir.divideScalar(tracer.length);
    tracer.travelled = 0;
    tracer.speed = speed;
    tracer.streak = streak;
    tracer.active = true;
    tracer.material.color.setHex(color);
    tracer.mesh.quaternion.setFromUnitVectors(UP, tracer.dir);
    tracer.mesh.scale.set(width, 0.001, width);
    tracer.mesh.position.copy(from);
    tracer.mesh.visible = true;
  }

  update(dt: number): void {
    for (const t of this.pool) {
      if (!t.active) continue;
      t.travelled += t.speed * dt;
      const head = Math.min(t.travelled, t.length);
      const tailDistance = Math.max(0, head - t.streak);
      if (t.travelled - t.streak >= t.length) {
        t.active = false;
        t.mesh.visible = false;
        continue;
      }
      this.tail.copy(t.start).addScaledVector(t.dir, tailDistance);
      t.mesh.position.copy(this.tail);
      t.mesh.scale.y = Math.max(0.001, head - tailDistance);
      t.material.opacity = 0.9 * (1 - Math.max(0, t.travelled - t.length) / t.streak);
    }
  }

  clear(): void {
    for (const t of this.pool) {
      t.active = false;
      t.mesh.visible = false;
    }
  }
}
