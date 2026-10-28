import * as THREE from 'three';
import { Random } from '../utils/Random';
import { TAU, clamp, lerp, smoothstep } from '../utils/math';

export interface SurfaceTextures {
  readonly map: THREE.Texture;
  readonly normalMap: THREE.Texture;
  /** Roughness in the green channel (three.js convention). */
  readonly roughnessMap: THREE.Texture;
}

export interface MetalTextures {
  readonly map: THREE.Texture;
  readonly normalMap: THREE.Texture;
  /** Green = roughness, blue = metalness, so one texture feeds both slots. */
  readonly ormMap: THREE.Texture;
}

export interface CrateTextures {
  readonly variants: readonly THREE.Texture[];
  readonly normalMap: THREE.Texture;
  readonly ormMap: THREE.Texture;
}

export interface TextureLibrary {
  readonly concrete: SurfaceTextures;
  readonly brick: SurfaceTextures;
  readonly corrugated: SurfaceTextures;
  readonly paintedMetal: MetalTextures;
  readonly crate: CrateTextures;
  readonly hazard: THREE.Texture;
  readonly safetyPaint: THREE.Texture;
  readonly oilStain: THREE.Texture;
  readonly bulletHole: THREE.Texture;
  readonly muzzleFlash: THREE.Texture;
  readonly flashlightCookie: THREE.Texture;
  readonly exitSign: THREE.Texture;
  readonly ammoCrate: THREE.Texture;
  readonly medkit: THREE.Texture;
  readonly gunWear: THREE.Texture;
  readonly softGlow: THREE.Texture;
}

const LATTICE = 256;

/** Value noise whose lattice wraps, so every fBm built on it tiles seamlessly. */
class TileableNoise {
  private readonly lattice = new Float32Array(LATTICE * LATTICE);

  constructor(rng: Random) {
    for (let i = 0; i < this.lattice.length; i++) this.lattice[i] = rng.next();
  }

  value(x: number, y: number, periodX: number, periodY = periodX): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const x0 = ((xi % periodX) + periodX) % periodX;
    const y0 = ((yi % periodY) + periodY) % periodY;
    const x1 = (x0 + 1) % periodX;
    const y1 = (y0 + 1) % periodY;
    const l = this.lattice;
    const a = l[y0 * LATTICE + x0];
    const b = l[y0 * LATTICE + x1];
    const c = l[y1 * LATTICE + x0];
    const d = l[y1 * LATTICE + x1];
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }

  /** Fractal sum over texture space (u, v in [0, 1)); result roughly in [0, 1]. */
  fbm(u: number, v: number, basePeriodX: number, octaves: number, basePeriodY = basePeriodX, gain = 0.5): number {
    let sum = 0;
    let amplitude = 1;
    let norm = 0;
    let px = basePeriodX;
    let py = basePeriodY;
    for (let o = 0; o < octaves; o++) {
      sum += amplitude * this.value(u * px, v * py, px, py);
      norm += amplitude;
      amplitude *= gain;
      px *= 2;
      py *= 2;
    }
    return sum / norm;
  }
}

function hash2(a: number, b: number): number {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function createCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context is unavailable');
  return [canvas, ctx];
}

function canvasFromPixels(width: number, height: number, pixels: Uint8ClampedArray<ArrayBuffer>): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(width, height);
  ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
  return canvas;
}

interface TextureOptions {
  readonly srgb?: boolean;
  readonly repeat?: boolean;
  readonly anisotropy?: number;
}

function makeTexture(canvas: HTMLCanvasElement, options: TextureOptions = {}): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = options.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  const wrap = options.repeat === false ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  texture.wrapS = wrap;
  texture.wrapT = wrap;
  texture.anisotropy = options.anisotropy ?? 1;
  texture.needsUpdate = true;
  return texture;
}

