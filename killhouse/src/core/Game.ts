import * as THREE from 'three';
import { DIFFICULTIES, LOOK, PICKUPS, PLAYER, WEAPON, WORLD, type Difficulty, type DifficultySettings } from '../config';
import { AudioSystem } from '../audio/AudioSystem';
import type { CombatContext, Enemy } from '../ai/Enemy';
import { TargetManager } from '../ai/TargetManager';
import { createEnemyHit } from '../ai/types';
import { EffectsManager } from '../fx/EffectsManager';
import { MobileInputController } from '../input/MobileInputController';
import { PickupManager, type PickupReceiver } from '../items/PickupManager';
import { createRayHit } from '../level/CollisionWorld';
import { LevelConstructor, type LevelData, type PickupKind } from '../level/LevelConstructor';
import { generateTextureLibrary, type TextureLibrary } from '../level/ProceduralTextures';
import { PlayerController } from '../player/PlayerController';
import { HUD } from '../ui/HUD';
import { Minimap, type MinimapBlip } from '../ui/Minimap';
import { Screens, formatTime, type MissionReport } from '../ui/Screens';
import { Random } from '../utils/Random';
import { lerp } from '../utils/math';
import { WeaponSystem } from '../weapons/WeaponSystem';
import { GameLoop } from './GameLoop';
import { RenderPipeline } from './RenderPipeline';

type GameState = 'loading' | 'menu' | 'playing' | 'paused' | 'ended';
type Outcome = 'victory' | 'defeat';

interface Preferences {
  difficulty: Difficulty;
  sensitivity: number;
  sound: boolean;
}

const PREFS_KEY = 'killhouse.prefs.v1';
const BEST_KEY = 'killhouse.best.v1';
const FLASHLIGHT_INTENSITY = 170;
const CENTER = new THREE.Vector2(0, 0);
const NO_LOOK = new THREE.Vector2(0, 0);

function readJson<T extends object>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<T>) } : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked (private mode, sandboxed frame): preferences simply don't persist.
  }
}

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

/** Mutable per-frame snapshot the enemies read; one instance, never reallocated. */
class CombatState implements CombatContext {
  playerAlive = true;
  playerLit = true;
  difficulty: DifficultySettings = DIFFICULTIES.regular;
  allies: readonly Enemy[] = [];

  constructor(
    readonly playerEye: THREE.Vector3,
    readonly playerFeet: THREE.Vector3,
    readonly playerVelocity: THREE.Vector3,
    private readonly onDamage: (amount: number, from: THREE.Vector3) => void,
  ) {}

  damagePlayer(amount: number, from: THREE.Vector3): void {
    this.onDamage(amount, from);
  }
}

/**
 * Orchestrates the run: builds the world, wires every system together, owns the
 * state machine (loading → menu → playing ⇄ paused → ended) and the frame order.
 */
export class Game implements PickupReceiver {
  private state: GameState = 'loading';
  private readonly screens: Screens;
  private readonly prefs: Preferences;
  private best: Partial<Record<Difficulty, number>>;
  private difficulty: DifficultySettings;

  private pipeline!: RenderPipeline;
  private textures!: TextureLibrary;
  private level!: LevelConstructor;
  private levelData!: LevelData;
  private effects!: EffectsManager;
  private readonly audio = new AudioSystem();
  private targets!: TargetManager;
  private pickups!: PickupManager;
  private player!: PlayerController;
  private weapon!: WeaponSystem;
  private input!: MobileInputController;
  private hud!: HUD;
  private minimap!: Minimap;
  private combat!: CombatState;
  private flashlight!: THREE.SpotLight;
  private loop!: GameLoop;
  private readonly rng = new Random(WORLD.seed ^ 0x2c1b3c6d);

