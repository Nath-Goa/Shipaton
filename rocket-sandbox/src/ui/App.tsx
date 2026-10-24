import { useEffect, useState } from 'react';
import { Design } from '../sim/design';
import { DEFAULT_SETTINGS, Settings } from '../sim/save';
import { Editor } from './Editor';
import { Flight, FlightInit } from './Flight';
import { MainMenu } from './MainMenu';
import { loadSettings, saveSettings } from './storage';

type Screen =
  | { kind: 'menu' }
  | { kind: 'editor'; design?: Design; designId?: string | null }
  | { kind: 'flight'; init: FlightInit; key: number };

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'menu' });
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [runKey, setRunKey] = useState(1);

  useEffect(() => {
    void loadSettings().then((s) => { setSettingsState(s); setReady(true); });
  }, []);

  const setSettings = (s: Settings) => { setSettingsState(s); void saveSettings(s); };
  const launch = (init: FlightInit) => { setRunKey((k) => k + 1); setScreen({ kind: 'flight', init, key: runKey + 1 }); };

  if (!ready) return <div className="loading">Loading…</div>;
  switch (screen.kind) {
    case 'flight':
      return (
        <Flight
          key={screen.key} init={screen.init} settings={settings} onExit={() => setScreen({ kind: 'menu' })}
          onEditor={(design) => setScreen({ kind: 'editor', design })}
        />
      );
    case 'editor':
      return (
        <Editor
          initial={screen.design} designId={screen.designId ?? null} onBack={() => setScreen({ kind: 'menu' })}
          onLaunch={(design, start) => launch({ kind: 'new', design, start })}
        />
      );
    default:
      return (
        <MainMenu
          settings={settings} setSettings={setSettings}
          onLaunch={launch}
          onEditor={(design, designId) => setScreen({ kind: 'editor', design, designId })}
        />
      );
  }
}