/** Tangent-space normal map from a wrapping height field (OpenGL / +Y-up convention). */
function normalFromHeight(height: Float32Array, w: number, h: number, strength: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const up = ((y - 1 + h) % h) * w;
    const down = ((y + 1) % h) * w;
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const left = (x - 1 + w) % w;
      const right = (x + 1) % w;
      const nx = -(height[row + right] - height[row + left]) * strength;
      const ny = (height[down + x] - height[up + x]) * strength;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const i = (row + x) * 4;
      out[i] = (nx * inv * 0.5 + 0.5) * 255;
      out[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
      out[i + 2] = (inv * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

/** Writes a soft dot into a wrapping scalar field, keeping the maximum. */
function stamp(field: Float32Array, size: number, cx: number, cy: number, radius: number, strength: number): void {
  const r = Math.ceil(radius + 1);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const px = Math.floor(cx) + dx;
      const py = Math.floor(cy) + dy;
      const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy);
      const falloff = 1 - d / (radius + 1);
      if (falloff <= 0) continue;
      const index = (((py % size) + size) % size) * size + (((px % size) + size) % size);
      field[index] = Math.max(field[index], falloff * strength);
    }
  }
}

function randomWalkLines(field: Float32Array, size: number, rng: Random, count: number, minSteps: number, maxSteps: number, turn: number, width: number): void {
  for (let c = 0; c < count; c++) {
    let x = rng.range(0, size);
    let y = rng.range(0, size);
    let angle = rng.range(0, TAU);
    const steps = rng.int(minSteps, maxSteps);
    const w = rng.range(width * 0.5, width);
    for (let s = 0; s < steps; s++) {
      angle += rng.range(-turn, turn);
      x += Math.cos(angle) * 1.4;
      y += Math.sin(angle) * 1.4;
      stamp(field, size, x, y, w, 1 - (s / steps) * 0.55);
    }
  }
}

function writeRgb(out: Uint8ClampedArray, i: number, r: number, g: number, b: number, a = 1): void {
  out[i] = clamp(r, 0, 1) * 255;
  out[i + 1] = clamp(g, 0, 1) * 255;
  out[i + 2] = clamp(b, 0, 1) * 255;
  out[i + 3] = clamp(a, 0, 1) * 255;
}

function concrete(rng: Random, noise: TileableNoise, anisotropy: number): SurfaceTextures {
  // One tile covers 4 m of floor: two 2 m slabs each way, separated by saw-cut joints.
  const n = 512;
  const half = n / 2;
  const color = new Uint8ClampedArray(n * n * 4);
  const rough = new Uint8ClampedArray(n * n * 4);
  const height = new Float32Array(n * n);
  const cracks = new Float32Array(n * n);
  randomWalkLines(cracks, n, rng, 9, 60, 220, 0.45, 1.1);

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = x / n;
      const v = y / n;
      const broad = noise.fbm(u, v, 3, 4);
      const mid = noise.fbm(u + 0.31, v + 0.67, 12, 4);
      const grain = rng.next();
      const stain = smoothstep(0.56, 0.7, noise.fbm(u + 0.53, v + 0.19, 2, 5));
      const jx = x % half;
      const jy = y % half;
      const joint = 1 - smoothstep(0.5, 2.4, Math.min(jx, half - jx, jy, half - jy));
      const crack = cracks[y * n + x];

      let lum = 0.5 + (broad - 0.5) * 0.24 + (mid - 0.5) * 0.12 + (grain - 0.5) * 0.07;
      lum *= 1 - stain * 0.45;
      lum *= 1 - joint * 0.55;
      lum *= 1 - crack * 0.45;
      const pit = grain < 0.006;
      if (grain > 0.992) lum += 0.12;
      else if (pit) lum *= 0.55;

      const i = (y * n + x) * 4;
      writeRgb(color, i, lum * 1.03, lum, lum * 0.95);
      const r = clamp(0.86 + (mid - 0.5) * 0.18 - stain * 0.52 + joint * 0.08, 0.18, 1);
      writeRgb(rough, i, r, r, r);
      height[y * n + x] = (mid - 0.5) * 0.5 + (grain - 0.5) * 0.08 - joint * 0.9 - crack * 0.6 - (pit ? 0.3 : 0);
    }
  }

  return {
    map: makeTexture(canvasFromPixels(n, n, color), { srgb: true, anisotropy }),
    normalMap: makeTexture(canvasFromPixels(n, n, normalFromHeight(height, n, n, 1.6)), { anisotropy }),
    roughnessMap: makeTexture(canvasFromPixels(n, n, rough), { anisotropy }),
  };
}

