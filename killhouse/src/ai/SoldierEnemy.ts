import * as THREE from 'three';
import { PLAYER, SOLDIER } from '../config';
import { clamp, damp, easeInQuad } from '../utils/math';
import { Enemy, type CombatContext, type EnemyWorld } from './Enemy';
import { createSoldierRig, type SoldierRig } from './EnemyModels';

const SHOULDER_HEIGHT = 1.42;

/** OPFOR rifleman: patrols or holds a post, fights from preferred range in bursts, hunts by sound. */
export class SoldierEnemy extends Enemy {
  readonly kind = 'soldier' as const;
  private readonly rig: SoldierRig;
  private readonly patroller: boolean;
  private idleDuration: number;
  private readonly patrolGoal = new THREE.Vector3();
  private walkPhase = 0;
  private aimPitch = -0.5;
  private recoil = 0;
  private flinch = 0;
  private burstLeft = 0;
  private burstTimer = 0;
  private fireCooldown = 0;
  private searchTimer = 0;
  private deathTime = 0;
  private deathDirection = -1;

  constructor(world: EnemyWorld, spawn: THREE.Vector3, health: number, yaw: number) {
    super(world, { radius: SOLDIER.radius, viewDistance: SOLDIER.viewDistance, darkViewDistance: SOLDIER.darkViewDistance, fovDegrees: SOLDIER.fovDegrees, preferredRange: SOLDIER.preferredRange }, spawn, health, yaw);
    this.rig = createSoldierRig();
    this.root.add(this.rig.root);
    this.patroller = world.rng.chance(0.55);
    this.idleDuration = world.rng.range(1.5, 6);
    this.fireCooldown = world.rng.range(0.2, 0.8);
    this.hitVolumes.push(
      { zone: 'head', impact: 'armor', sphere: new THREE.Sphere(new THREE.Vector3(0, 1.645, 0.01), 0.135) },
      { zone: 'body', impact: 'flesh', box: new THREE.Box3(new THREE.Vector3(-0.25, 0.92, -0.2), new THREE.Vector3(0.25, 1.52, 0.18)) },
      { zone: 'limb', impact: 'flesh', box: new THREE.Box3(new THREE.Vector3(-0.21, 0, -0.14), new THREE.Vector3(0.21, 0.92, 0.17)) },
      { zone: 'limb', impact: 'flesh', box: new THREE.Box3(new THREE.Vector3(-0.1, 1.15, 0.1), new THREE.Vector3(0.14, 1.38, 0.62)) },
    );
    this.root.rotation.y = yaw;
  }

