import {
  AdditiveBlending, BufferAttribute, BufferGeometry, NormalBlending, Points, ShaderMaterial, Vector3,
} from 'three';
import { rotY } from '../sim/frame';

const vert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uScale;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(0.1, -mv.z), 0.0, 220.0);
  vAlpha = aAlpha;
  vColor = aColor;
  #include <logdepthbuf_vertex>
}`;

const frag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying float vAlpha;
varying vec3 vColor;
void main() {
  #include <logdepthbuf_fragment>
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  gl_FragColor = vec4(vColor, a * a * vAlpha);
}`;

interface Pool {
  points: Points;
  geo: BufferGeometry;
  mat: ShaderMaterial;
  pos: Float64Array; // body-fixed, absolute
  vel: Float32Array; // body-fixed frame
  life: Float32Array;
  maxLife: Float32Array;
  size0: Float32Array;
  size1: Float32Array;
  col0: Float32Array;
  col1: Float32Array;
  drag: Float32Array;
  alpha0: Float32Array;
  next: number;
  count: number;
  rel: Float32Array;
  aSize: Float32Array;
  aAlpha: Float32Array;
  aColor: Float32Array;
}

function makePool(count: number, additive: boolean): Pool {
  const geo = new BufferGeometry();
  const rel = new Float32Array(count * 3);
  const aSize = new Float32Array(count);
  const aAlpha = new Float32Array(count);
  const aColor = new Float32Array(count * 3);
  geo.setAttribute('position', new BufferAttribute(rel, 3));
  geo.setAttribute('aSize', new BufferAttribute(aSize, 1));
  geo.setAttribute('aAlpha', new BufferAttribute(aAlpha, 1));
  geo.setAttribute('aColor', new BufferAttribute(aColor, 3));
  const mat = new ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, uniforms: { uScale: { value: 800 } },
    transparent: true, depthWrite: false, blending: additive ? AdditiveBlending : NormalBlending,
  });
  const points = new Points(geo, mat);
  points.frustumCulled = false;
  return {
    points, geo, mat, pos: new Float64Array(count * 3), vel: new Float32Array(count * 3), life: new Float32Array(count),
    maxLife: new Float32Array(count).fill(1), size0: new Float32Array(count), size1: new Float32Array(count),
    col0: new Float32Array(count * 3), col1: new Float32Array(count * 3), drag: new Float32Array(count), alpha0: new Float32Array(count),
    next: 0, count, rel, aSize, aAlpha, aColor,
  };
}

export interface SpawnOpts {
  pos: Vector3; // body-fixed absolute
  vel: Vector3; // body-fixed frame velocity
  life: number;
  size0: number;
  size1: number;
  c0: [number, number, number];
  c1: [number, number, number];
  drag?: number;
  alpha?: number;
}

export class Particles {
  readonly fire = makePool(1800, true);
  readonly smoke = makePool(2600, false);
  private tmp = new Vector3();

  setScale(px: number): void {
    this.fire.mat.uniforms.uScale.value = px;
    this.smoke.mat.uniforms.uScale.value = px;
  }

  private spawn(pool: Pool, o: SpawnOpts): void {
    const i = pool.next;
    pool.next = (pool.next + 1) % pool.count;
    pool.pos[i * 3] = o.pos.x; pool.pos[i * 3 + 1] = o.pos.y; pool.pos[i * 3 + 2] = o.pos.z;
    pool.vel[i * 3] = o.vel.x; pool.vel[i * 3 + 1] = o.vel.y; pool.vel[i * 3 + 2] = o.vel.z;
    pool.life[i] = o.life;
    pool.maxLife[i] = o.life;
    pool.size0[i] = o.size0;
    pool.size1[i] = o.size1;
    pool.col0.set(o.c0, i * 3);
    pool.col1.set(o.c1, i * 3);
    pool.drag[i] = o.drag ?? 0;
    pool.alpha0[i] = o.alpha ?? 1;
  }

  addFire(o: SpawnOpts): void { this.spawn(this.fire, o); }
  addSmoke(o: SpawnOpts): void { this.spawn(this.smoke, o); }

