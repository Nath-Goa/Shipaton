import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';

export interface NavBallData {
  /** directions expressed in the vessel frame */
  up: Vector3;
  north: Vector3;
  east: Vector3;
  prograde: Vector3 | null;
  radial: Vector3;
}

const SIZE = 120;

export function NavBall({ data }: { data: NavBallData | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !data) return;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(SIZE, SIZE);
    const R = SIZE / 2 - 2;
    for (let py = 0; py < SIZE; py++) {
      for (let px = 0; px < SIZE; px++) {
        const x = (px + 0.5 - SIZE / 2) / R;
        const y = -(py + 0.5 - SIZE / 2) / R;
        const r2 = x * x + y * y;
        const o = (py * SIZE + px) * 4;
        if (r2 > 1) { img.data[o + 3] = 0; continue; }
        const dep = Math.sqrt(1 - r2);
        // vessel frame: x right, y nose (towards the viewer), -z towards the top of the ball
        const p = new Vector3(x, dep, -y);
        const u = p.dot(data.up);
        const pitch = (Math.asin(Math.max(-1, Math.min(1, u))) * 180) / Math.PI;
        const az = (Math.atan2(p.dot(data.east), p.dot(data.north)) * 180) / Math.PI;
        let r = u >= 0 ? 52 : 120, g = u >= 0 ? 118 : 84, b = u >= 0 ? 196 : 52;
        const nearPitch = Math.abs(((pitch + 7.5) % 15 + 15) % 15 - 7.5);
        const nearAz = Math.abs(((az + 15) % 30 + 30) % 30 - 15);
        if (Math.abs(pitch) < 0.9) { r = 255; g = 255; b = 255; }
        else if (nearPitch < 0.55 && Math.abs(pitch) < 80) { r += 70; g += 70; b += 70; }
        else if (nearAz < 0.7 * (1 + Math.abs(pitch) / 40) && Math.abs(pitch) < 80) { r += 40; g += 40; b += 40; }
        const shade = 0.55 + 0.45 * dep;
        img.data[o] = Math.min(255, r * shade);
        img.data[o + 1] = Math.min(255, g * shade);
        img.data[o + 2] = Math.min(255, b * shade);
        img.data[o + 3] = 255;
      }
    }
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.putImageData(img, 0, 0);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, R, 0, Math.PI * 2);
    ctx.stroke();
    const mark = (d: Vector3, color: string, kind: 'pro' | 'retro' | 'rad' | 'radin') => {
      const front = d.y > 0;
      const mx = SIZE / 2 + d.x * R * 0.94;
      const my = SIZE / 2 + d.z * R * 0.94;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.globalAlpha = front ? 1 : 0.35;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mx, my, 6, 0, Math.PI * 2);
      ctx.stroke();
      if (kind === 'pro' || kind === 'rad') {
        ctx.beginPath(); ctx.arc(mx, my, 1.6, 0, Math.PI * 2); ctx.fill();
      }
      if (kind === 'retro' || kind === 'radin') {
        ctx.beginPath(); ctx.moveTo(mx - 4, my - 4); ctx.lineTo(mx + 4, my + 4); ctx.moveTo(mx + 4, my - 4); ctx.lineTo(mx - 4, my + 4); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    if (data.prograde) {
      mark(data.prograde, '#6dff7a', 'pro');
      mark(data.prograde.clone().negate(), '#6dff7a', 'retro');
    }
    mark(data.radial, '#6ab6ff', 'rad');
    mark(data.radial.clone().negate(), '#6ab6ff', 'radin');
    // nose marker
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(SIZE / 2 - 12, SIZE / 2); ctx.lineTo(SIZE / 2 - 4, SIZE / 2);
    ctx.moveTo(SIZE / 2 + 12, SIZE / 2); ctx.lineTo(SIZE / 2 + 4, SIZE / 2);
    ctx.moveTo(SIZE / 2, SIZE / 2 - 4); ctx.lineTo(SIZE / 2, SIZE / 2 - 10);
    ctx.stroke();
  }, [data]);
  return <canvas ref={ref} width={SIZE} height={SIZE} className="navball" />;
}
