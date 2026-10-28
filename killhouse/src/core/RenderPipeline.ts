import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { WORLD } from '../config';
import { clamp } from '../utils/math';
import { VIEWMODEL_LAYER } from '../weapons/WeaponModel';

const VIEWMODEL_FOV = 58;

/**
 * Owns the WebGL renderer and draws each frame in two passes: the world, then
 * (after clearing depth) the first-person rig with its own narrower FOV so the
 * rifle never clips into walls. Also adapts render resolution to hold frame rate.
 */
export class RenderPipeline {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.05, 140);
  readonly viewCamera = new THREE.PerspectiveCamera(VIEWMODEL_FOV, 1, 0.01, 6);
  readonly envMap: THREE.Texture;
  private zoom = 1;
  private pixelRatio: number;
  private readonly maxPixelRatio: number;
  private readonly minPixelRatio = 0.6;
  private frameAverage = 1 / 60;
  private adaptClock = 0;
  private warmup = 3;
  private readonly bufferSize = new THREE.Vector2();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    const dpr = window.devicePixelRatio || 1;
    this.maxPixelRatio = Math.min(dpr, 2);
    this.pixelRatio = Math.min(dpr, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    // In the pinned three.js (r186) PCFShadowMap *is* the soft filter (Vogel-disk PCF
    // driven by shadow.radius); PCFSoftShadowMap now only warns and falls back to it.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.autoClear = false;
    this.renderer.setClearColor(WORLD.fogColor, 1);

    this.scene.fog = new THREE.FogExp2(WORLD.fogColor, WORLD.fogDensity);
    this.scene.matrixWorldAutoUpdate = false;
    this.scene.add(this.camera);
    this.camera.add(this.viewCamera);
    this.camera.layers.set(0);
    this.viewCamera.layers.set(VIEWMODEL_LAYER);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.09;

    this.resize();
  }

  get maxAnisotropy(): number {
    return this.renderer.capabilities.getMaxAnisotropy();
  }

  /** Pixels per metre at 1 m from the camera; feeds point-sprite sizing. */
  get pointScale(): number {
    const height = this.renderer.getDrawingBufferSize(this.bufferSize).y;
    return height / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
  }

  resize(): void {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.viewCamera.aspect = width / height;
    this.applyFov();
  }

  /** Optical zoom for aiming down sights (1 = hip). */
  setZoom(zoom: number): void {
    if (Math.abs(zoom - this.zoom) < 1e-4) return;
    this.zoom = zoom;
    this.applyFov();
  }

  /** Compiles every material against both cameras before the first frame needs it. */
  async compile(): Promise<void> {
    this.scene.updateMatrixWorld(true);
    await this.renderer.compileAsync(this.scene, this.camera);
    await this.renderer.compileAsync(this.scene, this.viewCamera);
  }

  render(): void {
    const r = this.renderer;
    this.scene.updateMatrixWorld();
    r.shadowMap.needsUpdate = true;
    r.clear(true, true, false);
    r.render(this.scene, this.camera);
    r.clearDepth();
    r.render(this.scene, this.viewCamera);
  }

  /** Steps resolution down when frames run long and back up when there is headroom. */
  adapt(frameDt: number): void {
    if (frameDt <= 0 || frameDt > 0.25) return;
    if (this.warmup > 0) {
      this.warmup -= frameDt;
      return;
    }
    this.frameAverage += (frameDt - this.frameAverage) * 0.08;
    this.adaptClock += frameDt;
    if (this.adaptClock < 2) return;
    this.adaptClock = 0;
    let next = this.pixelRatio;
    if (this.frameAverage > 1 / 42) next = this.pixelRatio - 0.15;
    else if (this.frameAverage < 1 / 57) next = this.pixelRatio + 0.1;
    next = clamp(next, this.minPixelRatio, this.maxPixelRatio);
    if (Math.abs(next - this.pixelRatio) >= 0.05) {
      this.pixelRatio = next;
      this.renderer.setPixelRatio(next);
      this.resize();
    }
  }

  /** Resets the adaptive-resolution averaging after a pause or a heavy load. */
  settle(): void {
    this.warmup = 2;
    this.adaptClock = 0;
  }

  private applyFov(): void {
    // Hor+ with a 100° horizontal target, clamped so phones in portrait don't fisheye.
    const aspect = this.camera.aspect;
    const vertical = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(50)) / aspect));
    const base = clamp(vertical, 55, 80);
    this.camera.fov = base / this.zoom;
    this.camera.updateProjectionMatrix();
    // The rifle keeps a sensible width on tall portrait screens instead of filling them.
    const viewmodelBase = clamp(THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(31)) / aspect)), VIEWMODEL_FOV, 100);
    this.viewCamera.fov = viewmodelBase / (1 + (this.zoom - 1) * 0.25);
    this.viewCamera.updateProjectionMatrix();
  }
}
