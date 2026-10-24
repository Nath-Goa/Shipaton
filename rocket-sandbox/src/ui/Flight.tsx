import { useCallback, useEffect, useRef, useState } from 'react';
import { Quaternion, Vector3 } from 'three';
import { SOL } from '../sim/bodies';
import { Design } from '../sim/design';
import { boardVessel, canEva, plantFlag, startEva, stepEva, boardRange } from '../sim/eva';
import { activateStage, armChutes, chutesState, toggleLegs } from '../sim/flight';
import { startAutopilot, stopAutopilot } from '../sim/guidance';
import { advance, createWorld, spawnInOrbit, spawnOnPad, switchVessel, updateWarpCap, controllableVessels } from '../sim/sim';
import { deserializeWorld, serializeWorld, Settings, WorldSave } from '../sim/save';
import { computeTelemetry, Telemetry } from '../sim/telemetry';
import { SasMode, Vessel } from '../sim/vessel';
import { activeVessel, WARP_LEVELS, World } from '../sim/world';
import { GameRenderer, QualityLevel } from '../render/scene';
import { fmtDist, fmtMass, fmtPressure, fmtSpeed, fmtTime } from './format';
import { Controls, isTouchDevice } from './input';
import { GalaxyMap } from './GalaxyMap';
import { MapView } from './MapView';
import { NavBall, NavBallData } from './NavBall';
import { Sound } from './sound';
import { readSave, writeSave } from './storage';
import { Assists } from '../sim/world';
import { partDef } from '../sim/parts';

export type FlightInit =
  | { kind: 'new'; design: Design; start: 'pad' | 'leo' }
  | { kind: 'load'; save: WorldSave };

interface Props {
  init: FlightInit;
  settings: Settings;
  onExit: () => void;
  onEditor: (design: Design) => void;
}

interface Toast { id: number; text: string; level: string }

interface Hud {
  tel: Telemetry | null;
  nav: NavBallData | null;
  sas: SasMode;
  warp: number;
  warpCap: number;
  warpReason: string;
  apNote: string | null;
  stages: { label: string; count: number }[];
  destroyed: string | null;
  landed: boolean;
  evaOn: boolean;
  evaRange: number;
  canEva: boolean;
  hasLegs: boolean;
  chutes: string;
  assists: Assists;
  fps: number;
  chunks: number;
  vessels: number;
  hasJump: boolean;
  quality: QualityLevel;
}

const KIND_LABEL: Record<string, string> = { ignite: 'Ignite', detach: 'Separate', jettison: 'Jettison fairing', chute: 'Arm parachutes', legs: 'Deploy legs' };

function pickQuality(s: Settings): QualityLevel {
  if (s.graphics !== 'auto') return s.graphics;
  const mobile = isTouchDevice() || Math.min(window.innerWidth, window.innerHeight) < 600;
  return mobile ? 'low' : 'medium';
}

