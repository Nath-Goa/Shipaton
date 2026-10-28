import * as THREE from 'three';
import { WEAPON, WORLD } from '../config';
import type { AudioSystem } from '../audio/AudioSystem';
import { createEnemyHit, type ShotTargets } from '../ai/types';
import type { EffectsManager } from '../fx/EffectsManager';
import { createRayHit, type CollisionWorld } from '../level/CollisionWorld';
import type { TextureLibrary } from '../level/ProceduralTextures';
import type { PlayerController } from '../player/PlayerController';
import { Spring, TAU, clamp, damp, lerp, smoothstep } from '../utils/math';
import { VIEWMODEL_LAYER, WeaponModel } from './WeaponModel';

export interface WeaponFrameInput {
  /** Look input applied this frame, in radians (drives weapon sway). */
  readonly lookDelta: THREE.Vector2;
  /** 0..1 of walk speed. */
  readonly moveRatio: number;
  readonly triggerHeld: boolean;
  readonly tapShots: number;
  readonly reloadPressed: boolean;
  readonly adsToggle: boolean;
  readonly adsHeld: boolean;
}

export interface WeaponEvents {
  onHit(kill: boolean, headshot: boolean): void;
  onDryFire(): void;
}

interface ReloadPose {
  px: number;
  py: number;
  pz: number;
  rx: number;
  ry: number;
  rz: number;
  magY: number;
  magRX: number;
  magVisible: boolean;
  handX: number;
  handY: number;
  handZ: number;
  charge: number;
}

interface Casing {
  readonly mesh: THREE.Mesh;
  readonly velocity: THREE.Vector3;
  readonly spin: THREE.Vector3;
  life: number;
}

const NDC_CENTER = new THREE.Vector2(0, 0);
const HIP_POSITION = new THREE.Vector3(0.118, -0.142, -0.33);
const HIP_YAW = 0.035;

/**
 * The carbine: ammunition, fire control, hitscan ballistics, recoil, sway,
 * aim-down-sights and a fully procedural reload animation.
 */
export class WeaponSystem {
  readonly model: WeaponModel;
  /** Child of the world camera; every viewmodel offset is applied here. */
  readonly pivot = new THREE.Group();
  mag: number = WEAPON.magazineSize;
  reserve: number = WEAPON.startingReserve;
  shotsFired = 0;
  shotsHit = 0;
  headshots = 0;

