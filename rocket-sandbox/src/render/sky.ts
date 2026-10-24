import {
  AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, Group, Mesh, Points, ShaderMaterial, SphereGeometry, Vector3,
} from 'three';
import { CATALOG, galacticToWorld, starRGB, StarRec } from '../sim/galaxy';

const starVert = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
uniform float uFade;
uniform float uPx;
varying vec3 vColor;
void main() {
  vColor = aColor * uFade;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPx;
}`;
const starFrag = /* glsl */ `
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  gl_FragColor = vec4(vColor * a, 1.0);
}`;

const mwVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const mwFrag = /* glsl */ `
varying vec3 vDir;
uniform vec3 uPole;
uniform vec3 uCentre;
uniform float uFade;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5; float s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float lat = dot(d, uPole);
  float toCentre = max(dot(d, uCentre), 0.0);
  float band = exp(-(lat * lat) / (2.0 * 0.085 * 0.085));
  float wide = exp(-(lat * lat) / (2.0 * 0.26 * 0.26));
  float n = fbm(d * 7.0);
  float dust = smoothstep(0.38, 0.68, fbm(d * 11.0 + 4.0));
  float glow = (band * (0.35 + 0.9 * n) * (1.0 - 0.62 * dust) + wide * 0.09) * (0.55 + 1.4 * pow(toCentre, 2.5));
  vec3 col = mix(vec3(0.5, 0.58, 0.8), vec3(1.0, 0.82, 0.58), pow(toCentre, 1.5)) * glow * 0.42;
  gl_FragColor = vec4(col * uFade, 1.0);
}`;

export class Sky {
  readonly group = new Group();
  private points: Points | null = null;
  private starMat: ShaderMaterial;
  private mwMat: ShaderMaterial;
  private here: StarRec | null = null;

  constructor() {
    this.starMat = new ShaderMaterial({
      vertexShader: starVert, fragmentShader: starFrag, uniforms: { uFade: { value: 1 }, uPx: { value: 1 } },
      depthTest: false, depthWrite: false, blending: AdditiveBlending,
    });
    const pole = new Vector3(...galacticToWorld(0, 0, 1)).normalize();
    const centre = new Vector3(...galacticToWorld(1, 0, 0)).normalize();
    this.mwMat = new ShaderMaterial({
      vertexShader: mwVert, fragmentShader: mwFrag, uniforms: { uPole: { value: pole }, uCentre: { value: centre }, uFade: { value: 1 } },
      side: BackSide, depthTest: false, depthWrite: false, blending: AdditiveBlending,
    });
    const mw = new Mesh(new SphereGeometry(5e8, 48, 24), this.mwMat);
    mw.renderOrder = -101;
    mw.frustumCulled = false;
    this.group.add(mw);
  }

  /** Re-renders the sky as seen from `star`. */
  setSystem(star: StarRec): void {
    if (this.here?.id === star.id && this.points) return;
    this.here = star;
    if (this.points) { this.group.remove(this.points); this.points.geometry.dispose(); }
    const pos: number[] = [];
    const size: number[] = [];
    const col: number[] = [];
    for (const s of CATALOG) {
      if (s.id === star.id) continue;
      const dx = s.x - star.x, dy = s.y - star.y, dz = s.z - star.z;
      const dly = Math.hypot(dx, dy, dz);
      if (dly < 1e-3) continue;
      const mag = s.absMag + 5 * Math.log10(dly / 3.2616) - 5; // distance modulus, distance in parsecs
      if (mag > 6.6) continue;
      const [wx, wy, wz] = galacticToWorld(dx / dly, dy / dly, dz / dly);
      pos.push(wx * 4e8, wy * 4e8, wz * 4e8);
      const b = Math.max(0.15, Math.min(1, 1.15 - (mag + 1.5) * 0.14));
      size.push(1.1 + Math.max(0, (6.2 - mag)) * 0.5);
      const c = starRGB(s.colorIndex);
      col.push(c[0] * b, c[1] * b, c[2] * b);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('aSize', new BufferAttribute(new Float32Array(size), 1));
    g.setAttribute('aColor', new BufferAttribute(new Float32Array(col), 3));
    this.points = new Points(g, this.starMat);
    this.points.renderOrder = -100;
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }

  setFade(f: number): void {
    this.starMat.uniforms.uFade.value = f;
    this.mwMat.uniforms.uFade.value = f;
  }

  setPixelScale(px: number): void { this.starMat.uniforms.uPx.value = px; }
}
