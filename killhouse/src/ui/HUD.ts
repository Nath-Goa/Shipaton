import { clamp } from '../utils/math';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing HUD element #${id}`);
  return el as T;
}

export type ToastTone = 'info' | 'warn' | 'ok' | 'threat';

interface DamageIndicator {
  readonly el: HTMLElement;
  life: number;
}

const COMPASS_PX_PER_DEGREE = 2.6;
const CARDINALS: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };

/** The tactical visor: vitals, ammunition, compass, crosshair and combat feedback. Pure DOM, updated only on change. */
export class HUD {
  private readonly root = byId<HTMLElement>('hud');
  private readonly healthFill = byId<HTMLElement>('health-fill');
  private readonly healthValue = byId<HTMLElement>('health-value');
  private readonly ammoMag = byId<HTMLElement>('ammo-mag');
  private readonly ammoReserve = byId<HTMLElement>('ammo-reserve');
  private readonly ammoPips = byId<HTMLElement>('ammo-pips');
  private readonly hostiles = byId<HTMLElement>('hostiles-value');
  private readonly timer = byId<HTMLElement>('timer-value');
  private readonly par = byId<HTMLElement>('par-value');
  private readonly compassStrip = byId<HTMLElement>('compass-strip');
  private readonly heading = byId<HTMLElement>('heading');
  private readonly crosshair = byId<HTMLElement>('crosshair');
  private readonly hitmarker = byId<HTMLElement>('hitmarker');
  private readonly reloadRing = byId<HTMLElement>('reload-ring');
  private readonly reloadArc = document.getElementById('reload-arc') as unknown as SVGCircleElement;
  private readonly toastEl = byId<HTMLElement>('toast');
  private readonly feedEl = byId<HTMLElement>('killfeed');
  private readonly damageFlash = byId<HTMLElement>('damage-flash');
  private readonly lowHealth = byId<HTMLElement>('low-health');
  private readonly lightButton = byId<HTMLElement>('btn-light');
  private readonly adsButton = byId<HTMLElement>('btn-ads');
  private readonly indicators: DamageIndicator[] = [];
  private readonly pips: HTMLElement[] = [];
  private indicatorCursor = 0;
  private toastTimer = 0;
  private hintTimer = 0;
  private flash = 0;
  private time = 0;
  private lowHealthLevel = 0;
  private compassWidth = 220;
  private last = { health: -1, mag: -1, reserve: -1, hostiles: -1, timer: '', heading: -1, gap: -1, onTarget: false, ads: -1 };

  constructor(magazineSize: number) {
    const holder = byId<HTMLElement>('damage-indicators');
    for (let i = 0; i < 4; i++) {
      const el = document.createElement('i');
      el.className = 'damage-arc';
      holder.appendChild(el);
      this.indicators.push({ el, life: 0 });
    }
    for (let i = 0; i < magazineSize; i++) {
      const pip = document.createElement('i');
      this.ammoPips.appendChild(pip);
      this.pips.push(pip);
    }
    const strip = this.compassStrip;
    for (let d = -180; d <= 540; d += 15) {
      const tick = document.createElement('span');
      const deg = ((d % 360) + 360) % 360;
      const label = CARDINALS[deg];
      tick.className = label ? 'tick major' : 'tick';
      tick.textContent = label ?? (deg % 30 === 0 ? String(deg) : '');
      tick.style.left = `${(d + 180) * COMPASS_PX_PER_DEGREE}px`;
      strip.appendChild(tick);
    }
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    if (visible) this.resize();
  }

  /** Re-measures layout-dependent pieces; call after the HUD shows or the viewport changes. */
  resize(): void {
    this.compassWidth = this.compassStrip.parentElement?.clientWidth || this.compassWidth;
  }

  reset(par: string): void {
    this.par.textContent = `PAR ${par}`;
    this.hintTimer = 7;
    this.root.classList.add('show-hints');
    this.feedEl.replaceChildren();
    this.toastEl.classList.remove('show');
    this.flash = 0;
    this.damageFlash.style.opacity = '0';
    this.lowHealth.style.opacity = '0';
    this.lowHealthLevel = 0;
    for (const indicator of this.indicators) {
      indicator.life = 0;
      indicator.el.style.opacity = '0';
    }
    this.last = { health: -1, mag: -1, reserve: -1, hostiles: -1, timer: '', heading: -1, gap: -1, onTarget: false, ads: -1 };
    this.setReload(null);
  }

  setHealth(health: number, max: number): void {
    const rounded = Math.ceil(health);
    if (rounded === this.last.health) return;
    this.last.health = rounded;
    const fraction = clamp(health / max, 0, 1);
    this.healthFill.style.transform = `scaleX(${fraction})`;
    this.healthValue.textContent = String(rounded);
    this.root.classList.toggle('health-low', fraction < 0.35);
    this.lowHealthLevel = clamp((0.4 - fraction) / 0.4, 0, 1);
  }

