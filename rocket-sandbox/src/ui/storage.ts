import { DEFAULT_SETTINGS, ExportBundle, idbStore, SAVE_VERSION, SavedDesign, Settings, Store, WorldSave } from '../sim/save';
import { Design } from '../sim/design';
import { PRESETS } from '../sim/presets';

let storePromise: Promise<Store> | null = null;

/** Falls back to memory when IndexedDB is unavailable (some private modes), so the game still runs. */
function memoryStore(): Store {
  const m = new Map<string, unknown>();
  return {
    get: async <T,>(k: string) => m.get(k) as T | undefined,
    set: async (k, v) => { m.set(k, v); },
    del: async (k) => { m.delete(k); },
    keys: async () => [...m.keys()],
  };
}

export function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = idbStore().then(async (s) => {
      await s.set('probe', 1);
      return s;
    }).catch(() => memoryStore());
  }
  return storePromise;
}

export async function loadSettings(): Promise<Settings> {
  const s = await (await getStore()).get<Settings>('settings');
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

export async function saveSettings(s: Settings): Promise<void> {
  await (await getStore()).set('settings', s);
}

export async function loadDesigns(): Promise<SavedDesign[]> {
  const st = await getStore();
  const list = (await st.get<SavedDesign[]>('designs')) ?? [];
  return list;
}

export async function saveDesigns(list: SavedDesign[]): Promise<void> {
  await (await getStore()).set('designs', list);
}

export async function upsertDesign(id: string | null, design: Design): Promise<string> {
  const list = await loadDesigns();
  const key = id ?? `d${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  const i = list.findIndex((d) => d.id === key);
  const rec: SavedDesign = { id: key, design, updated: Date.now() };
  if (i >= 0) list[i] = rec; else list.push(rec);
  await saveDesigns(list);
  return key;
}

export async function deleteDesign(id: string): Promise<void> {
  await saveDesigns((await loadDesigns()).filter((d) => d.id !== id));
}

export type SaveSlot = 'quicksave' | 'autosave';

export async function writeSave(slot: SaveSlot, save: WorldSave): Promise<void> {
  await (await getStore()).set(`save:${slot}`, save);
}

export async function readSave(slot: SaveSlot): Promise<WorldSave | undefined> {
  return (await getStore()).get<WorldSave>(`save:${slot}`);
}

export async function exportBundle(): Promise<ExportBundle> {
  const saves: Record<string, WorldSave> = {};
  for (const slot of ['quicksave', 'autosave'] as SaveSlot[]) {
    const s = await readSave(slot);
    if (s) saves[slot] = s;
  }
  return { kind: 'orbital-sandbox-export', v: SAVE_VERSION, designs: await loadDesigns(), settings: await loadSettings(), saves };
}

export async function importBundle(data: unknown): Promise<string> {
  const b = data as ExportBundle;
  if (!b || b.kind !== 'orbital-sandbox-export') throw new Error('This file is not an Orbital Sandbox export.');
  if (b.v !== SAVE_VERSION) throw new Error(`Unsupported save version ${b.v}.`);
  const have = await loadDesigns();
  const byId = new Map(have.map((d) => [d.id, d]));
  for (const d of b.designs ?? []) byId.set(d.id, d);
  await saveDesigns([...byId.values()]);
  if (b.settings) await saveSettings({ ...DEFAULT_SETTINGS, ...b.settings });
  for (const [slot, s] of Object.entries(b.saves ?? {})) await writeSave(slot as SaveSlot, s);
  return `Imported ${b.designs?.length ?? 0} designs and ${Object.keys(b.saves ?? {}).length} saves.`;
}

export function presetDesign(id: string): Design {
  const p = PRESETS.find((x) => x.id === id) ?? PRESETS[0];
  return p.build();
}

export function downloadJson(name: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
