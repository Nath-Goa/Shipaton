import * as THREE from 'three';
import { DRONE, WORLD } from '../config';
import { damp } from '../utils/math';
import { Enemy, type CombatContext, type EnemyWorld } from './Enemy';
import { createDroneRig, type DroneRig } from './EnemyModels';

/**
 * Quadrotor: hovers above low cover, orbits the player at stand-off range and
 * fires a telegraphed laser (the eye brightens and whines before each shot).
 */
export class DroneEnemy extends Enemy {
  readonly kind = 'drone' as const;
  private readonly rig: DroneRig;
  private charging = false;
  private chargeTimer = 0;
  private fireCooldown: number;
  private time = 0;
  private searchTimer = 0;
  private recoil = 0;
  private fallSpeed = 0;
  private crashed = false;
  private trailTimer = 0;
  private spin = 0;
  private readonly orbit = new THREE.Vector3();

  constructor(world: EnemyWorld, spawn: THREE.Vector3, health: number, yaw: number) {
    super(
      world,
      { radius: DRONE.radius, viewDistance: DRONE.viewDistance, darkViewDistance: DRONE.darkViewDistance, fovDegrees: DRONE.fovDegrees, preferredRange: DRONE.preferredRange },
      new THREE.Vector3(spawn.x, DRONE.hoverHeight, spawn.z),
      health,
      yaw,
    );
    this.rig = createDroneRig();
    this.root.add(this.rig.root);
    this.fireCooldown = world.rng.range(0.5, 1.2);
    this.hitVolumes.push(
      { zone: 'head', impact: 'drone', sphere: new THREE.Sphere(new THREE.Vector3(0, -0.03, 0.29), 0.1) },
      { zone: 'body', impact: 'drone', sphere: new THREE.Sphere(new THREE.Vector3(0, 0, 0), 0.34) },
      { zone: 'limb', impact: 'drone', box: new THREE.Box3(new THREE.Vector3(-0.5, -0.05, -0.5), new THREE.Vector3(0.5, 0.11, 0.5)) },
    );
    this.root.rotation.y = yaw;
  }

