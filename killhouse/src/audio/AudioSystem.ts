import * as THREE from 'three';
import { clamp } from '../utils/math';

export type ReloadCue = 'magOut' | 'magIn' | 'bolt';

interface Listener {
  readonly position: THREE.Vector3;
  yaw: number;
}

/**
 * Every sound is synthesized with Web Audio at runtime (no audio files):
 * filtered noise for reports and impacts, oscillators for mechanics and UI,
 * a generated impulse response for the warehouse reverb.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private dry: GainNode | null = null;
  private reverbSend: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private humGain: GainNode | null = null;
  private humPan: StereoPannerNode | null = null;
  private ambience: GainNode | null = null;
  private enabled = true;
  private readonly listener: Listener = { position: new THREE.Vector3(), yaw: 0 };

  /** Must run inside a user gesture (browsers keep audio locked until then). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.18;
    compressor.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    this.master.connect(compressor);

    this.dry = ctx.createGain();
    this.dry.connect(this.master);

    const convolver = ctx.createConvolver();
    convolver.buffer = this.makeImpulse(ctx, 1.6, 2.6);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.32;
    this.reverbSend.connect(convolver);
    convolver.connect(this.master);

    const length = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

    this.startAmbience(ctx);
    this.startDroneHum(ctx);
    if (ctx.state === 'suspended') void ctx.resume();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(enabled ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setListener(position: THREE.Vector3, yaw: number): void {
    this.listener.position.copy(position);
    this.listener.yaw = yaw;
  }

  gunshot(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const jitter = 0.94 + Math.random() * 0.12;
    const out = this.voice(0, 1, 0.55);
    if (!out) return;
    this.noiseBurst(t, out, 'highpass', 900 * jitter, 0.7, 0.9, 0.08);
    this.noiseBurst(t, out, 'lowpass', 1600 * jitter, 0.8, 0.85, 0.2);
    this.sweep(t, out, 'sine', 160 * jitter, 42, 1.0, 0.13);
    this.sweep(t + 0.004, out, 'square', 2600, 1800, 0.05, 0.02);
  }

  enemyShot(position: THREE.Vector3, laser: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const { pan, gain, cutoff } = this.spatial(position);
    const out = this.voice(pan, gain, 0.6);
    if (!out) return;
    if (laser) {
      this.sweep(t, out, 'sawtooth', 1500, 180, 0.35, 0.16);
      this.noiseBurst(t, out, 'bandpass', 3200, 0.25, 0.3, 0.06);
    } else {
      this.noiseBurst(t, out, 'lowpass', Math.min(2200, cutoff), 0.9, 0.75, 0.18);
      this.sweep(t, out, 'sine', 120, 38, 0.6, 0.11);
    }
  }

  droneCharge(position: THREE.Vector3, duration: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const { pan, gain } = this.spatial(position);
    const out = this.voice(pan, gain * 0.5, 0.2);
    if (!out) return;
    this.sweep(ctx.currentTime, out, 'triangle', 420, 1500, 0.22, duration);
  }

  impact(position: THREE.Vector3, metallic: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const { pan, gain } = this.spatial(position);
    const out = this.voice(pan, gain * 0.5, 0.15);
    if (!out) return;
    const t = ctx.currentTime;
    if (metallic) {
      this.sweep(t, out, 'triangle', 2400 + Math.random() * 1600, 900, 0.18, 0.12);
    } else {
      this.noiseBurst(t, out, 'bandpass', 900 + Math.random() * 500, 0.5, 0.6, 0.05);
    }
  }

  reload(cue: ReloadCue): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const out = this.voice(0.15, 0.8, 0.12);
    if (!out) return;
    const t = ctx.currentTime;
    if (cue === 'magOut') {
      this.noiseBurst(t, out, 'bandpass', 2600, 0.5, 0.5, 0.03);
      this.noiseBurst(t + 0.05, out, 'bandpass', 1400, 0.4, 0.35, 0.05);
    } else if (cue === 'magIn') {
      this.noiseBurst(t, out, 'bandpass', 1800, 0.6, 0.6, 0.04);
      this.sweep(t, out, 'square', 900, 500, 0.12, 0.03);
    } else {
      this.noiseBurst(t, out, 'bandpass', 3200, 0.5, 0.5, 0.025);
      this.noiseBurst(t + 0.12, out, 'bandpass', 2400, 0.6, 0.65, 0.04);
    }
  }

  dryFire(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const out = this.voice(0, 0.6, 0.05);
    if (out) this.noiseBurst(ctx.currentTime, out, 'bandpass', 3000, 0.5, 0.5, 0.02);
  }

  hitMarker(kill: boolean, headshot: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const out = this.voice(0, 0.5, 0);
    if (!out) return;
    const t = ctx.currentTime;
    this.sweep(t, out, headshot ? 'triangle' : 'sine', headshot ? 3400 : 2100, headshot ? 3000 : 1900, 0.32, 0.035);
    if (kill) this.sweep(t + 0.07, out, 'sine', 1300, 1200, 0.32, 0.06);
  }

  playerHurt(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const out = this.voice(0, 0.9, 0.1);
    if (!out) return;
    const t = ctx.currentTime;
    this.noiseBurst(t, out, 'lowpass', 500, 0.8, 0.9, 0.14);
    this.sweep(t, out, 'sine', 95, 50, 0.7, 0.16);
  }

  footstep(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const out = this.voice((Math.random() - 0.5) * 0.2, 0.35, 0.06);
    if (out) this.noiseBurst(ctx.currentTime, out, 'bandpass', 380 + Math.random() * 220, 1.2, 0.8, 0.07);
  }

  pickup(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const out = this.voice(0, 0.5, 0.1);
    if (!out) return;
    const t = ctx.currentTime;
    this.sweep(t, out, 'sine', 660, 660, 0.3, 0.09);
    this.sweep(t + 0.09, out, 'sine', 990, 990, 0.3, 0.14);
  }

  explosion(position: THREE.Vector3): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const { pan, gain } = this.spatial(position);
    const out = this.voice(pan, Math.min(1, gain * 1.6), 0.8);
    if (!out) return;
    const t = ctx.currentTime;
    this.noiseBurst(t, out, 'lowpass', 700, 0.7, 1, 1.1);
    this.sweep(t, out, 'sine', 70, 30, 1, 0.9);
  }

  /** Drone rotor hum follows the nearest live drone. */
  setDroneProximity(position: THREE.Vector3 | null): void {
    const ctx = this.ctx;
    if (!ctx || !this.humGain || !this.humPan) return;
    const t = ctx.currentTime;
    if (!position) {
      this.humGain.gain.setTargetAtTime(0, t, 0.3);
      return;
    }
    const { pan, gain } = this.spatial(position);
    this.humGain.gain.setTargetAtTime(gain * 0.09, t, 0.2);
    this.humPan.pan.setTargetAtTime(pan, t, 0.1);
  }

  setAmbience(level: number): void {
    if (this.ctx && this.ambience) this.ambience.gain.setTargetAtTime(level * 0.06, this.ctx.currentTime, 0.5);
  }

  private spatial(position: THREE.Vector3): { pan: number; gain: number; cutoff: number } {
    const dx = position.x - this.listener.position.x;
    const dz = position.z - this.listener.position.z;
    const distance = Math.hypot(dx, dz, position.y - this.listener.position.y);
    const yaw = this.listener.yaw;
    const right = dx * Math.cos(yaw) - dz * Math.sin(yaw);
    const pan = distance > 0.01 ? clamp(right / distance, -1, 1) * 0.85 : 0;
    const gain = 1 / (1 + distance * 0.11);
    const cutoff = 18000 / (1 + distance * 0.18);
    return { pan, gain, cutoff };
  }

  /** Per-sound output stage: stereo pan, level, and a send into the shared reverb. */
  private voice(pan: number, gain: number, reverb: number): AudioNode | null {
    const ctx = this.ctx;
    if (!ctx || !this.dry || !this.reverbSend || !this.enabled) return null;
    const level = ctx.createGain();
    level.gain.value = gain;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    level.connect(panner);
    panner.connect(this.dry);
    if (reverb > 0) {
      const send = ctx.createGain();
      send.gain.value = reverb;
      panner.connect(send);
      send.connect(this.reverbSend);
    }
    return level;
  }

  private noiseBurst(start: number, out: AudioNode, type: BiquadFilterType, frequency: number, q: number, peak: number, duration: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(peak, start + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(env);
    env.connect(out);
    const offset = Math.random() * (this.noise.duration - duration - 0.05);
    source.start(start, Math.max(0, offset), duration + 0.02);
  }

  private sweep(start: number, out: AudioNode, type: OscillatorType, from: number, to: number, peak: number, duration: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(peak, start + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(env);
    env.connect(out);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  private makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const early = i < ctx.sampleRate * 0.03 && Math.random() < 0.004 ? 0.6 : 0;
        data[i] = ((Math.random() * 2 - 1) * Math.pow(1 - t, decay) + early) * 0.5;
      }
    }
    return buffer;
  }

  private startAmbience(ctx: AudioContext): void {
    if (!this.noise || !this.master) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 170;
    this.ambience = ctx.createGain();
    this.ambience.gain.value = 0;
    source.connect(filter);
    filter.connect(this.ambience);
    const mainsHum = ctx.createOscillator();
    mainsHum.frequency.value = 120;
    const humLevel = ctx.createGain();
    humLevel.gain.value = 0.05;
    mainsHum.connect(humLevel);
    humLevel.connect(this.ambience);
    this.ambience.connect(this.master);
    source.start();
    mainsHum.start();
  }

  private startDroneHum(ctx: AudioContext): void {
    if (!this.master) return;
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    a.type = 'sawtooth';
    b.type = 'sawtooth';
    a.frequency.value = 182;
    b.frequency.value = 187;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    this.humPan = ctx.createStereoPanner();
    a.connect(filter);
    b.connect(filter);
    filter.connect(this.humGain);
    this.humGain.connect(this.humPan);
    this.humPan.connect(this.master);
    a.start();
    b.start();
  }
}
