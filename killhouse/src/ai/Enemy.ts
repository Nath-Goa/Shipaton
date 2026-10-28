import * as THREE from 'three';
import { SOLDIER, type DifficultySettings } from '../config';
import type { AudioSystem } from '../audio/AudioSystem';
import type { EffectsManager, ImpactKind, TracerKind } from '../fx/EffectsManager';
import { createRayHit, type CollisionWorld } from '../level/CollisionWorld';
import type { NavGrid } from '../level/NavGrid';
import { Random } from '../utils/Random';
import { approachAngle, clamp } from '../utils/math';
import type { EnemyHit, HitZone } from './types';

export type EnemyKind = 'soldier' | 'drone';

const SETTLE_TIME = SOLDIER.settleTime;
export type EnemyState = 'idle' | 'patrol' | 'investigate' | 'engage' | 'hunt' | 'dead';

/** Long-lived services every enemy shares. */
export interface EnemyWorld {
  readonly collision: CollisionWorld;
  readonly nav: NavGrid;
  readonly effects: EffectsManager;
  readonly audio: AudioSystem;
  readonly rng: Random;
}

/** Per-frame view of the player and the squad. */
export interface CombatContext {
  readonly playerEye: THREE.Vector3;
  readonly playerFeet: THREE.Vector3;
  readonly playerVelocity: THREE.Vector3;
  readonly playerAlive: boolean;
  /** Weapon light on: the player is visible from much further away. */
  readonly playerLit: boolean;
  readonly difficulty: DifficultySettings;
  readonly allies: readonly Enemy[];
  damagePlayer(amount: number, from: THREE.Vector3): void;
}

/** A bounding volume in the enemy's root space (feet origin, +Z forward). */
export interface HitVolume {
  readonly zone: HitZone;
  readonly impact: ImpactKind;
  readonly sphere?: THREE.Sphere;
  readonly box?: THREE.Box3;
}

export interface EnemyTuning {
  readonly radius: number;
  readonly viewDistance: number;
  readonly darkViewDistance: number;
  readonly fovDegrees: number;
  readonly preferredRange: readonly [number, number];
}

/**
 * Shared enemy brain: perception (cone + line of sight + hearing), a state
 * machine (idle → patrol → investigate → engage → hunt → dead), A* path
 * following with steering and separation, and hitscan return fire.
 */
export abstract class Enemy {
  readonly root = new THREE.Group();
  readonly velocity = new THREE.Vector3();
  abstract readonly kind: EnemyKind;
  state: EnemyState = 'idle';
  health: number;
  readonly maxHealth: number;
  yaw: number;
  /** Seconds the minimap keeps showing this enemy. */
  revealTimer = 0;

  protected awareness = 0;
  protected seesPlayer = false;
  protected timeSinceSeen = 999;
  /** Continuous seconds with the player in sight; accuracy ramps up with it. */
  protected trackingTime = 0;
  protected readonly lastKnown = new THREE.Vector3();
  protected hasLastKnown = false;
  protected reaction = 0;
  /** Builds while an unaware enemy glimpses the player; reaching 1 means spotted. */
  protected suspicion = 0;
  protected readonly suspiciousPoint = new THREE.Vector3();
  protected perceptionTimer: number;
  private perceptionInterval = 0.15;
  protected readonly path: THREE.Vector3[] = [];
  protected pathIndex = 0;
  protected repathTimer = 0;
  protected readonly home: THREE.Vector3;
  protected readonly homeYaw: number;
  protected stateTimer = 0;
  protected stuckTimer = 0;
  protected strafeSign: 1 | -1 = 1;
  protected strafeTimer = 0;
  protected huntRounds = 0;
  protected hitFlash = 0;
  protected readonly phase: number;
  protected readonly hitVolumes: HitVolume[] = [];
  protected readonly fovCos: number;

