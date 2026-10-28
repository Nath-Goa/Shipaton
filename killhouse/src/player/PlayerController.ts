import * as THREE from 'three';
import { LOOK, PLAYER } from '../config';
import type { CollisionWorld } from '../level/CollisionWorld';
import { clamp, easeOutCubic } from '../utils/math';

export interface PlayerEvents {
  /** `angle` is where the shot came from relative to the view: 0 = ahead, +PI/2 = right. */
  onDamaged(amount: number, angle: number): void;
  onDeath(): void;
  onFootstep(): void;
}

/** First-person body: movement, collision, look, recoil, head bob, health. */
export class PlayerController {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly eye = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  health = 100;
  maxHealth = 100;
  alive = true;
  damageTaken = 0;

  private recoilPitch = 0;
  private recoilYaw = 0;
  private bobPhase = 0;
  private bobBlend = 0;
  private shake = 0;
  private time = 0;
  private deathTime = 0;
  private readonly previous = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly collision: CollisionWorld,
    private readonly events: PlayerEvents,
  ) {
    camera.rotation.order = 'YXZ';
  }

  reset(position: THREE.Vector3, yaw: number, maxHealth: number): void {
    this.position.copy(position).setY(0);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = -0.04;
    this.maxHealth = maxHealth;
    this.health = maxHealth;
    this.alive = true;
    this.damageTaken = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.bobPhase = 0;
    this.bobBlend = 0;
    this.shake = 0;
    this.deathTime = 0;
    this.updateEye();
  }

  /** Applies look input in radians; positive dx turns right, positive dy looks down. */
  look(dx: number, dy: number): void {
    if (!this.alive) return;
    this.yaw -= dx;
    this.pitch = clamp(this.pitch - dy, -LOOK.maxPitch, LOOK.maxPitch);
  }

  /** Splits a kick into a permanent climb and a part that springs back. */
  addRecoil(pitchKick: number, yawKick: number, permanentShare: number): void {
    this.pitch = clamp(this.pitch + pitchKick * permanentShare, -LOOK.maxPitch, LOOK.maxPitch);
    this.yaw += yawKick * permanentShare;
    this.recoilPitch += pitchKick * (1 - permanentShare);
    this.recoilYaw += yawKick * (1 - permanentShare);
  }

  get horizontalSpeed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  update(dt: number, move: THREE.Vector2, speedMultiplier: number): void {
    this.time += dt;
    this.recoilPitch *= Math.exp(-dt * 9);
    this.recoilYaw *= Math.exp(-dt * 9);
    this.shake *= Math.exp(-dt * 6);

    if (!this.alive) {
      this.deathTime += dt;
      this.velocity.multiplyScalar(Math.exp(-dt * 6));
      this.updateEye();
      return;
    }

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // forward = (-sin, -cos), right = (cos, -sin)
    const targetX = (-sin * move.y + cos * move.x) * PLAYER.walkSpeed * speedMultiplier;
    const targetZ = (-cos * move.y - sin * move.x) * PLAYER.walkSpeed * speedMultiplier;
    const k = 1 - Math.exp(-PLAYER.acceleration * dt);
    this.velocity.x += (targetX - this.velocity.x) * k;
    this.velocity.z += (targetZ - this.velocity.z) * k;

    this.previous.copy(this.position);
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.collision.resolveCircle(this.position, PLAYER.radius, 0.05, PLAYER.height);
    // Velocity follows what actually happened, so walls bleed off speed instead of storing it.
    if (dt > 0) {
      this.velocity.x = (this.position.x - this.previous.x) / dt;
      this.velocity.z = (this.position.z - this.previous.z) / dt;
    }

    const travelled = Math.hypot(this.position.x - this.previous.x, this.position.z - this.previous.z);
    const speedRatio = clamp(this.horizontalSpeed / PLAYER.walkSpeed, 0, 1);
    this.bobBlend += (speedRatio - this.bobBlend) * (1 - Math.exp(-dt * 8));
    const stepBefore = Math.floor(this.bobPhase / Math.PI);
    this.bobPhase += (travelled / PLAYER.stepLength) * Math.PI;
    if (Math.floor(this.bobPhase / Math.PI) !== stepBefore && speedRatio > 0.25) this.events.onFootstep();

    this.updateEye();
  }

  takeDamage(amount: number, from: THREE.Vector3): void {
    if (!this.alive || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.damageTaken += amount;
    this.shake = Math.min(1, this.shake + amount / 25);
    const dx = from.x - this.position.x;
    const dz = from.z - this.position.z;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const ahead = -dx * sin - dz * cos;
    const right = dx * cos - dz * sin;
    this.events.onDamaged(amount, Math.atan2(right, ahead));
    if (this.health <= 0) {
      this.alive = false;
      this.deathTime = 0;
      this.events.onDeath();
    }
  }

  /** Returns the amount of health actually restored. */
  heal(amount: number): number {
    const before = this.health;
    this.health = Math.min(this.maxHealth, this.health + amount);
    return this.health - before;
  }

  forward(out: THREE.Vector3): THREE.Vector3 {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  /** Writes the final camera transform (bob, recoil, shake, death fall). */
  applyCamera(): void {
    const t = this.time;
    const bob = this.bobBlend;
    const bobY = bob * PLAYER.bobHeight * (Math.cos(this.bobPhase * 2) - 1) * 0.5;
    const sway = bob * 0.012 * Math.sin(this.bobPhase);
    const death = this.alive ? 0 : easeOutCubic(this.deathTime / 0.9);
    const eyeHeight = PLAYER.eyeHeight + (0.32 - PLAYER.eyeHeight) * death;

    this.camera.position.set(
      this.position.x + Math.cos(this.yaw) * sway,
      this.position.y + eyeHeight + bobY,
      this.position.z - Math.sin(this.yaw) * sway,
    );
    const s = this.shake;
    this.camera.rotation.set(
      this.pitch + this.recoilPitch + Math.sin(t * 37) * s * 0.014 + death * (0.25 - this.pitch),
      this.yaw + this.recoilYaw + Math.sin(t * 29 + 1) * s * 0.012,
      Math.sin(t * 23) * s * 0.02 + death * 1.05 + bob * Math.sin(this.bobPhase) * 0.004,
      'YXZ',
    );
  }

  private updateEye(): void {
    this.eye.set(this.position.x, this.position.y + PLAYER.eyeHeight, this.position.z);
  }
}
