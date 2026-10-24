import {
  BoxGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SphereGeometry, CapsuleGeometry,
} from 'three';

const suit = new MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.7, metalness: 0.05 });
const visor = new MeshStandardMaterial({ color: 0xd9a93a, roughness: 0.1, metalness: 0.95 });
const dark = new MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.6, metalness: 0.4 });
const concrete = new MeshStandardMaterial({ color: 0x8e8f90, roughness: 0.95 });
const steel = new MeshStandardMaterial({ color: 0xb0452f, roughness: 0.6, metalness: 0.4 });
const poleMat = new MeshStandardMaterial({ color: 0xdedede, roughness: 0.4, metalness: 0.6 });
const flagMat = new MeshStandardMaterial({ color: 0xe8453c, roughness: 0.8, side: DoubleSide });

export class Astronaut {
  readonly group = new Group();
  private legL: Group;
  private legR: Group;
  private armL: Group;
  private armR: Group;
  private phase = 0;

  constructor() {
    const torso = new Mesh(new CapsuleGeometry(0.24, 0.42, 6, 12), suit);
    torso.position.y = 1.15;
    const head = new Mesh(new SphereGeometry(0.22, 18, 14), suit);
    head.position.y = 1.78;
    const v = new Mesh(new SphereGeometry(0.17, 16, 12, -1.1, 2.2, 0.3, 1.9), visor);
    v.position.set(0, 1.79, 0.07);
    v.scale.set(1.03, 1, 1.03);
    const pack = new Mesh(new BoxGeometry(0.46, 0.62, 0.22), suit);
    pack.position.set(0, 1.2, -0.3);
    const packTrim = new Mesh(new BoxGeometry(0.4, 0.1, 0.24), dark);
    packTrim.position.set(0, 1.0, -0.3);
    this.group.add(torso, head, v, pack, packTrim);
    const limb = (len: number, w: number, x: number, y: number): Group => {
      const g = new Group();
      const m = new Mesh(new CapsuleGeometry(w, len, 4, 8), suit);
      m.position.y = -len / 2;
      const boot = new Mesh(new SphereGeometry(w * 1.15, 8, 6), dark);
      boot.position.y = -len - w * 0.4;
      g.add(m, boot);
      g.position.set(x, y, 0);
      this.group.add(g);
      return g;
    };
    this.legL = limb(0.55, 0.11, -0.13, 0.85);
    this.legR = limb(0.55, 0.11, 0.13, 0.85);
    this.armL = limb(0.42, 0.09, -0.34, 1.5);
    this.armR = limb(0.42, 0.09, 0.34, 1.5);
  }

  /** speed in m/s drives the walk cycle; airborne freezes the pose. */
  animate(dt: number, speed: number, airborne: boolean): void {
    if (airborne) {
      this.legL.rotation.x = -0.5;
      this.legR.rotation.x = 0.4;
      this.armL.rotation.x = 0.6;
      this.armR.rotation.x = 0.6;
      return;
    }
    this.phase += dt * speed * 3.2;
    const s = Math.min(1, speed / 3) * 0.7;
    this.legL.rotation.x = Math.sin(this.phase) * s;
    this.legR.rotation.x = -Math.sin(this.phase) * s;
    this.armL.rotation.x = -Math.sin(this.phase) * s * 0.8;
    this.armR.rotation.x = Math.sin(this.phase) * s * 0.8;
  }
}

export function makeFlag(): Group {
  const g = new Group();
  const pole = new Mesh(new CylinderGeometry(0.025, 0.025, 2.2, 8), poleMat);
  pole.position.y = 1.1;
  const cloth = new Mesh(new PlaneGeometry(1.1, 0.7, 6, 3), flagMat);
  cloth.position.set(0.57, 1.85, 0);
  const pos = cloth.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 4) * 0.05);
  g.add(pole, cloth);
  return g;
}

/** Launch pad: a concrete apron, a flame trench and a service tower. */
export function makePad(): Group {
  const g = new Group();
  const apron = new Mesh(new CylinderGeometry(55, 58, 1.6, 48), concrete);
  apron.position.y = -0.8;
  g.add(apron);
  const mount = new Mesh(new CylinderGeometry(7, 8, 1.2, 24), new MeshStandardMaterial({ color: 0x55575b, roughness: 0.8 }));
  mount.position.y = 0.0;
  g.add(mount);
  const tower = new Group();
  const legs = [[-2, -2], [2, -2], [-2, 2], [2, 2]];
  for (const [x, z] of legs) {
    const leg = new Mesh(new BoxGeometry(0.4, 80, 0.4), steel);
    leg.position.set(x, 40, z);
    tower.add(leg);
  }
  for (let y = 4; y < 80; y += 8) {
    const braceA = new Mesh(new BoxGeometry(4.4, 0.3, 0.3), steel);
    braceA.position.set(0, y, 2);
    const braceB = braceA.clone();
    braceB.position.z = -2;
    const braceC = new Mesh(new BoxGeometry(0.3, 0.3, 4.4), steel);
    braceC.position.set(2, y, 0);
    const braceD = braceC.clone();
    braceD.position.x = -2;
    tower.add(braceA, braceB, braceC, braceD);
  }
  const arm = new Mesh(new BoxGeometry(10, 0.6, 1.2), steel);
  arm.position.set(-6, 52, 0);
  tower.add(arm);
  tower.position.set(-14, 0, 0);
  g.add(tower);
  for (let i = 0; i < 4; i++) {
    const lamp = new Mesh(new CylinderGeometry(0.2, 0.2, 18, 8), poleMat);
    const a = (i / 4) * Math.PI * 2 + 0.6;
    lamp.position.set(Math.cos(a) * 46, 9, Math.sin(a) * 46);
    g.add(lamp);
  }
  return g;
}