  private readonly raycaster = new THREE.Raycaster();
  private readonly worldHit = createRayHit();
  private readonly enemyHit = createEnemyHit();
  private readonly muzzleLight = new THREE.PointLight(0xffb565, 0, 9, 2);
  private readonly adsPosition: THREE.Vector3;
  private reloading = false;
  private reloadElapsed = 0;
  private reloadDuration: number = WEAPON.reloadTime;
  private reloadEmpty = false;
  private reloadRefilled = false;
  private readonly reloadCues = new Set<string>();
  private fireCooldown = 0;
  private autoReloadTimer = -1;
  private bloom = 0;
  private adsT = 0;
  private adsWanted = false;
  private queuedShot = false;
  private dryLatch = false;
  private flashTimer = 0;
  private bobPhase = 0;
  private time = 0;
  private swayX = 0;
  private swayY = 0;
  private swayRoll = 0;
  private readonly kickBack = new Spring(240, 22);
  private readonly kickPitch = new Spring(200, 18);
  private readonly kickRoll = new Spring(180, 16);
  private readonly pose: ReloadPose = {
    px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, magY: 0, magRX: 0, magVisible: true, handX: 0, handY: 0, handZ: 0, charge: 0,
  };
  private readonly magazineRest: THREE.Vector3;
  private readonly leftArmRest: THREE.Vector3;
  private readonly chargeRest: number;
  private readonly casings: Casing[] = [];
  private casingCursor = 0;
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly inverseCamera = new THREE.Quaternion();
  private readonly gravity = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    textures: TextureLibrary,
    envMap: THREE.Texture,
    private readonly collision: CollisionWorld,
    private readonly targets: ShotTargets,
    private readonly effects: EffectsManager,
    private readonly audio: AudioSystem,
    private readonly player: PlayerController,
    private readonly events: WeaponEvents,
  ) {
    this.model = new WeaponModel(textures, envMap);
    this.pivot.add(this.model.root);
    this.pivot.position.copy(HIP_POSITION);
    camera.add(this.pivot);
    this.adsPosition = new THREE.Vector3(0, -this.model.sightHeight, -0.2);
    this.magazineRest = this.model.magazine.position.clone();
    this.leftArmRest = this.model.leftArm.position.clone();
    this.chargeRest = this.model.chargingHandle.position.z;

    this.muzzleLight.layers.enableAll();
    this.model.muzzle.add(this.muzzleLight);

    const casingGeometry = new THREE.CylinderGeometry(0.0045, 0.0045, 0.022, 8);
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(casingGeometry, this.model.casingMaterial);
      mesh.layers.set(VIEWMODEL_LAYER);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      camera.add(mesh);
      this.casings.push({ mesh, velocity: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
    }
  }

  get isReloading(): boolean {
    return this.reloading;
  }

  get reloadProgress(): number {
    return this.reloading ? clamp(this.reloadElapsed / this.reloadDuration, 0, 1) : 0;
  }

  /** 0 = hip, 1 = fully aimed down the sight. */
  get adsAmount(): number {
    return smoothstep(0, 1, this.adsT);
  }

  get accuracy(): number {
    return this.shotsFired === 0 ? 0 : this.shotsHit / this.shotsFired;
  }

  /** Current cone half-angle in radians, used by both the shot and the crosshair. */
  currentSpread(moveRatio: number): number {
    const ads = this.adsAmount;
    return lerp(WEAPON.hipSpread, WEAPON.adsSpread, ads) + this.bloom * (1 - 0.6 * ads) + WEAPON.moveSpread * moveRatio * (1 - 0.75 * ads);
  }

  reset(): void {
    this.mag = WEAPON.magazineSize;
    this.reserve = WEAPON.startingReserve;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.headshots = 0;
    this.reloading = false;
    this.reloadElapsed = 0;
    this.fireCooldown = 0;
    this.autoReloadTimer = -1;
    this.bloom = 0;
    this.adsT = 0;
    this.adsWanted = false;
    this.queuedShot = false;
    this.flashTimer = 0;
    this.kickBack.reset();
    this.kickPitch.reset();
    this.kickRoll.reset();
    this.model.hideFlash();
    this.muzzleLight.intensity = 0;
    this.model.magazine.visible = true;
    for (const casing of this.casings) {
      casing.life = 0;
      casing.mesh.visible = false;
    }
  }

  /** Adds rounds to the reserve; returns how many were taken. */
  addAmmo(amount: number): number {
    const taken = Math.min(amount, WEAPON.maxReserve - this.reserve);
    this.reserve += Math.max(0, taken);
    return Math.max(0, taken);
  }

  startReload(): void {
    if (this.reloading || this.mag >= WEAPON.magazineSize || this.reserve <= 0) return;
    this.reloading = true;
    this.reloadElapsed = 0;
    this.reloadEmpty = this.mag === 0;
    this.reloadDuration = this.reloadEmpty ? WEAPON.emptyReloadTime : WEAPON.reloadTime;
    this.reloadRefilled = false;
    this.reloadCues.clear();
    this.autoReloadTimer = -1;
  }

  update(dt: number, input: WeaponFrameInput, alive: boolean): void {
    this.time += dt;
    this.fireCooldown -= dt;

    if (input.adsToggle) this.adsWanted = !this.adsWanted;
    if (input.reloadPressed) this.startReload();
    if (input.tapShots > 0) this.queuedShot = true;

    const wantsAds = alive && !this.reloading && (this.adsWanted || input.adsHeld);
    this.adsT = clamp(this.adsT + (wantsAds ? dt : -dt) / WEAPON.adsTime, 0, 1);

    if (this.autoReloadTimer > 0) {
      this.autoReloadTimer -= dt;
      if (this.autoReloadTimer <= 0) this.startReload();
    }

    const trigger = alive && (input.triggerHeld || this.queuedShot);
    if (!input.triggerHeld) this.dryLatch = false;
    if (trigger && !this.reloading && this.fireCooldown <= 0) {
      if (this.mag > 0) {
        this.fire(input.moveRatio);
        this.queuedShot = false;
      } else {
        this.queuedShot = false;
        if (!this.dryLatch) {
          this.dryLatch = true;
          this.fireCooldown = 0.25;
          this.audio.dryFire();
          this.events.onDryFire();
          this.startReload();
        }
      }
    } else if (this.reloading) {
      this.queuedShot = false;
    }

    if (this.fireCooldown < -0.06) this.bloom = Math.max(0, this.bloom - WEAPON.bloomRecovery * dt);

    if (this.reloading) this.advanceReload(dt);
    this.animate(dt, input);
    this.updateCasings(dt);
  }

  private fire(moveRatio: number): void {
    this.mag--;
    this.shotsFired++;
    this.fireCooldown = WEAPON.fireInterval;

    const camera = this.camera;
    this.raycaster.setFromCamera(NDC_CENTER, camera);
    const ray = this.raycaster.ray;
    const spread = this.currentSpread(moveRatio);
    if (spread > 0) {
      const angle = Math.tan(spread * Math.sqrt(Math.random()));
      const theta = Math.random() * TAU;
      this.right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      this.up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
      ray.direction
        .addScaledVector(this.right, Math.cos(theta) * angle)
        .addScaledVector(this.up, Math.sin(theta) * angle)
        .normalize();
    }

    const worldHit = this.collision.raycast(ray.origin, ray.direction, WEAPON.range, this.worldHit);
    const worldDistance = worldHit ? this.worldHit.distance : WEAPON.range;
    const enemyHit = this.targets.raycast(ray, worldDistance, this.enemyHit);

    const end = this.tmpA;
    if (enemyHit) {
      const hit = this.enemyHit;
      end.copy(hit.point);
      const falloff = lerp(1, WEAPON.falloffMin, smoothstep(WEAPON.falloffStart, WEAPON.falloffEnd, hit.distance));
      const zoneMultiplier = hit.zone === 'head' ? WEAPON.headMultiplier : hit.zone === 'limb' ? WEAPON.limbMultiplier : 1;
      this.effects.impact(hit.point, hit.normal, hit.impact);
      const killed = this.targets.applyHit(hit, WEAPON.damage * zoneMultiplier * falloff, this.player.position);
      this.shotsHit++;
      if (hit.zone === 'head') this.headshots++;
      this.audio.hitMarker(killed, hit.zone === 'head');
      this.events.onHit(killed, hit.zone === 'head');
    } else if (worldHit) {
      const hit = this.worldHit;
      end.copy(hit.point);
      this.effects.impact(hit.point, hit.normal, hit.surface);
      this.effects.bulletHole(hit.point, hit.normal);
      if (Math.random() < 0.35) this.audio.impact(hit.point, hit.surface === 'metal' || hit.surface === 'crate');
    } else {
      end.copy(ray.origin).addScaledVector(ray.direction, WEAPON.range);
    }

    this.model.muzzle.getWorldPosition(this.tmpB);
    const toEnd = end.distanceTo(this.tmpB);
    if (toEnd > 2) {
      this.tmpB.lerp(end, 1.2 / toEnd);
      this.effects.tracer(this.tmpB, end, 'player');
    }

    const ads = this.adsAmount;
    const kickScale = 1 - 0.45 * ads;
    this.kickBack.value = Math.min(this.kickBack.value + 0.024 * kickScale, 0.055);
    this.kickPitch.value = Math.min(this.kickPitch.value + 0.05 * kickScale, 0.13);
    this.kickRoll.value += (Math.random() - 0.5) * 0.04 * kickScale;
    this.player.addRecoil(
      WEAPON.recoilPitch * (1 - 0.3 * ads),
      (Math.random() - 0.5) * 2 * WEAPON.recoilYaw,
      WEAPON.recoilPermanent,
    );
    this.bloom = Math.min(WEAPON.maxBloom, this.bloom + WEAPON.bloomPerShot);

    this.model.showFlash(0.85 + Math.random() * 0.15);
    this.flashTimer = 0.045;
    this.muzzleLight.intensity = 16 + Math.random() * 8;
    this.ejectCasing();
    this.audio.gunshot();
    this.targets.notifyGunshot(this.player.position, WEAPON.noiseRadius);

    if (this.mag === 0 && this.reserve > 0) this.autoReloadTimer = 0.32;
  }

  private advanceReload(dt: number): void {
    this.reloadElapsed += dt;
    const t = this.reloadElapsed / this.reloadDuration;
    if (t >= 0.2 && !this.reloadCues.has('magOut')) {
      this.reloadCues.add('magOut');
      this.audio.reload('magOut');
    }
    if (t >= 0.57 && !this.reloadCues.has('magIn')) {
      this.reloadCues.add('magIn');
      this.audio.reload('magIn');
    }
    if (t >= 0.58 && !this.reloadRefilled) {
      this.reloadRefilled = true;
      const take = Math.min(WEAPON.magazineSize - this.mag, this.reserve);
      this.mag += take;
      this.reserve -= take;
      this.kickBack.value += 0.012;
      this.kickPitch.value -= 0.03;
    }
    if (this.reloadEmpty && t >= 0.72 && !this.reloadCues.has('bolt')) {
      this.reloadCues.add('bolt');
      this.audio.reload('bolt');
    }
    if (t >= 1) {
      this.reloading = false;
      this.reloadElapsed = 0;
    }
  }

  /** Procedural reload keyframes as a pure function of normalized time. */
  private computeReloadPose(t: number, empty: boolean): ReloadPose {
    const p = this.pose;
    const tilt = smoothstep(0, 0.16, t) * (1 - smoothstep(empty ? 0.86 : 0.8, 1, t));
    const cant = empty ? smoothstep(0.62, 0.7, t) * (1 - smoothstep(0.78, 0.88, t)) : 0;
    p.px = -0.03 * tilt;
    p.py = -0.035 * tilt - 0.01 * cant;
    p.pz = 0.02 * tilt;
    p.rx = 0.16 * tilt;
    p.ry = 0.3 * tilt;
    p.rz = -0.5 * tilt + 0.32 * cant;

    const drop = smoothstep(0.18, 0.36, t);
    const insert = smoothstep(0.42, 0.6, t);
    if (t < 0.36) {
      p.magY = -0.34 * drop * drop;
      p.magRX = -0.5 * drop;
      p.magVisible = true;
    } else if (t < 0.42) {
      p.magY = -0.4;
      p.magRX = -0.35;
      p.magVisible = false;
    } else {
      p.magY = -0.24 * (1 - insert);
      p.magRX = -0.35 * (1 - insert);
      p.magVisible = true;
    }
    const grab = smoothstep(0.14, 0.28, t) * (1 - smoothstep(0.6, 0.74, t));
    p.handX = 0.012 * grab;
    p.handY = (Math.min(p.magY, -0.03) - 0.1) * grab;
    p.handZ = 0.24 * grab;
    p.charge = empty ? Math.max(0, 0.06 * (smoothstep(0.66, 0.72, t) - smoothstep(0.74, 0.8, t))) : 0;
    return p;
  }

  private animate(dt: number, input: WeaponFrameInput): void {
    const ads = this.adsAmount;
    const moveAmount = input.moveRatio * (1 - 0.85 * ads);
    this.bobPhase += dt * 9.4 * input.moveRatio;
    const breath = 1 - 0.7 * ads;

    const lookVelX = dt > 0 ? input.lookDelta.x / dt : 0;
    const lookVelY = dt > 0 ? input.lookDelta.y / dt : 0;
    const swayScale = 1 - 0.6 * ads;
    this.swayX = damp(this.swayX, clamp(-lookVelX * 0.0035, -0.022, 0.022) * swayScale, 9, dt);
    this.swayY = damp(this.swayY, clamp(lookVelY * 0.0028, -0.016, 0.016) * swayScale, 9, dt);
    this.swayRoll = damp(this.swayRoll, clamp(-lookVelX * 0.012, -0.08, 0.08) * swayScale, 7, dt);

    this.kickBack.update(dt);
    this.kickPitch.update(dt);
    this.kickRoll.update(dt);

    const reload = this.reloading
      ? this.computeReloadPose(this.reloadProgress, this.reloadEmpty)
      : this.computeReloadPose(0, false);

    const base = this.tmpA.lerpVectors(HIP_POSITION, this.adsPosition, ads);
    this.pivot.position.set(
      base.x + Math.sin(this.bobPhase) * 0.011 * moveAmount + Math.sin(this.time * 0.9) * 0.0011 * breath + this.swayX + reload.px,
      base.y - Math.abs(Math.sin(this.bobPhase)) * 0.009 * moveAmount + Math.sin(this.time * 1.8) * 0.0014 * breath + this.swayY + reload.py,
      base.z + this.kickBack.value + reload.pz,
    );
    this.pivot.rotation.set(
      this.kickPitch.value + reload.rx - this.swayY * 1.5,
      HIP_YAW * (1 - ads) + this.swayX * 1.2 + reload.ry,
      Math.sin(this.bobPhase) * 0.02 * moveAmount + this.swayRoll + this.kickRoll.value + reload.rz,
    );

    const mag = this.model.magazine;
    mag.visible = reload.magVisible;
    mag.position.set(this.magazineRest.x, this.magazineRest.y + reload.magY, this.magazineRest.z);
    mag.rotation.x = reload.magRX;
    this.model.leftArm.position.set(
      this.leftArmRest.x + reload.handX,
      this.leftArmRest.y + reload.handY,
      this.leftArmRest.z + reload.handZ,
    );
    this.model.chargingHandle.position.z = this.chargeRest + reload.charge;

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.model.hideFlash();
    }
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 480);
  }

  private ejectCasing(): void {
    const casing = this.casings[this.casingCursor];
    this.casingCursor = (this.casingCursor + 1) % this.casings.length;
    this.model.ejectionPort.getWorldPosition(this.tmpB);
    this.camera.worldToLocal(this.tmpB);
    casing.mesh.position.copy(this.tmpB);
    casing.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.PI / 2);
    casing.velocity.set(1.5 + Math.random() * 0.7, 1.1 + Math.random() * 0.6, 0.25 + Math.random() * 0.3);
    casing.spin.set(Math.random() * 30 - 15, Math.random() * 30 - 15, Math.random() * 30 - 15);
    casing.life = 0.55;
    casing.mesh.visible = true;
  }

  private updateCasings(dt: number): void {
    this.inverseCamera.copy(this.camera.quaternion).invert();
    this.gravity.set(0, -WORLD.gravity, 0).applyQuaternion(this.inverseCamera);
    for (const casing of this.casings) {
      if (casing.life <= 0) continue;
      casing.life -= dt;
      if (casing.life <= 0) {
        casing.mesh.visible = false;
        continue;
      }
      casing.velocity.addScaledVector(this.gravity, dt);
      casing.mesh.position.addScaledVector(casing.velocity, dt);
      casing.mesh.rotation.x += casing.spin.x * dt;
      casing.mesh.rotation.y += casing.spin.y * dt;
      casing.mesh.rotation.z += casing.spin.z * dt;
    }
  }
}
