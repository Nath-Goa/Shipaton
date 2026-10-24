import {
  ACESFilmicToneMapping, AmbientLight, Color, DirectionalLight, GridHelper, Group, Mesh, MeshBasicMaterial, PerspectiveCamera,
  PMREMGenerator, Raycaster, Scene, SphereGeometry, SRGBColorSpace, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Design, FreeNode, layout } from '../sim/design';
import { vesselFromDesign, Vessel } from '../sim/vessel';
import { VesselView } from './partMeshes';

export type Pick = { kind: 'node'; part: number; node: 'top' | 'bottom' } | { kind: 'part'; id: number } | null;

export class EditorScene {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(45, 1, 0.05, 2000);
  private view: VesselView | null = null;
  private vessel: Vessel | null = null;
  private markers = new Group();
  private markerMeshes: Mesh[] = [];
  private grid = new GridHelper(60, 60, 0x3a4a6a, 0x1b2438);
  private yaw = 0.6;
  private pitch = 0.25;
  private dist = 18;
  private target = new Vector3();
  private ray = new Raycaster();
  private raf = 0;
  private time = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.setClearColor(new Color(0x0b1220));
    this.scene.add(new AmbientLight(0xffffff, 0.35), this.markers, this.grid);
    const key = new DirectionalLight(0xffffff, 2.4);
    key.position.set(8, 14, 10);
    const rim = new DirectionalLight(0x6a8cff, 0.9);
    rim.position.set(-10, 4, -8);
    this.scene.add(key, rim);
    const pm = new PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.5;
    pm.dispose();
    const loop = () => { this.raf = requestAnimationFrame(loop); this.render(); };
    loop();
  }

  resize(): void {
    const c = this.canvas;
    const w = c.clientWidth;
    const h = c.clientHeight;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  setDesign(d: Design, refocus = false): void {
    if (this.view) { this.scene.remove(this.view.group); this.view.dispose(); this.view = null; }
    if (d.parts.length === 0) { this.vessel = null; this.target.set(0, 0, 0); this.dist = 12; return; }
    this.vessel = vesselFromDesign(d, 'earth');
    this.vessel.quat.identity();
    this.view = new VesselView(this.vessel);
    this.scene.add(this.view.group);
    const placed = layout(d);
    let top = -Infinity, bottom = Infinity, rad = 0;
    for (const p of placed.values()) { top = Math.max(top, p.yTop); bottom = Math.min(bottom, p.yBottom); rad = Math.max(rad, Math.abs(p.pos.x) + p.radius); }
    this.grid.position.y = bottom - 0.3;
    const needed = Math.max(10, (top - bottom) * 1.4 + rad * 3);
    this.target.set(0, (top + bottom) / 2, 0);
    if (refocus || this.dist < needed) this.dist = needed;
    // part views are positioned in design space, so the group sits at the origin
    this.view.update(new Vector3(), 0, 0, 0, null);
  }

  setMarkers(nodes: FreeNode[], active: { part: number; node: string } | null, d: Design): void {
    for (const m of this.markerMeshes) { this.markers.remove(m); m.geometry.dispose(); (m.material as MeshBasicMaterial).dispose(); }
    this.markerMeshes = [];
    const placed = layout(d);
    for (const n of nodes) {
      const p = placed.get(n.part);
      if (!p) continue;
      const isActive = active && active.part === n.part && active.node === n.node;
      const mesh = new Mesh(
        new SphereGeometry(Math.max(0.16, n.dia * 0.1), 14, 10),
        new MeshBasicMaterial({ color: isActive ? 0xffa030 : 0x4aa8ff, transparent: true, opacity: isActive ? 1 : 0.75, depthTest: false }),
      );
      mesh.renderOrder = 10;
      mesh.position.set(0, n.node === 'top' ? p.yTop : p.yBottom, 0);
      mesh.userData = { part: n.part, node: n.node };
      this.markers.add(mesh);
      this.markerMeshes.push(mesh);
    }
  }

  highlight(ids: Set<number>): void { this.view?.highlight(ids); }

  orbit(dx: number, dy: number): void {
    this.yaw -= dx * 0.008;
    this.pitch = Math.max(-1.4, Math.min(1.45, this.pitch + dy * 0.008));
  }

  pan(dy: number): void { this.target.y += dy * this.dist * 0.0016; }

  zoom(f: number): void { this.dist = Math.max(3, Math.min(400, this.dist * f)); }

  pick(clientX: number, clientY: number): Pick {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hitsN = this.ray.intersectObjects(this.markerMeshes, false);
    if (hitsN.length) return { kind: 'node', part: hitsN[0].object.userData.part, node: hitsN[0].object.userData.node };
    if (this.view) {
      const hits = this.ray.intersectObject(this.view.group, true);
      for (const h of hits) {
        let o: Mesh | null = h.object as Mesh;
        while (o) {
          if (o.userData?.partId !== undefined) return { kind: 'part', id: o.userData.partId };
          o = o.parent as Mesh | null;
        }
      }
    }
    return null;
  }

  render(): void {
    this.time += 0.016;
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.dist,
      this.target.y + Math.sin(this.pitch) * this.dist,
      this.target.z + Math.cos(this.yaw) * cp * this.dist,
    );
    this.camera.lookAt(this.target);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.view?.dispose();
    this.renderer.dispose();
  }
}

