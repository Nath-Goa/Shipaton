import {
  AdditiveBlending, BufferGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, LatheGeometry,
  LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, TorusGeometry, Vector2, Vector3,
} from 'three';
import { PartDef } from '../sim/parts';
import { fairingShellHeight, PartRT, Vessel } from '../sim/vessel';

const mats = {
  white: new MeshStandardMaterial({ color: 0xeceff3, roughness: 0.42, metalness: 0.18 }),
  orange: new MeshStandardMaterial({ color: 0xd9692a, roughness: 0.5, metalness: 0.2 }),
  dark: new MeshStandardMaterial({ color: 0x24272d, roughness: 0.45, metalness: 0.75, side: DoubleSide }),
  steel: new MeshStandardMaterial({ color: 0x8c929c, roughness: 0.35, metalness: 0.8, side: DoubleSide }),
  gold: new MeshStandardMaterial({ color: 0xd2a94c, roughness: 0.3, metalness: 0.85 }),
  shield: new MeshStandardMaterial({ color: 0x3b2a20, roughness: 0.95, metalness: 0 }),
  glass: new MeshStandardMaterial({ color: 0x0f1b2b, roughness: 0.1, metalness: 0.9, emissive: 0x0a2236, emissiveIntensity: 0.6 }),
  booster: new MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.5, metalness: 0.1 }),
  black: new MeshStandardMaterial({ color: 0x141414, roughness: 0.6, metalness: 0.3 }),
  jump: new MeshStandardMaterial({ color: 0x59d6ff, emissive: 0x2bb8ff, emissiveIntensity: 2.2, roughness: 0.2 }),
  fairing: new MeshStandardMaterial({ color: 0xf6f6f4, roughness: 0.4, metalness: 0.1, side: DoubleSide }),
  chuteA: new MeshStandardMaterial({ color: 0xff6a2a, roughness: 0.9, side: DoubleSide }),
  chuteB: new MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.9, side: DoubleSide }),
  leg: new MeshStandardMaterial({ color: 0x9ea3ab, roughness: 0.4, metalness: 0.7 }),
};

export const SELECT_EMISSIVE = new Color(0x1b6dff);

function lathe(profile: [number, number][], seg = 28): LatheGeometry {
  return new LatheGeometry(profile.map(([r, y]) => new Vector2(Math.max(0.0001, r), y)), seg);
}

function cyl(rt: number, rb: number, h: number, mat: MeshStandardMaterial, y = 0, seg = 28): Mesh {
  const m = new Mesh(new CylinderGeometry(rt, rb, h, seg), mat);
  m.position.y = y;
  return m;
}

function ogive(r: number, h: number, steps = 10): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([r * Math.pow(1 - t * t, 0.62), -h / 2 + h * t]);
  }
  return pts;
}

function band(r: number, y: number, h: number, mat: MeshStandardMaterial): Mesh {
  return cyl(r * 1.012, r * 1.012, h, mat, y);
}