function brick(noise: TileableNoise, anisotropy: number): SurfaceTextures {
  // 2 m x 2 m tile of running-bond brick: 26 courses, 9 bricks per course.
  const n = 512;
  const courses = 26;
  const perCourse = 9;
  const courseH = n / courses;
  const brickW = n / perCourse;
  const mortar = 2.4;
  const color = new Uint8ClampedArray(n * n * 4);
  const rough = new Uint8ClampedArray(n * n * 4);
  const height = new Float32Array(n * n);
  const palette: readonly (readonly [number, number, number])[] = [
    [0.48, 0.23, 0.17],
    [0.42, 0.19, 0.14],
    [0.54, 0.28, 0.2],
    [0.36, 0.17, 0.13],
    [0.29, 0.16, 0.13],
    [0.5, 0.31, 0.24],
  ];

  for (let y = 0; y < n; y++) {
    const course = Math.floor(y / courseH);
    const yIn = y - course * courseH;
    const offset = (course % 2) * brickW * 0.5;
    for (let x = 0; x < n; x++) {
      const u = x / n;
      const v = y / n;
      const xs = (x + offset) % n;
      const brickIndex = Math.floor(xs / brickW);
      const xIn = xs - brickIndex * brickW;
      const edge = Math.min(xIn - mortar, brickW - xIn, yIn - mortar, courseH - yIn);
      const chip = noise.fbm(u, v, 32, 3);
      const isMortar = edge < (chip > 0.62 ? 1.6 : 0);
      const soot = noise.fbm(u + 0.2, v + 0.7, 2, 4);
      const grain = noise.fbm(u, v, 64, 2);
      const i = (y * n + x) * 4;

      if (isMortar) {
        const m = 0.44 + (grain - 0.5) * 0.12;
        const dark = 1 - smoothstep(0.45, 0.8, soot) * 0.4;
        writeRgb(color, i, m * 0.98 * dark, m * 0.94 * dark, m * 0.86 * dark);
        writeRgb(rough, i, 0.96, 0.96, 0.96);
        height[y * n + x] = 0.08 + grain * 0.06;
      } else {
        const id = hash2(course, brickIndex);
        const base = palette[Math.floor(id * palette.length) % palette.length];
        const shade = (0.82 + hash2(brickIndex + 17, course + 3) * 0.3) * (0.86 + grain * 0.28);
        const dark = 1 - smoothstep(0.42, 0.82, soot) * 0.45;
        const efflor = smoothstep(0.8, 0.95, noise.fbm(u + 0.9, v * 0.5, 4, 3, 1)) * 0.25;
        writeRgb(
          color,
          i,
          (base[0] * shade + efflor) * dark,
          (base[1] * shade + efflor) * dark,
          (base[2] * shade + efflor) * dark,
        );
        const r = 0.8 + (grain - 0.5) * 0.12;
        writeRgb(rough, i, r, r, r);
        height[y * n + x] = 0.55 + smoothstep(0, 3.2, edge) * 0.4 + (grain - 0.5) * 0.18;
      }
    }
  }

  return {
    map: makeTexture(canvasFromPixels(n, n, color), { srgb: true, anisotropy }),
    normalMap: makeTexture(canvasFromPixels(n, n, normalFromHeight(height, n, n, 2.4)), { anisotropy }),
    roughnessMap: makeTexture(canvasFromPixels(n, n, rough), { anisotropy }),
  };
}