  private flashlightOn = true;
  private elapsed = 0;
  private menuTime = 0;
  private missionTime = 0;
  private kills = 0;
  private outcome: Outcome | null = null;
  private endTimer = 0;
  private revealAll = false;
  private outOfAmmoWarned = false;
  private aimOnTarget = false;
  private autoAcquire = 0;
  private autoTrigger = false;
  private minimapClock = 0;
  private touchUi = false;
  private readonly lookDelta = new THREE.Vector2();
  private frameTaps = 0;
  private frameReload = false;
  private frameAds = false;
  private readonly aimRay = new THREE.Raycaster();
  private readonly aimWorldHit = createRayHit();
  private readonly aimEnemyHit = createEnemyHit();
  private readonly blips: MinimapBlip[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.prefs = readJson<Preferences>(PREFS_KEY, { difficulty: 'regular', sensitivity: 1, sound: true });
    if (!(this.prefs.difficulty in DIFFICULTIES)) this.prefs.difficulty = 'regular';
    this.best = readJson<Partial<Record<Difficulty, number>>>(BEST_KEY, {});
    this.difficulty = DIFFICULTIES[this.prefs.difficulty];
    this.screens = new Screens({
      deploy: (difficulty) => this.startMission(difficulty),
      resume: () => this.resume(),
      restart: () => this.startMission(this.difficulty.id),
      quit: () => this.quitToMenu(),
      setSensitivity: (value) => {
        this.prefs.sensitivity = value;
        if (this.input) this.input.sensitivity = value;
        writeJson(PREFS_KEY, this.prefs);
      },
      setSound: (enabled) => {
        this.prefs.sound = enabled;
        this.audio.setEnabled(enabled);
        writeJson(PREFS_KEY, this.prefs);
      },
    });
    this.screens.setPreferences(this.prefs.difficulty, this.prefs.sensitivity, this.prefs.sound, this.best);
    this.audio.setEnabled(this.prefs.sound);
  }

