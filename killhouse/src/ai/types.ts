import * as THREE from 'three';
import type { ImpactKind } from '../fx/EffectsManager';

export type HitZone = 'head' | 'body' | 'limb';

export interface EnemyHit {
  /** Index into TargetManager's enemy list. */
  enemyIndex: number;
  distance: number;
  readonly point: THREE.Vector3;
  readonly normal: THREE.Vector3;
  zone: HitZone;
  impact: ImpactKind;
}

export function createEnemyHit(): EnemyHit {
  return { enemyIndex: -1, distance: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), zone: 'body', impact: 'flesh' };
}

/** What the weapon needs from whoever owns the enemies. */
export interface ShotTargets {
  raycast(ray: THREE.Ray, maxDistance: number, out: EnemyHit): boolean;
  /** Applies damage; returns true if the hit killed the target. */
  applyHit(hit: EnemyHit, damage: number, from: THREE.Vector3): boolean;
  notifyGunshot(position: THREE.Vector3, radius: number): void;
}
