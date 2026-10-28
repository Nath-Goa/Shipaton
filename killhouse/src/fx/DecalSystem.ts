import * as THREE from 'three';

const FORWARD = new THREE.Vector3(0, 0, 1);

/** Ring buffer of instanced decal quads (bullet holes, scorch marks): one draw call. */
export class DecalSystem {
  readonly mesh: THREE.InstancedMesh;
  private cursor = 0;
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly roll = new THREE.Quaternion();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(texture: THREE.Texture, private readonly capacity: number) {
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      roughness: 0.9,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    this.clear();
  }

  add(point: THREE.Vector3, normal: THREE.Vector3, size: number, rollAngle: number): void {
    this.quaternion.setFromUnitVectors(FORWARD, normal);
    this.roll.setFromAxisAngle(FORWARD, rollAngle);
    this.quaternion.multiply(this.roll);
    this.position.copy(point).addScaledVector(normal, 0.004);
    this.scale.set(size, size, 1);
    this.matrix.compose(this.position, this.quaternion, this.scale);
    this.mesh.setMatrixAt(this.cursor, this.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.cursor = (this.cursor + 1) % this.capacity;
  }

  clear(): void {
    for (let i = 0; i < this.capacity; i++) this.mesh.setMatrixAt(i, this.hidden);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.cursor = 0;
  }
}
