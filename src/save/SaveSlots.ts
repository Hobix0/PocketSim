import { validateSave, type SaveData } from './SaveGame';

// Speicherplätze im Browser: ein automatischer (Tagesende) und drei eigene.
// Dazu Export/Import als Datei – für Umgebungen ohne Browser-Speicher und zum Sichern.
// Ein Wunsch für den Neustart ("laden", "neu") wird über sessionStorage an die neu geladene Seite gereicht.

export type SlotId = 'auto' | '1' | '2' | '3';
export const SLOTS: SlotId[] = ['auto', '1', '2', '3'];
const KEY = (s: SlotId) => `urbanevolution.spielstand.${s}`;
const START_KEY = 'urbanevolution.start';

export interface SlotInfo {
  slot: SlotId;
  level: string;
  tag: number;
  uhrzeit: string;
  geld: number;
  gespeichert: string;
}

export function info(slot: SlotId, d: SaveData): SlotInfo {
  const minutes = d.uhr.total;
  const h = Math.floor((minutes % 1440) / 60), m = Math.floor(minutes % 60);
  return { slot, level: d.level, tag: Math.floor(minutes / 1440) + 1, uhrzeit: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, geld: d.spieler.geld, gespeichert: d.gespeichert };
}

export function readSlot(slot: SlotId): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY(slot));
    return raw ? validateSave(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeSlot(slot: SlotId, data: SaveData): boolean {
  try {
    localStorage.setItem(KEY(slot), JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function deleteSlot(slot: SlotId): void {
  try { localStorage.removeItem(KEY(slot)); } catch { /* nichts zu tun */ }
}

export function listSlots(): (SlotInfo | null)[] {
  return SLOTS.map((s) => { const d = readSlot(s); return d ? info(s, d) : null; });
}

/** Zuletzt gespeicherter Platz (für „Fortsetzen“) */
export function newestSlot(): SlotId | null {
  const all = listSlots().filter((x): x is SlotInfo => x !== null);
  all.sort((a, b) => b.gespeichert.localeCompare(a.gespeichert));
  return all[0]?.slot ?? null;
}

export function storageAvailable(): boolean {
  try {
    localStorage.setItem('urbanevolution.test', '1');
    localStorage.removeItem('urbanevolution.test');
    return true;
  } catch {
    return false;
  }
}

export function downloadSave(data: SaveData): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  a.download = `urbanevolution-tag-${info('1', data).tag}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function readSaveFile(file: File): Promise<SaveData> {
  return validateSave(JSON.parse(await file.text()));
}

// ── Neustart mit Wunsch ─────────────────────────────────────────────

export type StartRequest = { aktion: 'neu' } | { aktion: 'laden'; daten: SaveData };

/** Seite neu laden und danach ein neues Spiel starten bzw. einen Spielstand laden. */
export function restartWith(req: StartRequest | null, hash = ''): void {
  try {
    if (req) sessionStorage.setItem(START_KEY, JSON.stringify(req));
    else sessionStorage.removeItem(START_KEY);
  } catch { /* ohne sessionStorage startet einfach das Hauptmenü */ }
  location.hash = hash;
  location.reload();
}

/** Wunsch vom letzten Neuladen abholen (einmalig). */
export function takeStartRequest(): StartRequest | null {
  try {
    const raw = sessionStorage.getItem(START_KEY);
    sessionStorage.removeItem(START_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as StartRequest;
    if (r.aktion === 'laden') return { aktion: 'laden', daten: validateSave(r.daten) };
    return r.aktion === 'neu' ? r : null;
  } catch {
    return null;
  }
}
