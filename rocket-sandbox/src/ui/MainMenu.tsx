import { useEffect, useRef, useState } from 'react';
import { analyze, Design } from '../sim/design';
import { PRESETS } from '../sim/presets';
import { SavedDesign, Settings } from '../sim/save';
import { FlightInit } from './Flight';
import { fmtMass, fmtSpeed } from './format';
import { deleteDesign, downloadJson, exportBundle, importBundle, loadDesigns, readSave, saveSettings } from './storage';

interface Props {
  settings: Settings;
  setSettings: (s: Settings) => void;
  onLaunch: (init: FlightInit) => void;
  onEditor: (design?: Design, id?: string | null) => void;
}

export function MainMenu({ settings, setSettings, onLaunch, onEditor }: Props) {
  const [designs, setDesigns] = useState<SavedDesign[]>([]);
  const [hasSave, setHasSave] = useState<{ quick: boolean; auto: boolean }>({ quick: false, auto: false });
  const [showSettings, setShowSettings] = useState(false);
  const [msg, setMsg] = useState('');
  const [startPad, setStartPad] = useState<Record<string, 'pad' | 'leo'>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setDesigns(await loadDesigns());
    setHasSave({ quick: !!(await readSave('quicksave')), auto: !!(await readSave('autosave')) });
  };
  useEffect(() => { void refresh(); }, []);

  const cont = async (slot: 'quicksave' | 'autosave') => {
    const save = await readSave(slot);
    if (save) onLaunch({ kind: 'load', save });
  };

  const card = (key: string, name: string, blurb: string, design: Design, defaultStart: 'pad' | 'leo', extra?: React.ReactNode) => {
    const st = analyze(design);
    const start = startPad[key] ?? defaultStart;
    return (
      <div className="card" key={key}>
        <h3>{name}</h3>
        <p className="dim small">{blurb}</p>
        <div className="small">
          {design.parts.length} parts · {fmtMass(st.mass)} · Δv {fmtSpeed(st.totalDvVac)} · {st.crew ? `${st.crew} crew` : 'uncrewed'}{st.jump ? ' · jump drive' : ''}
        </div>
        <div className="row wrap">
          <select value={start} onChange={(e) => setStartPad({ ...startPad, [key]: e.target.value as 'pad' | 'leo' })}>
            <option value="pad">Launch pad, Earth</option>
            <option value="leo">Low Earth orbit (400 km)</option>
          </select>
          <button className="btn primary" onClick={() => onLaunch({ kind: 'new', design, start })}>Fly</button>
          <button className="btn" onClick={() => onEditor(design, null)}>Edit copy</button>
          {extra}
        </div>
      </div>
    );
  };

  return (
    <div className="menu">
      <div className="menu-hero">
        <h1>Orbital Sandbox</h1>
        <p>Build rockets. Reach the Moon, the planets and the stars of the Milky Way.</p>
        <div className="row wrap center">
          <button className="btn" disabled={!hasSave.auto} onClick={() => void cont('autosave')}>Continue (autosave)</button>
          <button className="btn" disabled={!hasSave.quick} onClick={() => void cont('quicksave')}>Load quicksave</button>
          <button className="btn" onClick={() => onEditor(undefined, null)}>Hangar</button>
          <button className="btn" onClick={() => setShowSettings(true)}>Settings</button>
        </div>
      </div>
      <h2>Ready-made vehicles</h2>
      <div className="grid">
        {PRESETS.map((p) => card(p.id, p.name, p.blurb, p.build(), p.start))}
      </div>
      <h2>Your designs</h2>
      <div className="grid">
        {designs.length === 0 && <p className="dim">Designs you save in the hangar appear here.</p>}
        {designs.map((d) =>
          card(d.id, d.design.name, `Saved ${new Date(d.updated).toLocaleString()}`, d.design, 'pad', (
            <>
              <button className="btn" onClick={() => onEditor(d.design, d.id)}>Open</button>
              <button className="btn" onClick={async () => { if (confirm(`Delete “${d.design.name}”?`)) { await deleteDesign(d.id); void refresh(); } }}>Delete</button>
            </>
          )),
        )}
      </div>
      <footer className="dim small">
        Star data: HYG Database v4.1 (astronexus), CC BY-SA 4.0. Planet surfaces are procedural; generated stars and systems are fictional. Everything is unlocked.
      </footer>

      {showSettings && (
        <div className="overlay center" onClick={() => setShowSettings(false)}>
          <div className="panel big" onClick={(e) => e.stopPropagation()}>
            <h2>Settings</h2>
            <label className="field">Graphics
              <select value={settings.graphics} onChange={(e) => setSettings({ ...settings, graphics: e.target.value as Settings['graphics'] })}>
                <option value="auto">Auto (adapts to frame rate)</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
              </select>
            </label>
            <label className="field">Touch controls
              <select value={settings.touchControls} onChange={(e) => setSettings({ ...settings, touchControls: e.target.value as Settings['touchControls'] })}>
                <option value="auto">Auto</option><option value="on">Always on</option><option value="off">Off</option>
              </select>
            </label>
            <label className="check"><input type="checkbox" checked={settings.invertPitch} onChange={(e) => setSettings({ ...settings, invertPitch: e.target.checked })} /> Invert pitch</label>
            <label className="check"><input type="checkbox" checked={settings.sound} onChange={(e) => setSettings({ ...settings, sound: e.target.checked })} /> Sound</label>
            <label className="check"><input type="checkbox" checked={settings.showFps} onChange={(e) => setSettings({ ...settings, showFps: e.target.checked })} /> Show performance counter</label>
            <hr />
            <div className="row wrap">
              <button className="btn" onClick={async () => { downloadJson('orbital-sandbox-export.json', await exportBundle()); }}>Export saves</button>
              <button className="btn" onClick={() => fileRef.current?.click()}>Import saves</button>
              <input
                ref={fileRef} type="file" accept="application/json" hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try { setMsg(await importBundle(JSON.parse(await f.text()))); void refresh(); } catch (err) { setMsg((err as Error).message); }
                  e.target.value = '';
                }}
              />
            </div>
            {msg && <p className="small">{msg}</p>}
            <button className="btn primary" onClick={() => { void saveSettings(settings); setShowSettings(false); }}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
