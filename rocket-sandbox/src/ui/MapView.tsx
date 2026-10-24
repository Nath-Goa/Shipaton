import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Vector3 } from 'three';
import { atmosphereTop, BodyDef, surfaceGravity } from '../sim/bodies';
import { startAutopilot } from '../sim/guidance';
import { bodyStateRel, elements, predictEvents, sampleConic } from '../sim/orbit';
import { activeVessel, World } from '../sim/world';
import { fmtDist, fmtTime } from './format';

interface Props { world: World; onClose: () => void; toast: (t: string, l?: string) => void }

const rgb = (c: [number, number, number]) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;

/** Points along a body's orbit around its parent (ecliptic plane, X/Z). */
function orbitPath(body: BodyDef, n = 160): Vector3[] {
  const o = body.orbit!;
  const b = o.a * Math.sqrt(1 - o.e * o.e);
  const pts: Vector3[] = [];
  const cw = Math.cos(o.argPeri);
  const sw = Math.sin(o.argPeri);
  for (let i = 0; i <= n; i++) {
    const E = (i / n) * Math.PI * 2;
    const xp = o.a * (Math.cos(E) - o.e);
    const yp = b * Math.sin(E);
    pts.push(new Vector3(xp * cw - yp * sw, 0, -(xp * sw + yp * cw)));
  }
  return pts;
}