function buildBody(def: PartDef, p: PartRT): Group {
  const g = new Group();
  const r = def.dia / 2;
  const h = def.length;
  switch (def.kind) {
    case 'pod': {
      if (def.id === 'lander_s2') {
        g.add(cyl(r * 0.92, r, h, mats.gold, 0, 8));
        g.add(cyl(r * 0.98, r * 0.98, 0.1, mats.dark, h / 2 - 0.05, 8));
        g.add(cyl(r * 0.98, r * 0.98, 0.1, mats.dark, -h / 2 + 0.05, 8));
        const win = new Mesh(new SphereGeometry(r * 0.28, 12, 8, 0, Math.PI), mats.glass);
        win.position.set(0, h * 0.12, r * 0.9);
        win.scale.set(1, 0.7, 0.4);
        g.add(win);
      } else if (def.id.startsWith('probe')) {
        g.add(cyl(r, r, h, mats.dark, 0));
        g.add(band(r, h * 0.25, 0.04, mats.orange));
        const dish = new Mesh(new SphereGeometry(r * 0.35, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mats.steel);
        dish.position.set(r * 0.55, h / 2, 0);
        dish.rotation.z = -0.5;
        g.add(dish);
      } else if (def.id === 'cabin_s3') {
        g.add(new Mesh(lathe([[0.01, -h / 2], [r, -h / 2], [r, h / 2 - r * 0.55], [r * 0.86, h / 2 - r * 0.22], [r * 0.5, h / 2 - 0.02], [0.01, h / 2]]), mats.white));
        g.add(band(r, -h / 2 + 0.2, 0.28, mats.orange));
        for (let i = 0; i < 4; i++) {
          const win = new Mesh(new SphereGeometry(0.22, 10, 8), mats.glass);
          const a = (i / 4) * Math.PI * 2 + 0.4;
          win.position.set(Math.cos(a) * r * 0.97, h * 0.12, Math.sin(a) * r * 0.97);
          win.scale.set(0.5, 1, 0.5);
          g.add(win);
        }
      } else {
        g.add(new Mesh(lathe([[0.01, -h / 2], [r * 0.98, -h / 2], [r, -h / 2 + 0.06 * h], [r * 0.62, h / 2 - 0.22 * h], [r * 0.3, h / 2 - 0.04 * h], [r * 0.14, h / 2]]), mats.white));
        const win = new Mesh(new SphereGeometry(r * 0.2, 10, 8), mats.glass);
        win.position.set(0, h * 0.05, r * 0.72);
        win.scale.set(1, 1.2, 0.35);
        g.add(win);
        g.add(band(r * 0.99, -h / 2 + 0.07 * h, 0.05 * h, mats.orange));
      }
      break;
    }
    case 'tank': {
      g.add(cyl(r, r, h, mats.white, 0));
      const bh = Math.min(0.28, h * 0.1);
      g.add(band(r, h / 2 - bh / 2, bh, mats.orange));
      g.add(band(r, -h / 2 + bh / 2, bh, mats.orange));
      if (h > 3.5) g.add(band(r, 0, bh * 0.5, mats.dark));
      break;
    }
    case 'engine': {
      const nuclear = def.id === 'eng_phoenix';
      const mount = Math.min(0.55, h * 0.22);
      g.add(cyl(r * 0.98, r * 0.98, mount, nuclear ? mats.white : mats.dark, h / 2 - mount / 2));
      if (nuclear) {
        g.add(cyl(r * 0.5, r * 0.5, h * 0.4, mats.steel, h / 2 - mount - h * 0.2));
        g.add(band(r * 0.5, h / 2 - mount - 0.1, 0.1, mats.orange));
      }
      const top = h / 2 - mount;
      g.add(new Mesh(lathe([[r * 0.85, top], [r * 0.4, top - (top + h / 2) * 0.35], [r * 0.34, top - (top + h / 2) * 0.55], [r * 0.5, -h / 2 + (top + h / 2) * 0.22], [r * 0.82, -h / 2]], 32), mats.dark));
      g.add(new Mesh(lathe([[r * 0.8, -h / 2 + 0.005], [r * 0.8, -h / 2 + 0.05]], 32), mats.steel));
      break;
    }
    case 'srb': {
      const bodyH = h * 0.78;
      g.add(cyl(r, r, bodyH, mats.booster, -h / 2 + 0.1 * h + bodyH / 2));
      g.add(new Mesh(lathe(ogive(r, h * 0.2).map(([rr, y]) => [rr, y + h / 2 - h * 0.1] as [number, number])), mats.black));
      g.add(new Mesh(lathe([[r * 0.5, -h / 2 + 0.12 * h], [r * 0.35, -h / 2 + 0.05 * h], [r * 0.6, -h / 2]], 20), mats.dark));
      g.add(band(r, -h / 2 + 0.25 * h, 0.1, mats.black));
      break;
    }
    case 'decoupler': {
      g.add(cyl(r, r, h, mats.dark, 0));
      g.add(band(r, 0, h * 0.35, mats.orange));
      break;
    }
    case 'adapter': {
      const mesh = new Mesh(new CylinderGeometry(def.topDia! / 2, def.bottomDia! / 2, h, 28), mats.white);
      g.add(mesh);
      const ring = new Mesh(new CylinderGeometry(def.topDia! / 2 * 1.01, def.topDia! / 2 * 1.01 + 0.03, 0.08, 28), mats.orange);
      ring.position.y = h / 2 - 0.04;
      g.add(ring);
      break;
    }
    case 'nose': {
      g.add(new Mesh(lathe(ogive(r, h)), mats.white));
      g.add(band(r * 0.99, -h / 2 + 0.06, 0.1, mats.orange));
      break;
    }
    case 'fairing': {
      g.add(cyl(r * 1.0, r * 1.0, h, mats.white, 0));
      g.add(band(r, 0, h * 0.4, mats.orange));
      break;
    }
    case 'shield': {
      g.add(new Mesh(lathe([[0.01, -h / 2 - 0.05], [r * 0.7, -h / 2 - 0.02], [r * 1.0, -h / 2 + 0.03], [r * 1.0, h / 2]]), mats.shield));
      break;
    }
    case 'chute': {
      const c = cyl(r, r, h, mats.orange, 0, 12);
      g.add(c);
      g.add(cyl(r * 1.02, r * 1.02, 0.05, mats.dark, h / 2 - 0.025, 12));
      break;
    }
    case 'jump': {
      g.add(cyl(r, r, h, mats.dark, 0));
      const t = new Mesh(new TorusGeometry(r * 1.0, 0.09, 12, 48), mats.jump);
      t.rotation.x = Math.PI / 2;
      t.name = 'jumpring';
      g.add(t);
      const t2 = t.clone();
      t2.position.y = h * 0.32;
      t2.scale.setScalar(0.96);
      g.add(t2);
      const t3 = t.clone();
      t3.position.y = -h * 0.32;
      t3.scale.setScalar(0.96);
      g.add(t3);
      break;
    }
    case 'leg': break; // dynamic
  }
  g.userData.partId = p.id;
  return g;
}

export class PartView {
  group = new Group();
  // dynamic bits
  legStrutA: Mesh | null = null;
  legStrutB: Mesh | null = null;
  legFoot: Mesh | null = null;
  canopy: Group | null = null;
  lines: LineSegments | null = null;
  shell: Group | null = null;
  jumpRing: Mesh | null = null;
  flame: { outer: Mesh; inner: Mesh } | null = null;
  materials: MeshStandardMaterial[] = [];

  constructor(readonly part: PartRT, vessel: Vessel) {
    const def = part.def;
    this.group.position.copy(part.pos);
    this.group.userData.partId = part.id;
    if (def.kind === 'leg') {
      const mk = (r: number) => new Mesh(new CylinderGeometry(r, r, 1, 8), mats.leg);
      this.legStrutA = mk(0.06);
      this.legStrutB = mk(0.04);
      this.legFoot = new Mesh(new CylinderGeometry(0.3, 0.32, 0.06, 14), mats.steel);
      this.group.add(this.legStrutA, this.legStrutB, this.legFoot);
    } else if (def.kind === 'fairing' && part.half) {
      this.group.add(this.buildShell(part, vessel));
    } else {
      this.group.add(buildBody(def, part));
      if (def.kind === 'fairing' && !part.jettisoned) {
        this.shell = this.buildShell(part, vessel);
        this.group.add(this.shell);
      }
      if (def.kind === 'chute') {
        const rc = Math.sqrt((def.chuteArea ?? 100) / (2 * Math.PI));
        this.canopy = new Group();
        const sph = new SphereGeometry(rc, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2);
        const colors: number[] = [];
        const pos = sph.attributes.position;
        const a = new Color(0xff6a2a);
        const b = new Color(0xf4f4f4);
        for (let i = 0; i < pos.count; i++) {
          const ang = Math.atan2(pos.getZ(i), pos.getX(i)) + Math.PI;
          const c = Math.floor((ang / (Math.PI * 2)) * 12) % 2 ? a : b;
          colors.push(c.r, c.g, c.b);
        }
        sph.setAttribute('color', new Float32BufferAttribute(colors, 3));
        const m = new Mesh(sph, new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: DoubleSide }));
        this.canopy.add(m);
        this.canopy.visible = false;
        this.group.add(this.canopy);
        const lg = new BufferGeometry();
        lg.setAttribute('position', new Float32BufferAttribute(new Float32Array(16 * 3), 3));
        this.lines = new LineSegments(lg, new LineBasicMaterial({ color: 0xdddddd }));
        this.lines.visible = false;
        this.group.add(this.lines);
      }
      if (def.kind === 'jump') this.jumpRing = this.group.getObjectByName('jumpring') as Mesh;
      if (def.kind === 'engine' || def.kind === 'srb') {
        const unit = new CylinderGeometry(1, 0.05, 1, 18, 1, true);
        unit.translate(0, -0.5, 0);
        const outer = new Mesh(unit, new MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
        const inner = new Mesh(unit, new MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
        outer.position.y = -def.length / 2;
        inner.position.y = -def.length / 2;
        outer.visible = false;
        inner.visible = false;
        this.group.add(outer, inner);
        this.flame = { outer, inner };
      }
    }
    this.group.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && m.material && (m.material as MeshStandardMaterial).emissive) {
        m.userData.partId = part.id;
      }
    });
  }

  private buildShell(part: PartRT, vessel: Vessel): Group {
    const g = new Group();
    const r = (part.def.dia / 2) * 1.04;
    const H = fairingShellHeight(vessel, part);
    const Hc = H * 0.6;
    const halves = part.half ? [part.half - 1] : [0, 1];
    // a whole fairing stands on its ring; a loose half is centred on its own origin
    const y0 = part.half ? -H / 2 : part.def.length / 2;
    const tipProfile = ogive(r, H - Hc, 10).map(([rr, y]) => new Vector2(Math.max(0.0001, rr), y));
    for (const hf of halves) {
      const theta = hf * Math.PI;
      const body = new Mesh(new CylinderGeometry(r, r, Hc, 20, 1, true, theta, Math.PI), mats.fairing);
      body.position.y = y0 + Hc / 2;
      const tip = new Mesh(new LatheGeometry(tipProfile, 20, theta, Math.PI), mats.fairing);
      tip.position.y = y0 + Hc + (H - Hc) / 2;
      g.add(body, tip);
    }
    return g;
  }

  update(burnVisible: boolean, vacuum: number, time: number): void {
    const p = this.part;
    if (this.shell) this.shell.visible = !p.jettisoned;
    if (this.legStrutA && this.legStrutB && this.legFoot) {
      const L = p.def.legLength ?? 1.5;
      const out = new Vector3(Math.cos(p.angle), 0, Math.sin(p.angle));
      // attachment high on the part; folded foot hugs the hull below, deployed foot reaches the contact point
      const attach = new Vector3(0, p.def.length * 0.3, 0);
      const folded = new Vector3(0, -p.def.length * 0.5, 0);
      const deployed = new Vector3(out.x * L * 0.45, -L, out.z * L * 0.45);
      const foot = folded.lerp(deployed, p.leg);
      const knee = attach.clone().lerp(foot, 0.45).addScaledVector(out, 0.25 * L * (0.3 + 0.7 * p.leg));
      const seg = (m: Mesh, a: Vector3, b: Vector3) => {
        const d = b.clone().sub(a);
        const len = Math.max(0.001, d.length());
        m.position.copy(a).addScaledVector(d, 0.5);
        m.scale.set(1, len, 1);
        m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), d.normalize());
      };
      seg(this.legStrutA, attach, knee);
      seg(this.legStrutB, knee, foot);
      this.legFoot.position.copy(foot);
    }
    if (this.canopy && this.lines) {
      const state = p.chute;
      const show = state === 'reefed' || state === 'inflating' || state === 'full';
      this.canopy.visible = show;
      this.lines.visible = show;
      if (show) {
        const rc = Math.sqrt((p.def.chuteArea ?? 100) / (2 * Math.PI));
        const frac = state === 'reefed' ? 0.1 : state === 'inflating' ? 0.1 + 0.9 * Math.min(1, p.chuteT / 3) : 1;
        const sx = 0.18 + 0.82 * Math.sqrt(frac);
        const sy = 0.6 + 0.4 * frac;
        const lineLen = rc * 1.9 * (0.5 + 0.5 * frac);
        this.canopy.scale.set(sx, sy, sx);
        this.canopy.position.set(0, lineLen, 0);
        const pos = this.lines.geometry.attributes.position as Float32BufferAttribute;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          pos.setXYZ(i * 2, Math.cos(a) * rc * sx, lineLen + 0.05, Math.sin(a) * rc * sx);
          pos.setXYZ(i * 2 + 1, 0, 0.1, 0);
        }
        pos.needsUpdate = true;
      }
    }
    if (this.jumpRing) this.jumpRing.rotation.z = time * 0.8;
    if (this.flame) {
      const f = this.flame;
      const on = burnVisible && p.burn > 0.02;
      f.outer.visible = on;
      f.inner.visible = on;
      if (on) {
        const def = p.def;
        const thrust = (def.thrust ?? 1e5) * p.burn;
        const len = (1.6 + Math.pow(thrust / 1e5, 0.45) * 2.2) * (0.92 + Math.random() * 0.16) * (def.kind === 'srb' ? 1.2 : 1);
        const wid = def.kind === 'srb' ? p.radius * 0.7 : p.radius * 0.8;
        const spread = 1 + vacuum * 0.9;
        f.outer.scale.set(wid * spread, len * (1 + vacuum * 0.4), wid * spread);
        f.inner.scale.set(wid * 0.5 * spread, len * 0.55, wid * 0.5 * spread);
        const nuclear = def.id === 'eng_phoenix';
        (f.outer.material as MeshBasicMaterial).color.setHex(nuclear ? 0xff5fb0 : def.ispVac && def.ispVac > 400 ? 0x6ab4ff : 0xff8a2a);
        (f.inner.material as MeshBasicMaterial).color.setHex(nuclear ? 0xffe0f0 : def.ispVac && def.ispVac > 400 ? 0xdcefff : 0xfff1c4);
      }
    }
  }

  setHighlight(on: boolean): void {
    this.group.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      const mat = m.material as MeshStandardMaterial;
      if (!mat || !mat.emissive || m.userData.noHighlight) return;
      if (on) {
        if (!m.userData.origMat) {
          m.userData.origMat = mat;
          const c = mat.clone();
          c.emissive = SELECT_EMISSIVE.clone();
          c.emissiveIntensity = 0.55;
          m.material = c;
        }
      } else if (m.userData.origMat) {
        (m.material as MeshStandardMaterial).dispose();
        m.material = m.userData.origMat;
        m.userData.origMat = null;
      }
    });
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}