function corrugated(noise: TileableNoise, anisotropy: number): SurfaceTextures {
  // Roof decking: 2 m tile, eight corrugations, rust running down the valleys.
  const n = 256;
  const color = new Uint8ClampedArray(n * n * 4);
  const rough = new Uint8ClampedArray(n * n * 4);
  const height = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = x / n;
      const v = y / n;
      const wave = 0.5 + 0.5 * Math.cos(u * TAU * 8);
      const streak = smoothstep(0.58, 0.8, noise.fbm(u, v, 32, 3, 2));
      const blotch = noise.fbm(u + 0.4, v, 4, 4);
      const lum = (0.25 + (blotch - 0.5) * 0.1) * (0.72 + wave * 0.28);
      const i = (y * n + x) * 4;
      writeRgb(color, i, lerp(lum, 0.27, streak * 0.6), lerp(lum, 0.15, streak * 0.6), lerp(lum * 1.03, 0.09, streak * 0.6));
      const r = 0.6 + streak * 0.3 + (blotch - 0.5) * 0.1;
      writeRgb(rough, i, r, r, r);
      height[y * n + x] = wave + streak * 0.08;
    }
  }
  return {
    map: makeTexture(canvasFromPixels(n, n, color), { srgb: true, anisotropy }),
    normalMap: makeTexture(canvasFromPixels(n, n, normalFromHeight(height, n, n, 2.2)), { anisotropy }),
    roughnessMap: makeTexture(canvasFromPixels(n, n, rough), { anisotropy }),
  };
}

function paintedMetal(rng: Random, noise: TileableNoise, anisotropy: number): MetalTextures {
  // Neutral light paint so instance colors tint it; rust streaks and scratches stay readable.
  const n = 256;
  const color = new Uint8ClampedArray(n * n * 4);
  const orm = new Uint8ClampedArray(n * n * 4);
  const height = new Float32Array(n * n);
  const scratches = new Float32Array(n * n);
  randomWalkLines(scratches, n, rng, 26, 8, 30, 0.08, 0.7);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = x / n;
      const v = y / n;
      const paint = 0.8 * (0.88 + noise.fbm(u, v, 6, 4) * 0.24);
      const rust = smoothstep(0.6, 0.78, noise.fbm(u, v, 24, 3, 3)) * smoothstep(0.35, 0.62, noise.fbm(u + 0.3, v + 0.6, 4, 3));
      const scratch = scratches[y * n + x];
      const i = (y * n + x) * 4;
      const r = lerp(paint, 0.5, rust) + scratch * 0.15;
      const g = lerp(paint, 0.27, rust) + scratch * 0.15;
      const b = lerp(paint, 0.15, rust) + scratch * 0.15;
      writeRgb(color, i, r, g, b);
      writeRgb(orm, i, 1, lerp(0.52, 0.92, rust) - scratch * 0.25, lerp(0.3, 0.08, rust) + scratch * 0.6);
      height[y * n + x] = rust * 0.35 * noise.fbm(u, v, 64, 2) - scratch * 0.3;
    }
  }
  return {
    map: makeTexture(canvasFromPixels(n, n, color), { srgb: true, anisotropy }),
    normalMap: makeTexture(canvasFromPixels(n, n, normalFromHeight(height, n, n, 3)), { anisotropy }),
    ormMap: makeTexture(canvasFromPixels(n, n, orm), { anisotropy }),
  };
}

interface CrateVariant {
  readonly paint: readonly [number, number, number];
  readonly ink: readonly [number, number, number];
  readonly lines: readonly [string, string];
  readonly code: string;
  readonly arrows: boolean;
}

const CRATE_VARIANTS: readonly CrateVariant[] = [
  { paint: [0.29, 0.32, 0.19], ink: [0.9, 0.87, 0.76], lines: ['AMMUNITION', '5.56MM BALL M855'], code: 'NSN 1305-01-155-5459', arrows: false },
  { paint: [0.19, 0.2, 0.21], ink: [0.92, 0.74, 0.2], lines: ['FRAGILE', 'OPTICS · LOT 2417'], code: 'KH-7 STORES 0419', arrows: true },
  { paint: [0.47, 0.4, 0.27], ink: [0.14, 0.11, 0.08], lines: ['TRAINING', 'COMPOUND KH-7'], code: 'RANGE CONTROL · BAY 3', arrows: false },
];