  eyePosition(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.position.x, this.position.y + SOLDIER.eyeHeight, this.position.z);
  }

  muzzlePosition(out: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld();
    return this.rig.muzzle.getWorldPosition(out);
  }

  /** Menu attract mode: breathe and look around without thinking. */
  idleAnimate(time: number): void {
    if (!this.alive) return;
    this.rig.torso.rotation.y = Math.sin(time * 0.4 + this.phase) * 0.25;
    this.rig.arms.rotation.x = 0.5 + Math.sin(time * 1.3 + this.phase) * 0.02;
    this.rig.body.position.y = Math.sin(time * 1.6 + this.phase) * 0.004;
    this.root.rotation.y = this.yaw;
    this.root.updateMatrix();
    this.root.updateMatrixWorld();
  }

  protected resolveCollision(): void {
    this.world.collision.resolveCircle(this.position, SOLDIER.radius, 0.05, PLAYER.height);
  }

  protected onShotFired(): void {
    this.recoil = Math.min(1, this.recoil + 0.6);
  }

  protected think(dt: number, ctx: CombatContext): void {
    const rng = this.world.rng;
    switch (this.state) {
      case 'idle': {
        this.applyMovement(dt, 0, 0, ctx);
        if (this.suspicion > 0.3) {
          this.faceYaw(Math.atan2(this.suspiciousPoint.x - this.position.x, this.suspiciousPoint.z - this.position.z), 2.4, dt);
          break;
        }
        this.faceYaw(this.homeYaw + Math.sin(this.stateTimer * 0.45 + this.phase) * 0.9, 1.1, dt);
        if (this.patroller && this.stateTimer > this.idleDuration) {
          if (this.world.nav.randomWalkableNear(this.home.x, this.home.z, 4, rng, this.patrolGoal) && this.setPathTo(this.patrolGoal)) {
            this.state = 'patrol';
            this.stateTimer = 0;
          } else {
            this.stateTimer = 0;
          }
        }
        break;
      }
      case 'patrol': {
        if (this.suspicion > 0.3) {
          this.applyMovement(dt, 0, 0, ctx);
          this.faceYaw(Math.atan2(this.suspiciousPoint.x - this.position.x, this.suspiciousPoint.z - this.position.z), 2.4, dt);
          break;
        }
        const arrived = this.followPath(dt, SOLDIER.walkSpeed, ctx, true);
        if (arrived || this.stateTimer > 20) {
          this.enterState('idle');
          this.idleDuration = rng.range(2, 5.5);
        }
        break;
      }
      case 'investigate': {
        if (this.searchTimer > 0) {
          this.searchTimer += dt;
          this.applyMovement(dt, 0, 0, ctx);
          this.faceYaw(this.yaw + 1, 1.6, dt);
          if (this.searchTimer > 4.5) {
            this.searchTimer = 0;
            this.awareness = 0.45;
            this.patrolGoal.copy(this.home);
            this.enterState(this.setPathTo(this.home) ? 'patrol' : 'idle');
          }
          break;
        }
        if (this.approach(this.lastKnown, SOLDIER.runSpeed * 0.75, dt, ctx, true, 1.2) || this.stateTimer > 16) {
          this.searchTimer = 0.001;
        }
        break;
      }
      case 'engage': {
        this.searchTimer = 0;
        if (!this.seesPlayer && this.timeSinceSeen > 1.1) {
          this.enterState('hunt');
          break;
        }
        const pos = this.position;
        const dx = ctx.playerFeet.x - pos.x;
        const dz = ctx.playerFeet.z - pos.z;
        const distance = Math.hypot(dx, dz) || 1;
        this.faceYaw(Math.atan2(dx, dz), 7, dt);
        const [near, far] = SOLDIER.preferredRange;
        if (distance > far) {
          this.approach(ctx.playerFeet, SOLDIER.runSpeed * 0.8, dt, ctx, false, far * 0.8);
        } else if (distance < near) {
          this.applyMovement(dt, (-dx / distance) * SOLDIER.walkSpeed, (-dz / distance) * SOLDIER.walkSpeed, ctx);
        } else {
          this.strafeTimer -= dt;
          if (this.strafeTimer <= 0 || this.stuckTimer > 0.4) {
            this.strafeSign = rng.chance(0.5) ? 1 : -1;
            this.strafeTimer = rng.range(1.1, 2.6);
            this.stuckTimer = 0;
          }
          const speed = this.burstLeft > 0 ? SOLDIER.walkSpeed * 0.35 : SOLDIER.walkSpeed * 0.9;
          this.applyMovement(dt, (-dz / distance) * this.strafeSign * speed, (dx / distance) * this.strafeSign * speed, ctx);
        }
        this.reaction -= dt;
        this.updateFiring(dt, ctx, this.yawErrorTo(ctx.playerFeet.x, ctx.playerFeet.z) < 0.28);
        break;
      }
      case 'hunt': {
        this.searchTimer = 0;
        if (this.approach(this.lastKnown, SOLDIER.runSpeed, dt, ctx, true, 1.2)) {
          this.huntRounds++;
          if (this.huntRounds > 2 || this.stateTimer > 18) {
            this.state = 'investigate';
            this.stateTimer = 0;
            this.searchTimer = 0.001;
          } else {
            // The squad knows roughly where the shooter went: close on the player's
            // current position with an error that shrinks each round.
            const error = 4 / this.huntRounds;
            this.lastKnown.set(
              ctx.playerFeet.x + rng.range(-error, error),
              0,
              ctx.playerFeet.z + rng.range(-error, error),
            );
            this.path.length = 0;
            this.repathTimer = 0;
          }
        }
        this.burstLeft = 0;
        break;
      }
      case 'dead':
        break;
    }
  }

  private updateFiring(dt: number, ctx: CombatContext, aligned: boolean): void {
    if (this.burstLeft > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        if (this.seesPlayer && ctx.playerAlive) this.fireAtPlayer(ctx, SOLDIER.accuracy, SOLDIER.damage, 'enemy', false);
        this.burstLeft--;
        this.burstTimer = SOLDIER.burstInterval;
      }
      return;
    }
    this.fireCooldown -= dt;
    if (this.fireCooldown <= 0 && this.reaction <= 0 && this.seesPlayer && aligned && ctx.playerAlive) {
      this.burstLeft = SOLDIER.burstSize + (this.world.rng.chance(0.3) ? 1 : 0);
      this.burstTimer = 0;
      this.fireCooldown = this.world.rng.range(SOLDIER.burstCooldown[0], SOLDIER.burstCooldown[1]);
    }
  }

  protected animate(dt: number, ctx: CombatContext): void {
    const rig = this.rig;
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.walkPhase += dt * speed * 3.4;
    const stride = clamp(speed / 2.2, 0, 1);
    const swing = Math.sin(this.walkPhase) * 0.6 * stride;
    rig.legL.rotation.x = swing;
    rig.legR.rotation.x = -swing;
    rig.body.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.035 * stride;

    let targetPitch = -0.5;
    if (this.state === 'engage' || this.state === 'hunt') {
      const dx = ctx.playerEye.x - this.position.x;
      const dz = ctx.playerEye.z - this.position.z;
      targetPitch = this.state === 'engage' ? Math.atan2(ctx.playerEye.y - 0.3 - SHOULDER_HEIGHT, Math.hypot(dx, dz)) : -0.15;
    }
    this.aimPitch = damp(this.aimPitch, targetPitch, 8, dt);
    this.recoil = damp(this.recoil, 0, 14, dt);
    rig.arms.rotation.x = -this.aimPitch - this.recoil * 0.12;
    rig.arms.position.z = -this.recoil * 0.04;
    this.flinch = damp(this.flinch, 0, 6, dt);
    rig.torso.rotation.x = -this.flinch * 0.32 + stride * 0.08;
    rig.torso.rotation.y = this.state === 'idle' ? Math.sin(this.stateTimer * 0.8 + this.phase) * 0.15 : 0;
    const flash = this.hitFlash;
    rig.bodyMaterial.emissive.setRGB(0.55 * flash, 0.07 * flash, 0.03 * flash);
    this.root.rotation.y = this.yaw;
  }

  override damage(amount: number, from: THREE.Vector3): boolean {
    this.flinch = 1;
    return super.damage(amount, from);
  }

  protected onKilled(from: THREE.Vector3): void {
    const pos = this.position;
    this.yaw = Math.atan2(from.x - pos.x, from.z - pos.z);
    this.root.rotation.y = this.yaw;
    const back = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const chest = new THREE.Vector3(pos.x, 1.0, pos.z);
    const blockedBehind = !this.world.collision.isSegmentClear(chest, chest.clone().addScaledVector(back, 1.9));
    this.deathDirection = blockedBehind ? 1 : -1;
    this.deathTime = 0;
    this.rig.visorMaterial.emissiveIntensity = 0;
    this.rig.bodyMaterial.emissive.setRGB(0, 0, 0);
  }

  protected updateDeath(dt: number): void {
    if (this.deathTime > 1.2) return;
    this.deathTime += dt;
    const rig = this.rig;
    const buckle = clamp(this.deathTime / 0.18, 0, 1);
    const fall = easeInQuad((this.deathTime - 0.1) / 0.55);
    const settle = this.deathTime > 0.65 ? Math.sin(Math.min(1, (this.deathTime - 0.65) / 0.3) * Math.PI) * 0.06 : 0;
    rig.body.rotation.x = this.deathDirection * (Math.PI / 2 - 0.12) * fall - this.deathDirection * settle;
    rig.body.position.y = -0.12 * buckle * (1 - fall) + 0.1 * fall;
    rig.legL.rotation.x = 0.35 * buckle * (1 - fall);
    rig.legR.rotation.x = -0.2 * buckle * (1 - fall);
    rig.arms.rotation.x = 0.9 * fall;
    rig.torso.rotation.x = -0.25 * this.deathDirection * fall;
  }
}