export function Flight({ init, settings, onExit, onEditor }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World | null>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const controls = useRef(new Controls());
  const sound = useRef(new Sound());
  const designRef = useRef<Design | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [overlay, setOverlay] = useState<'none' | 'pause' | 'map' | 'galaxy' | 'assists'>('none');
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const [hidden, setHidden] = useState(false);
  const [stickPos, setStickPos] = useState<{ x: number; y: number } | null>(null);
  const touch = settings.touchControls === 'on' || (settings.touchControls === 'auto' && isTouchDevice());
  const toastId = useRef(1);
  const [, force] = useState(0);

  const toast = useCallback((text: string, level = 'info') => {
    const id = toastId.current++;
    setToasts((t) => [...t.slice(-3), { id, text, level }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const doStage = useCallback(() => {
    const w = worldRef.current;
    const v = w && activeVessel(w);
    if (!w || !v || v.destroyed || w.eva) return;
    sound.current.resume();
    activateStage(w, v);
  }, []);

  const quicksave = useCallback(async () => {
    const w = worldRef.current;
    if (!w) return;
    await writeSave('quicksave', serializeWorld(w, 'Quicksave'));
    toast('Quicksaved.', 'good');
  }, [toast]);

  const restoreFrom = useCallback((save: WorldSave | undefined) => {
    if (!save) { toast('No save found.', 'warn'); return; }
    const w = deserializeWorld(save);
    if (!w) { toast('That save could not be read.', 'bad'); return; }
    worldRef.current = w;
    setOverlay('none');
  }, [toast]);

  const quickload = useCallback(async () => { restoreFrom(await readSave('quicksave')); }, [restoreFrom]);

  const restartFlight = useCallback(() => {
    if (init.kind !== 'new') { onExit(); return; }
    const w = createWorld(SOL);
    if (init.start === 'pad') spawnOnPad(w, init.design, 'earth'); else spawnInOrbit(w, init.design, 'earth', 400e3);
    worldRef.current = w;
    setOverlay('none');
  }, [init, onExit]);

  // ------------------------------------------------------------------ main setup
  useEffect(() => {
    const canvas = canvasRef.current!;
    const c = controls.current;
    let w: World;
    if (init.kind === 'new') {
      designRef.current = init.design;
      w = createWorld(SOL);
      if (init.start === 'pad') spawnOnPad(w, init.design, 'earth'); else spawnInOrbit(w, init.design, 'earth', 400e3);
    } else {
      const loaded = deserializeWorld(init.save);
      if (!loaded) { onExit(); return; }
      w = loaded;
    }
    worldRef.current = w;
    const quality = pickQuality(settings);
    const gr = new GameRenderer(canvas, quality);
    rendererRef.current = gr;
    if (location.search.includes('debug')) (window as unknown as { __game: unknown }).__game = { world: () => worldRef.current, gr };
    sound.current.enabled = settings.sound;
    const detach = c.attach();

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      gr.resize(r.width, r.height, window.devicePixelRatio || 1);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ---- pointer camera
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const pd = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      sound.current.resume();
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
    };
    const pm = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pointers.size === 1) {
        gr.cam.yaw -= dx * 0.0055;
        gr.cam.pitch = Math.max(-1.45, Math.min(1.5, gr.cam.pitch + dy * 0.0055));
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) gr.cam.zoom = Math.max(0.15, Math.min(2e6, gr.cam.zoom * (pinch / d)));
        pinch = d;
      }
    };
    const pu = (e: PointerEvent) => { pointers.delete(e.pointerId); pinch = 0; };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      gr.cam.zoom = Math.max(0.15, Math.min(2e6, gr.cam.zoom * Math.exp(e.deltaY * 0.0012)));
    };
    canvas.addEventListener('pointerdown', pd);
    canvas.addEventListener('pointermove', pm);
    canvas.addEventListener('pointerup', pu);
    canvas.addEventListener('pointercancel', pu);
    canvas.addEventListener('wheel', wheel, { passive: false });

    // ---- discrete keys
    const setSas = (mode: SasMode) => {
      const world = worldRef.current!;
      const v = activeVessel(world);
      if (!v) return;
      v.sas.mode = mode;
      if (mode === 'hold') v.sas.hold.copy(v.quat);
      if (v.ap) stopAutopilot(world, v);
    };
    const offPress = c.onPress((code) => {
      const world = worldRef.current!;
      const v = activeVessel(world);
      if (overlayRef.current === 'pause') { if (code === 'Escape') setOverlay('none'); return; }
      switch (code) {
        case 'Escape': setOverlay(overlayRef.current === 'none' ? 'pause' : 'none'); break;
        case 'Space': doStage(); break;
        case 'KeyM': setOverlay(overlayRef.current === 'map' ? 'none' : 'map'); break;
        case 'KeyJ': setOverlay(overlayRef.current === 'galaxy' ? 'none' : 'galaxy'); break;
        case 'KeyC': gr.cam.mode = gr.cam.mode === 'horizon' ? 'vessel' : 'horizon'; break;
        case 'KeyT': if (v) { world.assists.stability = !world.assists.stability; toast(`Stability assist ${world.assists.stability ? 'on' : 'off'}`); } break;
        case 'Digit1': setSas('hold'); break;
        case 'Digit2': setSas('prograde'); break;
        case 'Digit3': setSas('retrograde'); break;
        case 'Digit4': setSas('radialOut'); break;
        case 'Digit5': setSas('radialIn'); break;
        case 'KeyG': if (v) toggleLegs(v); break;
        case 'KeyP': if (v) { armChutes(v); toast('Parachutes armed.'); } break;
        case 'Tab': switchVessel(world); break;
        case 'KeyZ': if (v) { c.touchThrottle = null; v.throttle = 1; } break;
        case 'KeyX': if (v) { c.touchThrottle = null; v.throttle = 0; } break;
        case 'Period': world.warpIndex = Math.min(world.warpCap, world.warpIndex + 1); break;
        case 'Comma': world.warpIndex = Math.max(0, world.warpIndex - 1); break;
        case 'Slash': world.warpIndex = 0; break;
        case 'KeyF':
          if (world.eva) plantFlag(world);
          else if (v) startEva(world, v);
          break;
        case 'KeyB': if (world.eva) boardVessel(world); break;
        case 'KeyH': setHidden((h) => !h); break;
        case 'F5': void quicksave(); break;
        case 'F9': void quickload(); break;
        default: break;
      }
    });

    // ---- loop
    let raf = 0;
    let last = performance.now();
    let hudT = 0;
    let capT = 0;
    let saveT = 0;
    let fpsAcc = 0;
    let fpsN = 0;
    let fps = 60;
    let slow = 0;
    let curQuality = quality;
    const tmpQ = new Quaternion();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dtReal = Math.min(0.1, (now - last) / 1000);
      last = now;
      const world = worldRef.current!;
      world.paused = overlayRef.current === 'pause';
      fpsAcc += dtReal; fpsN++;
      if (fpsAcc > 0.5) {
        fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
        if (settings.graphics === 'auto') {
          slow = fps < 24 ? slow + 1 : fps > 50 ? Math.max(0, slow - 1) : slow;
          if (slow >= 4 && curQuality !== 'low') { curQuality = curQuality === 'high' ? 'medium' : 'low'; gr.setQuality(curQuality); resize(); slow = 0; }
        }
      }
      const v = activeVessel(world);
      // ----- controls
      if (!world.paused) {
        if (world.eva) {
          stepEva(world, Math.min(dtReal, 0.05) * Math.max(1, 1), {
            forward: (c.held('KeyW', 'ArrowUp') ? 1 : 0) - (c.held('KeyS', 'ArrowDown') ? 1 : 0) + c.stick.y,
            turn: (c.held('KeyD', 'ArrowRight') ? 1 : 0) - (c.held('KeyA', 'ArrowLeft') ? 1 : 0) + c.stick.x,
            strafe: (c.held('KeyE') ? 1 : 0) - (c.held('KeyQ') ? 1 : 0),
            run: c.held('ShiftLeft', 'ShiftRight'),
            jump: c.held('Space'),
          });
        } else if (v && !v.destroyed) {
          if (c.touchThrottle !== null) v.throttle = c.touchThrottle;
          const dth = (c.held('ShiftLeft', 'ShiftRight') ? 1 : 0) - (c.held('ControlLeft', 'ControlRight') ? 1 : 0);
          if (dth) { c.touchThrottle = null; v.throttle = Math.max(0, Math.min(1, v.throttle + dth * dtReal * 0.7)); }
          let sy = (c.held('KeyW', 'ArrowUp') ? 1 : 0) - (c.held('KeyS', 'ArrowDown') ? 1 : 0) + c.stick.y;
          let sx = (c.held('KeyD', 'ArrowRight') ? 1 : 0) - (c.held('KeyA', 'ArrowLeft') ? 1 : 0) + c.stick.x;
          if (settings.invertPitch) sy = -sy;
          const roll = (c.held('KeyE') ? 1 : 0) - (c.held('KeyQ') ? 1 : 0) + c.roll;
          const cam = gr.camera;
          const n = new Vector3(0, 1, 0).applyQuaternion(v.quat);
          const f = new Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
          const r = new Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
          f.addScaledVector(n, -f.dot(n));
          r.addScaledVector(n, -r.dot(n));
          if (f.lengthSq() < 1e-4) f.copy(new Vector3(0, 1, 0).applyQuaternion(cam.quaternion)).addScaledVector(n, 0);
          f.normalize(); r.normalize();
          const m = f.multiplyScalar(sy).addScaledVector(r, sx);
          const axis = new Vector3().crossVectors(n, m);
          const ab = axis.applyQuaternion(tmpQ.copy(v.quat).invert());
          const mag = Math.hypot(sx, sy);
          if (mag > 1) ab.divideScalar(mag);
          v.input.pitch = ab.x;
          v.input.yaw = -ab.z;
          v.input.roll = Math.max(-1, Math.min(1, ab.y + roll));
        }
      }
      // ----- simulate
      advance(world, dtReal);
      if (world.events.length) {
        const ev = world.events.splice(0);
        gr.handleEvents(world, ev);
        for (const e of ev) {
          if (e.type === 'msg' && e.text) toast(e.text, e.level);
          else if (e.type === 'explosion') sound.current.boom(Math.min(2, e.size / 8));
          else if (e.type === 'stage' || e.type === 'separation') sound.current.clunk();
          else if (e.type === 'touchdown') toast(e.text, 'good');
        }
      }
      capT += dtReal;
      if (capT > 0.25) { capT = 0; updateWarpCap(world); }
      saveT += dtReal;
      if (saveT > 20 && v && !v.destroyed) {
        saveT = 0;
        void writeSave('autosave', serializeWorld(world, 'Autosave'));
      }
      gr.render(world, dtReal);
      // ----- sound
      if (v) {
        const t = computeTelemetryLight(world, v);
        sound.current.update(t.thrust, t.atm, t.speed, world.paused);
      }
      // ----- hud
      hudT += dtReal;
      if (hudT > 0.1) {
        hudT = 0;
        setHud(buildHud(world, fps, gr, curQuality));
      }
    };
    raf = requestAnimationFrame(tick);

    const onVisibility = () => { if (document.hidden && worldRef.current) { const v = activeVessel(worldRef.current); if (v && !v.destroyed) void writeSave('autosave', serializeWorld(worldRef.current, 'Autosave')); } };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      detach();
      offPress();
      canvas.removeEventListener('pointerdown', pd);
      canvas.removeEventListener('pointermove', pm);
      canvas.removeEventListener('pointerup', pu);
      canvas.removeEventListener('pointercancel', pu);
      canvas.removeEventListener('wheel', wheel);
      document.removeEventListener('visibilitychange', onVisibility);
      gr.dispose();
      sound.current.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const w = worldRef.current;
  const v = w ? activeVessel(w) : undefined;
  const setSasBtn = (mode: SasMode) => {
    if (!v || !w) return;
    v.sas.mode = mode;
    if (mode === 'hold') v.sas.hold.copy(v.quat);
    if (v.ap) stopAutopilot(w, v);
  };
  const toggleAssist = (k: keyof Assists) => {
    if (!w) return;
    w.assists[k] = !w.assists[k];
    force((n) => n + 1);
  };
  const runAp = (kind: 'ascent' | 'circularize' | 'deorbit' | 'land') => {
    if (!w || !v) return;
    const err = startAutopilot(w, v, kind);
    if (err) toast(err, 'warn');
  };

  const tel = hud?.tel;
  return (
    <div className="flight" onPointerDown={() => sound.current.resume()}>
      <canvas ref={canvasRef} className="game-canvas" />
      {hud && !hidden && (
        <>
          <div className="hud-top">
            <div className="panel mini">
              <b>{tel?.body ?? '—'}</b> · {tel?.situation}
              {w && <span className="dim"> · T+{fmtTime(tel?.missionTime ?? 0)}</span>}
              {hud.vessels > 1 && <span className="dim"> · {hud.vessels} vessels</span>}
            </div>
            <div className="hud-buttons">
              <button className="btn sm" onClick={() => setOverlay('map')} title="Map (M)">Map</button>
              {hud.hasJump && <button className="btn sm" onClick={() => setOverlay('galaxy')} title="Galaxy map (J)">Galaxy</button>}
              <button className="btn sm" onClick={() => setOverlay('assists')}>Assists</button>
              <button className="btn sm" onClick={() => setOverlay('pause')}>Menu</button>
            </div>
          </div>

          {hud.evaOn ? (
            <div className="panel eva">
              <b>Astronaut</b>
              <div>Vessel {fmtDist(hud.evaRange)} away</div>
              <div className="row">
                <button className="btn" onClick={() => w && plantFlag(w)}>Plant flag (F)</button>
                <button className="btn" disabled={hud.evaRange > 12} onClick={() => w && boardVessel(w)}>Board (B)</button>
              </div>
              <div className="dim small">WASD walk · Space jump · Shift run · Q/E strafe</div>
            </div>
          ) : (
            tel && (
              <>
                <div className="panel tele">
                  <Row k="Altitude" v={fmtDist(tel.alt)} />
                  {Number.isFinite(tel.radar) && tel.radar < 20000 && <Row k="Radar" v={fmtDist(tel.radar)} />}
                  <Row k="Surface speed" v={fmtSpeed(tel.speedSurf)} />
                  <Row k="Orbital speed" v={fmtSpeed(tel.speedOrb)} />
                  <Row k="Vertical" v={fmtSpeed(tel.vSpeed)} />
                  <Row k="Apoapsis" v={Number.isFinite(tel.apo) ? fmtDist(tel.apo) : 'escape'} />
                  <Row k="Periapsis" v={fmtDist(tel.peri)} />
                  {tel.bound && tel.alt > 0 && <Row k="Period" v={fmtTime(tel.period)} />}
                  <Row k="Acceleration" v={`${tel.gLoad.toFixed(2)} g`} />
                  <Row k="Mass" v={fmtMass(tel.mass)} />
                  <Row k="TWR" v={tel.twr.toFixed(2)} />
                  <Row k="Δv left" v={fmtSpeed(tel.dv)} />
                  {tel.pressure > 1 && <Row k="Pressure" v={fmtPressure(tel.pressure)} />}
                  {tel.q > 50 && <Row k="Dyn. pressure" v={fmtPressure(tel.q)} />}
                  {tel.heat > 0.05 && <Row k="Heat" v={`${Math.round(tel.heat * 100)}%`} warn={tel.heat > 0.7} />}
                  {tel.jumpRange > 0 && <Row k="Jump charge" v={`${tel.jumpCharge.toFixed(1)} / ${tel.jumpRange.toFixed(0)} ly`} />}
                  <div className="bar"><div style={{ width: `${tel.fuelCap > 0 ? (100 * tel.fuel) / tel.fuelCap : 0}%` }} /></div>
                  <div className="dim small">Propellant {fmtMass(tel.fuel)}</div>
                </div>

                <div className="panel stage-panel">
                  <button className="btn stage-btn" onClick={doStage}>STAGE <span className="dim">Space</span></button>
                  <div className="stage-list">
                    {hud.stages.length === 0 && <div className="dim small">No stages left</div>}
                    {hud.stages.slice(0, 5).map((s, i) => (
                      <div key={i} className={`stage-row ${i === 0 ? 'next' : ''}`}><span className="num">{hud.stages.length - i}</span>{s.label}</div>
                    ))}
                  </div>
                  <div className="row wrap">
                    {hud.hasLegs && <button className="btn sm" onClick={() => v && toggleLegs(v)}>Gear (G)</button>}
                    {hud.chutes !== 'none' && <button className="btn sm" onClick={() => v && armChutes(v)}>Chutes: {hud.chutes} (P)</button>}
                    {hud.canEva && <button className="btn sm" onClick={() => w && v && startEva(w, v)}>Exit (F)</button>}
                    {hud.vessels > 1 && <button className="btn sm" onClick={() => w && switchVessel(w)}>Switch (Tab)</button>}
                  </div>
                </div>

                <div className="bottom-center">
                  <div className="throttle">
                    <div className="dim small">THR</div>
                    <input
                      type="range" min={0} max={100} value={Math.round(tel.throttle * 100)} className="vslider"
                      onChange={(e) => { controls.current.touchThrottle = null; if (v) v.throttle = Number(e.target.value) / 100; }}
                    />
                    <div className="num">{Math.round(tel.throttle * 100)}%</div>
                  </div>
                  <div className="ballwrap">
                    <NavBall data={hud.nav} />
                    <div className="sas">
                      {(['hold', 'prograde', 'retrograde', 'radialOut', 'radialIn', 'off'] as SasMode[]).map((m) => (
                        <button key={m} className={`chip ${hud.sas === m ? 'on' : ''}`} onClick={() => setSasBtn(m)}>
                          {{ hold: 'HOLD', prograde: 'PRO', retrograde: 'RET', radialOut: 'RAD+', radialIn: 'RAD−', off: 'OFF', up: 'UP' }[m]}
                        </button>
                      ))}
                    </div>
                    <div className="dim small">
                      Pitch {Math.round((tel.pitch * 180) / Math.PI)}° · Hdg {Math.round((tel.heading * 180) / Math.PI)}°
                    </div>
                  </div>
                </div>
              </>
            )
          )}

          <div className="warp">
            <button className="btn sm" onClick={() => w && (w.warpIndex = Math.max(0, w.warpIndex - 1))}>◀</button>
            <span className="warp-val">{WARP_LEVELS[Math.min(hud.warp, hud.warpCap)]}×</span>
            <button className="btn sm" onClick={() => w && (w.warpIndex = Math.min(w.warpCap, w.warpIndex + 1))}>▶</button>
            {hud.warpReason && <span className="dim small warp-reason">{hud.warpReason}</span>}
          </div>

          {hud.apNote && v?.ap && (
            <div className="panel ap">
              <b>Autopilot · {v.ap.kind}</b>
              <div>{hud.apNote}</div>
              <button className="btn sm" onClick={() => w && v && stopAutopilot(w, v, 'Autopilot disengaged.')}>Disengage</button>
            </div>
          )}
          {settings.showFps && <div className="fps">{hud.fps.toFixed(0)} fps · {hud.chunks} chunks · {hud.quality}</div>}
        </>
      )}

      {touch && hud && !hud.evaOn && !hidden && (
        <TouchControls controls={controls.current} throttle={tel?.throttle ?? 0} onStage={doStage} stickPos={stickPos} setStickPos={setStickPos} />
      )}
      {touch && hud && hud.evaOn && !hidden && (
        <TouchControls controls={controls.current} throttle={0} onStage={() => w && plantFlag(w)} stickPos={stickPos} setStickPos={setStickPos} evaMode onJump={() => { controls.current.keys.add('Space'); setTimeout(() => controls.current.keys.delete('Space'), 120); }} />
      )}

      <div className="toasts">{toasts.map((t) => <div key={t.id} className={`toast ${t.level}`}>{t.text}</div>)}</div>

      {hud?.destroyed && (
        <div className="overlay center">
          <div className="panel big">
            <h2>Vessel lost</h2>
            <p>{hud.destroyed}.</p>
            <div className="col">
              <button className="btn" onClick={() => void quickload()}>Revert to quicksave</button>
              <button className="btn" onClick={async () => restoreFrom(await readSave('autosave'))}>Load autosave</button>
              <button className="btn" onClick={restartFlight}>Restart flight</button>
              <button className="btn" onClick={onExit}>Main menu</button>
            </div>
          </div>
        </div>
      )}

      {overlay === 'pause' && (
        <div className="overlay center">
          <div className="panel big">
            <h2>Paused</h2>
            <div className="col">
              <button className="btn primary" onClick={() => setOverlay('none')}>Resume</button>
              <button className="btn" onClick={() => void quicksave()}>Quicksave (F5)</button>
              <button className="btn" onClick={() => void quickload()}>Quickload (F9)</button>
              <button className="btn" onClick={() => setOverlay('assists')}>Assists</button>
              <button className="btn" onClick={restartFlight}>Restart flight</button>
              {designRef.current && <button className="btn" onClick={() => onEditor(designRef.current!)}>Open in hangar</button>}
              <button className="btn" onClick={onExit}>Main menu</button>
            </div>
            <Help />
          </div>
        </div>
      )}

      {overlay === 'assists' && w && (
        <div className="overlay center" onClick={() => setOverlay('none')}>
          <div className="panel big" onClick={(e) => e.stopPropagation()}>
            <h2>Flight assists</h2>
            <label className="check"><input type="checkbox" checked={w.assists.stability} onChange={() => toggleAssist('stability')} /> Stability assist (SAS) — holds attitude, default on</label>
            <label className="check"><input type="checkbox" checked={w.assists.orbitGuidance} onChange={() => toggleAssist('orbitGuidance')} /> Orbit guidance — ascent, circularise and transfer autopilots</label>
            <label className="check"><input type="checkbox" checked={w.assists.landing} onChange={() => toggleAssist('landing')} /> Landing assistance — de-orbit, powered descent, legs and parachutes</label>
            <label className="check"><input type="checkbox" checked={w.assists.unlimitedFuel} onChange={() => toggleAssist('unlimitedFuel')} /> Unlimited fuel (default off)</label>
            {v && (
              <div className="col" style={{ marginTop: 12 }}>
                <div className="dim small">Autopilots (need the matching assist enabled)</div>
                <div className="row wrap">
                  <button className="btn sm" disabled={!w.assists.orbitGuidance} onClick={() => { runAp('ascent'); setOverlay('none'); }}>Ascent to orbit</button>
                  <button className="btn sm" disabled={!w.assists.orbitGuidance} onClick={() => { runAp('circularize'); setOverlay('none'); }}>Circularise</button>
                  <button className="btn sm" disabled={!w.assists.orbitGuidance} onClick={() => { runAp('deorbit'); setOverlay('none'); }}>De-orbit</button>
                  <button className="btn sm" disabled={!w.assists.landing} onClick={() => { runAp('land'); setOverlay('none'); }}>Land</button>
                </div>
                <div className="dim small">Open the map (M) to plan a transfer to a moon or planet.</div>
              </div>
            )}
            <button className="btn" onClick={() => setOverlay('none')}>Close</button>
          </div>
        </div>
      )}

      {overlay === 'map' && w && <MapView world={w} onClose={() => setOverlay('none')} toast={toast} />}
      {overlay === 'galaxy' && w && <GalaxyMap world={w} onClose={() => setOverlay('none')} toast={toast} />}
    </div>
  );
}