  protected readonly eye = new THREE.Vector3();
  protected readonly muzzleWorld = new THREE.Vector3();
  private readonly aimPoint = new THREE.Vector3();
  private readonly aimDir = new THREE.Vector3();
  private readonly worldHit = createRayHit();
  private readonly previous = new THREE.Vector3();
  private readonly inverse = new THREE.Matrix4();
  private readonly localRay = new THREE.Ray();
  private readonly localPoint = new THREE.Vector3();
  private matrixVersion = 0;
  private inverseVersion = -1;

  protected constructor(
    protected readonly world: EnemyWorld,
    protected readonly tuning: EnemyTuning,
    spawn: THREE.Vector3,
    health: number,
    initialYaw: number,
  ) {
    this.health = health;
    this.maxHealth = health;
    this.home = spawn.clone();
    this.homeYaw = initialYaw;
    this.yaw = initialYaw;
    this.root.position.copy(spawn);
    this.phase = world.rng.range(0, Math.PI * 2);
    this.perceptionTimer = world.rng.range(0, 0.25);
    this.fovCos = Math.cos(((tuning.fovDegrees / 2) * Math.PI) / 180);
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  /** True while hunting or fighting; used for the HUD threat display. */
  get isAware(): boolean {
    return this.alive && (this.state === 'engage' || this.state === 'hunt');
  }

  abstract eyePosition(out: THREE.Vector3): THREE.Vector3;
  abstract muzzlePosition(out: THREE.Vector3): THREE.Vector3;
  /** One frame of non-dead behaviour after perception. */
  protected abstract think(dt: number, ctx: CombatContext): void;
  protected abstract animate(dt: number, ctx: CombatContext): void;
  protected abstract onKilled(from: THREE.Vector3): void;
  protected abstract updateDeath(dt: number): void;
  protected abstract resolveCollision(): void;
  /** Called after each round so the model can recoil. */
  protected abstract onShotFired(): void;

  update(dt: number, ctx: CombatContext): void {
    if (this.state === 'dead') {
      this.updateDeath(dt);
    } else {
      this.revealTimer = Math.max(0, this.revealTimer - dt);
      this.hitFlash = Math.max(0, this.hitFlash - dt * 6);
      this.perceive(dt, ctx);
      this.trackingTime = this.seesPlayer ? this.trackingTime + dt : 0;
      this.stateTimer += dt;
      this.think(dt, ctx);
      this.animate(dt, ctx);
    }
    this.root.updateMatrix();
    this.root.updateMatrixWorld();
    this.matrixVersion++;
  }

  /** Precise hit test: the ray is moved into root space and tested against each volume. */
  raycast(ray: THREE.Ray, maxDistance: number, out: EnemyHit): boolean {
    if (!this.alive) return false;
    if (this.inverseVersion !== this.matrixVersion) {
      this.inverse.copy(this.root.matrixWorld).invert();
      this.inverseVersion = this.matrixVersion;
    }
    this.localRay.copy(ray).applyMatrix4(this.inverse);
    let best = maxDistance;
    let found = false;
    for (const volume of this.hitVolumes) {
      const point = volume.sphere
        ? this.localRay.intersectSphere(volume.sphere, this.localPoint)
        : volume.box
          ? this.localRay.intersectBox(volume.box, this.localPoint)
          : null;
      if (!point) continue;
      const distance = point.distanceTo(this.localRay.origin);
      if (distance >= best) continue;
      best = distance;
      found = true;
      out.distance = distance;
      out.zone = volume.zone;
      out.impact = volume.impact;
      out.point.copy(point);
      if (volume.sphere) out.normal.subVectors(point, volume.sphere.center).normalize();
      else if (volume.box) boxNormal(volume.box, point, out.normal);
    }
    if (found) {
      out.point.applyMatrix4(this.root.matrixWorld);
      out.normal.transformDirection(this.root.matrixWorld);
    }
    return found;
  }

  /** Returns true when this damage killed the enemy. */
  damage(amount: number, from: THREE.Vector3): boolean {
    if (!this.alive) return false;
    this.health -= amount;
    this.hitFlash = 1;
    this.awareness = 1;
    this.suspicion = 1;
    this.lastKnown.copy(from);
    this.hasLastKnown = true;
    this.revealTimer = Math.max(this.revealTimer, 3);
    if (this.health <= 0) {
      this.health = 0;
      this.state = 'dead';
      this.velocity.set(0, 0, 0);
      this.onKilled(from);
      return true;
    }
    this.reaction = Math.min(this.reaction, 0.3);
    if (!this.seesPlayer && this.state !== 'hunt') this.enterState('hunt');
    return false;
  }

  /** Gunfire or a squad-mate's shout: go and look. */
  hearNoise(position: THREE.Vector3): void {
    if (!this.alive || this.seesPlayer) return;
    this.awareness = Math.max(this.awareness, 0.7);
    this.lastKnown.copy(position);
    this.hasLastKnown = true;
    if (this.state === 'hunt') {
      this.repathTimer = 0;
      this.stateTimer = Math.min(this.stateTimer, 4);
    } else if (this.state !== 'engage') {
      this.enterState('investigate');
    }
  }

  protected enterState(state: EnemyState): void {
    this.state = state;
    this.stateTimer = 0;
    this.path.length = 0;
    this.pathIndex = 0;
    this.repathTimer = 0;
    if (state === 'hunt') this.huntRounds = 0;
  }

  protected perceive(dt: number, ctx: CombatContext): void {
    this.timeSinceSeen += dt;
    this.perceptionTimer -= dt;
    if (this.perceptionTimer > 0) return;
    const interval = this.perceptionInterval;
    this.perceptionInterval = 0.12 + this.world.rng.next() * 0.1;
    this.perceptionTimer = this.perceptionInterval;

    let visible = false;
    let distance = Infinity;
    if (ctx.playerAlive) {
      this.eyePosition(this.eye);
      const dx = ctx.playerEye.x - this.eye.x;
      const dy = ctx.playerEye.y - this.eye.y;
      const dz = ctx.playerEye.z - this.eye.z;
      distance = Math.hypot(dx, dy, dz);
      const range = ctx.playerLit || this.awareness > 0.5 ? this.tuning.viewDistance : this.tuning.darkViewDistance;
      if (distance < range) {
        const flat = Math.hypot(dx, dz) || 1;
        const facing = (dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw)) / flat;
        const inView = this.awareness >= 0.99 || distance < 3.5 || facing > this.fovCos;
        if (inView) visible = this.world.collision.isSegmentClear(this.eye, ctx.playerEye);
      }
    }

    if (visible && this.awareness < 0.99) {
      // Unaware enemies need a moment of sight before they react; a lit weapon
      // light and short range both shorten it, and an alerted enemy is quicker.
      let detection = ctx.playerLit ? 0.2 + distance / 26 : 0.5 + distance / 12;
      if (this.awareness >= 0.5) detection *= 0.35;
      this.suspicion += interval / detection;
      this.suspiciousPoint.copy(ctx.playerFeet);
      if (this.suspicion < 1) {
        this.seesPlayer = false;
        return;
      }
    } else if (!visible) {
      this.suspicion = Math.max(0, this.suspicion - interval * 0.4);
    }

    if (visible) {
      this.suspicion = 1;
      if (!this.seesPlayer) {
        if (this.awareness < 0.99 || this.timeSinceSeen > 2) {
          this.reaction = ctx.difficulty.reactionTime * (0.75 + this.world.rng.next() * 0.5) + distance * 0.008;
        }
        if (this.awareness < 0.99) this.alertSquad(ctx);
      }
      this.seesPlayer = true;
      this.timeSinceSeen = 0;
      this.awareness = 1;
      this.lastKnown.copy(ctx.playerFeet);
      this.hasLastKnown = true;
      this.revealTimer = Math.max(this.revealTimer, 1.2);
      if (this.state !== 'engage') this.enterState('engage');
    } else {
      this.seesPlayer = false;
    }
  }