export function MapView({ world: w, onClose, toast }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const v = activeVessel(w);
  const [focus, setFocus] = useState(v?.body ?? w.system.bodies[0].id);
  const [target, setTarget] = useState<string | null>(null);
  const view = useRef({ scale: 1e6, panX: 0, panY: 0 });
  const [tick, setTick] = useState(0);
  const idx = w.idx;

  const fit = useCallback((id: string) => {
    const kids = idx.children.get(id) ?? [];
    const body = idx.get(id);
    let ext = body.radius * 4;
    for (const k of kids) ext = Math.max(ext, k.orbit!.a * (1 + k.orbit!.e) * 1.1);
    if (v && v.body === id) {
      const el = elements(v.pos, v.vel, body.mu);
      ext = Math.max(ext, Number.isFinite(el.ra) ? el.ra * 1.25 : v.pos.length() * 2);
    }
    const el = ref.current;
    const px = el ? Math.min(el.clientWidth, el.clientHeight) / 2 : 300;
    view.current = { scale: ext / (px * 0.85), panX: 0, panY: 0 };
  }, [idx, v]);

  useEffect(() => { fit(focus); }, [focus, fit]);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 400); return () => clearInterval(t); }, []);

  const events = useMemo(() => {
    if (!v) return null;
    return predictEvents(idx, v.body, v.pos, v.vel, w.t, 30 * 86400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  // ---- draw
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth;
    const H = c.clientHeight;
    c.width = W * dpr;
    c.height = H * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#04060c';
    ctx.fillRect(0, 0, W, H);
    const { scale, panX, panY } = view.current;
    const cx = W / 2 + panX;
    const cy = H / 2 + panY;
    const P = (p: Vector3) => [cx + p.x / scale, cy + p.z / scale] as const;
    const fb = idx.get(focus);
    ctx.lineWidth = 1;
    // SOI
    const soi = idx.soi.get(focus);
    if (soi && Number.isFinite(soi)) {
      ctx.strokeStyle = 'rgba(120,160,255,0.25)';
      ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.arc(cx, cy, soi / scale, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    // body
    ctx.fillStyle = rgb(fb.color);
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(4, fb.radius / scale), 0, Math.PI * 2); ctx.fill();
    if (fb.atmosphere) {
      ctx.strokeStyle = 'rgba(140,190,255,0.35)';
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(5, (fb.radius + atmosphereTop(fb)) / scale), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = '#cfe0ff';
    ctx.font = '12px system-ui';
    ctx.fillText(fb.name, cx + 8, cy - 8);
    // children
    const tmp = { pos: new Vector3(), vel: new Vector3() };
    for (const k of idx.children.get(focus) ?? []) {
      const path = orbitPath(k);
      ctx.strokeStyle = k.id === target ? 'rgba(255,200,80,0.8)' : 'rgba(180,200,255,0.22)';
      ctx.beginPath();
      path.forEach((p, i) => { const [x, y] = P(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
      bodyStateRel(idx, k.id, w.t, tmp);
      const [x, y] = P(tmp.pos);
      ctx.fillStyle = rgb(k.color);
      ctx.beginPath(); ctx.arc(x, y, Math.max(3, k.radius / scale), 0, Math.PI * 2); ctx.fill();
      if (k.id === target) { ctx.strokeStyle = '#ffc850'; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = '#b8c8e8';
      ctx.fillText(k.name, x + 8, y - 6);
      const ks = idx.soi.get(k.id)!;
      if (ks / scale > 6) { ctx.strokeStyle = 'rgba(120,160,255,0.18)'; ctx.beginPath(); ctx.arc(x, y, ks / scale, 0, Math.PI * 2); ctx.stroke(); }
    }
    // vessels
    for (const vs of w.vessels) {
      if (vs.destroyed || vs.body !== focus || !vs.derived.hasControl && vs.id !== w.activeId) continue;
      const el = elements(vs.pos, vs.vel, idx.get(vs.body).mu);
      const mine = vs.id === w.activeId;
      const pts = sampleConic(vs.pos, vs.vel, idx.get(vs.body).mu, 240, Number.isFinite(soi ?? NaN) ? (soi as number) : Infinity);
      ctx.strokeStyle = mine ? '#6dff9a' : 'rgba(109,255,154,0.4)';
      ctx.lineWidth = mine ? 2 : 1;
      ctx.beginPath();
      pts.forEach((p, i) => { const [x, y] = P(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
      ctx.lineWidth = 1;
      const [x, y] = P(vs.pos);
      ctx.fillStyle = mine ? '#6dff9a' : '#a8d8b8';
      ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 5, y + 5); ctx.lineTo(x - 5, y + 5); ctx.closePath(); ctx.fill();
      if (mine && el.bound) {
        const pe = el.evec.clone().normalize().multiplyScalar(el.rp);
        const ap = el.evec.clone().normalize().multiplyScalar(-el.ra);
        for (const [p, label] of [[pe, 'Pe'], [ap, 'Ap']] as const) {
          const [px, py] = P(p);
          ctx.fillStyle = '#ffd36b';
          ctx.fillRect(px - 3, py - 3, 6, 6);
          ctx.fillText(`${label} ${fmtDist(label === 'Pe' ? el.rp - fb.radius : el.ra - fb.radius)}`, px + 8, py + 4);
        }
      }
    }
    void tick;
  });

  // ---- interaction
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef(0);
  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
    if (pts.current.size === 2) { const [a, b] = [...pts.current.values()]; pinch.current = Math.hypot(a.x - b.x, a.y - b.y); }
  };
  const onMove = (e: React.PointerEvent) => {
    const p = pts.current.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current > 0) view.current.scale = Math.max(1, view.current.scale * (pinch.current / d));
      pinch.current = d;
      setTick((n) => n + 1);
    } else {
      view.current.panX += dx; view.current.panY += dy;
      if (drag.current && Math.hypot(e.clientX - drag.current.x, e.clientY - drag.current.y) > 5) drag.current.moved = true;
      setTick((n) => n + 1);
    }
  };
  const onUp = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId);
    pinch.current = 0;
    const d = drag.current;
    if (d && !d.moved && pts.current.size === 0) {
      // pick the nearest child body
      const c = ref.current!;
      const r = c.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const { scale, panX, panY } = view.current;
      let best: string | null = null;
      let bd = 26;
      const tmp = { pos: new Vector3(), vel: new Vector3() };
      for (const k of idx.children.get(focus) ?? []) {
        bodyStateRel(idx, k.id, w.t, tmp);
        const dd = Math.hypot(r.width / 2 + panX + tmp.pos.x / scale - mx, r.height / 2 + panY + tmp.pos.z / scale - my);
        if (dd < bd) { bd = dd; best = k.id; }
      }
      if (best) setTarget(best);
    }
    drag.current = null;
  };
  const onWheel = (e: React.WheelEvent) => {
    view.current.scale = Math.max(1, view.current.scale * Math.exp(e.deltaY * 0.0012));
    setTick((n) => n + 1);
  };

  const tb = target ? idx.get(target) : null;
  const tvec = tb && v && v.body === tb.parent ? (() => { const s = { pos: new Vector3(), vel: new Vector3() }; bodyStateRel(idx, tb.id, w.t, s); return s.pos.distanceTo(v.pos); })() : null;
  const canPlan = !!(tb && v && tb.parent === v.body);

  return (
    <div className="overlay map">
      <canvas
        ref={ref} className="map-canvas" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}
      />
      <div className="map-top">
        <button className="btn" onClick={onClose}>✕ Close map</button>
        <div className="chips">
          {idx.get(focus).parent && <button className="chip" onClick={() => setFocus(idx.get(focus).parent!)}>↑ {idx.get(idx.get(focus).parent!).name}</button>}
          {v && v.body !== focus && <button className="chip" onClick={() => setFocus(v.body)}>⌖ {idx.get(v.body).name}</button>}
          {(idx.children.get(focus) ?? []).map((k) => (
            <button key={k.id} className={`chip ${target === k.id ? 'on' : ''}`} onClick={() => { setTarget(k.id); }} onDoubleClick={() => setFocus(k.id)}>{k.name}</button>
          ))}
        </div>
      </div>
      <div className="panel map-info">
        {v && (() => {
          const body = idx.get(v.body);
          const el = elements(v.pos, v.vel, body.mu);
          return (
            <>
              <b>{v.name}</b> around {body.name}
              <div className="small dim">Pe {fmtDist(el.rp - body.radius)} · Ap {el.bound ? fmtDist(el.ra - body.radius) : 'open'} · e {el.e.toFixed(3)} · inc {((el.inclination * 180) / Math.PI).toFixed(1)}°</div>
              {el.bound && <div className="small dim">Period {fmtTime(el.period)} · to Pe {fmtTime(el.tPe)} · to Ap {fmtTime(el.tAp)}</div>}
              {events && (
                <div className={`small ${events.kind === 'impact' ? 'bad' : 'good'}`}>
                  {events.kind === 'encounter' && `Encounter with ${idx.get(events.body).name} in ${fmtTime(events.dt)}`}
                  {events.kind === 'escape' && `Leaves the sphere of influence in ${fmtTime(events.dt)}`}
                  {events.kind === 'impact' && `Impact with ${body.name} in ${fmtTime(events.dt)}`}
                </div>
              )}
            </>
          );
        })()}
        {tb && (
          <div className="target">
            <hr />
            <b>{tb.name}</b> <span className="dim small">({tb.provenance} data)</span>
            <div className="small dim">Radius {fmtDist(tb.radius)} · gravity {surfaceGravity(tb).toFixed(2)} m/s² · {tb.gasGiant ? 'gas giant, no surface' : tb.atmosphere ? `atmosphere ${atmosphereTop(tb) / 1000 | 0} km` : 'airless'}</div>
            {tb.blurb && <div className="small">{tb.blurb}</div>}
            {tvec !== null && <div className="small dim">Distance now {fmtDist(tvec)}</div>}
            <div className="row wrap">
              <button className="btn sm" onClick={() => setFocus(tb.id)}>Focus</button>
              <button
                className="btn sm primary" disabled={!canPlan}
                onClick={() => {
                  if (!v) return;
                  const err = startAutopilot(w, v, 'transfer', { target: tb.id });
                  if (err) toast(err, 'warn'); else { toast(`Transfer to ${tb.name} engaged.`, 'good'); onClose(); }
                }}
              >Auto-transfer</button>
              <button className="btn sm" onClick={() => { w.assists.orbitGuidance = true; toast('Orbit guidance enabled.'); }}>Enable guidance</button>
            </div>
            {!canPlan && <div className="small dim">Auto-transfer works for bodies that orbit the same parent as your vessel. Climb out of the current sphere of influence first.</div>}
          </div>
        )}
        <div className="small dim">Drag to pan · wheel/pinch zoom · tap a body · double-tap a chip to focus.</div>
      </div>
    </div>
  );
}

