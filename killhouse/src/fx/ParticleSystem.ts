import * as THREE from 'three';

const VERTEX = /* glsl */ `
  uniform float uScale;
  attribute float aSize;
  attribute vec4 aColor;
  varying vec4 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale / max(-mv.z, 0.05);
  }
`;

const FRAGMENT = /* glsl */ `
  varying vec4 vColor;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c) * 4.0;
    if (d > 1.0) discard;
    float falloff = (1.0 - d) * (1.0 - d);
    gl_FragColor = vec4(vColor.rgb, vColor.a * falloff);
  }
`;

export interface ParticleParams {
  r: number;
  g: number;
  b: number;
  alpha: number;
  size: number;
  endSize: number;
  life: number;
  gravity: number;
  drag: number;
}

/**
 * Fixed-capacity GPU point pool. Spawning overwrites the oldest slot, so a
 * sustained firefight never allocates and never grows the buffers.
 */
export class ParticleSystem {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;
  private readonly velocity: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly startSize: Float32Array;
  private readonly endSize: Float32Array;
  private readonly startAlpha: Float32Array;
  private readonly gravity: Float32Array;
  private readonly drag: Float32Array;
  private cursor = 0;
  private live = 0;
  private readonly positionAttr: THREE.BufferAttribute;
  private readonly colorAttr: THREE.BufferAttribute;
  private readonly sizeAttr: THREE.BufferAttribute;

  constructor(private readonly capacity: number, blending: THREE.Blending) {
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 4);
    this.sizes = new Float32Array(capacity);
    this.velocity = new Float32Array(capacity * 3);
    this.age = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.startSize = new Float32Array(capacity);
    this.endSize = new Float32Array(capacity);
    this.startAlpha = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);

    const geometry = new THREE.BufferGeometry();
    this.positionAttr = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.colorAttr = new THREE.BufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.positionAttr);
    geometry.setAttribute('aColor', this.colorAttr);
    geometry.setAttribute('aSize', this.sizeAttr);

    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  setScale(pixelsPerUnitAtOneMeter: number): void {
    this.material.uniforms.uScale.value = pixelsPerUnitAtOneMeter;
  }

  emit(px: number, py: number, pz: number, vx: number, vy: number, vz: number, p: ParticleParams): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    if (this.age[i] >= this.life[i]) this.live++;
    this.positions[i * 3] = px;
    this.positions[i * 3 + 1] = py;
    this.positions[i * 3 + 2] = pz;
    this.velocity[i * 3] = vx;
    this.velocity[i * 3 + 1] = vy;
    this.velocity[i * 3 + 2] = vz;
    this.colors[i * 4] = p.r;
    this.colors[i * 4 + 1] = p.g;
    this.colors[i * 4 + 2] = p.b;
    this.colors[i * 4 + 3] = p.alpha;
    this.sizes[i] = p.size;
    this.startSize[i] = p.size;
    this.endSize[i] = p.endSize;
    this.startAlpha[i] = p.alpha;
    this.age[i] = 0;
    this.life[i] = p.life;
    this.gravity[i] = p.gravity;
    this.drag[i] = p.drag;
  }

  update(dt: number): void {
    if (this.live === 0) return;
    let live = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.age[i] >= this.life[i]) continue;
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      if (t >= 1) {
        this.sizes[i] = 0;
        this.colors[i * 4 + 3] = 0;
        continue;
      }
      live++;
      const damping = Math.exp(-this.drag[i] * dt);
      const k = i * 3;
      this.velocity[k] *= damping;
      this.velocity[k + 1] = this.velocity[k + 1] * damping - this.gravity[i] * dt;
      this.velocity[k + 2] *= damping;
      this.positions[k] += this.velocity[k] * dt;
      this.positions[k + 1] += this.velocity[k + 1] * dt;
      this.positions[k + 2] += this.velocity[k + 2] * dt;
      if (this.positions[k + 1] < 0.01) {
        this.positions[k + 1] = 0.01;
        this.velocity[k + 1] *= -0.25;
        this.velocity[k] *= 0.5;
        this.velocity[k + 2] *= 0.5;
      }
      this.sizes[i] = this.startSize[i] + (this.endSize[i] - this.startSize[i]) * t;
      this.colors[i * 4 + 3] = this.startAlpha[i] * (1 - t * t);
    }
    this.live = live;
    this.positionAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
  }

  clear(): void {
    this.age.fill(0);
    this.life.fill(0);
    this.sizes.fill(0);
    this.live = 0;
    this.sizeAttr.needsUpdate = true;
  }
}
