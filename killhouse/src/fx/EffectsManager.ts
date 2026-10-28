import * as THREE from 'three';
import type { Surface } from '../level/CollisionWorld';
import type { TextureLibrary } from '../level/ProceduralTextures';
import { DecalSystem } from './DecalSystem';
import { ParticleSystem, type ParticleParams } from './ParticleSystem';
import { TracerSystem } from './TracerSystem';

export type ImpactKind = Surface | 'flesh' | 'armor' | 'drone';
export type TracerKind = 'player' | 'enemy' | 'laser';

interface FlashSprite {
  readonly sprite: THREE.Sprite;
  timer: number;
}

const params: ParticleParams = { r: 1, g: 1, b: 1, alpha: 1, size: 0.1, endSize: 0.1, life: 1, gravity: 0, drag: 0 };

function setParams(r: number, g: number, b: number, alpha: number, size: number, endSize: number, life: number, gravity: number, drag: number): ParticleParams {
  params.r = r;
  params.g = g;
  params.b = b;
  params.alpha = alpha;
  params.size = size;
  params.endSize = endSize;
  params.life = life;
  params.gravity = gravity;
  params.drag = drag;
  return params;
}

const rand = (min: number, max: number): number => min + Math.random() * (max - min);

/** One entry point for every visual consequence of a shot: sparks, dust, holes, tracers, flashes. */
export class EffectsManager {
  private readonly sparks = new ParticleSystem(700, THREE.AdditiveBlending);
  private readonly smoke = new ParticleSystem(420, THREE.NormalBlending);
  private readonly decals: DecalSystem;
  private readonly tracers = new TracerSystem(28);
  private readonly flashLight = new THREE.PointLight(0xffb060, 0, 10, 2);
  private flashTimer = 0;
  private flashDuration = 0.06;
  private flashPeak = 0;
  private readonly sprites: FlashSprite[] = [];
  private spriteCursor = 0;
  private readonly dir = new THREE.Vector3();