function stencilMask(n: number, variant: CrateVariant): Float32Array {
  const [canvas, ctx] = createCanvas(n, n);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, n, n);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(n * 0.105)}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText(variant.lines[0], n / 2, n * 0.44, n * 0.74);
  ctx.font = `bold ${Math.round(n * 0.055)}px "Arial Narrow", Arial, sans-serif`;
  ctx.fillText(variant.lines[1], n / 2, n * 0.57, n * 0.72);
  ctx.textAlign = 'left';
  ctx.font = `${Math.round(n * 0.034)}px "Courier New", monospace`;
  ctx.fillText(variant.code, n * 0.15, n * 0.8);
  if (variant.arrows) {
    for (const ax of [0.28, 0.72]) {
      ctx.beginPath();
      ctx.moveTo(n * ax, n * 0.2);
      ctx.lineTo(n * (ax - 0.05), n * 0.28);
      ctx.lineTo(n * (ax - 0.018), n * 0.28);
      ctx.lineTo(n * (ax - 0.018), n * 0.34);
      ctx.lineTo(n * (ax + 0.018), n * 0.34);
      ctx.lineTo(n * (ax + 0.018), n * 0.28);
      ctx.lineTo(n * (ax + 0.05), n * 0.28);
      ctx.closePath();
      ctx.fill();
    }
  }
  const data = ctx.getImageData(0, 0, n, n).data;
  const mask = new Float32Array(n * n);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4] / 255;
  canvas.width = 0;
  return mask;
}

function crate(rng: Random, noise: TileableNoise, anisotropy: number): CrateTextures {
  // One steel crate face: raised rolled frame, five pressed ribs, gussets, rivets, worn stencil.
  const n = 512;
  const frame = Math.round(n * 0.075);
  const gusset = n * 0.13;
  const height = new Float32Array(n * n);
  const chipped = new Uint8Array(n * n);
  const ribShade = new Float32Array(n * n);
  const grime = new Float32Array(n * n);
  const inFrame = new Uint8Array(n * n);
  const scratches = new Float32Array(n * n);
  randomWalkLines(scratches, n, rng, 22, 10, 36, 0.1, 0.7);
  const rivetSpacing = n / 8;

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = x / n;
      const v = y / n;
      const index = y * n + x;
      const edgeDist = Math.min(x, y, n - 1 - x, n - 1 - y);
      const frameHere = edgeDist < frame;
      let h: number;
      if (frameHere) {
        h = 1 - (1 - smoothstep(0, 6, edgeDist)) * 0.35;
        const along = edgeDist === x || edgeDist === n - 1 - x ? y : x;
        const rivetCenter = Math.round(along / rivetSpacing) * rivetSpacing;
        const rd = Math.hypot(along - rivetCenter, edgeDist - frame * 0.5);
        if (rd < 5.5) h += 0.35 * Math.sqrt(1 - (rd / 5.5) ** 2);
        inFrame[index] = 1;
      } else {
        const rib = 0.5 + 0.5 * Math.cos(((x - frame) / (n - 2 * frame)) * TAU * 5);
        h = 0.4 + rib * 0.22 - noise.fbm(u, v, 3, 2) * 0.05;
        ribShade[index] = rib;
        const cx = Math.min(x - frame, n - frame - x);
        const cy = Math.min(y - frame, n - frame - y);
        if (cx + cy < gusset) {
          h = 0.86;
          ribShade[index] = 1;
        }
      }
      const chipNoise = noise.fbm(u, v, 16, 4);
      const nearEdge = Math.max(0, 1 - edgeDist / 26);
      chipped[index] = chipNoise > 0.71 - nearEdge * 0.2 || scratches[index] > 0.55 ? 1 : 0;
      grime[index] = smoothstep(0.45, 0.85, noise.fbm(u + 0.6, v + 0.1, 4, 4));
      height[index] = h - (chipped[index] ? 0.04 : 0);
    }
  }

  const orm = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const rough = chipped[i] ? 0.34 : 0.6 + grime[i] * 0.25;
    writeRgb(orm, i * 4, 1, rough, chipped[i] ? 0.92 : 0.1);
  }

  const variants: THREE.Texture[] = [];
  for (const variant of CRATE_VARIANTS) {
    const mask = stencilMask(n, variant);
    const color = new Uint8ClampedArray(n * n * 4);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const index = y * n + x;
        const u = x / n;
        const v = y / n;
        const tone = 0.88 + noise.fbm(u, v, 8, 3) * 0.24;
        const cavity = inFrame[index] ? 1 : 0.8 + ribShade[index] * 0.2;
        const dirt = 1 - grime[index] * 0.38;
        let r = variant.paint[0] * tone * cavity * dirt;
        let g = variant.paint[1] * tone * cavity * dirt;
        let b = variant.paint[2] * tone * cavity * dirt;
        const wear = noise.fbm(u + 0.15, v + 0.85, 24, 3);
        if (mask[index] > 0.5 && wear < 0.62) {
          r = lerp(r, variant.ink[0] * dirt, 0.88);
          g = lerp(g, variant.ink[1] * dirt, 0.88);
          b = lerp(b, variant.ink[2] * dirt, 0.88);
        }
        if (chipped[index]) {
          const metal = 0.42 + noise.fbm(u, v, 64, 2) * 0.2;
          r = metal;
          g = metal * 0.98;
          b = metal * 0.95;
        }
        writeRgb(color, index * 4, r, g, b);
      }
    }
    variants.push(makeTexture(canvasFromPixels(n, n, color), { srgb: true, anisotropy }));
  }

  return {
    variants,
    normalMap: makeTexture(canvasFromPixels(n, n, normalFromHeight(height, n, n, 2.2)), { anisotropy }),
    ormMap: makeTexture(canvasFromPixels(n, n, orm), { anisotropy }),
  };
}

