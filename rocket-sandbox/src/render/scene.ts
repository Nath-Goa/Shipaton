import {
  ACESFilmicToneMapping, Color, DirectionalLight, FogExp2, Group, HemisphereLight, Matrix4, PerspectiveCamera, PMREMGenerator,
  Quaternion, Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { atmosphereDensity, AU, BodyDef } from '../sim/bodies';
import { evaInertial, localBasis } from '../sim/eva';
import { bodyAngle, rotY, surfaceVelocity } from '../sim/frame';
import { starById, StarRec } from '../sim/galaxy';
import { bodyPosAbs } from '../sim/orbit';
import { groundHeight, padHeight } from '../sim/terrain';
import { activeVessel, GameEvent, World } from '../sim/world';
import { originWorld, partWorld, Vessel } from '../sim/vessel';
import { BodyView } from './bodies';
import { Particles } from './fx';
import { Astronaut, makeFlag, makePad } from './props';
import { Sky } from './sky';
import { TerrainQuality } from './terrain';
import { VesselView } from './partMeshes';

export type QualityLevel = 'low' | 'medium' | 'high';

interface QualityDef { pixelRatio: number; terrain: TerrainQuality; antialias: boolean }

export const QUALITY: Record<QualityLevel, QualityDef> = {
  low: { pixelRatio: 1, terrain: { splitFactor: 1.55, minSpacing: 8, buildPerFrame: 1 }, antialias: false },
  medium: { pixelRatio: 1.5, terrain: { splitFactor: 2.0, minSpacing: 3.5, buildPerFrame: 2 }, antialias: true },
  high: { pixelRatio: 2, terrain: { splitFactor: 2.5, minSpacing: 1.8, buildPerFrame: 3 }, antialias: true },
};

export interface CameraState {
  yaw: number;
  pitch: number;
  /** multiplier on the natural chase distance */
  zoom: number;
  mode: 'horizon' | 'vessel';
}

export interface FrameStats {
  chunks: number;
  drawCalls: number;
  triangles: number;
}

const UP = new Vector3(0, 1, 0);

export class GameRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(60, 1, 0.1, 1e14);
  readonly cam: CameraState = { yaw: -0.6, pitch: 0.28, zoom: 1, mode: 'horizon' };
  private sky = new Sky();
  private particles = new Particles();
  private sun = new DirectionalLight(0xffffff, 3);
  private hemi = new HemisphereLight(0x8fa8ff, 0x20201a, 0.05);
  private bodyViews = new Map<string, BodyView>();
  private vesselViews = new Map<number, VesselView>();
  private flagGroup = new Group();
  private flagMeshes = new Map<number, Group>();
  private flagGround = new Map<number, number>();
  private astronaut = new Astronaut();
  private pad = makePad();
  private systemId = '';
  private quality: QualityLevel = 'medium';
  private lastEvaPos = new Vector3();
  private time = 0;
  private fogColor = new Color(0x000000);
  private frame = 0;
  private emitAccum = new Map<number, number>();
  stats: FrameStats = { chunks: 0, drawCalls: 0, triangles: 0 };

  constructor(readonly canvas: HTMLCanvasElement, quality: QualityLevel) {
    this.quality = quality;
    this.renderer = new WebGLRenderer({
      canvas, antialias: QUALITY[quality].antialias, powerPreference: 'high-performance', logarithmicDepthBuffer: true, alpha: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setClearColor(0x000000);
    this.renderer.info.autoReset = false;
    this.scene.add(this.camera, this.sky.group, this.sun, this.hemi, this.particles.fire.points, this.particles.smoke.points, this.flagGroup);
    this.scene.add(this.astronaut.group, this.pad);
    this.astronaut.group.visible = false;
    this.pad.visible = false;
    const pm = new PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    pm.dispose();
    this.sun.position.set(0, 0, 0);
  }

  setQuality(q: QualityLevel): void {
    this.quality = q;
    for (const b of this.bodyViews.values()) b.setQuality(QUALITY[q].terrain);
  }

  resize(width: number, height: number, dpr: number): void {
    const pr = Math.min(dpr, QUALITY[this.quality].pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    const scale = (height * pr) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.particles.setScale(scale);
    this.sky.setPixelScale(pr * (width > 900 ? 1.15 : 1));
  }

  private ensureSystem(w: World): void {
    if (this.systemId === w.system.id) return;
    for (const b of this.bodyViews.values()) { this.scene.remove(b.group); b.dispose(); }
    this.bodyViews.clear();
    for (const v of this.vesselViews.values()) { this.scene.remove(v.group); v.dispose(); }
    this.vesselViews.clear();
    for (const body of w.system.bodies) {
      const view = new BodyView(body, QUALITY[this.quality].terrain);
      this.bodyViews.set(body.id, view);
      this.scene.add(view.group);
    }
    this.systemId = w.system.id;
    const star = starById(w.system.starId);
    if (star) this.sky.setSystem(star as StarRec);
    this.particles.clear();
    for (const g of this.flagMeshes.values()) this.flagGroup.remove(g);
    this.flagMeshes.clear();
  }

  /** Handles one-off effects from the simulation (explosions, splashes). */
  handleEvents(w: World, events: GameEvent[]): void {
    for (const e of events) {
      if (e.type === 'explosion' && w.idx.get(e.body)) {
        const body = w.idx.get(e.body);
        const theta = bodyAngle(body, w.t);
        const bf = rotY(e.pos.clone(), -theta);
        const alt = e.pos.length() - body.radius;
        this.particles.explosion(bf, e.size, !!body.atmosphere && alt < 30000);
      } else if (e.type === 'splash') {
        const body = w.idx.get(e.body);
        const theta = bodyAngle(body, w.t);
        const bf = rotY(e.pos.clone(), -theta);
        this.particles.splash(bf, bf.clone().normalize(), 10);
      }
    }
  }

  private abs = new Map<string, Vector3>();

  private absOf(w: World, id: string): Vector3 {
    let v = this.abs.get(id);
    if (!v) { v = bodyPosAbs(w.idx, id, w.t); this.abs.set(id, v); }
    return v;
  }

  render(w: World, dt: number): void {
    this.ensureSystem(w);
    this.time += dt;
    this.frame++;
    this.abs.clear();
    const av = activeVessel(w);
    let frameId: string;
    const target = new Vector3();
    let upv: Vector3;
    if (w.eva) {
      frameId = w.eva.body;
      target.copy(evaInertial(w, w.eva)).addScaledVector(w.eva.dir.clone().applyAxisAngle(UP, bodyAngle(w.idx.get(frameId), w.t)), 1.2);
      upv = target.clone().normalize();
    } else if (av) {
      frameId = av.body;
      target.copy(av.pos);
      upv = av.pos.clone().normalize();
    } else return;
    const frameBody = w.idx.get(frameId);
    const theta = bodyAngle(frameBody, w.t);

    // ---- camera
    const baseDist = av && !w.eva ? Math.max(9, (av.derived.top - av.derived.bottom) * 1.5 + av.derived.radiusMax * 5) : 6;
    const dist = baseDist * this.cam.zoom;
    let e1: Vector3, e2: Vector3, e3: Vector3;
    if (this.cam.mode === 'vessel' && av && !w.eva) {
      e1 = new Vector3(1, 0, 0).applyQuaternion(av.quat);
      e2 = new Vector3(0, 0, 1).applyQuaternion(av.quat);
      e3 = new Vector3(0, 1, 0).applyQuaternion(av.quat);
    } else {
      const b = localBasis(upv);
      e1 = b.east; e2 = b.north; e3 = b.up;
    }
    const cp = Math.cos(this.cam.pitch);
    const d = e1.clone().multiplyScalar(cp * Math.cos(this.cam.yaw)).addScaledVector(e2, cp * Math.sin(this.cam.yaw)).addScaledVector(e3, Math.sin(this.cam.pitch));
    const camPos = target.clone().addScaledVector(d, dist);
    // never dip below the ground
    if (!frameBody.gasGiant && frameBody.terrain) {
      const r = camPos.length();
      if (r - frameBody.radius < 4000) {
        const dirBF = rotY(camPos.clone().normalize(), -theta);
        const g = groundHeight(frameBody, dirBF);
        const min = frameBody.radius + g + 1.5;
        if (r < min) camPos.multiplyScalar(min / r);
      }
    }
    this.camera.position.set(0, 0, 0);
    this.camera.up.copy(e3);
    this.camera.lookAt(target.clone().sub(camPos));
    this.camera.updateMatrixWorld();
    this.camera.near = Math.max(0.05, Math.min(2, dist * 0.01));
    this.camera.updateProjectionMatrix();

    // ---- absolute positions of bodies relative to the star
    const frameAbs = this.absOf(w, frameId);
    const camAbs = frameAbs.clone().add(camPos);
    const star = w.idx.star;
    const starRel = this.absOf(w, star.id).clone().sub(camAbs);
    const sunDir = starRel.clone().normalize();
    const camAlt = camPos.length() - frameBody.radius;
    const up = camPos.clone().normalize();

    // ---- lighting
    const dAU = Math.max(1e-4, starRel.length() / AU);
    const irr = w.system.luminosity / (dAU * dAU);
    const sc = star.color;
    this.sun.color.setRGB(Math.min(1, sc[0] * 1.05), Math.min(1, sc[1] * 1.0), Math.min(1, sc[2] * 0.95));
    this.sun.intensity = 3.1 * Math.pow(Math.min(Math.max(irr, 0.03), 5), 0.55);
    this.sun.target.position.set(0, 0, 0);
    this.sun.position.copy(sunDir).multiplyScalar(1000);
    this.sun.updateMatrixWorld();

    // ---- sky colour, fog and star visibility
    let day = 1;
    let rhoFrac = 0;
    let skyCol: [number, number, number] = [0, 0, 0];
    if (frameBody.atmosphere) {
      rhoFrac = atmosphereDensity(frameBody, camAlt) / frameBody.atmosphere.density0;
      const sunUp = up.dot(sunDir);
      day = Math.max(0, Math.min(1, (sunUp + 0.18) / 0.5));
      const k = Math.min(1, Math.pow(rhoFrac * 9, 0.6)) * day;
      const sk = frameBody.atmosphere.sky;
      // dusk glow on the horizon side
      const dusk = Math.max(0, 1 - Math.abs(sunUp) * 6) * Math.min(1, rhoFrac * 12);
      skyCol = [sk[0] * k + dusk * 0.5, sk[1] * k + dusk * 0.18, sk[2] * k + dusk * 0.08];
    }
    this.fogColor.setRGB(skyCol[0] * 0.9, skyCol[1] * 0.9, skyCol[2] * 0.9, SRGBColorSpace);
    this.renderer.setClearColor(this.fogColor.clone().multiplyScalar(0.9));
    this.sky.setFade(Math.max(0, 1 - Math.min(1, (skyCol[0] + skyCol[1] + skyCol[2]) * 3.3)));
    if (frameBody.atmosphere && rhoFrac > 1e-6) {
      const vis = frameBody.atmosphere.scaleHeight * (frameBody.gasGiant ? 2.2 : 9);
      const fogDen = (1.7 / vis) * Math.min(1, rhoFrac);
      if (!(this.scene.fog instanceof FogExp2)) this.scene.fog = new FogExp2(0x000000, 0);
      this.scene.fog.color.copy(this.fogColor);
      this.scene.fog.density = fogDen;
      this.hemi.intensity = 0.05 + 0.5 * Math.min(1, rhoFrac * 8) * day;
      this.hemi.color.setRGB(skyCol[0] + 0.1, skyCol[1] + 0.1, skyCol[2] + 0.15);
    } else {
      this.scene.fog = null;
      this.hemi.intensity = 0.04;
    }

    // ---- bodies
    for (const body of w.system.bodies) {
      const view = this.bodyViews.get(body.id)!;
      const rel = this.absOf(w, body.id).clone().sub(camAbs);
      const bodyTheta = bodyAngle(body, w.t);
      const sunBody = this.absOf(w, body.id).clone().negate().normalize();
      view.update({ rel, camRel: rel.clone().negate(), theta: bodyTheta, sunDir: sunBody });
    }

    // ---- vessels
    const live = new Set<number>();
    for (const v of w.vessels) {
      if (v.destroyed) continue;
      const vbAbs = this.absOf(w, v.body);
      const origin = originWorld(v).add(vbAbs).sub(camAbs);
      const posRel = v.pos.clone().add(vbAbs).sub(camAbs);
      if (posRel.length() > 4e5) continue;
      live.add(v.id);
      let view = this.vesselViews.get(v.id);
      if (!view) { view = new VesselView(v); this.vesselViews.set(v.id, view); this.scene.add(view.group); }
      const vb = w.idx.get(v.body);
      const alt = v.pos.length() - vb.radius;
      const rho = atmosphereDensity(vb, alt);
      const pressure = vb.atmosphere ? vb.atmosphere.pressure0 * Math.exp(-alt / vb.atmosphere.scaleHeight) : 0;
      const vac = 1 - Math.min(1, pressure / 101325);
      const vAir = v.vel.clone().sub(surfaceVelocity(vb, v.pos, new Vector3()));
      const sp = vAir.length();
      const flux = rho > 0 ? 1.74e-4 * Math.sqrt(rho / Math.max(0.5, v.derived.radiusMax)) * sp * sp * sp : 0;
      const plasma = Math.min(1.5, flux / 1.4e6);
      const airLocal = sp > 1 ? vAir.clone().normalize().applyQuaternion(v.quat.clone().invert()) : null;
      view.update(origin, this.time, vac, plasma, airLocal);
      view.group.visible = true;
      this.emitExhaust(w, v, dt, frameId, theta, rho, alt);
    }
    for (const [id, view] of this.vesselViews) {
      if (!live.has(id)) { this.scene.remove(view.group); view.dispose(); this.vesselViews.delete(id); }
    }

    // ---- pad
    const pad = w.padBody === frameId;
    if (pad) {
      const base = w.padDir.clone().multiplyScalar(frameBody.radius + padHeight(frameBody));
      const padRel = rotY(base.clone(), theta).sub(camPos);
      this.pad.visible = padRel.length() < 30000;
      this.pad.position.copy(padRel);
      this.pad.quaternion.setFromUnitVectors(UP, w.padDir.clone().applyAxisAngle(UP, theta));
    } else this.pad.visible = false;

    // ---- flags
    this.updateFlags(w, frameBody, theta, camPos);

    // ---- astronaut
    if (w.eva && frameId === w.eva.body) {
      const e = w.eva;
      const foot = evaInertial(w, e);
      const rel = foot.clone().sub(camPos);
      this.astronaut.group.visible = true;
      this.astronaut.group.position.copy(rel);
      const upI = e.dir.clone().applyAxisAngle(UP, theta);
      const { east, north } = localBasis(e.dir);
      const fwdBF = east.clone().multiplyScalar(Math.cos(e.heading)).addScaledVector(north, Math.sin(e.heading));
      const fwd = fwdBF.applyAxisAngle(UP, theta);
      const right = new Vector3().crossVectors(fwd, upI).normalize();
      const m = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right.clone().negate(), upI, fwd));
      this.astronaut.group.quaternion.copy(m);
      const moved = foot.distanceTo(this.lastEvaPos) / Math.max(dt, 1e-3);
      this.lastEvaPos.copy(foot);
      this.astronaut.animate(dt, Math.min(8, moved), e.height > 0.1);
    } else this.astronaut.group.visible = false;

    // ---- particles
    this.particles.update(dt, theta, camPos, frameBody.mu / (frameBody.radius * frameBody.radius), upvBF(up, theta));

    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
    let chunks = 0;
    for (const b of this.bodyViews.values()) chunks += b.terrainChunks;
    this.stats = { chunks, drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
  }

  private updateFlags(w: World, body: BodyDef, theta: number, camPos: Vector3): void {
    const mine = w.flags.filter((f) => f.body === body.id);
    const ids = new Set(mine.map((f) => f.id));
    for (const [id, g] of this.flagMeshes) if (!ids.has(id)) { this.flagGroup.remove(g); this.flagMeshes.delete(id); }
    for (const f of mine) {
      let g = this.flagMeshes.get(f.id);
      if (!g) { g = makeFlag(); this.flagMeshes.set(f.id, g); this.flagGroup.add(g); }
      let h = this.flagGround.get(f.id);
      if (h === undefined) { h = groundHeight(body, f.dir); this.flagGround.set(f.id, h); }
      const p = rotY(f.dir.clone().multiplyScalar(body.radius + h), theta).sub(camPos);
      g.visible = p.length() < 40000;
      g.position.copy(p);
      g.quaternion.setFromUnitVectors(UP, f.dir.clone().applyAxisAngle(UP, theta));
      const cloth = g.children[1];
      cloth.rotation.y = Math.sin(this.time * 1.7 + f.id) * 0.06;
    }
  }

  private emitExhaust(w: World, v: Vessel, dt: number, frameId: string, theta: number, rho: number, alt: number): void {
    if (v.body !== frameId) return;
    const body = w.idx.get(v.body);
    const axis = new Vector3(0, 1, 0).applyQuaternion(v.quat);
    const vs = surfaceVelocity(body, v.pos, new Vector3());
    for (const p of v.parts) {
      if (p.burn <= 0.02) continue;
      const nozzle = partWorld(v, p).addScaledVector(axis, -p.def.length / 2);
      const thrust = (p.def.thrust ?? 1e5) * p.burn;
      const atm = Math.min(1, rho * 2.5);
      if (atm < 0.01 && alt > 2000) continue;
      const key = p.id + v.id * 1000;
      let acc = (this.emitAccum.get(key) ?? 0) + dt * (30 + Math.min(150, thrust / 8e3)) * (0.3 + atm);
      const bfPos = rotY(nozzle.clone(), -theta);
      const velSurf = rotY(v.vel.clone().sub(vs), -theta);
      const exhaust = rotY(axis.clone().negate(), -theta);
      const near = alt < 300;
      while (acc >= 1) {
        acc -= 1;
        const spread = new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
        const vel = velSurf.clone().addScaledVector(exhaust, 25 + Math.random() * 35).addScaledVector(spread, 6);
        const size = p.radius * (1.4 + Math.random() * 0.8);
        this.particles.addSmoke({
          pos: bfPos.clone().addScaledVector(exhaust, 1 + Math.random() * 2), vel, life: 3 + Math.random() * 5, size0: size, size1: size * (4 + 6 * atm),
          c0: [0.85, 0.82, 0.78], c1: [0.5, 0.5, 0.52], drag: 1.2, alpha: 0.38 * atm,
        });
        if (near && Math.random() < 0.5) {
          // ground blast spreading sideways
          const ground = bfPos.clone().normalize();
          const side = spread.clone().addScaledVector(ground, -spread.dot(ground)).normalize();
          this.particles.addSmoke({
            pos: bfPos.clone().addScaledVector(exhaust, 6), vel: side.multiplyScalar(18 + Math.random() * 28), life: 5 + Math.random() * 6,
            size0: 5, size1: 38, c0: [0.8, 0.78, 0.72], c1: [0.55, 0.55, 0.55], drag: 0.55, alpha: 0.32,
          });
        }
      }
      this.emitAccum.set(key, acc);
    }
  }

  dispose(): void {
    for (const b of this.bodyViews.values()) b.dispose();
    for (const v of this.vesselViews.values()) v.dispose();
    this.renderer.dispose();
  }
}

function upvBF(up: Vector3, theta: number): Vector3 {
  return rotY(up.clone(), -theta);
}