  constructor(scene: THREE.Scene, textures: TextureLibrary) {
    this.decals = new DecalSystem(textures.bulletHole, 140);
    this.flashLight.layers.enableAll();
    scene.add(this.sparks.points, this.smoke.points, this.decals.mesh, this.tracers.group, this.flashLight);
    for (let i = 0; i < 4; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: textures.muzzleFlash,
          color: 0xffc070,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
          fog: false,
        }),
      );
      sprite.scale.setScalar(0.55);
      sprite.visible = false;
      sprite.renderOrder = 6;
      scene.add(sprite);
      this.sprites.push({ sprite, timer: 0 });
    }
  }

  /** Pixels per world unit at 1 m, so particle sizes are specified in metres. */
  setPointScale(scale: number): void {
    this.sparks.setScale(scale);
    this.smoke.setScale(scale);
  }

  impact(point: THREE.Vector3, normal: THREE.Vector3, kind: ImpactKind): void {
    switch (kind) {
      case 'concrete':
      case 'brick': {
        const dust = kind === 'brick' ? [0.48, 0.32, 0.26] : [0.56, 0.54, 0.5];
        this.burst(this.smoke, point, normal, 7, 0.5, 2.0, 0.9, setParams(dust[0], dust[1], dust[2], 0.55, 0.07, 0.48, rand(0.7, 1.1), 0.35, 3.5));
        this.burst(this.smoke, point, normal, 5, 2.0, 4.0, 0.7, setParams(0.18, 0.17, 0.16, 1, 0.026, 0.02, 0.55, 9.8, 0.6));
        this.burst(this.sparks, point, normal, 2, 3.0, 6.0, 0.8, setParams(1, 0.75, 0.4, 1, 0.025, 0.0, 0.16, 6, 1.2));
        break;
      }
      case 'metal':
      case 'crate': {
        this.burst(this.sparks, point, normal, 13, 3.0, 8.5, 0.85, setParams(1, 0.72, 0.32, 1, 0.032, 0.0, rand(0.18, 0.34), 9, 1.4));
        this.burst(this.smoke, point, normal, 2, 0.3, 0.9, 0.6, setParams(0.4, 0.4, 0.4, 0.4, 0.06, 0.3, 0.6, -0.2, 2.5));
        break;
      }
      case 'flesh': {
        this.burst(this.smoke, point, normal, 7, 0.6, 2.2, 0.9, setParams(0.3, 0.025, 0.02, 0.85, 0.06, 0.3, rand(0.32, 0.48), 0.6, 4));
        this.burst(this.smoke, point, normal, 5, 1.5, 3.5, 0.8, setParams(0.22, 0.02, 0.015, 1, 0.022, 0.02, 0.5, 9.8, 0.8));
        break;
      }
      case 'armor': {
        this.burst(this.sparks, point, normal, 9, 2.5, 7, 0.9, setParams(1, 0.8, 0.45, 1, 0.03, 0.0, 0.22, 8, 1.5));
        this.burst(this.smoke, point, normal, 4, 0.5, 1.6, 0.9, setParams(0.3, 0.05, 0.04, 0.7, 0.05, 0.24, 0.4, 0.6, 4));
        break;
      }
      case 'drone': {
        this.burst(this.sparks, point, normal, 14, 2.5, 8, 1, setParams(1, 0.7, 0.3, 1, 0.03, 0.0, 0.3, 9, 1.2));
        this.burst(this.sparks, point, normal, 5, 1.5, 4, 1, setParams(0.45, 0.8, 1, 1, 0.035, 0.0, 0.2, 2, 3));
        this.burst(this.smoke, point, normal, 3, 0.3, 1, 0.8, setParams(0.12, 0.12, 0.13, 0.7, 0.08, 0.4, 0.8, -0.3, 2));
        break;
      }
    }
  }

  bulletHole(point: THREE.Vector3, normal: THREE.Vector3): void {
    this.decals.add(point, normal, rand(0.07, 0.1), rand(0, Math.PI * 2));
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, kind: TracerKind): void {
    if (kind === 'player') this.tracers.fire(from, to, 0xffd28a, 0.006, 340, 3.2);
    else if (kind === 'enemy') this.tracers.fire(from, to, 0xff9a52, 0.008, 210, 2.6);
    else this.tracers.fire(from, to, 0xff3020, 0.014, 160, 3.6);
  }

  /** World-space flash for enemy weapons: billboard plus a shared point light. */
  muzzleFlash(position: THREE.Vector3, color: number, lightIntensity: number): void {
    const flash = this.sprites[this.spriteCursor];
    this.spriteCursor = (this.spriteCursor + 1) % this.sprites.length;
    flash.sprite.position.copy(position);
    flash.sprite.material.color.setHex(color);
    flash.sprite.material.rotation = Math.random() * Math.PI * 2;
    flash.sprite.scale.setScalar(rand(0.4, 0.65));
    flash.sprite.visible = true;
    flash.timer = 0.05;
    this.lightFlash(position, color, lightIntensity, 0.07);
  }

  explosion(position: THREE.Vector3): void {
    this.dir.set(0, 1, 0);
    this.burst(this.sparks, position, this.dir, 60, 3, 11, 1, setParams(1, 0.65, 0.25, 1, 0.045, 0.0, rand(0.4, 0.9), 9, 0.9));
    this.burst(this.smoke, position, this.dir, 26, 0.6, 3.2, 1, setParams(0.09, 0.085, 0.08, 0.85, 0.4, 2.2, rand(1.3, 2.3), -0.5, 1.2));
    this.burst(this.sparks, position, this.dir, 10, 0.5, 2, 1, setParams(1, 0.45, 0.15, 0.9, 0.5, 1.4, 0.25, -1, 3));
    this.decals.add(new THREE.Vector3(position.x, 0, position.z), this.dir, 1.8, rand(0, Math.PI * 2));
    this.lightFlash(position, 0xff8a3a, 120, 0.32);
  }

  /** Short sparking trail for a falling drone. */
  trail(position: THREE.Vector3): void {
    this.dir.set(0, 1, 0);
    this.burst(this.sparks, position, this.dir, 2, 0.5, 2, 1, setParams(1, 0.6, 0.25, 1, 0.03, 0, 0.3, 4, 1));
    this.burst(this.smoke, position, this.dir, 1, 0.2, 0.6, 1, setParams(0.08, 0.08, 0.08, 0.7, 0.12, 0.6, 1.1, -0.6, 1.5));
  }

  update(dt: number): void {
    this.sparks.update(dt);
    this.smoke.update(dt);
    this.tracers.update(dt);
    if (this.flashTimer > 0) {
      this.flashTimer = Math.max(0, this.flashTimer - dt);
      const t = this.flashTimer / this.flashDuration;
      this.flashLight.intensity = this.flashPeak * t * t;
    }
    for (const flash of this.sprites) {
      if (flash.timer <= 0) continue;
      flash.timer -= dt;
      if (flash.timer <= 0) flash.sprite.visible = false;
    }
  }

  clear(): void {
    this.sparks.clear();
    this.smoke.clear();
    this.decals.clear();
    this.tracers.clear();
    this.flashTimer = 0;
    this.flashLight.intensity = 0;
    for (const flash of this.sprites) {
      flash.timer = 0;
      flash.sprite.visible = false;
    }
  }

  private lightFlash(position: THREE.Vector3, color: number, peak: number, duration: number): void {
    if (this.flashTimer > 0 && this.flashPeak * (this.flashTimer / this.flashDuration) > peak) return;
    this.flashLight.position.copy(position);
    this.flashLight.color.setHex(color);
    this.flashPeak = peak;
    this.flashDuration = duration;
    this.flashTimer = duration;
    this.flashLight.intensity = peak;
  }

  private burst(
    system: ParticleSystem,
    point: THREE.Vector3,
    normal: THREE.Vector3,
    count: number,
    minSpeed: number,
    maxSpeed: number,
    spread: number,
    p: ParticleParams,
  ): void {
    const baseLife = p.life;
    for (let i = 0; i < count; i++) {
      let x = Math.random() * 2 - 1;
      let y = Math.random() * 2 - 1;
      let z = Math.random() * 2 - 1;
      const len = Math.hypot(x, y, z) || 1;
      x = normal.x + (x / len) * spread;
      y = normal.y + (y / len) * spread;
      z = normal.z + (z / len) * spread;
      const n = Math.hypot(x, y, z) || 1;
      const speed = rand(minSpeed, maxSpeed);
      p.life = baseLife * rand(0.75, 1.25);
      system.emit(
        point.x + normal.x * 0.02,
        point.y + normal.y * 0.02,
        point.z + normal.z * 0.02,
        (x / n) * speed,
        (y / n) * speed,
        (z / n) * speed,
        p,
      );
    }
    p.life = baseLife;
  }
}