function hazard(noise: TileableNoise): THREE.Texture {
  const n = 128;
  const color = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const stripe = (x + y) % 64 < 32;
      const wear = noise.fbm(x / n, y / n, 8, 3);
      const scuff = wear > 0.66 ? 0.55 : 1;
      const i = (y * n + x) * 4;
      if (stripe) writeRgb(color, i, 0.84 * scuff, 0.64 * scuff, 0.1 * scuff);
      else writeRgb(color, i, 0.08, 0.08, 0.08);
    }
  }
  return makeTexture(canvasFromPixels(n, n, color), { srgb: true });
}

function safetyPaint(noise: TileableNoise): THREE.Texture {
  const w = 64;
  const h = 256;
  const color = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const worn = noise.fbm(x / w, y / h, 4, 4, 16);
      const i = (y * w + x) * 4;
      writeRgb(color, i, 0.86, 0.68, 0.12, worn > 0.6 ? 0 : 1);
    }
  }
  return makeTexture(canvasFromPixels(w, h, color), { srgb: true });
}

function oilStain(noise: TileableNoise): THREE.Texture {
  const n = 256;
  const color = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = x / n - 0.5;
      const dy = y / n - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) * 2;
      const blob = noise.fbm(x / n, y / n, 4, 5) - r * 0.85;
      const alpha = smoothstep(0.02, 0.32, blob) * 0.85;
      writeRgb(color, (y * n + x) * 4, 0.07, 0.06, 0.05, alpha);
    }
  }
  return makeTexture(canvasFromPixels(n, n, color), { srgb: true, repeat: false });
}