  eyePosition(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.position);
  }

  muzzlePosition(out: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld();
    return this.rig.muzzle.getWorldPosition(out);
  }

  idleAnimate(dt: number, time: number): void {
    if (!this.alive) return;
    this.position.y = DRONE.hoverHeight + Math.sin(time * 1.7 + this.phase) * 0.1;
    for (const rotor of this.rig.rotors) rotor.rotation.y += dt * 55;
    this.root.updateMatrix();
    this.root.updateMatrixWorld();
  }

  protected resolveCollision(): void {
    const y = this.position.y;
    this.world.collision.resolveCircle(this.position, DRONE.radius, y - 0.25, y + 0.25);
  }

  protected onShotFired(): void {
    this.recoil = 1;
  }

  protected think(dt: number, ctx: CombatContext): void {
    this.time += dt;
    const rng = this.world.rng;
    const hover = this.state === 'engage' ? DRONE.hoverHeight - 0.25 : DRONE.hoverHeight;
    this.position.y = damp(this.position.y, hover + Math.sin(this.time * 1.7 + this.phase) * 0.12, 2.5, dt);

    switch (this.state) {
      case 'idle':
      case 'patrol': {
        if (this.suspicion > 0.3) {
          this.applyMovement(dt, 0, 0, ctx, 3);
          this.faceYaw(Math.atan2(this.suspiciousPoint.x - this.position.x, this.suspiciousPoint.z - this.position.z), 2, dt);
          break;
        }
        const a = this.time * 0.22 + this.phase;
        this.orbit.set(this.home.x + Math.cos(a) * 2.2, 0, this.home.z + Math.sin(a) * 2.2);
        this.approach(this.orbit, 1.3, dt, ctx, true, 0.3);
        break;
      }
      case 'investigate': {
        if (this.searchTimer > 0) {
          this.searchTimer += dt;
          this.applyMovement(dt, 0, 0, ctx);
          this.faceYaw(this.yaw + 1, 1.4, dt);
          if (this.searchTimer > 4) {
            this.searchTimer = 0;
            this.awareness = 0.45;
            this.home.set(this.position.x, this.home.y, this.position.z);
            this.enterState('idle');
          }
          break;
        }
        if (this.approach(this.lastKnown, DRONE.speed * 0.8, dt, ctx, true, 1.5) || this.stateTimer > 16) this.searchTimer = 0.001;
        break;
      }
      case 'engage': {
        this.searchTimer = 0;
        if (!this.seesPlayer && this.timeSinceSeen > 1.3) {
          this.charging = false;
          this.enterState('hunt');
          break;
        }
        const pos = this.position;
        const dx = ctx.playerFeet.x - pos.x;
        const dz = ctx.playerFeet.z - pos.z;
        const distance = Math.hypot(dx, dz) || 1;
        this.faceYaw(Math.atan2(dx, dz), 4, dt);
        const [near, far] = DRONE.preferredRange;
        if (distance > far) {
          this.approach(ctx.playerFeet, DRONE.speed * 0.85, dt, ctx, false, far * 0.85);
        } else if (distance < near) {
          this.applyMovement(dt, (-dx / distance) * DRONE.speed * 0.7, (-dz / distance) * DRONE.speed * 0.7, ctx, 4);
        } else {
          this.strafeTimer -= dt;
          if (this.strafeTimer <= 0 || this.stuckTimer > 0.4) {
            this.strafeSign = rng.chance(0.5) ? 1 : -1;
            this.strafeTimer = rng.range(1.6, 3.4);
            this.stuckTimer = 0;
          }
          const speed = this.charging ? DRONE.speed * 0.25 : DRONE.speed * 0.6;
          this.applyMovement(dt, (-dz / distance) * this.strafeSign * speed, (dx / distance) * this.strafeSign * speed, ctx, 3);
        }
        this.reaction -= dt;
        this.updateFiring(dt, ctx, this.yawErrorTo(ctx.playerFeet.x, ctx.playerFeet.z) < 0.35);
        break;
      }
      case 'hunt': {
        this.searchTimer = 0;
        if (this.approach(this.lastKnown, DRONE.speed, dt, ctx, true, 1.5)) {
          this.huntRounds++;
          if (this.huntRounds > 2 || this.stateTimer > 18) {
            this.state = 'investigate';
            this.stateTimer = 0;
            this.searchTimer = 0.001;
          } else {
            const error = 4 / this.huntRounds;
            this.lastKnown.set(ctx.playerFeet.x + rng.range(-error, error), 0, ctx.playerFeet.z + rng.range(-error, error));
            this.path.length = 0;
            this.repathTimer = 0;
          }
        }
        break;
      }
      case 'dead':
        break;
    }
  }

  private updateFiring(dt: number, ctx: CombatContext, aligned: boolean): void {
    if (this.charging) {
      this.chargeTimer -= dt;
      if (this.chargeTimer <= 0) {
        this.charging = false;
        if (this.seesPlayer && ctx.playerAlive) this.fireAtPlayer(ctx, DRONE.accuracy, DRONE.damage, 'laser', true);
        this.fireCooldown = this.world.rng.range(DRONE.fireCooldown[0], DRONE.fireCooldown[1]);
      }
      return;
    }
    this.fireCooldown -= dt;
    if (this.fireCooldown <= 0 && this.reaction <= 0 && this.seesPlayer && aligned && ctx.playerAlive) {
      this.charging = true;
      this.chargeTimer = DRONE.chargeTime;
      this.world.audio.droneCharge(this.position, DRONE.chargeTime);
    }
  }

  protected animate(dt: number): void {
    const rig = this.rig;
    for (const rotor of rig.rotors) rotor.rotation.y += dt * 55;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const forward = this.velocity.x * sin + this.velocity.z * cos;
    const right = this.velocity.x * cos - this.velocity.z * sin;
    this.recoil = damp(this.recoil, 0, 10, dt);
    rig.body.rotation.x = damp(rig.body.rotation.x, forward * 0.09 - this.recoil * 0.25, 6, dt);
    rig.body.rotation.z = damp(rig.body.rotation.z, -right * 0.09, 6, dt);
    const charge = this.charging ? 1 - this.chargeTimer / DRONE.chargeTime : 0;
    rig.eyeMaterial.emissiveIntensity = 3 + charge * charge * 14;
    const flash = this.hitFlash;
    rig.bodyMaterial.emissive.setRGB(0.6 * flash, 0.18 * flash, 0.05 * flash);
    this.root.rotation.y = this.yaw;
  }

  protected onKilled(): void {
    this.charging = false;
    this.fallSpeed = 0;
    this.crashed = false;
    this.spin = this.world.rng.range(3, 7) * this.world.rng.sign();
    this.rig.eyeMaterial.emissiveIntensity = 0;
    this.rig.bodyMaterial.emissive.setRGB(0, 0, 0);
  }

  protected updateDeath(dt: number): void {
    if (this.crashed) return;
    const pos = this.position;
    this.fallSpeed += WORLD.gravity * dt;
    pos.y -= this.fallSpeed * dt;
    this.velocity.multiplyScalar(Math.exp(-dt * 1.5));
    pos.x += this.velocity.x * dt;
    pos.z += this.velocity.z * dt;
    this.world.collision.resolveCircle(pos, DRONE.radius * 0.6, pos.y - 0.2, pos.y + 0.2);
    this.yaw += this.spin * dt;
    this.root.rotation.y = this.yaw;
    this.rig.body.rotation.x += dt * 2.2;
    for (const rotor of this.rig.rotors) rotor.rotation.y += dt * 12;
    this.trailTimer -= dt;
    if (this.trailTimer <= 0) {
      this.trailTimer = 0.04;
      this.world.effects.trail(pos);
    }
    if (pos.y <= 0.22) {
      pos.y = 0.22;
      this.crashed = true;
      this.velocity.set(0, 0, 0);
      this.rig.body.rotation.set(0.25, 0, 0.45);
      this.world.effects.explosion(pos);
      this.world.audio.explosion(pos);
    }
  }
}
