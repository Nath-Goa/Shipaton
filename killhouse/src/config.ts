export type Difficulty = 'recruit' | 'regular' | 'veteran';

export interface DifficultySettings {
  readonly id: Difficulty;
  readonly label: string;
  readonly summary: string;
  /** Multiplier on every point of damage an enemy round deals. */
  readonly enemyDamage: number;
  /** Multiplier on enemy hit probability. */
  readonly enemyAccuracy: number;
  /** Seconds between an enemy first spotting the player and its first shot. */
  readonly reactionTime: number;
  readonly enemyHealth: number;
  readonly playerHealth: number;
  /** Qualification par time, in seconds. */
  readonly parTime: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultySettings> = {
  recruit: {
    id: 'recruit',
    label: 'Recruit',
    summary: 'Slow reactions, light hits, 150 HP.',
    enemyDamage: 0.6,
    enemyAccuracy: 0.72,
    reactionTime: 1.05,
    enemyHealth: 0.85,
    playerHealth: 150,
    parTime: 420,
  },
  regular: {
    id: 'regular',
    label: 'Regular',
    summary: 'The standard qualification run.',
    enemyDamage: 1,
    enemyAccuracy: 1,
    reactionTime: 0.7,
    enemyHealth: 1,
    playerHealth: 100,
    parTime: 330,
  },
  veteran: {
    id: 'veteran',
    label: 'Veteran',
    summary: 'Fast, accurate, unforgiving.',
    enemyDamage: 1.4,
    enemyAccuracy: 1.22,
    reactionTime: 0.42,
    enemyHealth: 1.15,
    playerHealth: 100,
    parTime: 270,
  },
};

export const WORLD = {
  cellSize: 2,
  wallHeight: 6,
  doorHeight: 2.6,
  gravity: 9.81,
  seed: 0x4b1d7,
  fogColor: 0x07090a,
  fogDensity: 0.046,
} as const;

export const PLAYER = {
  radius: 0.34,
  height: 1.8,
  eyeHeight: 1.62,
  walkSpeed: 4.5,
  adsSpeedMultiplier: 0.55,
  acceleration: 11,
  stepLength: 1.5,
  bobHeight: 0.026,
} as const;

export const LOOK = {
  /** Radians turned by dragging a finger the full height of the screen. */
  touchRadiansPerScreenHeight: 2.6,
  mouseRadiansPerPixel: 0.0021,
  keyboardTurnRate: 2.2,
  maxPitch: 1.42,
  adsMultiplier: 0.62,
  /** Look-speed multiplier while the crosshair rests on a live target (mobile aim assist). */
  aimFriction: 0.58,
} as const;

export const WEAPON = {
  magazineSize: 30,
  startingReserve: 120,
  maxReserve: 240,
  fireInterval: 60 / 690,
  damage: 34,
  headMultiplier: 3,
  limbMultiplier: 0.72,
  range: 160,
  falloffStart: 30,
  falloffEnd: 90,
  falloffMin: 0.7,
  reloadTime: 2.05,
  emptyReloadTime: 2.6,
  hipSpread: 0.0055,
  adsSpread: 0.0011,
  bloomPerShot: 0.0042,
  maxBloom: 0.032,
  bloomRecovery: 0.075,
  moveSpread: 0.011,
  recoilPitch: 0.0105,
  recoilYaw: 0.0032,
  /** Share of each recoil kick that stays (the rest springs back). */
  recoilPermanent: 0.22,
  adsTime: 0.17,
  adsZoom: 1.5,
  /** Enemies inside this radius hear every shot. */
  noiseRadius: 30,
} as const;

export const SOLDIER = {
  health: 100,
  radius: 0.34,
  walkSpeed: 1.7,
  runSpeed: 3.5,
  viewDistance: 40,
  darkViewDistance: 18,
  fovDegrees: 130,
  eyeHeight: 1.64,
  burstSize: 3,
  burstInterval: 0.11,
  burstCooldown: [1.2, 2.1] as const,
  /** Seconds of continuous sight before an enemy reaches full accuracy. */
  settleTime: 1.8,
  damage: 6,
  accuracy: 0.36,
  preferredRange: [7, 16] as const,
  alertAlliesRadius: 14,
} as const;

export const DRONE = {
  health: 70,
  radius: 0.45,
  speed: 3.6,
  hoverHeight: 2.7,
  viewDistance: 42,
  darkViewDistance: 22,
  fovDegrees: 200,
  fireCooldown: [1.35, 2.2] as const,
  chargeTime: 0.5,
  damage: 10,
  accuracy: 0.45,
  preferredRange: [6, 12] as const,
} as const;

export const PICKUPS = {
  ammoAmount: 90,
  droppedAmmoAmount: 45,
  medkitAmount: 45,
  dropChance: 0.6,
  collectRadius: 1.15,
} as const;