  explosion(posBF: Vector3, size: number, groundAir: boolean): void {
    for (let i = 0; i < 140; i++) {
      const d = this.tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      const sp = (0.3 + Math.random()) * size * 5;
      this.addFire({
        pos: posBF.clone().addScaledVector(d, size * 0.3), vel: d.clone().multiplyScalar(sp), life: 0.8 + Math.random() * 1.6,
        size0: size * (0.6 + Math.random()), size1: size * 0.2, c0: [1, 0.8, 0.4], c1: [0.9, 0.2, 0.05], drag: groundAir ? 1.2 : 0.2,
      });
    }
    for (let i = 0; i < 90; i++) {
      const d = this.tmp.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize();
      const sp = (0.1 + Math.random() * 0.6) * size * 3;
      this.addSmoke({
        pos: posBF.clone().addScaledVector(d, size * 0.2), vel: d.clone().multiplyScalar(sp), life: 2 + Math.random() * 3,
        size0: size * 0.8, size1: size * 3, c0: [0.25, 0.22, 0.2], c1: [0.4, 0.4, 0.42], drag: 0.6, alpha: 0.6,
      });
    }
  }

  splash(posBF: Vector3, up: Vector3, size: number): void {
    for (let i = 0; i < 80; i++) {
      const d = up.clone().multiplyScalar(1.2).add(this.tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)).normalize();
      this.addSmoke({
        pos: posBF.clone(), vel: d.multiplyScalar(5 + Math.random() * size * 2), life: 1.5 + Math.random() * 1.5,
        size0: 1.2, size1: 4 + size * 0.4, c0: [0.9, 0.95, 1], c1: [0.8, 0.9, 1], drag: 0.9, alpha: 0.7,
      });
    }
  }

  /** Advances the particles and writes camera-relative positions. camInertial is the camera position relative to the frame body. */
  update(dt: number, theta: number, camInertial: Vector3, gravity: number, up: Vector3): void {
    const tmp = this.tmp;
    for (const pool of [this.fire, this.smoke]) {
      for (let i = 0; i < pool.count; i++) {
        if (pool.life[i] <= 0) { pool.aAlpha[i] = 0; pool.aSize[i] = 0; continue; }
        pool.life[i] -= dt;
        const k = Math.max(0, pool.life[i] / pool.maxLife[i]);
        const dr = Math.exp(-pool.drag[i] * dt);
        pool.vel[i * 3] *= dr; pool.vel[i * 3 + 1] *= dr; pool.vel[i * 3 + 2] *= dr;
        if (pool === this.smoke) {
          pool.vel[i * 3] += up.x * 0.4 * dt; pool.vel[i * 3 + 1] += up.y * 0.4 * dt; pool.vel[i * 3 + 2] += up.z * 0.4 * dt;
        } else {
          pool.vel[i * 3] -= up.x * gravity * 0.1 * dt; pool.vel[i * 3 + 1] -= up.y * gravity * 0.1 * dt; pool.vel[i * 3 + 2] -= up.z * gravity * 0.1 * dt;
        }
        pool.pos[i * 3] += pool.vel[i * 3] * dt;
        pool.pos[i * 3 + 1] += pool.vel[i * 3 + 1] * dt;
        pool.pos[i * 3 + 2] += pool.vel[i * 3 + 2] * dt;
        tmp.set(pool.pos[i * 3], pool.pos[i * 3 + 1], pool.pos[i * 3 + 2]);
        rotY(tmp, theta).sub(camInertial);
        pool.rel[i * 3] = tmp.x; pool.rel[i * 3 + 1] = tmp.y; pool.rel[i * 3 + 2] = tmp.z;
        pool.aSize[i] = pool.size1[i] + (pool.size0[i] - pool.size1[i]) * k;
        pool.aAlpha[i] = pool.alpha0[i] * (pool === this.fire ? k : Math.min(1, k * 2.2) * Math.min(1, (1 - k) * 8 + 0.15));
        for (let c = 0; c < 3; c++) pool.aColor[i * 3 + c] = pool.col1[i * 3 + c] + (pool.col0[i * 3 + c] - pool.col1[i * 3 + c]) * k;
      }
      (pool.geo.attributes.position as BufferAttribute).needsUpdate = true;
      (pool.geo.attributes.aSize as BufferAttribute).needsUpdate = true;
      (pool.geo.attributes.aAlpha as BufferAttribute).needsUpdate = true;
      (pool.geo.attributes.aColor as BufferAttribute).needsUpdate = true;
    }
  }

  clear(): void {
    this.fire.life.fill(0);
    this.smoke.life.fill(0);
  }
}
