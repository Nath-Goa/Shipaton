import type { LevelData } from '../level/LevelConstructor';

export interface MinimapBlip {
  readonly x: number;
  readonly z: number;
  readonly kind: 'soldier' | 'drone' | 'ammo' | 'medkit';
}

const PIXELS_PER_METRE = 6;
const RANGE_METRES = 17;

/** Heading-up radar: the floor plan rotates around the player, who always points up. */
export class Minimap {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly plan: HTMLCanvasElement;
  private readonly width: number;
  private readonly depth: number;
  private size = 0;
  private dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement, level: LevelData) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Minimap canvas unavailable');
    this.ctx = ctx;
    this.width = level.width;
    this.depth = level.depth;

    this.plan = document.createElement('canvas');
    this.plan.width = level.width * PIXELS_PER_METRE;
    this.plan.height = level.depth * PIXELS_PER_METRE;
    const plan = this.plan.getContext('2d');
    if (!plan) throw new Error('Minimap plan canvas unavailable');
    const cell = level.cellSize * PIXELS_PER_METRE;
    level.cells.forEach((kind, i) => {
      const c = i % level.cols;
      const r = Math.floor(i / level.cols);
      if (kind === 'wall') plan.fillStyle = 'rgba(222, 214, 192, 0.82)';
      else if (kind === 'floor' || kind === 'door') plan.fillStyle = 'rgba(40, 46, 40, 0.55)';
      else plan.fillStyle = 'rgba(130, 128, 112, 0.55)';
      plan.fillRect(c * cell, r * cell, cell, cell);
    });
    this.resize();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.size = Math.max(60, Math.round(rect.width || 112));
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.size * this.dpr);
    this.canvas.height = Math.round(this.size * this.dpr);
  }

  draw(px: number, pz: number, yaw: number, blips: readonly MinimapBlip[]): void {
    const ctx = this.ctx;
    const s = this.size;
    const half = s / 2;
    const scale = half / RANGE_METRES;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, s, s);

    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(6, 9, 8, 0.72)';
    ctx.fillRect(0, 0, s, s);

    ctx.translate(half, half);
    ctx.rotate(yaw);
    ctx.scale(scale, scale);
    ctx.translate(-px, -pz);
    ctx.drawImage(this.plan, 0, 0, this.width, this.depth);
    for (const blip of blips) {
      if (blip.kind === 'ammo' || blip.kind === 'medkit') {
        ctx.fillStyle = blip.kind === 'ammo' ? '#f2a541' : '#7fe3a0';
        ctx.fillRect(blip.x - 0.45, blip.z - 0.45, 0.9, 0.9);
      } else {
        ctx.fillStyle = '#ff4b36';
        ctx.beginPath();
        if (blip.kind === 'drone') {
          ctx.moveTo(blip.x, blip.z - 0.8);
          ctx.lineTo(blip.x + 0.7, blip.z + 0.55);
          ctx.lineTo(blip.x - 0.7, blip.z + 0.55);
          ctx.closePath();
        } else {
          ctx.arc(blip.x, blip.z, 0.6, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    }
    ctx.restore();

    // View cone and player marker stay fixed: the world turns, the player doesn't.
    ctx.fillStyle = 'rgba(233, 228, 214, 0.08)';
    ctx.beginPath();
    ctx.moveTo(half, half);
    ctx.arc(half, half, half - 2, -Math.PI / 2 - 0.85, -Math.PI / 2 + 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e9e4d6';
    ctx.beginPath();
    ctx.moveTo(half, half - 6);
    ctx.lineTo(half + 4.5, half + 5);
    ctx.lineTo(half, half + 2.5);
    ctx.lineTo(half - 4.5, half + 5);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(233, 228, 214, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(half, half, half - 1, 0, Math.PI * 2);
    ctx.stroke();
    const nx = half + Math.sin(yaw) * (half - 9);
    const ny = half - Math.cos(yaw) * (half - 9);
    ctx.fillStyle = '#f2a541';
    ctx.font = '600 10px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny);
  }
}
