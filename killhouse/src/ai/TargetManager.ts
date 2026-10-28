import * as THREE from 'three';
import { DRONE, SOLDIER, type DifficultySettings } from '../config';
import type { LevelData } from '../level/LevelConstructor';
import { DroneEnemy } from './DroneEnemy';
import type { CombatContext, Enemy, EnemyWorld } from './Enemy';
import { SoldierEnemy } from './SoldierEnemy';
import type { EnemyHit, ShotTargets } from './types';

export interface TargetEvents {
  onKilled(enemy: Enemy, headshot: boolean): void;
}

/**
 * Spawns, updates and hit-tests every hostile in the compound. Implements the
 * weapon's ShotTargets contract, so the rifle never touches enemy internals.
 */
export class TargetManager implements ShotTargets {
  readonly enemies: Enemy[] = [];
  private readonly group = new THREE.Group();
  private readonly toEnemy = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();
  private readonly listenerEar = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private readonly world: EnemyWorld,
    private readonly events: TargetEvents,
  ) {
    scene.add(this.group);
  }

  get total(): number {
    return this.enemies.length;
  }

  get alive(): number {
    let count = 0;
    for (const enemy of this.enemies) if (enemy.alive) count++;
    return count;
  }

  /** Removes everyone and spawns the full roster for a new run. */
  spawn(level: LevelData, difficulty: DifficultySettings): void {
    this.clear();
    const rng = this.world.rng;
    const facing = (p: THREE.Vector3): number => {
      // Face the most open direction so guards watch their room, not the wall.
      let best = 0;
      let bestRun = -1;
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        let run = 0;
        while (run < 6 && level.nav.isWalkableAt(p.x + Math.sin(angle) * (run + 1) * 1.6, p.z + Math.cos(angle) * (run + 1) * 1.6)) run++;
        if (run > bestRun) {
          bestRun = run;
          best = angle;
        }
      }
      return best + rng.range(-0.3, 0.3);
    };
    for (const spawn of level.soldierSpawns) {
      const soldier = new SoldierEnemy(this.world, spawn, SOLDIER.health * difficulty.enemyHealth, facing(spawn));
      this.enemies.push(soldier);
      this.group.add(soldier.root);
    }
    for (const spawn of level.droneSpawns) {
      const drone = new DroneEnemy(this.world, spawn, DRONE.health * difficulty.enemyHealth, facing(spawn));
      this.enemies.push(drone);
      this.group.add(drone.root);
    }
    for (const enemy of this.enemies) {
      enemy.root.updateMatrix();
      enemy.root.updateMatrixWorld();
    }
  }

  clear(): void {
    for (const enemy of this.enemies) {
      this.group.remove(enemy.root);
      enemy.root.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          const material = object.material as THREE.Material | THREE.Material[];
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material.dispose();
        }
      });
    }
    this.enemies.length = 0;
  }

  update(dt: number, ctx: CombatContext): void {
    for (const enemy of this.enemies) enemy.update(dt, ctx);
  }

  /** Attract-mode animation for the menu: no perception, no AI. */
  animateIdle(dt: number, time: number): void {
    for (const enemy of this.enemies) {
      if (enemy instanceof SoldierEnemy) enemy.idleAnimate(time);
      else if (enemy instanceof DroneEnemy) enemy.idleAnimate(dt, time);
    }
  }

  raycast(ray: THREE.Ray, maxDistance: number, out: EnemyHit): boolean {
    let best = maxDistance;
    let found = false;
    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      if (!enemy.alive) continue;
      // Cheap reject: skip anyone whose 1.2 m bounding sphere the ray misses.
      this.toEnemy.copy(enemy.position);
      if (enemy.kind === 'soldier') this.toEnemy.y += 0.9;
      const along = this.toEnemy.sub(ray.origin).dot(ray.direction);
      if (along < -1.2 || along - 1.2 > best) continue;
      this.scratch.copy(ray.direction).multiplyScalar(along).sub(this.toEnemy);
      if (this.scratch.lengthSq() > 1.44) continue;
      if (enemy.raycast(ray, best, out)) {
        best = out.distance;
        out.enemyIndex = i;
        found = true;
      }
    }
    return found;
  }

  applyHit(hit: EnemyHit, damage: number, from: THREE.Vector3): boolean {
    const enemy = this.enemies[hit.enemyIndex];
    if (!enemy || !enemy.alive) return false;
    const killed = enemy.damage(damage, from);
    if (killed) this.events.onKilled(enemy, hit.zone === 'head');
    return killed;
  }

  /** Gunfire carries through open doors; walls muffle it to roughly half range. */
  notifyGunshot(position: THREE.Vector3, radius: number): void {
    this.listenerEar.set(position.x, 1.5, position.z);
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const d = enemy.position.distanceTo(position);
      if (d > radius) continue;
      enemy.eyePosition(this.scratch);
      if (d < radius * 0.55 || this.world.collision.isSegmentClear(this.scratch, this.listenerEar)) enemy.hearNoise(position);
    }
  }

  nearestLiveDrone(position: THREE.Vector3, maxDistance: number): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null;
    let bestDistance = maxDistance;
    for (const enemy of this.enemies) {
      if (!enemy.alive || enemy.kind !== 'drone') continue;
      const d = enemy.position.distanceTo(position);
      if (d < bestDistance) {
        bestDistance = d;
        best = enemy.position;
      }
    }
    return best;
  }
}
