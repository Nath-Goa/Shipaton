import { CanvasTexture, LinearFilter, RepeatWrapping, SRGBColorSpace, Texture, Vector3 } from 'three';
import { BodyDef, RGB } from '../sim/bodies';
import { Simplex3 } from '../sim/noise';
import { terrainColor, terrainHeight } from '../sim/terrain';

const cache = new Map<string, Texture>();

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement): Texture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  return t;
}

/** Low-resolution equirectangular colour map used when a rocky body is too far away for terrain chunks. */
export function rockyTexture(body: BodyDef): Texture {
  const key = `rock:${body.id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = 512;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  const img = ctx.createImageData(W, H);
  const d = new Vector3();
  const sea = body.terrain?.seaLevel;
  const oc = body.terrain?.oceanColor ?? [0.04, 0.2, 0.42];
  for (let y = 0; y < H; y++) {
    const lat = Math.PI / 2 - ((y + 0.5) / H) * Math.PI;
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W) * Math.PI * 2;
      // sphere uv convention in three: u runs along +x -> +z... match SphereGeometry
      d.set(-Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
      const h = terrainHeight(body, d, 9);
      let rgb: RGB;
      if (sea !== undefined && h <= sea) {
        const t = 1 - Math.exp(-(sea - h) / 400);
        rgb = [0.1 + (oc[0] - 0.1) * t, 0.46 + (oc[1] - 0.46) * t, 0.52 + (oc[2] - 0.52) * t];
      } else rgb = terrainColor(body, d, h, 0.1);
      const o = (y * W + x) * 4;
      img.data[o] = rgb[0] * 255;
      img.data[o + 1] = rgb[1] * 255;
      img.data[o + 2] = rgb[2] * 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = finish(c);
  cache.set(key, t);
  return t;
}

export function gasTexture(body: BodyDef): Texture {
  const key = `gas:${body.id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = 512;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  const img = ctx.createImageData(W, H);
  const noise = new Simplex3(Math.abs(Math.floor(body.mu % 100003)) + 5);
  const bands = body.bands ?? [body.color];
  for (let y = 0; y < H; y++) {
    const lat = (y / H) * Math.PI;
    for (let x = 0; x < W; x++) {
      const lon = (x / W) * Math.PI * 2;
      const nx = Math.cos(lon) * Math.sin(lat);
      const nz = Math.sin(lon) * Math.sin(lat);
      const ny = Math.cos(lat);
      const turb = noise.fbm(nx * 3, ny * 9, nz * 3, 4) * 0.12;
      const bandPos = (Math.sin((ny + turb) * 14) * 0.5 + 0.5) * (bands.length - 1);
      const i0 = Math.floor(bandPos);
      const f = bandPos - i0;
      const a = bands[i0];
      const b = bands[Math.min(bands.length - 1, i0 + 1)];
      const sw = noise.fbm(nx * 8 + 11, ny * 30, nz * 8, 3) * 0.08;
      const o = (y * W + x) * 4;
      img.data[o] = Math.max(0, Math.min(255, (a[0] + (b[0] - a[0]) * f + sw) * 255));
      img.data[o + 1] = Math.max(0, Math.min(255, (a[1] + (b[1] - a[1]) * f + sw) * 255));
      img.data[o + 2] = Math.max(0, Math.min(255, (a[2] + (b[2] - a[2]) * f + sw) * 255));
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = finish(c);
  cache.set(key, t);
  return t;
}

export function sunTexture(color: RGB): Texture {
  const key = `sun:${color.join(',')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = 256;
  const H = 128;
  const [c, ctx] = canvas(W, H);
  const img = ctx.createImageData(W, H);
  const noise = new Simplex3(77);
  for (let y = 0; y < H; y++) {
    const lat = (y / H) * Math.PI;
    for (let x = 0; x < W; x++) {
      const lon = (x / W) * Math.PI * 2;
      const n = noise.fbm(Math.cos(lon) * Math.sin(lat) * 6, Math.cos(lat) * 6, Math.sin(lon) * Math.sin(lat) * 6, 5) * 0.5 + 0.5;
      const k = 0.72 + n * 0.5;
      const o = (y * W + x) * 4;
      img.data[o] = Math.min(255, color[0] * k * 255 * 1.1);
      img.data[o + 1] = Math.min(255, color[1] * k * 255);
      img.data[o + 2] = Math.min(255, color[2] * k * 255 * 0.9);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = finish(c);
  cache.set(key, t);
  return t;
}

export function ringTexture(color: RGB): Texture {
  const key = `ring:${color.join(',')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, ctx] = canvas(512, 4);
  const noise = new Simplex3(31);
  const img = ctx.createImageData(512, 1);
  for (let x = 0; x < 512; x++) {
    const t = x / 511;
    const n = noise.fbm(t * 40, 0.5, 0.5, 4) * 0.5 + 0.5;
    const gap = t > 0.55 && t < 0.62 ? 0.1 : 1;
    const a = Math.max(0, Math.min(1, (0.25 + n * 0.8) * gap)) * Math.min(1, t * 8) * Math.min(1, (1 - t) * 8);
    img.data[x * 4] = color[0] * 255;
    img.data[x * 4 + 1] = color[1] * 255;
    img.data[x * 4 + 2] = color[2] * 255;
    img.data[x * 4 + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0);
  for (let y = 1; y < 4; y++) ctx.drawImage(c, 0, 0, 512, 1, 0, y, 512, 1);
  const t = finish(c);
  cache.set(key, t);
  return t;
}

export function glowTexture(): Texture {
  const hit = cache.get('glow');
  if (hit) return hit;
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.15, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  cache.set('glow', t);
  return t;
}

export function disposeTextures(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