  private alertSquad(ctx: CombatContext): void {
    for (const ally of ctx.allies) {
      if (ally === this || !ally.alive) continue;
      if (ally.position.distanceToSquared(this.position) < SOLDIER.alertAlliesRadius ** 2) ally.hearNoise(ctx.playerFeet);
    }
  }

  protected setPathTo(target: THREE.Vector3): boolean {
    this.pathIndex = 0;
    return this.world.nav.findPath(this.position, target, this.path);
  }

  /** Walks the current path; returns true once the last waypoint is reached. */
  protected followPath(dt: number, speed: number, ctx: CombatContext, faceMovement: boolean): boolean {
    const pos = this.position;
    while (this.pathIndex < this.path.length) {
      const wp = this.path[this.pathIndex];
      if (Math.hypot(wp.x - pos.x, wp.z - pos.z) > 0.4) break;
      this.pathIndex++;
    }
    if (this.pathIndex >= this.path.length) {
      this.applyMovement(dt, 0, 0, ctx);
      return true;
    }
    const wp = this.path[this.pathIndex];
    const dx = wp.x - pos.x;
    const dz = wp.z - pos.z;
    const d = Math.hypot(dx, dz) || 1;
    if (faceMovement) this.faceYaw(Math.atan2(dx, dz), 5, dt);
    this.applyMovement(dt, (dx / d) * speed, (dz / d) * speed, ctx);
    if (this.stuckTimer > 0.8) {
      this.stuckTimer = 0;
      this.repathTimer = 0;
      this.path.length = 0;
      this.pathIndex = 0;
    }
    return false;
  }