/** Visual for one vessel: a group of part views, rebuilt when parts are added/removed. */
export class VesselView {
  readonly group = new Group();
  readonly parts = new Map<number, PartView>();
  private key = '';
  private plasma: Mesh;
  private plasmaMat: MeshBasicMaterial;

  constructor(public vessel: Vessel) {
    this.plasmaMat = new MeshBasicMaterial({ color: 0xff7a2e, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
    this.plasma = new Mesh(new SphereGeometry(1, 20, 14), this.plasmaMat);
    this.plasma.visible = false;
    this.group.add(this.plasma);
    this.rebuild();
  }

  private makeKey(): string {
    return this.vessel.parts.map((p) => `${p.id}${p.jettisoned ? 'j' : ''}${p.half}`).join(',');
  }

  rebuild(): void {
    for (const pv of this.parts.values()) { this.group.remove(pv.group); pv.dispose(); }
    this.parts.clear();
    for (const p of this.vessel.parts) {
      const pv = new PartView(p, this.vessel);
      this.parts.set(p.id, pv);
      this.group.add(pv.group);
    }
    this.key = this.makeKey();
  }

  /** Brings the model in line with the simulation state. originRel is the design-space origin relative to the camera. */
  update(originRel: Vector3, time: number, vacuum: number, plasma: number, airDirLocal: Vector3 | null): void {
    const v = this.vessel;
    if (this.makeKey() !== this.key) this.rebuild();
    this.group.position.copy(originRel);
    this.group.quaternion.copy(v.quat);
    for (const pv of this.parts.values()) pv.update(true, vacuum, time);
    const d = v.derived;
    if (plasma > 0.03 && airDirLocal) {
      this.plasma.visible = true;
      const r = Math.max(1, d.radiusMax) * 1.35;
      this.plasma.scale.set(r * 1.1, r * (1.0 + plasma * 1.2), r * 1.1);
      // sit just ahead of the vessel, on whichever end the air is hitting
      const front = airDirLocal.y < 0 ? d.top : d.bottom;
      this.plasma.position.set(0, front + (airDirLocal.y < 0 ? 0.3 : -0.3) * r, 0);
      this.plasmaMat.opacity = Math.min(0.75, plasma * 0.7);
      this.plasmaMat.color.setHSL(0.07 - Math.min(0.05, plasma * 0.04), 1, 0.55);
    } else this.plasma.visible = false;
  }

  highlight(ids: Set<number>): void {
    for (const [id, pv] of this.parts) pv.setHighlight(ids.has(id));
  }

  dispose(): void {
    for (const pv of this.parts.values()) pv.dispose();
    this.plasma.geometry.dispose();
    this.plasmaMat.dispose();
  }
}

