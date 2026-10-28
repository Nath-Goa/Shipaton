import * as THREE from 'three';
import { LOOK } from '../config';
import { clamp } from '../utils/math';

export interface InputElements {
  /** Full-screen layer under the HUD buttons that receives all free touches. */
  readonly surface: HTMLElement;
  readonly joystickBase: HTMLElement;
  readonly joystickKnob: HTMLElement;
  readonly fire: HTMLElement;
  readonly reload: HTMLElement;
  readonly ads: HTMLElement;
  readonly auto: HTMLElement;
  readonly light: HTMLElement;
  readonly pause: HTMLElement;
}

type Zone = 'move' | 'look';

interface LookPointer {
  lastX: number;
  lastY: number;
  startX: number;
  startY: number;
  startTime: number;
  travel: number;
  fromFireButton: boolean;
}

interface JoystickState {
  readonly id: number;
  originX: number;
  originY: number;
}

/** Fraction of the screen width (from the left) that belongs to the movement stick. */
export const MOVE_ZONE_RATIO = 0.5;
const JOYSTICK_DEADZONE = 0.12;
const TAP_MAX_SECONDS = 0.22;
const TAP_MAX_TRAVEL = 14;

/**
 * Touch-first input. The screen is split at MOVE_ZONE_RATIO: any touch that
 * starts left of the split drives a floating thumbstick, any touch that starts
 * right of it drags the camera (and a short tap fires one round). The fire
 * button holds the trigger and also aims while the thumb stays on it.
 * Mouse + keyboard work through pointer lock for desktop play-testing.
 */
export class MobileInputController {
  /** x = strafe right, y = forward; length <= 1. */
  readonly move = new THREE.Vector2();
  fireHeld = false;
  adsHeld = false;
  autoFire = false;
  sensitivity = 1;
  /** True once the device has produced a touch, so the HUD can show touch controls. */
  touchSeen = false;

  private lookX = 0;
  private lookY = 0;
  private tapShots = 0;
  private reloadQueued = false;
  private adsToggleQueued = false;
  private lightQueued = false;
  private pauseQueued = false;
  private enabled = false;
  private joystick: JoystickState | null = null;
  private readonly stickVector = new THREE.Vector2();
  private readonly lookPointers = new Map<number, LookPointer>();
  private firePointer: number | null = null;
  private readonly keys = new Set<string>();
  private pointerLocked = false;
  private pointerLockFailed = false;
  private lockedAt = 0;
  private mouseFire = false;
  private readonly cleanups: (() => void)[] = [];

  constructor(private readonly el: InputElements) {
    this.bind();
  }

  get isPointerLocked(): boolean {
    return this.pointerLocked;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.resetTransient();
  }

  setAutoFire(on: boolean): void {
    this.autoFire = on;
    this.el.auto.classList.toggle('is-on', on);
    this.el.auto.setAttribute('aria-pressed', String(on));
  }

  /** Accumulated look input in radians since the last call. */
  consumeLook(out: THREE.Vector2): THREE.Vector2 {
    out.set(this.lookX, this.lookY);
    this.lookX = 0;
    this.lookY = 0;
    return out;
  }

  consumeTapShots(): number {
    const shots = this.tapShots;
    this.tapShots = 0;
    return shots;
  }

  consumeReload(): boolean {
    const queued = this.reloadQueued;
    this.reloadQueued = false;
    return queued;
  }

  consumeAdsToggle(): boolean {
    const queued = this.adsToggleQueued;
    this.adsToggleQueued = false;
    return queued;
  }

  consumeFlashlight(): boolean {
    const queued = this.lightQueued;
    this.lightQueued = false;
    return queued;
  }

  consumePause(): boolean {
    const queued = this.pauseQueued;
    this.pauseQueued = false;
    return queued;
  }

