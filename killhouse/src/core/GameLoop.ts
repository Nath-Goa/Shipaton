export interface LoopHooks {
  /** Once per displayed frame, before simulation: sample input. */
  beginFrame(frameDt: number): void;
  /** Zero or more times per frame with dt <= maxStep. */
  fixedUpdate(dt: number, firstStep: boolean): void;
  /** Once per displayed frame, after simulation: present. */
  render(frameDt: number): void;
}

/**
 * requestAnimationFrame driver with semi-fixed sub-stepping: a long frame is
 * split into equal steps no longer than `maxStep`, so springs, AI and
 * collision stay stable at 30 Hz and render smoothly at 120 Hz.
 */
export class GameLoop {
  private running = false;
  private last = 0;
  private handle = 0;

  constructor(
    private readonly hooks: LoopHooks,
    private readonly maxStep = 1 / 60,
    private readonly maxFrame = 0.1,
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.handle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.handle);
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    this.handle = requestAnimationFrame(this.tick);
    let frameDt = (now - this.last) / 1000;
    this.last = now;
    if (!(frameDt > 0)) frameDt = 0;
    frameDt = Math.min(frameDt, this.maxFrame);

    this.hooks.beginFrame(frameDt);
    const steps = Math.max(1, Math.ceil(frameDt / this.maxStep - 1e-6));
    const step = frameDt / steps;
    for (let i = 0; i < steps; i++) this.hooks.fixedUpdate(step, i === 0);
    this.hooks.render(frameDt);
  };
}
