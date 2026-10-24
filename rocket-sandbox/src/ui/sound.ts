/** Tiny procedural soundscape: engine roar, wind, explosions and a staging clunk. Created lazily after a user gesture. */
export class Sound {
  private ctx: AudioContext | null = null;
  private engineGain!: GainNode;
  private engineFilter!: BiquadFilterNode;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private master!: GainNode;
  enabled = true;

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02; // brown noise
      data[i] = last * 3.5;
    }
    const mk = (type: BiquadFilterType, freq: number): [AudioBufferSourceNode, BiquadFilterNode, GainNode] => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master);
      src.start();
      return [src, f, g];
    };
    [, this.engineFilter, this.engineGain] = mk('lowpass', 400);
    [, this.windFilter, this.windGain] = mk('bandpass', 900);
    return ctx;
  }

  resume(): void {
    const c = this.ensure();
    if (c && c.state === 'suspended') void c.resume();
  }

  update(thrustLevel: number, atmosphere: number, speed: number, paused: boolean): void {
    const c = this.ensure();
    if (!c) return;
    const t = c.currentTime;
    const eng = paused ? 0 : Math.min(1, thrustLevel);
    this.engineGain.gain.setTargetAtTime(eng * (0.25 + 0.75 * Math.min(1, atmosphere * 3 + 0.2)), t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(160 + eng * 700 * (0.4 + atmosphere), t, 0.1);
    const wind = paused ? 0 : Math.min(1, speed / 400) * Math.min(1, atmosphere * 4);
    this.windGain.gain.setTargetAtTime(wind * 0.5, t, 0.2);
    this.windFilter.frequency.setTargetAtTime(500 + speed * 2, t, 0.2);
  }

  boom(size = 1): void {
    const c = this.ensure();
    if (!c) return;
    const dur = 1.6;
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.4);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 600 * size;
    const g = c.createGain();
    g.gain.value = 0.9;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  clunk(): void {
    const c = this.ensure();
    if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(140, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(50, c.currentTime + 0.12);
    g.gain.setValueAtTime(0.25, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.18);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(c.currentTime + 0.2);
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