  /** Merges keyboard state into `move`; call once per frame before reading it. */
  update(dt: number): void {
    let kx = 0;
    let ky = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) ky += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) ky -= 1;
    if (this.keys.has('KeyD')) kx += 1;
    if (this.keys.has('KeyA')) kx -= 1;
    if (this.keys.has('ArrowLeft')) this.lookX -= LOOK.keyboardTurnRate * dt * this.sensitivity;
    if (this.keys.has('ArrowRight')) this.lookX += LOOK.keyboardTurnRate * dt * this.sensitivity;
    if (kx !== 0 || ky !== 0) {
      const len = Math.hypot(kx, ky);
      this.move.set(kx / len, ky / len);
    } else {
      this.move.copy(this.stickVector);
    }
    this.fireHeld = this.firePointer !== null || this.mouseFire;
  }

  /** Re-acquires pointer lock on desktop; must be called from a user gesture. */
  requestPointerLock(): void {
    if (this.touchSeen || this.pointerLockFailed || this.pointerLocked) return;
    const surface = this.el.surface;
    if (typeof surface.requestPointerLock !== 'function') {
      this.pointerLockFailed = true;
      return;
    }
    try {
      const result = surface.requestPointerLock() as unknown;
      if (result instanceof Promise) {
        result.catch(() => {
          this.pointerLockFailed = true;
        });
      }
    } catch {
      this.pointerLockFailed = true;
    }
  }

  releasePointerLock(): void {
    if (this.pointerLocked && document.exitPointerLock) document.exitPointerLock();
  }

  dispose(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
  }

  private zoneFor(x: number): Zone {
    return x < window.innerWidth * MOVE_ZONE_RATIO ? 'move' : 'look';
  }

  private listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, handler, options);
    this.cleanups.push(() => target.removeEventListener(type, handler, options));
  }

  private bind(): void {
    const surface = this.el.surface;
    this.listen(surface, 'pointerdown', (e) => this.onSurfaceDown(e));
    this.listen(surface, 'pointermove', (e) => this.onPointerMove(e));
    this.listen(surface, 'pointerup', (e) => this.onPointerUp(e));
    this.listen(surface, 'pointercancel', (e) => this.onPointerUp(e, true));
    this.listen(surface, 'contextmenu', (e) => e.preventDefault());

    const fire = this.el.fire;
    this.listen(fire, 'pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.enabled) return;
      this.noteTouch(e);
      this.firePointer = e.pointerId;
      this.lookPointers.set(e.pointerId, this.newLookPointer(e, true));
      fire.setPointerCapture(e.pointerId);
      fire.classList.add('is-pressed');
    });
    this.listen(fire, 'pointermove', (e) => this.onPointerMove(e));
    this.listen(fire, 'pointerup', (e) => this.onPointerUp(e));
    this.listen(fire, 'pointercancel', (e) => this.onPointerUp(e, true));

    const tapButton = (button: HTMLElement, action: () => void): void => {
      this.listen(button, 'pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.noteTouch(e);
        button.classList.add('is-pressed');
        action();
      });
      const release = (): void => button.classList.remove('is-pressed');
      this.listen(button, 'pointerup', release);
      this.listen(button, 'pointercancel', release);
      this.listen(button, 'pointerleave', release);
    };
    tapButton(this.el.reload, () => {
      if (this.enabled) this.reloadQueued = true;
    });
    tapButton(this.el.ads, () => {
      if (this.enabled) this.adsToggleQueued = true;
    });
    tapButton(this.el.auto, () => {
      if (this.enabled) this.setAutoFire(!this.autoFire);
    });
    tapButton(this.el.light, () => {
      if (this.enabled) this.lightQueued = true;
    });
    tapButton(this.el.pause, () => {
      if (this.enabled) this.pauseQueued = true;
    });

    const onKeyDown = (e: KeyboardEvent): void => {
      if (!this.enabled) return;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        this.pauseQueued = true;
        return;
      }
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyR') this.reloadQueued = true;
      if (e.code === 'KeyF') this.lightQueued = true;
      if (e.code === 'KeyT') this.setAutoFire(!this.autoFire);
      if (e.code === 'KeyQ') this.adsToggleQueued = true;
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      this.keys.delete(e.code);
    };
    const onBlur = (): void => this.resetTransient();
    const onLockChange = (): void => {
      const locked = document.pointerLockElement === this.el.surface;
      if (this.pointerLocked && !locked && this.enabled) this.pauseQueued = true;
      if (locked && !this.pointerLocked) this.lockedAt = performance.now();
      this.pointerLocked = locked;
      if (!locked) {
        this.mouseFire = false;
        this.adsHeld = false;
      }
    };
    const onLockError = (): void => {
      this.pointerLockFailed = true;
    };
    const onMouseMove = (e: MouseEvent): void => {
      if (!this.enabled || !this.pointerLocked) return;
      // Chrome can report one huge jump in the moment pointer lock engages; drop only that.
      if (performance.now() - this.lockedAt < 250 && (Math.abs(e.movementX) > 150 || Math.abs(e.movementY) > 150)) return;
      this.lookX += e.movementX * LOOK.mouseRadiansPerPixel * this.sensitivity;
      this.lookY += e.movementY * LOOK.mouseRadiansPerPixel * this.sensitivity;
    };
    const preventScroll = (e: TouchEvent): void => {
      if (this.enabled) e.preventDefault();
    };
    const preventGesture = (e: Event): void => e.preventDefault();
    // Any touch anywhere (including the Deploy button) proves this is a touch device.
    const noteAnyTouch = (e: PointerEvent): void => this.noteTouch(e);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('pointerlockerror', onLockError);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('touchmove', preventScroll, { passive: false });
    document.addEventListener('gesturestart', preventGesture);
    document.addEventListener('pointerdown', noteAnyTouch, true);
    this.cleanups.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('pointerlockerror', onLockError);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('touchmove', preventScroll);
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('pointerdown', noteAnyTouch, true);
    });
  }

  private noteTouch(e: PointerEvent): void {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') this.touchSeen = true;
  }

  private newLookPointer(e: PointerEvent, fromFireButton: boolean): LookPointer {
    return {
      lastX: e.clientX,
      lastY: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      startTime: performance.now() / 1000,
      travel: 0,
      fromFireButton,
    };
  }

  private onSurfaceDown(e: PointerEvent): void {
    e.preventDefault();
    if (!this.enabled) return;
    this.noteTouch(e);

    if (e.pointerType === 'mouse' && !this.touchSeen && !this.pointerLockFailed) {
      if (!this.pointerLocked) {
        this.requestPointerLock();
        return;
      }
      if (e.button === 0) this.mouseFire = true;
      if (e.button === 2) this.adsHeld = true;
      return;
    }

    this.el.surface.setPointerCapture(e.pointerId);
    if (this.zoneFor(e.clientX) === 'move') {
      if (this.joystick) return;
      const radius = this.joystickRadius();
      const originX = clamp(e.clientX, radius + 8, window.innerWidth * MOVE_ZONE_RATIO - radius * 0.5);
      const originY = clamp(e.clientY, radius + 8, window.innerHeight - radius - 8);
      this.joystick = { id: e.pointerId, originX, originY };
      this.el.joystickBase.hidden = false;
      this.el.joystickBase.style.transform = `translate(${originX - radius}px, ${originY - radius}px)`;
      this.updateStick(e.clientX, e.clientY);
    } else {
      this.lookPointers.set(e.pointerId, this.newLookPointer(e, false));
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.enabled) return;
    if (this.joystick && e.pointerId === this.joystick.id) {
      this.updateStick(e.clientX, e.clientY);
      return;
    }
    const look = this.lookPointers.get(e.pointerId);
    if (!look) return;
    const dx = e.clientX - look.lastX;
    const dy = e.clientY - look.lastY;
    look.lastX = e.clientX;
    look.lastY = e.clientY;
    look.travel += Math.abs(dx) + Math.abs(dy);
    const scale = (LOOK.touchRadiansPerScreenHeight / Math.max(240, window.innerHeight)) * this.sensitivity;
    this.lookX += dx * scale;
    this.lookY += dy * scale;
  }

  private onPointerUp(e: PointerEvent, cancelled = false): void {
    if (e.pointerType === 'mouse' && this.pointerLocked) {
      if (e.button === 0) this.mouseFire = false;
      if (e.button === 2) this.adsHeld = false;
      return;
    }
    if (this.joystick && e.pointerId === this.joystick.id) {
      this.joystick = null;
      this.stickVector.set(0, 0);
      this.el.joystickBase.hidden = true;
      this.el.joystickKnob.style.transform = 'translate(0px, 0px)';
      return;
    }
    if (e.pointerId === this.firePointer) {
      this.firePointer = null;
      this.el.fire.classList.remove('is-pressed');
    }
    const look = this.lookPointers.get(e.pointerId);
    if (!look) return;
    this.lookPointers.delete(e.pointerId);
    const held = performance.now() / 1000 - look.startTime;
    if (!cancelled && this.enabled && !look.fromFireButton && held < TAP_MAX_SECONDS && look.travel < TAP_MAX_TRAVEL) {
      this.tapShots = 1;
    }
  }

  private joystickRadius(): number {
    return clamp(Math.min(window.innerWidth, window.innerHeight) * 0.14, 46, 84);
  }

  private updateStick(x: number, y: number): void {
    const stick = this.joystick;
    if (!stick) return;
    const radius = this.joystickRadius();
    let dx = x - stick.originX;
    let dy = y - stick.originY;
    let length = Math.hypot(dx, dy);
    if (length > radius * 1.25) {
      // Floating stick: the base trails the thumb so it never runs out of travel.
      const excess = length - radius * 1.25;
      stick.originX += (dx / length) * excess;
      stick.originY += (dy / length) * excess;
      this.el.joystickBase.style.transform = `translate(${stick.originX - radius}px, ${stick.originY - radius}px)`;
      dx = x - stick.originX;
      dy = y - stick.originY;
      length = Math.hypot(dx, dy);
    }
    const clamped = Math.min(length, radius);
    const nx = length > 0 ? (dx / length) * clamped : 0;
    const ny = length > 0 ? (dy / length) * clamped : 0;
    this.el.joystickKnob.style.transform = `translate(${nx}px, ${ny}px)`;
    const magnitude = clamped / radius;
    if (magnitude < JOYSTICK_DEADZONE) {
      this.stickVector.set(0, 0);
      return;
    }
    const scaled = (magnitude - JOYSTICK_DEADZONE) / (1 - JOYSTICK_DEADZONE);
    this.stickVector.set((nx / clamped) * scaled, (-ny / clamped) * scaled);
  }

  private resetTransient(): void {
    this.keys.clear();
    this.joystick = null;
    this.stickVector.set(0, 0);
    this.move.set(0, 0);
    this.lookPointers.clear();
    this.firePointer = null;
    this.mouseFire = false;
    this.adsHeld = false;
    this.fireHeld = false;
    this.tapShots = 0;
    this.lookX = 0;
    this.lookY = 0;
    this.el.joystickBase.hidden = true;
    this.el.joystickKnob.style.transform = 'translate(0px, 0px)';
    this.el.fire.classList.remove('is-pressed');
  }
}