  async init(): Promise<void> {
    try {
      this.pipeline = new RenderPipeline(this.canvas);
    } catch {
      this.screens.showError('This browser could not start WebGL, so the 3D compound cannot be drawn. Try Chrome or Safari with hardware acceleration on.');
      return;
    }
    try {
      await this.build();
    } catch (error) {
      console.error(error);
      this.screens.showError(`The compound failed to build: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async build(): Promise<void> {
    const { scene, camera } = this.pipeline;
    this.textures = await generateTextureLibrary(WORLD.seed, this.pipeline.maxAnisotropy, (fraction, label) =>
      this.screens.setProgress(fraction, label),
    );

    this.screens.setProgress(0.76, 'Building the compound');
    await nextFrame();
    this.level = new LevelConstructor(scene, this.textures, WORLD.seed);
    this.levelData = this.level.build();
    const { collision, nav } = this.levelData;

    const ambient = new THREE.HemisphereLight(0x8d9db5, 0x2b2219, 0.3);
    ambient.layers.enableAll();
    scene.add(ambient);

    this.flashlight = new THREE.SpotLight(0xfff1dc, 0, 34, 0.42, 0.45, 2);
    this.flashlight.position.set(0.16, -0.14, -0.28);
    this.flashlight.target.position.set(0.02, -0.12, -10);
    this.flashlight.map = this.textures.flashlightCookie;
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(1024, 1024);
    this.flashlight.shadow.camera.near = 0.1;
    this.flashlight.shadow.camera.far = 30;
    this.flashlight.shadow.bias = -0.0003;
    this.flashlight.shadow.normalBias = 0.02;
    this.flashlight.shadow.radius = 2.5;
    this.flashlight.shadow.autoUpdate = false;
    // Render the map once even while the light is off: an unallocated shadow
    // sampler makes WebGL reject every draw call that reads it.
    this.flashlight.shadow.needsUpdate = true;
    this.flashlight.layers.enableAll();
    camera.add(this.flashlight, this.flashlight.target);

    this.screens.setProgress(0.82, 'Arming the range');
    await nextFrame();
    this.effects = new EffectsManager(scene, this.textures);
    this.targets = new TargetManager(
      scene,
      { collision, nav, effects: this.effects, audio: this.audio, rng: this.rng },
      { onKilled: (enemy, headshot) => this.onEnemyKilled(enemy, headshot) },
    );
    this.pickups = new PickupManager(scene, this.textures);
    this.player = new PlayerController(camera, collision, {
      onDamaged: (amount, angle) => {
        this.hud.damage(angle, amount);
        this.audio.playerHurt();
      },
      onDeath: () => this.onPlayerDeath(),
      onFootstep: () => this.audio.footstep(),
    });
    this.combat = new CombatState(this.player.eye, this.player.position, this.player.velocity, (amount, from) =>
      this.player.takeDamage(amount, from),
    );
    this.weapon = new WeaponSystem(camera, this.textures, this.pipeline.envMap, collision, this.targets, this.effects, this.audio, this.player, {
      onHit: (kill, headshot) => this.hud.hitMarker(kill, headshot),
      onDryFire: () => {
        if (this.weapon.reserve === 0) this.hud.toast('Magazine empty · no reserve', 'warn');
      },
    });
    this.weapon.pivot.visible = false;

    this.input = new MobileInputController({
      surface: byId('touch-layer'),
      joystickBase: byId('joystick'),
      joystickKnob: byId('joystick-knob'),
      fire: byId('btn-fire'),
      reload: byId('btn-reload'),
      ads: byId('btn-ads'),
      auto: byId('btn-auto'),
      light: byId('btn-light'),
      pause: byId('btn-pause'),
    });
    this.input.sensitivity = this.prefs.sensitivity;
    this.hud = new HUD(WEAPON.magazineSize);
    this.minimap = new Minimap(byId<HTMLCanvasElement>('minimap'), this.levelData);

    // Lamps bake their shadow maps on the first frame, before anything that moves exists.
    this.screens.setProgress(0.88, 'Compiling shaders');
    await nextFrame();
    this.positionMenuCamera();
    await this.pipeline.compile();
    this.pipeline.render();

    this.targets.spawn(this.levelData, this.difficulty);
    this.pickups.reset(this.levelData.pickupSpawns);
    this.screens.setProgress(0.95, 'Briefing');
    await this.pipeline.compile();

    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('orientationchange', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.loop.stop();
      this.audio.suspend();
      this.screens.showContextLost();
    });

    this.loop = new GameLoop({
      beginFrame: (dt) => this.beginFrame(dt),
      fixedUpdate: (dt, first) => this.fixedUpdate(dt, first),
      render: (dt) => this.render(dt),
    });
    this.screens.setProgress(1, 'Ready');
    this.state = 'menu';
    this.screens.showMenu();
    this.loop.start();
  }

  receive(kind: PickupKind, amount: number): number {
    if (kind === 'ammo') {
      const taken = this.weapon.addAmmo(amount);
      if (taken > 0) {
        this.hud.toast(`+${taken} rounds`, 'ok', 1.6);
        this.audio.pickup();
        this.outOfAmmoWarned = false;
      }
      return taken;
    }
    const healed = this.player.heal(amount);
    if (healed > 0) {
      this.hud.toast(`+${Math.round(healed)} HP`, 'ok', 1.6);
      this.audio.pickup();
    }
    return healed;
  }

  private startMission(difficulty: Difficulty): void {
    if (this.state === 'loading') return;
    this.audio.unlock();
    this.audio.setEnabled(this.prefs.sound);
    this.audio.setAmbience(1);
    this.audio.resume();
    this.requestImmersive();
    this.difficulty = DIFFICULTIES[difficulty];
    this.prefs.difficulty = difficulty;
    writeJson(PREFS_KEY, this.prefs);

    this.targets.spawn(this.levelData, this.difficulty);
    this.pickups.reset(this.levelData.pickupSpawns);
    this.effects.clear();
    this.weapon.reset();
    this.player.reset(this.levelData.playerStart.position, this.levelData.playerStart.yaw, this.difficulty.playerHealth);
    this.missionTime = 0;
    this.kills = 0;
    this.outcome = null;
    this.endTimer = 0;
    this.revealAll = false;
    this.outOfAmmoWarned = false;
    this.aimOnTarget = false;
    this.autoAcquire = 0;
    this.autoTrigger = false;
    this.setFlashlight(true);
    this.weapon.pivot.visible = true;
    this.player.applyCamera();
    this.pipeline.camera.updateMatrixWorld();

    if (this.input.touchSeen || window.matchMedia('(pointer: coarse)').matches) this.enableTouchUi();
    this.state = 'playing';
    this.screens.showPlaying();
    this.hud.reset(formatTime(this.difficulty.parTime, false));
    this.hud.setVisible(true);
    this.minimap.resize();
    this.input.setEnabled(true);
    this.input.requestPointerLock();
    this.hud.toast(`Clear the compound · ${this.targets.total} hostiles`, 'info', 3.2);
    this.pipeline.settle();
  }

  private pause(): void {
    if (this.state !== 'playing' || this.outcome) return;
    this.state = 'paused';
    this.input.setEnabled(false);
    this.input.releasePointerLock();
    this.audio.suspend();
    this.screens.showPause();
  }

  private resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.screens.hidePause();
    this.audio.unlock();
    this.audio.resume();
    this.input.setEnabled(true);
    this.input.requestPointerLock();
    this.pipeline.settle();
  }

  private quitToMenu(): void {
    this.state = 'menu';
    this.menuTime = 0;
    this.input.setEnabled(false);
    this.input.releasePointerLock();
    this.audio.resume();
    this.audio.setDroneProximity(null);
    this.hud.setVisible(false);
    this.weapon.pivot.visible = false;
    this.setFlashlight(false);
    this.effects.clear();
    this.targets.spawn(this.levelData, this.difficulty);
    this.pickups.reset(this.levelData.pickupSpawns);
    this.pipeline.setZoom(1);
    this.screens.setBestTimes(this.best);
    this.screens.showMenu();
    this.pipeline.settle();
  }

  private beginFrame(frameDt: number): void {
    if (this.state !== 'playing') return;
    this.input.update(frameDt);
    if (this.input.consumePause()) {
      this.pause();
      return;
    }
    if (!this.touchUi && this.input.touchSeen) this.enableTouchUi();
    if (this.input.consumeFlashlight()) this.setFlashlight(!this.flashlightOn);
    this.input.consumeLook(this.lookDelta);
    const multiplier = lerp(1, LOOK.adsMultiplier, this.weapon.adsAmount) * (this.aimOnTarget ? LOOK.aimFriction : 1);
    this.lookDelta.multiplyScalar(multiplier);
    this.player.look(this.lookDelta.x, this.lookDelta.y);
    this.frameTaps = this.input.consumeTapShots();
    this.frameReload = this.input.consumeReload();
    this.frameAds = this.input.consumeAdsToggle();
  }

  private fixedUpdate(dt: number, first: boolean): void {
    if (this.state === 'menu') {
      this.menuTime += dt;
      this.elapsed += dt;
      this.targets.animateIdle(dt, this.menuTime);
      this.effects.update(dt);
      this.level.update(dt, this.elapsed, this.pipeline.pointScale);
      return;
    }
    if (this.state !== 'playing') return;

    this.elapsed += dt;
    if (this.player.alive && !this.outcome) this.missionTime += dt;
    this.combat.playerAlive = this.player.alive;
    this.combat.playerLit = this.flashlightOn;
    this.combat.difficulty = this.difficulty;
    this.combat.allies = this.targets.enemies;

    const speedMultiplier = lerp(1, PLAYER.adsSpeedMultiplier, this.weapon.adsAmount);
    this.player.update(dt, this.input.move, speedMultiplier);
    this.player.applyCamera();
    this.pipeline.camera.updateMatrixWorld();

    const armed = this.player.alive && this.outcome === null;
    this.weapon.update(
      dt,
      {
        lookDelta: first ? this.lookDelta : NO_LOOK,
        moveRatio: Math.min(1, this.player.horizontalSpeed / PLAYER.walkSpeed),
        triggerHeld: this.input.fireHeld || this.autoTrigger,
        tapShots: first ? this.frameTaps : 0,
        reloadPressed: first && this.frameReload,
        adsToggle: first && this.frameAds,
        adsHeld: this.input.adsHeld,
      },
      armed,
    );
    this.targets.update(dt, this.combat);
    this.pickups.update(dt, this.elapsed, this.player.position, this.player.alive, this);
    this.effects.update(dt);
    this.level.update(dt, this.elapsed, this.pipeline.pointScale);

    if (this.outcome) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.finishMission();
    }
  }

  private render(frameDt: number): void {
    if (this.state === 'menu') {
      this.positionMenuCamera();
      this.effects.setPointScale(this.pipeline.pointScale);
      this.pipeline.render();
      this.pipeline.adapt(frameDt);
      return;
    }
    if (this.state !== 'playing') return;

    this.pipeline.setZoom(lerp(1, WEAPON.adsZoom, this.weapon.adsAmount));
    this.updateAim(frameDt);
    this.updateHud(frameDt);
    this.audio.setListener(this.player.eye, this.player.yaw);
    this.audio.setDroneProximity(this.player.alive ? this.targets.nearestLiveDrone(this.player.position, 24) : null);
    this.effects.setPointScale(this.pipeline.pointScale);
    this.pipeline.render();
    this.pipeline.adapt(frameDt);
  }

  private updateAim(frameDt: number): void {
    this.aimRay.setFromCamera(CENTER, this.pipeline.camera);
    const ray = this.aimRay.ray;
    const { collision } = this.levelData;
    const worldDistance = collision.raycast(ray.origin, ray.direction, 80, this.aimWorldHit) ? this.aimWorldHit.distance : 80;
    this.aimOnTarget = this.player.alive && this.outcome === null && this.targets.raycast(ray, Math.min(60, worldDistance), this.aimEnemyHit);
    this.autoAcquire = this.input.autoFire && this.aimOnTarget && !this.weapon.isReloading ? this.autoAcquire + frameDt : 0;
    this.autoTrigger = this.autoAcquire > 0.09;
  }

  private updateHud(frameDt: number): void {
    const hud = this.hud;
    const weapon = this.weapon;
    hud.setHealth(this.player.health, this.player.maxHealth);
    hud.setAmmo(weapon.mag, weapon.reserve);
    hud.setHostiles(this.targets.alive);
    hud.setTimer(formatTime(this.missionTime), this.missionTime > this.difficulty.parTime);
    hud.setHeading(this.player.yaw);
    const camera = this.pipeline.camera;
    const moveRatio = Math.min(1, this.player.horizontalSpeed / PLAYER.walkSpeed);
    const gap =
      (Math.tan(weapon.currentSpread(moveRatio)) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) * (window.innerHeight / 2) + 5;
    hud.setCrosshair(gap, this.aimOnTarget, weapon.adsAmount);
    hud.setReload(weapon.isReloading ? weapon.reloadProgress : null);
    hud.update(frameDt);

    if (weapon.mag === 0 && weapon.reserve === 0 && !this.outOfAmmoWarned) {
      this.outOfAmmoWarned = true;
      hud.toast('Out of ammo · find an ammo can', 'threat', 3);
    }

    this.minimapClock -= frameDt;
    if (this.minimapClock <= 0) {
      this.minimapClock = 1 / 15;
      this.blips.length = 0;
      for (const enemy of this.targets.enemies) {
        if (enemy.alive && (this.revealAll || enemy.revealTimer > 0)) {
          this.blips.push({ x: enemy.position.x, z: enemy.position.z, kind: enemy.kind });
        }
      }
      for (const pickup of this.pickups.pickups) {
        if (pickup.active) this.blips.push({ x: pickup.base.x, z: pickup.base.z, kind: pickup.kind });
      }
      this.minimap.draw(this.player.position.x, this.player.position.z, this.player.yaw, this.blips);
    }
  }

  private onEnemyKilled(enemy: Enemy, headshot: boolean): void {
    this.kills++;
    this.hud.feed(`${enemy.kind === 'drone' ? 'Drone' : 'Rifleman'} down${headshot ? ' · headshot' : ''}`, headshot);
    if (enemy.kind === 'soldier' && this.rng.chance(PICKUPS.dropChance)) {
      this.pickups.spawn('ammo', enemy.position, PICKUPS.droppedAmmoAmount);
    }
    const alive = this.targets.alive;
    if (alive === 0) {
      this.outcome = 'victory';
      this.endTimer = 2.4;
      this.input.setEnabled(false);
      this.hud.toast('Compound clear', 'ok', 3);
      this.audio.pickup();
    } else if (alive <= 3 && !this.revealAll) {
      this.revealAll = true;
      this.hud.toast(`Visor uplink · last ${alive} hostiles marked`, 'threat', 3);
    }
  }

  private onPlayerDeath(): void {
    if (this.outcome) return;
    this.outcome = 'defeat';
    this.endTimer = 2.6;
    this.input.setEnabled(false);
    this.weapon.pivot.visible = false;
    this.hud.toast('You are down', 'threat', 3);
  }

  private finishMission(): void {
    this.state = 'ended';
    this.input.releasePointerLock();
    this.hud.setVisible(false);
    this.audio.setDroneProximity(null);
    const victory = this.outcome === 'victory';
    const settings = this.difficulty;
    const accuracy = this.weapon.accuracy;
    const time = this.missionTime;

    let rating = 'Unqualified';
    let title = 'Killed in action';
    let subtitle = `${this.targets.alive} hostiles still holding the compound.`;
    if (victory) {
      const previous = this.best[settings.id];
      if (previous === undefined || time < previous) {
        this.best[settings.id] = time;
        writeJson(BEST_KEY, this.best);
      }
      if (time <= settings.parTime && accuracy >= 0.5) rating = 'Expert';
      else if (time <= settings.parTime * 1.25 && accuracy >= 0.35) rating = 'Sharpshooter';
      else rating = 'Marksman';
      title = 'Compound clear';
      subtitle = time <= settings.parTime ? `Inside par by ${formatTime(settings.parTime - time)}.` : `Over par by ${formatTime(time - settings.parTime)}.`;
    }
    const best = this.best[settings.id];
    const report: MissionReport = {
      victory,
      rating,
      title,
      subtitle,
      time: formatTime(time),
      kills: `${this.kills} / ${this.targets.total}`,
      accuracy: `${Math.round(accuracy * 100)}% (${this.weapon.shotsHit}/${this.weapon.shotsFired})`,
      headshots: String(this.weapon.headshots),
      damage: `${Math.round(this.player.damageTaken)} HP`,
      best: best !== undefined ? `${formatTime(best)} · ${settings.label}` : `None on ${settings.label}`,
    };
    this.screens.showReport(report);
  }

  private enableTouchUi(): void {
    if (this.touchUi) return;
    this.touchUi = true;
    document.body.classList.add('touch-ui');
  }

  private setFlashlight(on: boolean): void {
    this.flashlightOn = on;
    this.flashlight.intensity = on ? FLASHLIGHT_INTENSITY : 0;
    this.flashlight.shadow.autoUpdate = on;
    if (on) this.flashlight.shadow.needsUpdate = true;
    this.hud?.setFlashlight(on);
  }

  private positionMenuCamera(): void {
    const { center, radiusX, radiusZ } = this.levelData.overview;
    const angle = this.menuTime * 0.05 + 0.6;
    const camera = this.pipeline.camera;
    camera.position.set(center.x + Math.cos(angle) * radiusX, 4.3, center.z + Math.sin(angle) * radiusZ);
    camera.lookAt(center.x, 1.1, center.z);
    camera.updateMatrixWorld();
  }

  private onResize(): void {
    if (!this.pipeline) return;
    this.pipeline.resize();
    this.minimap?.resize();
    this.hud?.resize();
    if (this.state === 'paused' || this.state === 'ended') this.pipeline.render();
  }

  /** Fullscreen + landscape lock on phones; both are optional and fail quietly where refused. */
  private requestImmersive(): void {
    if (!window.matchMedia('(pointer: coarse)').matches) return;
    const root = document.documentElement;
    const lock = (): void => {
      const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      orientation.lock?.('landscape').catch(() => undefined);
    };
    if (!document.fullscreenElement && root.requestFullscreen) {
      root.requestFullscreen({ navigationUI: 'hide' }).then(lock).catch(() => undefined);
    } else {
      lock();
    }
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
