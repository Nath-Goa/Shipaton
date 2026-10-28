import { DIFFICULTIES, type Difficulty } from '../config';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing screen element #${id}`);
  return el as T;
}

export interface ScreenActions {
  deploy(difficulty: Difficulty): void;
  resume(): void;
  restart(): void;
  quit(): void;
  setSensitivity(value: number): void;
  setSound(enabled: boolean): void;
}

export interface MissionReport {
  readonly victory: boolean;
  readonly rating: string;
  readonly title: string;
  readonly subtitle: string;
  readonly time: string;
  readonly kills: string;
  readonly accuracy: string;
  readonly headshots: string;
  readonly damage: string;
  readonly best: string;
}

export function formatTime(seconds: number, tenths = true): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  const whole = Math.floor(s);
  const base = `${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}`;
  return tenths ? `${base}.${Math.floor((s - whole) * 10)}` : base;
}

/** Loading, briefing, pause and debrief overlays. */
export class Screens {
  private readonly loading = byId<HTMLElement>('screen-loading');
  private readonly loadingFill = byId<HTMLElement>('loading-fill');
  private readonly loadingLabel = byId<HTMLElement>('loading-label');
  private readonly start = byId<HTMLElement>('screen-start');
  private readonly pause = byId<HTMLElement>('screen-pause');
  private readonly end = byId<HTMLElement>('screen-end');
  private readonly lost = byId<HTMLElement>('screen-lost');
  private readonly difficultyButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-difficulty]'));
  private readonly summary = byId<HTMLElement>('difficulty-summary');
  private readonly briefPar = byId<HTMLElement>('brief-par');
  private readonly bestTime = byId<HTMLElement>('best-time');
  private readonly rotateHint = byId<HTMLElement>('rotate-hint');
  private readonly sensitivity = byId<HTMLInputElement>('opt-sensitivity');
  private readonly sensitivityValue = byId<HTMLOutputElement>('opt-sensitivity-value');
  private readonly sound = byId<HTMLInputElement>('opt-sound');
  private selected: Difficulty = 'regular';
  private bestTimes: Partial<Record<Difficulty, number>> = {};

  constructor(private readonly actions: ScreenActions) {
    for (const button of this.difficultyButtons) {
      button.addEventListener('click', () => this.select(button.dataset.difficulty as Difficulty));
    }
    byId<HTMLButtonElement>('btn-deploy').addEventListener('click', () => this.actions.deploy(this.selected));
    byId<HTMLButtonElement>('btn-resume').addEventListener('click', () => this.actions.resume());
    byId<HTMLButtonElement>('btn-restart').addEventListener('click', () => this.actions.restart());
    byId<HTMLButtonElement>('btn-quit').addEventListener('click', () => this.actions.quit());
    byId<HTMLButtonElement>('btn-again').addEventListener('click', () => this.actions.restart());
    byId<HTMLButtonElement>('btn-menu').addEventListener('click', () => this.actions.quit());
    byId<HTMLButtonElement>('btn-reload-page').addEventListener('click', () => window.location.reload());
    this.sensitivity.addEventListener('input', () => {
      const value = Number(this.sensitivity.value);
      this.sensitivityValue.textContent = `${value.toFixed(2)}×`;
      this.actions.setSensitivity(value);
    });
    this.sound.addEventListener('change', () => this.actions.setSound(this.sound.checked));
    const orientation = (): void => {
      const portrait = window.innerHeight > window.innerWidth;
      const touch = window.matchMedia('(pointer: coarse)').matches;
      this.rotateHint.hidden = !(portrait && touch);
    };
    window.addEventListener('resize', orientation);
    orientation();
  }

  get difficulty(): Difficulty {
    return this.selected;
  }

  setProgress(fraction: number, label: string): void {
    this.loadingFill.style.transform = `scaleX(${Math.max(0, Math.min(1, fraction))})`;
    this.loadingLabel.textContent = label;
  }

  showError(message: string): void {
    this.loading.hidden = false;
    this.loading.classList.add('error');
    this.loadingLabel.textContent = message;
  }

  setPreferences(difficulty: Difficulty, sensitivity: number, sound: boolean, bestTimes: Partial<Record<Difficulty, number>>): void {
    this.bestTimes = bestTimes;
    this.sensitivity.value = String(sensitivity);
    this.sensitivityValue.textContent = `${sensitivity.toFixed(2)}×`;
    this.sound.checked = sound;
    this.select(difficulty);
  }

  setBestTimes(bestTimes: Partial<Record<Difficulty, number>>): void {
    this.bestTimes = bestTimes;
    this.select(this.selected);
  }

  showMenu(): void {
    this.loading.hidden = true;
    this.pause.hidden = true;
    this.end.hidden = true;
    this.start.hidden = false;
  }

  showPlaying(): void {
    this.loading.hidden = true;
    this.start.hidden = true;
    this.pause.hidden = true;
    this.end.hidden = true;
  }

  showPause(): void {
    this.pause.hidden = false;
  }

  hidePause(): void {
    this.pause.hidden = true;
  }

  showContextLost(): void {
    this.lost.hidden = false;
  }

  showReport(report: MissionReport): void {
    this.end.hidden = false;
    this.end.dataset.outcome = report.victory ? 'victory' : 'defeat';
    byId('end-rating').textContent = report.rating;
    byId('end-title').textContent = report.title;
    byId('end-sub').textContent = report.subtitle;
    byId('end-time').textContent = report.time;
    byId('end-kills').textContent = report.kills;
    byId('end-accuracy').textContent = report.accuracy;
    byId('end-headshots').textContent = report.headshots;
    byId('end-damage').textContent = report.damage;
    byId('end-best').textContent = report.best;
    byId<HTMLButtonElement>('btn-again').focus({ preventScroll: true });
  }

  private select(difficulty: Difficulty): void {
    this.selected = difficulty;
    for (const button of this.difficultyButtons) {
      const active = button.dataset.difficulty === difficulty;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-checked', String(active));
    }
    const settings = DIFFICULTIES[difficulty];
    this.summary.textContent = settings.summary;
    this.briefPar.textContent = formatTime(settings.parTime, false);
    const best = this.bestTimes[difficulty];
    this.bestTime.textContent = best ? `Best clear on ${settings.label}: ${formatTime(best)}` : `No clear on ${settings.label} yet`;
  }
}