function bulletHole(rng: Random): THREE.Texture {
  const n = 64;
  const color = new Uint8ClampedArray(n * n * 4);
  const spokes = Array.from({ length: 7 }, () => ({ angle: rng.range(0, TAU), length: rng.range(0.55, 0.95) }));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5) / n - 0.5;
      const dy = (y + 0.5) / n - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) * 2;
      const angle = Math.atan2(dy, dx);
      let crack = 0;
      for (const spoke of spokes) {
        const diff = Math.abs(Math.atan2(Math.sin(angle - spoke.angle), Math.cos(angle - spoke.angle)));
        if (diff < 0.07 && r < spoke.length) crack = Math.max(crack, 1 - r / spoke.length);
      }
      let lum = 0.02;
      let alpha = 0;
      if (r < 0.16) alpha = 1;
      else if (r < 0.34) {
        lum = 0.12;
        alpha = 0.92 - (r - 0.16) * 1.5;
      } else {
        lum = 0.09;
        alpha = Math.max(0, 0.45 - r * 0.45);
      }
      alpha = Math.max(alpha, crack * 0.75);
      writeRgb(color, (y * n + x) * 4, lum, lum, lum, alpha);
    }
  }
  return makeTexture(canvasFromPixels(n, n, color), { srgb: true, repeat: false });
}

function muzzleFlash(): THREE.Texture {
  const n = 128;
  const [canvas, ctx] = createCanvas(n, n);
  ctx.clearRect(0, 0, n, n);
  ctx.translate(n / 2, n / 2);
  ctx.globalCompositeOperation = 'lighter';
  const prongs = 7;
  for (let i = 0; i < prongs; i++) {
    ctx.save();
    ctx.rotate((i / prongs) * TAU + (i % 2) * 0.2);
    const length = n * (i % 2 === 0 ? 0.48 : 0.34);
    const gradient = ctx.createLinearGradient(0, 0, length, 0);
    gradient.addColorStop(0, 'rgba(255,250,230,0.95)');
    gradient.addColorStop(0.35, 'rgba(255,190,90,0.7)');
    gradient.addColorStop(1, 'rgba(255,110,30,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, -n * 0.05);
    ctx.lineTo(length, 0);
    ctx.lineTo(0, n * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, n * 0.3);
  core.addColorStop(0, 'rgba(255,255,245,1)');
  core.addColorStop(0.3, 'rgba(255,220,140,0.85)');
  core.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, n * 0.3, 0, TAU);
  ctx.fill();
  return makeTexture(canvas, { srgb: true, repeat: false });
}

function flashlightCookie(noise: TileableNoise): THREE.Texture {
  const n = 256;
  const color = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5) / n - 0.5;
      const dy = (y + 0.5) / n - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) * 2;
      const hotspot = Math.exp(-r * r * 9);
      const spill = (1 - smoothstep(0.55, 0.98, r)) * 0.42;
      const ring = Math.exp(-((r - 0.6) ** 2) * 260) * 0.18;
      const lens = 0.94 + noise.fbm(x / n, y / n, 8, 3) * 0.12;
      const value = clamp((hotspot + spill + ring) * lens, 0, 1);
      writeRgb(color, (y * n + x) * 4, value, value * 0.97, value * 0.9);
    }
  }
  return makeTexture(canvasFromPixels(n, n, color), { srgb: true, repeat: false });
}

function exitSign(): THREE.Texture {
  const [canvas, ctx] = createCanvas(256, 128);
  ctx.fillStyle = '#0d5e2f';
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = '#19a457';
  ctx.fillRect(8, 8, 240, 112);
  ctx.fillStyle = '#f4fff6';
  ctx.font = 'bold 66px "Arial Black", Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('EXIT', 22, 66);
  ctx.beginPath();
  ctx.moveTo(198, 40);
  ctx.lineTo(236, 64);
  ctx.lineTo(198, 88);
  ctx.lineTo(198, 74);
  ctx.lineTo(182, 74);
  ctx.lineTo(182, 54);
  ctx.lineTo(198, 54);
  ctx.closePath();
  ctx.fill();
  return makeTexture(canvas, { srgb: true, repeat: false });
}

