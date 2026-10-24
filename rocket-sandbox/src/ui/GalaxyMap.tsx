import { useEffect, useMemo, useRef, useState } from 'react';
import { CATALOG, distanceLy, galacticDensity, nearestStar, searchStars, starRGB, starsWithin, StarRec, systemForStar } from '../sim/galaxy';
import { mulberry32 } from '../sim/rng';
import { checkJump, currentStar, doJump } from '../sim/jump';
import { activeVessel, World } from '../sim/world';

interface Props { world: World; onClose: () => void; toast: (t: string, l?: string) => void }

/** Decorative disc stars drawn at galaxy scale. They are density samples, not selectable systems. */
function diskSamples(): Float32Array {
  const rng = mulberry32(4242);
  const out: number[] = [];
  while (out.length < 3 * 9000) {
    const x = 26000 + (rng() * 2 - 1) * 52000; // Sun-relative; the galactic centre is at x = +26,000 ly
    const y = (rng() * 2 - 1) * 52000;
    const z = (rng() * 2 - 1) * 2500;
    const d = galacticDensity(x, y, z);
    if (rng() < d * 0.9) out.push(x, y, z);
  }
  return new Float32Array(out);
}

export function GalaxyMap({ world: w, onClose, toast }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const here = currentStar(w);
  const v = activeVessel(w);
  const [center, setCenter] = useState({ x: here.x, y: here.y, z: here.z });
  const [span, setSpan] = useState(60);
  const [yaw, setYaw] = useState(0.4);
  const [pitch, setPitch] = useState(0.9);
  const [sel, setSel] = useState<StarRec | null>(null);
  const [query, setQuery] = useState('');
  const disk = useMemo(diskSamples, []);

  const stars = useMemo(() => starsWithin(center.x, center.y, center.z, span * 1.2, 4500), [center, span]);
  const proj = (x: number, y: number, z: number, W: number, H: number) => {
    const dx = x - center.x, dy = y - center.y, dz = z - center.z;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const rx = dx * cy - dy * sy;
    const ry = dx * sy + dy * cy;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const sx = rx;
    const sz = ry * sp + dz * cp; // up on screen
    const depth = ry * cp - dz * sp;
    const k = Math.min(W, H) / 2 / span;
    return [W / 2 + sx * k, H / 2 - sz * k, depth] as const;
  };

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth, H = c.clientHeight;
    c.width = W * dpr; c.height = H * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#03040a';
    ctx.fillRect(0, 0, W, H);
    if (span > 400) {
      ctx.fillStyle = 'rgba(150,170,230,0.35)';
      for (let i = 0; i < disk.length; i += 3) {
        const [x, y] = proj(disk[i], disk[i + 1], disk[i + 2], W, H);
        if (x > 0 && x < W && y > 0 && y < H) ctx.fillRect(x, y, 1.2, 1.2);
      }
      // galactic centre marker
      const [gx, gy] = proj(26000, 0, 0, W, H);
      ctx.fillStyle = 'rgba(255,214,140,0.9)';
      ctx.beginPath(); ctx.arc(gx, gy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd68c'; ctx.font = '11px system-ui'; ctx.fillText('Galactic centre', gx + 8, gy + 4);
    }
    // jump range
    if (v && v.derived.hasJump) {
      const range = w.assists.unlimitedFuel ? v.derived.jumpRange : Math.min(v.jumpCharge, v.derived.jumpRange);
      const k = Math.min(W, H) / 2 / span;
      const [hx, hy] = proj(here.x, here.y, here.z, W, H);
      ctx.strokeStyle = 'rgba(89,214,255,0.4)';
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.ellipse(hx, hy, range * k, range * k * Math.sin(pitch), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const s of stars) {
      const [x, y, d] = proj(s.x, s.y, s.z, W, H);
      if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
      const c3 = starRGB(s.colorIndex);
      const bright = Math.max(0.25, Math.min(1, 1.1 - (s.absMag - 2) * 0.08));
      const r = s.real ? (span < 200 ? 2.4 : 1.6) : span < 100 ? 1.6 : 1.1;
      ctx.fillStyle = `rgba(${Math.round(c3[0] * 255)},${Math.round(c3[1] * 255)},${Math.round(c3[2] * 255)},${(s.real ? 0.95 : 0.55) * bright})`;
      ctx.beginPath(); ctx.arc(x, y, r + Math.max(0, -d * 0.0), 0, Math.PI * 2); ctx.fill();
      if (s.real && span < 40 && s.name && !s.name.startsWith('HIP') && !s.name.startsWith('HYG')) { ctx.fillStyle = 'rgba(200,215,255,0.7)'; ctx.font = '10px system-ui'; ctx.fillText(s.name, x + 5, y - 4); }
    }
    const mark = (s: StarRec, color: string, label: string) => {
      const [x, y] = proj(s.x, s.y, s.z, W, H);
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = color; ctx.font = '12px system-ui'; ctx.fillText(label, x + 12, y + 4);
      ctx.lineWidth = 1;
    };
    mark(here, '#6dff9a', `${here.name} (you)`);
    if (sel) mark(sel, '#ffc850', sel.name);
    // line between
    if (sel) {
      const [x1, y1] = proj(here.x, here.y, here.z, W, H);
      const [x2, y2] = proj(sel.x, sel.y, sel.z, W, H);
      ctx.strokeStyle = 'rgba(255,200,80,0.5)'; ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
    }
  });

  const pts = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(false);
  const pinch = useRef(0);
  const down = useRef({ x: 0, y: 0, button: 0 });
  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
    down.current = { x: e.clientX, y: e.clientY, button: e.button };
    if (pts.current.size === 2) { const [a, b] = [...pts.current.values()]; pinch.current = Math.hypot(a.x - b.x, a.y - b.y); }
  };
  const onMove = (e: React.PointerEvent) => {
    const p = pts.current.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y) > 5) moved.current = true;
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current > 0) setSpan((s) => Math.max(4, Math.min(70000, s * (pinch.current / d))));
      pinch.current = d;
    } else if (e.shiftKey || e.buttons === 2) {
      setYaw((yw) => yw + dx * 0.006);
      setPitch((pt) => Math.max(0.05, Math.min(1.5, pt - dy * 0.006)));
    } else {
      const c = ref.current!;
      const k = span / (Math.min(c.clientWidth, c.clientHeight) / 2);
      const cy = Math.cos(yaw), sy = Math.sin(yaw), sp = Math.sin(pitch);
      const sx = -dx * k;
      const sz = dy * k;
      const ry = sz / Math.max(0.15, sp);
      setCenter((c0) => ({ x: c0.x + sx * cy + ry * sy, y: c0.y - sx * sy + ry * cy, z: c0.z }));
    }
  };
  const onUp = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId);
    pinch.current = 0;
    if (!moved.current && pts.current.size === 0) {
      const c = ref.current!;
      const r = c.getBoundingClientRect();
      let best: StarRec | null = null;
      let bd = 22;
      for (const s of stars) {
        const [x, y] = proj(s.x, s.y, s.z, r.width, r.height);
        const d = Math.hypot(x - (e.clientX - r.left), y - (e.clientY - r.top));
        if (d < bd) { bd = d; best = s; }
      }
      if (best) setSel(best);
    }
  };

  const check = sel && v ? checkJump(w, v, sel) : null;
  const sys = useMemo(() => (sel ? systemForStar(sel) : null), [sel]);
  const results = query.length > 1 ? searchStars(query, 8) : [];

  return (
    <div className="overlay map">
      <canvas ref={ref} className="map-canvas" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onWheel={(e) => setSpan((s) => Math.max(4, Math.min(70000, s * Math.exp(e.deltaY * 0.0013))))} onContextMenu={(e) => e.preventDefault()} />
      <div className="map-top">
        <button className="btn" onClick={onClose}>✕ Close</button>
        <input className="search" placeholder="Search stars (Sirius, Proxima…)" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="chips">
          {results.map((s) => (
            <button key={s.id} className="chip" onClick={() => { setSel(s); setCenter({ x: s.x, y: s.y, z: s.z }); setSpan(Math.max(8, Math.min(span, 40))); setQuery(''); }}>{s.name}</button>
          ))}
          <button className="chip" onClick={() => { setCenter({ x: here.x, y: here.y, z: here.z }); setSpan(60); }}>Home</button>
          <button className="chip" onClick={() => { const s = nearestStar(center.x, center.y, center.z); if (s) setSel(s); }}>Pick nearest to view centre</button>
          <button className="chip" onClick={() => { setSpan(20000); setCenter({ x: 13000, y: 0, z: 0 }); }}>Whole galaxy</button>
        </div>
      </div>
      <div className="panel map-info">
        <div className="small dim">Catalog: {CATALOG.length.toLocaleString()} real stars (HYG). Faint filler stars are generated and fictional; zoom to ~150 ly to see them.</div>
        {sel ? (
          <>
            <b>{sel.name}</b> <span className="dim small">{sel.real ? 'catalog star (observed)' : 'generated star (fictional)'}</span>
            <div className="small dim">Spectral {sel.spectral || '?'} · abs. mag {sel.absMag.toFixed(1)} · {distanceLy(here, sel).toFixed(1)} ly away</div>
            {sys && (
              <div className="small">
                {sys.bodies.filter((b) => b.parent === 'star').length} planet(s) · data: <b>{sys.provenance}</b>
                {sys.provenance !== 'generated' && ' (planet existence/orbits observed, other details generated)'}
                <div className="dim">{sys.bodies.filter((b) => b.kind === 'planet').map((b) => b.name.replace(sel.name + ' ', '')).join(', ') || 'no planets'}</div>
              </div>
            )}
            {check && (
              <div className={`small ${check.ok ? 'good' : 'bad'}`}>
                {check.ok ? `Jump ready: ${check.distance.toFixed(1)} ly` : check.reason}
              </div>
            )}
            <button
              className="btn primary" disabled={!check?.ok}
              onClick={() => { if (v && sel && doJump(w, v, sel)) { toast(`Arrived at ${sel.name}.`, 'good'); onClose(); } }}
            >Jump</button>
          </>
        ) : <div className="small">Tap a star to select a destination.</div>}
        <div className="small dim">Drag pan · right-drag/shift-drag rotate · wheel/pinch zoom. {v?.derived.hasJump ? '' : 'This ship has no jump drive — build one with the Fold-Space Jump Drive.'}</div>
      </div>
    </div>
  );
}
