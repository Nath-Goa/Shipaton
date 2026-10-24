import {
  AdditiveBlending, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Points, PointsMaterial,
  BufferGeometry, Float32BufferAttribute, RingGeometry, Sprite, SpriteMaterial, SphereGeometry, Vector3,
} from 'three';
import { BodyDef } from '../sim/bodies';
import { makeAtmosphere, Atmosphere } from './atmosphere';
import { TerrainQuality, TerrainTree } from './terrain';
import { gasTexture, glowTexture, ringTexture, rockyTexture, sunTexture } from './textures';

export interface BodyFrame {
  /** Body centre relative to the camera, inertial axes (metres) */
  rel: Vector3;
  /** Camera position relative to the body centre */
  camRel: Vector3;
  theta: number;
  sunDir: Vector3;
}

/** Everything needed to draw one celestial body at any distance. */
export class BodyView {
  readonly group = new Group();
  private low: Mesh | null = null;
  private terrain: TerrainTree | null = null;
  private atmosphere: Atmosphere | null = null;
  private rings: Mesh | null = null;
  private glow: Sprite | null = null;
  private dot: Points;
  private dotPos: Float32Array;
  private lastDist = Infinity;

  constructor(readonly body: BodyDef, private quality: TerrainQuality) {
    this.dotPos = new Float32Array(3);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.dotPos, 3));
    this.dot = new Points(g, new PointsMaterial({ color: new Color(...body.color), size: 3.2, sizeAttenuation: false, transparent: true, depthWrite: false }));
    this.dot.frustumCulled = false;
    this.group.add(this.dot);

    if (body.luminous) {
      const m = new Mesh(new SphereGeometry(body.radius, 64, 32), new MeshBasicMaterial({ map: sunTexture(body.color), fog: false }));
      this.low = m;
      this.group.add(m);
      const sp = new Sprite(new SpriteMaterial({ map: glowTexture(), color: new Color(...body.color), blending: AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      sp.scale.setScalar(body.radius * 7);
      this.glow = sp;
      this.group.add(sp);
    } else {
      const mat = new MeshStandardMaterial({
        map: body.gasGiant ? gasTexture(body) : rockyTexture(body),
        roughness: body.gasGiant ? 0.95 : 0.9, metalness: 0, envMapIntensity: 0.15, fog: false,
      });
      this.low = new Mesh(new SphereGeometry(body.radius, 96, 48), mat);
      this.group.add(this.low);
      if (body.rings) {
        const rg = new RingGeometry(body.rings.inner, body.rings.outer, 128, 1);
        const pos = rg.attributes.position;
        const uv = rg.attributes.uv;
        for (let i = 0; i < pos.count; i++) {
          const r = Math.hypot(pos.getX(i), pos.getY(i));
          uv.setXY(i, (r - body.rings.inner) / (body.rings.outer - body.rings.inner), 0.5);
        }
        this.rings = new Mesh(rg, new MeshBasicMaterial({ map: ringTexture(body.rings.color), transparent: true, side: DoubleSide, depthWrite: false, fog: false }));
        this.rings.rotation.x = -Math.PI / 2;
        this.group.add(this.rings);
      }
    }
    this.atmosphere = makeAtmosphere(body);
    if (this.atmosphere) this.group.add(this.atmosphere.mesh);
  }

  setQuality(q: TerrainQuality): void {
    this.quality = q;
    this.terrain?.setQuality(q);
  }

  update(f: BodyFrame): void {
    const body = this.body;
    const R = body.radius;
    const dist = f.camRel.length();
    this.lastDist = dist;
    const angular = (2 * R) / Math.max(dist, 1);
    const showSphere = angular > 0.0009;
    this.dot.visible = !showSphere && !body.luminous;
    if (!showSphere) this.dotPos.set([f.rel.x, f.rel.y, f.rel.z]);
    (this.dot.geometry.attributes.position as Float32BufferAttribute).needsUpdate = true;
    this.group.visible = true;

    const useTerrain = !!body.terrain && !body.gasGiant && !body.luminous && dist < R * 12;
    if (useTerrain) {
      if (!this.terrain) {
        this.terrain = new TerrainTree(body, this.quality);
        this.group.add(this.terrain.group);
      }
      this.terrain.group.visible = true;
      this.terrain.update(f.camRel, f.theta);
      if (this.low) this.low.visible = false;
    } else {
      if (this.terrain) {
        this.terrain.group.visible = false;
        if (dist > R * 60) { this.group.remove(this.terrain.group); this.terrain.dispose_all(); this.terrain = null; }
      }
      if (this.low) {
        this.low.visible = showSphere;
        this.low.position.copy(f.rel);
        this.low.rotation.y = f.theta;
      }
    }
    if (this.rings) {
      this.rings.position.copy(f.rel);
      this.rings.visible = showSphere;
    }
    if (this.glow) this.glow.position.copy(f.rel);
    if (this.atmosphere) {
      this.atmosphere.mesh.visible = showSphere;
      this.atmosphere.update(f.rel, f.sunDir);
    }
  }

  get terrainChunks(): number { return this.terrain?.chunkCount ?? 0; }
  get distance(): number { return this.lastDist; }

  hide(): void { this.group.visible = false; }

  dispose(): void {
    this.terrain?.dispose_all();
    this.group.traverse((o) => {
      const m = o as Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}