  /** Straight-line steering when the way is clear, A* otherwise. Returns true on arrival. */
  protected approach(target: THREE.Vector3, speed: number, dt: number, ctx: CombatContext, faceMovement: boolean, arriveDistance = 0.6): boolean {
    const pos = this.position;
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d < arriveDistance) {
      this.applyMovement(dt, 0, 0, ctx);
      return true;
    }
    if (this.world.nav.hasClearWalk(pos.x, pos.z, target.x, target.z, this.tuning.radius * 0.9)) {
      this.path.length = 0;
      this.pathIndex = 0;
      if (faceMovement) this.faceYaw(Math.atan2(dx, dz), 5, dt);
      this.applyMovement(dt, (dx / d) * speed, (dz / d) * speed, ctx);
      return false;
    }
    this.repathTimer -= dt;
    if (this.repathTimer <= 0 || this.path.length === 0) {
      this.setPathTo(target);
      this.repathTimer = 0.9;
    }
    return this.followPath(dt, speed, ctx, faceMovement) && d < arriveDistance * 2;
  }

  /** Accelerates toward a desired velocity, with squad separation, collision and stuck detection. */
  protected applyMovement(dt: number, vx: number, vz: number, ctx: CombatContext, acceleration = 9): void {
    const pos = this.position;
    let wantX = vx;
    let wantZ = vz;
    for (const other of ctx.allies) {
      if (other === this || !other.alive || other.kind !== this.kind) continue;
      const dx = pos.x - other.position.x;
      const dz = pos.z - other.position.z;
      const d2 = dx * dx + dz * dz;
      const min = this.tuning.radius * 2.6;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = ((min - d) / min) * 2.4;
        wantX += (dx / d) * push;
        wantZ += (dz / d) * push;
      }
    }
    const k = 1 - Math.exp(-acceleration * dt);
    this.velocity.x += (wantX - this.velocity.x) * k;
    this.velocity.z += (wantZ - this.velocity.z) * k;
    this.previous.copy(pos);
    pos.x += this.velocity.x * dt;
    pos.z += this.velocity.z * dt;
    this.resolveCollision();
    if (dt > 0) {
      this.velocity.x = (pos.x - this.previous.x) / dt;
      this.velocity.z = (pos.z - this.previous.z) / dt;
    }
    const wanted = Math.hypot(vx, vz);
    const achieved = Math.hypot(this.velocity.x, this.velocity.z);
    if (wanted > 0.5 && achieved < wanted * 0.3) this.stuckTimer += dt;
    else this.stuckTimer = Math.max(0, this.stuckTimer - dt);
  }

  protected faceYaw(target: number, rate: number, dt: number): number {
    const before = this.yaw;
    this.yaw = approachAngle(this.yaw, target, rate * dt);
    return Math.abs(this.yaw - before);
  }

  protected yawErrorTo(x: number, z: number): number {
    const target = Math.atan2(x - this.position.x, z - this.position.z);
    const diff = Math.atan2(Math.sin(target - this.yaw), Math.cos(target - this.yaw));
    return Math.abs(diff);
  }

  /**
   * One hitscan round at the player. Hit probability falls off with range and
   * target movement; a hit can still be stopped by cover between the muzzle and
   * the player, and every miss lands somewhere visible.
   */
  protected fireAtPlayer(ctx: CombatContext, accuracy: number, damage: number, tracer: TracerKind, laser: boolean): void {
    const rng = this.world.rng;
    const muzzle = this.muzzlePosition(this.muzzleWorld);
    const target = this.aimPoint.copy(ctx.playerEye);
    target.y -= 0.28;
    const dir = this.aimDir.subVectors(target, muzzle);
    const distance = dir.length();
    dir.divideScalar(distance || 1);

    const playerSpeed = Math.hypot(ctx.playerVelocity.x, ctx.playerVelocity.z);
    const settle = 0.45 + 0.55 * clamp(this.trackingTime / SETTLE_TIME, 0, 1);
    const chance = clamp(
      accuracy * settle * ctx.difficulty.enemyAccuracy * clamp(1.15 - distance / 45, 0.3, 1) * (playerSpeed > 2.5 ? 0.72 : 1),
      0.04,
      0.92,
    );
    const hit = rng.next() < chance;
    if (!hit) {
      const side = rng.range(0.45, 1.3) * rng.sign();
      target.x += dir.z * side;
      target.z -= dir.x * side;
      target.y += rng.range(-0.5, 0.7);
      dir.subVectors(target, muzzle).normalize();
    }

    const blocked = this.world.collision.raycast(muzzle, dir, hit ? Math.max(0.1, distance - 0.35) : 90, this.worldHit);
    const end = this.aimPoint;
    if (hit && !blocked) {
      ctx.damagePlayer(damage * ctx.difficulty.enemyDamage, muzzle);
      end.copy(muzzle).addScaledVector(dir, Math.max(0.5, distance - 0.6));
    } else if (blocked) {
      end.copy(this.worldHit.point);
      this.world.effects.impact(this.worldHit.point, this.worldHit.normal, this.worldHit.surface);
      this.world.effects.bulletHole(this.worldHit.point, this.worldHit.normal);
    } else {
      end.copy(muzzle).addScaledVector(dir, 90);
    }
    this.world.effects.tracer(muzzle, end, tracer);
    this.world.effects.muzzleFlash(muzzle, laser ? 0xff3a28 : 0xffb060, laser ? 9 : 16);
    this.world.audio.enemyShot(muzzle, laser);
    this.revealTimer = Math.max(this.revealTimer, 2.5);
    this.onShotFired();
  }
}

function boxNormal(box: THREE.Box3, point: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const dx0 = Math.abs(point.x - box.min.x);
  const dx1 = Math.abs(point.x - box.max.x);
  const dy0 = Math.abs(point.y - box.min.y);
  const dy1 = Math.abs(point.y - box.max.y);
  const dz0 = Math.abs(point.z - box.min.z);
  const dz1 = Math.abs(point.z - box.max.z);
  const min = Math.min(dx0, dx1, dy0, dy1, dz0, dz1);
  if (min === dx0) return out.set(-1, 0, 0);
  if (min === dx1) return out.set(1, 0, 0);
  if (min === dy0) return out.set(0, -1, 0);
  if (min === dy1) return out.set(0, 1, 0);
  if (min === dz0) return out.set(0, 0, -1);
  return out.set(0, 0, 1);
}