function Row({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return <div className={`trow ${warn ? 'warn' : ''}`}><span>{k}</span><b>{v}</b></div>;
}

function Help() {
  return (
    <div className="help small dim">
      <div><b>Fly:</b> W/S pitch · A/D yaw · Q/E roll · Shift/Ctrl throttle · Z/X full/cut · Space stage · T stability</div>
      <div><b>SAS:</b> 1 hold · 2 prograde · 3 retrograde · 4/5 radial · G gear · P parachutes</div>
      <div><b>View:</b> drag to orbit · wheel zoom · C camera mode · M map · J galaxy · Tab switch vessel · , . time warp · H hide HUD</div>
      <div><b>Astronaut:</b> F exit/plant flag · B board · F5 save · F9 load</div>
    </div>
  );
}

function computeTelemetryLight(w: World, v: Vessel) {
  const body = w.idx.get(v.body);
  let thrust = 0;
  let nominal = 1;
  for (const p of v.parts) {
    if (p.burn > 0 && p.def.thrust) { thrust += p.burn * (p.def.thrust ?? 0); }
    if (p.def.thrust) nominal += p.def.thrust;
  }
  const alt = v.pos.length() - body.radius;
  const atm = body.atmosphere ? Math.min(1, (body.atmosphere.density0 * Math.exp(-alt / body.atmosphere.scaleHeight)) / 1.2) : 0;
  return { thrust: Math.min(1, (thrust / nominal) * 1.6), atm, speed: v.vel.length() };
}

function buildHud(w: World, fps: number, gr: GameRenderer, quality: QualityLevel): Hud {
  const v = activeVessel(w);
  const evaOn = !!w.eva;
  if (!v) {
    return { tel: null, nav: null, sas: 'off', warp: 0, warpCap: 0, warpReason: '', apNote: null, stages: [], destroyed: null, landed: false, evaOn, evaRange: 0, canEva: false, hasLegs: false, chutes: 'none', assists: w.assists, fps, chunks: 0, vessels: 0, hasJump: false, quality };
  }
  const tel = computeTelemetry(w, v);
  // navball directions in the vessel frame
  const inv = v.quat.clone().invert();
  const up = v.pos.clone().normalize();
  let east = new Vector3().crossVectors(new Vector3(0, 1, 0), up);
  if (east.lengthSq() < 1e-9) east = new Vector3(1, 0, 0);
  east.normalize();
  const north = new Vector3().crossVectors(up, east).normalize();
  const body = w.idx.get(v.body);
  const vel = v.vel.clone();
  if (body.atmosphere && tel.alt < 70000) vel.sub(new Vector3(body.rotationPeriod ? (2 * Math.PI / body.rotationPeriod) * v.pos.z : 0, 0, body.rotationPeriod ? -(2 * Math.PI / body.rotationPeriod) * v.pos.x : 0));
  const nav: NavBallData = {
    up: up.clone().applyQuaternion(inv), north: north.clone().applyQuaternion(inv), east: east.clone().applyQuaternion(inv),
    prograde: vel.length() > 0.5 ? vel.normalize().applyQuaternion(inv) : null, radial: up.clone().applyQuaternion(inv),
  };
  const stages = v.stages.slice(v.stageIdx).map((s) => {
    const names = s.map((a) => {
      const p = v.parts.find((q) => q.id === a.part);
      return p ? `${KIND_LABEL[a.kind] ?? a.kind}${p.def.kind === 'engine' || p.def.kind === 'srb' || a.kind === 'detach' ? ' ' + p.def.name : ''}` : null;
    }).filter(Boolean) as string[];
    const uniq = [...new Set(names)];
    const counts = uniq.map((n) => { const c = names.filter((x) => x === n).length; return c > 1 ? `${c}× ${n}` : n; });
    return { label: counts.join(', '), count: s.length };
  });
  void partDef;
  return {
    tel, nav, sas: v.sas.mode, warp: w.warpIndex, warpCap: w.warpCap, warpReason: w.warpReason, apNote: v.ap?.note ?? null,
    stages, destroyed: v.destroyed && v.id === w.activeId ? v.destroyed : null, landed: v.landed, evaOn, evaRange: boardRange(w),
    canEva: !w.eva && canEva(w, v) === null, hasLegs: v.parts.some((p) => p.def.kind === 'leg'), chutes: chutesState(v), assists: w.assists,
    fps, chunks: gr.stats.chunks, vessels: controllableVessels(w).length, hasJump: v.derived.hasJump, quality,
  };
}

function TouchControls({ controls, throttle, onStage, stickPos, setStickPos, evaMode, onJump }: {
  controls: Controls; throttle: number; onStage: () => void; stickPos: { x: number; y: number } | null;
  setStickPos: (p: { x: number; y: number } | null) => void; evaMode?: boolean; onJump?: () => void;
}) {
  const baseRef = useRef<HTMLDivElement>(null);
  const onStick = (e: React.PointerEvent) => {
    const el = baseRef.current!;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2);
    let dy = (e.clientY - cy) / (r.height / 2);
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    controls.stick.x = dx;
    controls.stick.y = -dy;
    setStickPos({ x: dx, y: dy });
  };
  const endStick = () => { controls.stick.x = 0; controls.stick.y = 0; setStickPos(null); };
  return (
    <div className="touch">
      <div className="touch-left">
        {!evaMode && (
          <input
            type="range" min={0} max={100} value={Math.round(throttle * 100)} className="vslider tall"
            onChange={(e) => { controls.touchThrottle = Number(e.target.value) / 100; }}
          />
        )}
        <div className="row">
          <button className="btn round" onPointerDown={() => { controls.roll = -1; }} onPointerUp={() => { controls.roll = 0; }} onPointerLeave={() => { controls.roll = 0; }}>⟲</button>
          <button className="btn round" onPointerDown={() => { controls.roll = 1; }} onPointerUp={() => { controls.roll = 0; }} onPointerLeave={() => { controls.roll = 0; }}>⟳</button>
        </div>
      </div>
      <div className="touch-right">
        <button className="btn stage-big" onClick={onStage}>{evaMode ? 'FLAG' : 'STAGE'}</button>
        {evaMode && <button className="btn round" onClick={onJump}>⤒</button>}
        <div
          ref={baseRef} className="stick"
          onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); onStick(e); }}
          onPointerMove={(e) => { if (e.buttons || e.pointerType === 'touch') onStick(e); }}
          onPointerUp={endStick} onPointerCancel={endStick}
        >
          <div className="knob" style={{ transform: `translate(${(stickPos?.x ?? 0) * 34}px, ${(stickPos?.y ?? 0) * 34}px)` }} />
        </div>
      </div>
    </div>
  );
}