  setAmmo(mag: number, reserve: number): void {
    if (mag !== this.last.mag) {
      this.last.mag = mag;
      this.ammoMag.textContent = String(mag);
      this.ammoMag.classList.toggle('low', mag <= 8);
      this.pips.forEach((pip, i) => pip.classList.toggle('spent', i >= mag));
    }
    if (reserve !== this.last.reserve) {
      this.last.reserve = reserve;
      this.ammoReserve.textContent = `/${reserve}`;
    }
  }

  setHostiles(alive: number): void {
    if (alive === this.last.hostiles) return;
    this.last.hostiles = alive;
    this.hostiles.textContent = String(alive);
  }

  setTimer(text: string, overPar: boolean): void {
    if (text === this.last.timer) return;
    this.last.timer = text;
    this.timer.textContent = text;
    this.timer.classList.toggle('over', overPar);
  }

  /** Yaw in radians; north is -Z (the top of the floor plan). */
  setHeading(yaw: number): void {
    const degrees = ((((-yaw * 180) / Math.PI) % 360) + 360) % 360;
    const rounded = Math.round(degrees);
    this.compassStrip.style.transform = `translateX(${this.compassWidth / 2 - (degrees + 180) * COMPASS_PX_PER_DEGREE}px)`;
    if (rounded !== this.last.heading) {
      this.last.heading = rounded;
      this.heading.textContent = `${String(rounded % 360).padStart(3, '0')}°`;
    }
  }

  setCrosshair(gapPx: number, onTarget: boolean, ads: number): void {
    const gap = Math.round(gapPx * 2) / 2;
    if (gap !== this.last.gap) {
      this.last.gap = gap;
      this.crosshair.style.setProperty('--gap', `${gap}px`);
    }
    if (onTarget !== this.last.onTarget) {
      this.last.onTarget = onTarget;
      this.crosshair.classList.toggle('on-target', onTarget);
    }
    const adsRounded = Math.round(ads * 20) / 20;
    if (adsRounded !== this.last.ads) {
      this.last.ads = adsRounded;
      this.crosshair.style.opacity = String(1 - adsRounded);
      this.adsButton.classList.toggle('is-on', ads > 0.5);
    }
  }

  hitMarker(kill: boolean, headshot: boolean): void {
    const el = this.hitmarker;
    el.classList.remove('show', 'kill', 'head');
    void el.offsetWidth;
    el.classList.add('show');
    if (kill) el.classList.add('kill');
    if (headshot) el.classList.add('head');
  }

  damage(angle: number, amount: number): void {
    const indicator = this.indicators[this.indicatorCursor];
    this.indicatorCursor = (this.indicatorCursor + 1) % this.indicators.length;
    indicator.life = 1.4;
    indicator.el.style.transform = `rotate(${angle}rad)`;
    indicator.el.style.opacity = '1';
    this.flash = Math.min(0.75, this.flash + amount / 40);
  }

  setReload(progress: number | null): void {
    if (progress === null) {
      if (!this.reloadRing.hidden) this.reloadRing.hidden = true;
      return;
    }
    if (this.reloadRing.hidden) this.reloadRing.hidden = false;
    const circumference = 2 * Math.PI * 26;
    this.reloadArc.style.strokeDashoffset = String(circumference * (1 - progress));
  }

  toast(text: string, tone: ToastTone = 'info', seconds = 2.4): void {
    this.toastEl.textContent = text;
    this.toastEl.dataset.tone = tone;
    this.toastEl.classList.add('show');
    this.toastTimer = seconds;
  }

  feed(text: string, emphasis = false): void {
    const line = document.createElement('div');
    line.className = emphasis ? 'feed-line emphasis' : 'feed-line';
    line.textContent = text;
    this.feedEl.prepend(line);
    while (this.feedEl.children.length > 4) this.feedEl.lastElementChild?.remove();
    window.setTimeout(() => line.classList.add('fade'), 2600);
    window.setTimeout(() => line.remove(), 3200);
  }

  setFlashlight(on: boolean): void {
    this.lightButton.classList.toggle('is-on', on);
    this.lightButton.setAttribute('aria-pressed', String(on));
  }

  update(dt: number): void {
    this.time += dt;
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.root.classList.remove('show-hints');
    }
    for (const indicator of this.indicators) {
      if (indicator.life <= 0) continue;
      indicator.life -= dt;
      indicator.el.style.opacity = String(clamp(indicator.life / 0.8, 0, 1));
    }
    if (this.flash > 0.001) {
      this.flash *= Math.exp(-dt * 4);
      this.damageFlash.style.opacity = this.flash.toFixed(3);
    }
    const pulse = this.lowHealthLevel > 0 ? this.lowHealthLevel * (0.65 + 0.35 * Math.sin(this.time * 5)) : 0;
    this.lowHealth.style.opacity = pulse.toFixed(3);
  }
}