function ammoCrate(): THREE.Texture {
  const [canvas, ctx] = createCanvas(256, 128);
  ctx.fillStyle = '#4a5230';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#2b301b';
  ctx.lineWidth = 6;
  ctx.strokeRect(5, 5, 246, 118);
  ctx.fillStyle = '#e8c33a';
  ctx.fillRect(0, 92, 256, 10);
  ctx.fillStyle = '#efe7cc';
  ctx.font = 'bold 34px "Arial Black", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('5.56 MM', 128, 40);
  ctx.font = 'bold 18px "Courier New", monospace';
  ctx.fillText('90 RDS · M855 BALL', 128, 72);
  return makeTexture(canvas, { srgb: true, repeat: false });
}

function medkit(): THREE.Texture {
  const [canvas, ctx] = createCanvas(256, 128);
  ctx.fillStyle = '#d9d6cc';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#9b978a';
  ctx.lineWidth = 6;
  ctx.strokeRect(5, 5, 246, 118);
  ctx.fillStyle = '#c0281f';
  ctx.fillRect(34, 46, 60, 36);
  ctx.fillRect(46, 34, 36, 60);
  ctx.fillStyle = '#2a2622';
  ctx.font = 'bold 30px "Arial Black", Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('MEDIC', 112, 54);
  ctx.font = 'bold 15px "Courier New", monospace';
  ctx.fillText('IFAK · TRAUMA', 112, 84);
  return makeTexture(canvas, { srgb: true, repeat: false });
}

function gunWear(rng: Random, noise: TileableNoise): THREE.Texture {
  const n = 128;
  const color = new Uint8ClampedArray(n * n * 4);
  const scratches = new Float32Array(n * n);
  randomWalkLines(scratches, n, rng, 40, 4, 16, 0.05, 0.6);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const value = clamp(0.42 + (noise.fbm(x / n, y / n, 8, 4) - 0.5) * 0.3 - scratches[i] * 0.25, 0.12, 0.85);
      writeRgb(color, i * 4, value, value, value);
    }
  }
  return makeTexture(canvasFromPixels(n, n, color));
}

function softGlow(): THREE.Texture {
  const n = 64;
  const [canvas, ctx] = createCanvas(n, n);
  const gradient = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, n, n);
  return makeTexture(canvas, { srgb: true, repeat: false });
}

const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Builds every texture the game uses from code. Yields a frame between the heavy
 * generators so the loading bar keeps moving on slower phones.
 */
export async function generateTextureLibrary(
  seed: number,
  maxAnisotropy: number,
  onProgress: (fraction: number, label: string) => void,
): Promise<TextureLibrary> {
  const rng = new Random(seed);
  const noise = new TileableNoise(rng);
  const anisotropy = Math.min(8, maxAnisotropy);

  onProgress(0.02, 'Pouring concrete');
  await nextFrame();
  const concreteSet = concrete(rng, noise, anisotropy);
  onProgress(0.18, 'Laying brick');
  await nextFrame();
  const brickSet = brick(noise, anisotropy);
  onProgress(0.34, 'Hanging roof decking');
  await nextFrame();
  const corrugatedSet = corrugated(noise, anisotropy);
  const metal = paintedMetal(rng, noise, anisotropy);
  onProgress(0.46, 'Stenciling crates');
  await nextFrame();
  const crateSet = crate(rng, noise, anisotropy);
  onProgress(0.66, 'Painting markings');
  await nextFrame();
  const library: TextureLibrary = {
    concrete: concreteSet,
    brick: brickSet,
    corrugated: corrugatedSet,
    paintedMetal: metal,
    crate: crateSet,
    hazard: hazard(noise),
    safetyPaint: safetyPaint(noise),
    oilStain: oilStain(noise),
    bulletHole: bulletHole(rng),
    muzzleFlash: muzzleFlash(),
    flashlightCookie: flashlightCookie(noise),
    exitSign: exitSign(),
    ammoCrate: ammoCrate(),
    medkit: medkit(),
    gunWear: gunWear(rng, noise),
    softGlow: softGlow(),
  };
  onProgress(0.72, 'Textures ready');
  return library;
}
