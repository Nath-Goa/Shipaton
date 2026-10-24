import { AdditiveBlending, DoubleSide, IcosahedronGeometry, Mesh, ShaderMaterial, Vector3 } from 'three';
import { BodyDef } from '../sim/bodies';

const vert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vRel;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vRel = (modelMatrix * vec4(position, 1.0)).xyz; // scene is camera-relative, so this is the view ray
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;

const frag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uCenter;   // planet centre relative to the camera, in units of R
uniform float uAtmo;    // atmosphere outer radius / R
uniform float uH;       // scale height / R
uniform vec3 uSun;
uniform vec3 uColor;
uniform float uStrength;
varying vec3 vRel;

vec2 raySphere(vec3 ro, vec3 rd, vec3 c, float r) {
  vec3 oc = ro - c;
  float b = dot(oc, rd);
  float cc = dot(oc, oc) - r * r;
  float h = b * b - cc;
  if (h < 0.0) return vec2(-1.0, -1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 rd = normalize(vRel);
  vec3 ro = vec3(0.0);
  vec2 ta = raySphere(ro, rd, uCenter, uAtmo);
  if (ta.y < 0.0) discard;
  float t0 = max(ta.x, 0.0);
  float t1 = ta.y;
  vec2 tp = raySphere(ro, rd, uCenter, 1.0);
  bool hitsPlanet = tp.x > 0.0;
  if (hitsPlanet) t1 = min(t1, tp.x);
  if (t1 <= t0) discard;
  const int STEPS = 12;
  float dt = (t1 - t0) / float(STEPS);
  float dens = 0.0;
  float light = 0.0;
  for (int i = 0; i < STEPS; i++) {
    vec3 p = ro + rd * (t0 + (float(i) + 0.5) * dt);
    vec3 rel = p - uCenter;
    float h = (length(rel) - 1.0) / uH;
    float d = exp(-max(h, 0.0)) * dt / uH;
    float sunl = smoothstep(-0.25, 0.35, dot(normalize(rel), uSun));
    dens += d;
    light += d * sunl;
  }
  float a = 1.0 - exp(-dens * uStrength);
  // looking down through the air we only add a light veil; at the limb the glow can be strong
  if (hitsPlanet) a = min(a, 0.22);
  float lit = dens > 0.0 ? light / dens : 0.0;
  // redden the terminator a little
  vec3 col = mix(uColor * vec3(1.0, 0.62, 0.45), uColor, smoothstep(0.1, 0.8, lit));
  gl_FragColor = vec4(col * lit, a * lit);
}`;

export interface Atmosphere { mesh: Mesh; material: ShaderMaterial; update(centerRel: Vector3, sunDir: Vector3): void }

export function makeAtmosphere(body: BodyDef): Atmosphere | null {
  const a = body.atmosphere;
  if (!a) return null;
  const R = body.radius;
  const top = Math.min(R * 0.5, a.scaleHeight * 9);
  const atmo = (R + top) / R;
  const material = new ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uCenter: { value: new Vector3() },
      uAtmo: { value: atmo },
      uH: { value: a.scaleHeight / R },
      uSun: { value: new Vector3(1, 0, 0) },
      uColor: { value: new Vector3(a.glow[0], a.glow[1], a.glow[2]) },
      uStrength: { value: Math.min(14, 0.5 / Math.sqrt(a.scaleHeight / R) * Math.min(4, 0.6 + Math.log10(1 + a.density0 * 40))) },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  // the proxy shell is deliberately bigger than the atmosphere so its faceted edge never shows
  const mesh = new Mesh(new IcosahedronGeometry(R * (1 + (atmo - 1) * 1.8 + 0.02), 6), material);
  mesh.frustumCulled = false;
  return {
    mesh,
    material,
    update(centerRel, sunDir) {
      mesh.position.copy(centerRel);
      const u = material.uniforms;
      u.uCenter.value.copy(centerRel).divideScalar(R);
      u.uSun.value.copy(sunDir);
    },
  };
}
