import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addRadial, addStack, adjustRadial, analyze, autoStage, canAttachRadial, canAttachStack, cloneDesign, Design, emptyDesign,
  freeStackNodes, groupMembers, instOf, moveRadial, moveStack, removePart, StageAction, subtreeOf,
} from '../sim/design';
import { PARTS, PartCategory, PartDef, partDef } from '../sim/parts';
import { EditorScene } from '../render/editorScene';
import { SavedDesign } from '../sim/save';
import { fmtForce, fmtMass, fmtSpeed } from './format';
import { loadDesigns, upsertDesign } from './storage';

interface Props {
  initial?: Design;
  designId: string | null;
  onBack: () => void;
  onLaunch: (d: Design, start: 'pad' | 'leo') => void;
}

const CATS: PartCategory[] = ['Command', 'Fuel', 'Engines', 'Boosters', 'Structural', 'Recovery', 'Special'];
const KIND_LABEL: Record<string, string> = { ignite: 'Ignite', detach: 'Separate', jettison: 'Jettison', chute: 'Arm chute', legs: 'Deploy legs' };

interface Target { part: number; node: 'top' | 'bottom' }

export function Editor({ initial, designId, onBack, onLaunch }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<EditorScene | null>(null);
  const [design, setDesignState] = useState<Design>(() => initial ? cloneDesign(initial) : emptyDesign('New rocket'));
  const [past, setPast] = useState<Design[]>([]);
  const [future, setFuture] = useState<Design[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [cat, setCat] = useState<PartCategory>('Command');
  const [sym, setSym] = useState(1);
  const [moving, setMoving] = useState<number | null>(null);
  const [customStages, setCustomStages] = useState(false);
  const [msg, setMsg] = useState('');
  const [dirty, setDirty] = useState(false);
  const [id, setId] = useState<string | null>(designId);
  const [panel, setPanel] = useState<'parts' | 'info'>('parts');
  const [saved, setSaved] = useState<SavedDesign[] | null>(null);
  const [wide, setWide] = useState(window.innerWidth > 900);
  const [hoverStage, setHoverStage] = useState<number | null>(null);

  useEffect(() => {
    const onR = () => setWide(window.innerWidth > 900);
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);

  // ---- scene lifecycle
  useEffect(() => {
    const s = new EditorScene(canvasRef.current!);
    sceneRef.current = s;
    s.resize();
    const ro = new ResizeObserver(() => s.resize());
    ro.observe(canvasRef.current!);
    s.setDesign(design, true);
    return () => { ro.disconnect(); s.dispose(); sceneRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => analyze(design), [design]);
  const freeNodes = useMemo(() => freeStackNodes(design), [design]);

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.setDesign(design);
    s.setMarkers(freeNodes, target, design);
    s.highlight(new Set([...(selected != null ? groupMembers(design, selected) : []), ...(hoverStage != null ? (design.stages[hoverStage] ?? []).map((a) => a.part) : [])]));
  }, [design, freeNodes, target, selected, hoverStage]);

  const commit = useCallback((next: Design, stagesTouched = false) => {
    setPast((p) => [...p.slice(-60), design]);
    setFuture([]);
    const d = cloneDesign(next);
    if (!customStages && !stagesTouched) d.stages = autoStage(d);
    setDesignState(d);
    setDirty(true);
  }, [design, customStages]);

  const undo = () => {
    if (!past.length) return;
    setFuture((f) => [design, ...f]);
    setDesignState(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
    setSelected(null);
  };
  const redo = () => {
    if (!future.length) return;
    setPast((p) => [...p, design]);
    setDesignState(future[0]);
    setFuture((f) => f.slice(1));
  };

  // ---- default attach target: continue the stack where the last part went
  const effectiveTarget = useMemo<Target | null>(() => {
    if (target && freeNodes.some((n) => n.part === target.part && n.node === target.node)) return target;
    if (design.parts.length === 0) return null;
    const bottoms = freeNodes.filter((n) => n.node === 'bottom');
    if (bottoms.length) return { part: bottoms[bottoms.length - 1].part, node: 'bottom' };
    return freeNodes.length ? { part: freeNodes[0].part, node: freeNodes[0].node } : null;
  }, [target, freeNodes, design]);

  const addPart = (def: PartDef) => {
    setMsg('');
    if (def.attach === 'stack') {
      if (design.parts.length === 0) {
        const m = addStack(design, null, 'bottom', def.id);
        if (m) { commit(m.design); setSelected(m.added[0]); setTarget(def.bottomDia ? { part: m.added[0], node: 'bottom' } : null); }
        return;
      }
      const t = effectiveTarget;
      if (!t) { setMsg('No free attachment node. Remove a part or select a node.'); return; }
      const m = addStack(design, t.part, t.node, def.id);
      if (!m) { setMsg(`${def.name} doesn't fit that node (${def.topDia ?? '—'} m / ${def.bottomDia ?? '—'} m).`); return; }
      commit(m.design);
      const id2 = m.added[0];
      setSelected(id2);
      const cont: 'top' | 'bottom' = t.node;
      const nextNode = (cont === 'bottom' ? def.bottomDia : def.topDia) ? cont : null;
      setTarget(nextNode ? { part: id2, node: nextNode } : null);
    } else {
      const host = selected != null && canAttachRadial(design, selected, def) ? selected : null;
      if (host == null) { setMsg('Select a tank or capsule first, then add this side part.'); return; }
      const m = addRadial(design, host, def.id, sym, 0);
      if (!m) { setMsg('That part cannot attach there.'); return; }
      commit(m.design);
      setSelected(m.added[0]);
    }
  };

  const compatible = (def: PartDef): boolean => {
    if (design.parts.length === 0) return def.attach === 'stack';
    if (def.attach === 'radial') return selected != null && canAttachRadial(design, selected, def);
    const t = effectiveTarget;
    return !!t && canAttachStack(design, t.part, t.node, def);
  };

  const onCanvasPointer = useRef<{ x: number; y: number; moved: boolean; pts: Map<number, { x: number; y: number }>; pinch: number }>({ x: 0, y: 0, moved: false, pts: new Map(), pinch: 0 });
  const down = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const st = onCanvasPointer.current;
    st.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    st.x = e.clientX; st.y = e.clientY; st.moved = false;
    if (st.pts.size === 2) { const [a, b] = [...st.pts.values()]; st.pinch = Math.hypot(a.x - b.x, a.y - b.y); }
  };
  const move = (e: React.PointerEvent) => {
    const st = onCanvasPointer.current;
    const p = st.pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(e.clientX - st.x, e.clientY - st.y) > 6) st.moved = true;
    if (st.pts.size === 2) {
      const [a, b] = [...st.pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (st.pinch > 0) sceneRef.current?.zoom(st.pinch / d);
      st.pinch = d;
    } else if (st.moved) {
      if (e.shiftKey || e.buttons === 2) sceneRef.current?.pan(dy); else sceneRef.current?.orbit(dx, dy);
    }
  };
  const up = (e: React.PointerEvent) => {
    const st = onCanvasPointer.current;
    st.pts.delete(e.pointerId);
    if (!st.moved && st.pts.size === 0) {
      const pk = sceneRef.current?.pick(e.clientX, e.clientY);
      if (pk?.kind === 'node') {
        if (moving != null) {
          const next = moveStack(design, moving, pk.part, pk.node);
          if (next) { commit(next); setMsg(''); } else setMsg('That node does not fit the moved part (sizes or orientation differ).');
          setMoving(null);
        } else setTarget({ part: pk.part, node: pk.node });
      } else if (pk?.kind === 'part') {
        if (moving != null) {
          const def = partDef(instOf(design, moving).partId);
          if (def.attach === 'radial') {
            const next = moveRadial(design, moving, pk.id);
            if (next) commit(next); else setMsg('Side parts mount to tanks and capsules.');
            setMoving(null);
          } else setSelected(pk.id);
        } else setSelected(pk.id);
      } else setSelected(null);
    }
  };

  // ---- actions on selection
  const sel = selected != null && design.parts.some((p) => p.id === selected) ? instOf(design, selected) : null;
  const selDef = sel ? partDef(sel.partId) : null;
  const remove = () => {
    if (!sel) return;
    const count = new Set([...groupMembers(design, sel.id).flatMap((m) => [...subtreeOf(design, m)])]).size;
    if (sel.id === design.root && design.parts.length > 1 && !confirm('Remove the root part and everything attached? This clears the whole rocket.')) return;
    if (count > 1 && sel.id !== design.root && !confirm(`Remove ${selDef!.name} and ${count - 1} attached part(s)?`)) return;
    commit(removePart(design, sel.id));
    setSelected(null);
    setTarget(null);
  };

  // ---- staging edits
  const editStages = (fn: (s: StageAction[][]) => StageAction[][]) => {
    const d = cloneDesign(design);
    d.stages = fn(d.stages.map((s) => s.map((a) => ({ ...a }))));
    setCustomStages(true);
    commit(d, true);
  };
  const moveAction = (si: number, ai: number, dir: -1 | 1) => editStages((st) => {
    const a = st[si].splice(ai, 1)[0];
    const to = si + dir;
    if (to < 0) st.unshift([a]);
    else if (to >= st.length) st.push([a]);
    else st[to].push(a);
    return st.filter((s) => s.length);
  });
  const moveStage = (si: number, dir: -1 | 1) => editStages((st) => {
    const to = si + dir;
    if (to < 0 || to >= st.length) return st;
    [st[si], st[to]] = [st[to], st[si]];
    return st;
  });
  const partName = (id2: number) => { const p = design.parts.find((q) => q.id === id2); return p ? partDef(p.partId).name : '?'; };

  const save = async () => {
    const name = prompt('Name this design', design.name)?.trim();
    if (!name) return;
    const d = cloneDesign(design);
    d.name = name;
    setDesignState(d);
    const key = await upsertDesign(id, d);
    setId(key);
    setDirty(false);
    setMsg(`Saved “${name}”.`);
  };

  const guardUnsaved = () => !dirty || confirm('Discard unsaved changes?');

  const parts = PARTS.filter((p) => p.category === cat);

  const showParts = wide || panel === 'parts';
  const showInfo = wide || panel === 'info';

  return (
    <div className="editor">
      <canvas ref={canvasRef} className="game-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onWheel={(e) => { e.preventDefault(); sceneRef.current?.zoom(Math.exp(e.deltaY * 0.0012)); }} onContextMenu={(e) => e.preventDefault()} />

      {showParts && (
        <div className="ed-side ed-left panel">
          <div className="row"><button className="btn sm" onClick={() => { if (guardUnsaved()) onBack(); }}>← Menu</button><b style={{ flex: 1 }}>{design.name}{dirty ? ' •' : ''}</b></div>
          <div className="cat-tabs">{CATS.map((c) => <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}</div>
          {effectiveTarget ? (
            <div className="small dim">Attaching to {partDef(instOf(design, effectiveTarget.part).partId).name} · {effectiveTarget.node} node. Tap a blue dot to choose another.</div>
          ) : <div className="small dim">{design.parts.length ? 'No free stack node.' : 'Pick a first part (a command pod works well).'}</div>}
          {msg && <div className="small" style={{ color: 'var(--warn)' }}>{msg}</div>}
          {parts.map((p) => {
            const ok = compatible(p);
            return (
              <button key={p.id} className="btn part-btn" disabled={!ok} title={p.desc} onClick={() => addPart(p)}>
                <span>{p.name}</span>
                <span className="dim">{p.kind === 'engine' || p.kind === 'srb' ? fmtForce(p.thrust ?? 0) : p.fuel ? fmtMass(p.fuel) : fmtMass(p.mass)}</span>
              </button>
            );
          })}
          {cat === 'Boosters' || cat === 'Recovery' ? (
            <div className="row small">Symmetry
              {[1, 2, 3, 4, 6].map((n) => <button key={n} className={`chip ${sym === n ? 'on' : ''}`} onClick={() => setSym(n)}>{n}×</button>)}
            </div>
          ) : null}
          <div className="small dim">Side parts (boosters, legs, parachutes) attach to the selected tank or capsule. Symmetry places copies evenly around it.</div>
        </div>
      )}

      {showInfo && (
        <div className="ed-side ed-right panel">
          <div className="row wrap">
            <button className="btn sm" disabled={!past.length} onClick={undo}>↶ Undo</button>
            <button className="btn sm" disabled={!future.length} onClick={redo}>↷ Redo</button>
            <button className="btn sm" onClick={() => void save()}>Save</button>
            <button className="btn sm" onClick={async () => setSaved(await loadDesigns())}>Load</button>
            <button className="btn sm" onClick={() => { if (design.parts.length && !confirm('Start a new design? Unsaved changes are lost.')) return; setDesignState(emptyDesign('New rocket')); setPast([]); setFuture([]); setSelected(null); setTarget(null); setId(null); setDirty(false); setCustomStages(false); }}>New</button>
          </div>
          <div className="trow"><span>Parts</span><b>{design.parts.length}</b></div>
          <div className="trow"><span>Mass</span><b>{fmtMass(stats.mass)}</b></div>
          <div className="trow"><span>Height</span><b>{stats.height.toFixed(1)} m</b></div>
          <div className="trow"><span>Crew</span><b>{stats.crew}</b></div>
          <div className="trow"><span>Δv (vacuum)</span><b>{fmtSpeed(stats.totalDvVac)}</b></div>
          <div className="trow"><span>Liftoff TWR</span><b>{stats.liftoffTwr.toFixed(2)}</b></div>
          {stats.warnings.map((w) => <div key={w} className="small bad">⚠ {w}</div>)}
          {stats.liftoffTwr > 0 && stats.liftoffTwr < 1.05 && <div className="small" style={{ color: 'var(--warn)' }}>⚠ Liftoff TWR is below 1.05 — this will not leave the pad on Earth.</div>}

          {sel && selDef && (
            <div className="panel" style={{ padding: 8 }}>
              <b>{selDef.name}</b>
              <div className="small dim">{selDef.desc}</div>
              <div className="small">Mass {fmtMass(selDef.mass)}{selDef.fuel ? ` + ${fmtMass(selDef.fuel)} propellant` : ''}{selDef.thrust ? ` · ${fmtForce(selDef.thrust)} · Isp ${selDef.ispVac}/${selDef.ispAtm}s` : ''}</div>
              <div className="row wrap">
                <button className="btn sm" onClick={remove}>Delete</button>
                {sel.id !== design.root && <button className="btn sm" onClick={() => { setMoving(sel.id); setMsg(selDef.attach === 'stack' ? 'Tap a blue node to re-attach the selected part and everything below it.' : 'Tap a tank or capsule to move this side part.'); }}>Move</button>}
                {selDef.attach === 'radial' && (
                  <>
                    <button className="btn sm" onClick={() => commit(adjustRadial(design, sel.id, -Math.PI / 12, 0))}>⟲ 15°</button>
                    <button className="btn sm" onClick={() => commit(adjustRadial(design, sel.id, Math.PI / 12, 0))}>⟳ 15°</button>
                    <button className="btn sm" onClick={() => commit(adjustRadial(design, sel.id, 0, 0.25))}>↑ 0.25 m</button>
                    <button className="btn sm" onClick={() => commit(adjustRadial(design, sel.id, 0, -0.25))}>↓ 0.25 m</button>
                  </>
                )}
              </div>
              {moving != null && <button className="btn sm" onClick={() => { setMoving(null); setMsg(''); }}>Cancel move</button>}
            </div>
          )}

          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>Staging</b>
            <button className="btn sm" onClick={() => { setCustomStages(false); const d = cloneDesign(design); d.stages = autoStage(d); setPast((p) => [...p, design]); setDesignState(d); }}>Auto</button>
          </div>
          <div className="small dim">Stage 1 fires first. Reorder actions with the arrows.</div>
          {design.stages.map((s, si) => (
            <div key={si} className="stage-edit" onMouseEnter={() => setHoverStage(si)} onMouseLeave={() => setHoverStage(null)} onClick={() => setHoverStage(hoverStage === si ? null : si)}>
              <div className="row"><b>Stage {si + 1}</b><span style={{ flex: 1 }} />
                <button className="btn sm" onClick={(e) => { e.stopPropagation(); moveStage(si, -1); }}>↑</button>
                <button className="btn sm" onClick={(e) => { e.stopPropagation(); moveStage(si, 1); }}>↓</button></div>
              {s.map((a, ai) => (
                <div key={ai} className="row small">
                  <span style={{ flex: 1 }}>{KIND_LABEL[a.kind]} · {partName(a.part)}</span>
                  <button className="btn sm" onClick={(e) => { e.stopPropagation(); moveAction(si, ai, -1); }}>↑</button>
                  <button className="btn sm" onClick={(e) => { e.stopPropagation(); moveAction(si, ai, 1); }}>↓</button>
                </div>
              ))}
            </div>
          ))}
          <div className="row wrap">
            <button className="btn primary" disabled={!stats.hasControl || !design.parts.length} onClick={() => onLaunch(design, 'pad')}>Launch from pad</button>
            <button className="btn" disabled={!stats.hasControl || !design.parts.length} onClick={() => onLaunch(design, 'leo')}>Start in orbit</button>
          </div>
        </div>
      )}

      {!wide && (
        <div className="ed-bottom">
          <button className={`btn sm ${panel === 'parts' ? 'primary' : ''}`} onClick={() => setPanel('parts')}>Parts</button>
          <button className={`btn sm ${panel === 'info' ? 'primary' : ''}`} onClick={() => setPanel('info')}>Info &amp; staging</button>
        </div>
      )}

      {saved && (
        <div className="overlay center" onClick={() => setSaved(null)}>
          <div className="panel big" onClick={(e) => e.stopPropagation()}>
            <h2>Saved designs</h2>
            {saved.length === 0 && <p className="dim">Nothing saved yet.</p>}
            {saved.map((d) => (
              <div className="row" key={d.id} style={{ marginBottom: 6 }}>
                <span style={{ flex: 1 }}>{d.design.name}</span>
                <button className="btn sm" onClick={() => {
                  if (!guardUnsaved()) return;
                  setDesignState(cloneDesign(d.design)); setId(d.id); setPast([]); setFuture([]); setSelected(null); setTarget(null); setDirty(false); setCustomStages(true); setSaved(null);
                  setTimeout(() => sceneRef.current?.setDesign(d.design, true), 0);
                }}>Load</button>
              </div>
            ))}
            <button className="btn" onClick={() => setSaved(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
