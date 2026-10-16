// Importiert die Blender-Exporte aus data/3d in die Spieldaten.
//
//   npm run import:3d
//
// Liest data/3d/Baubar/_export_liste.csv und data/3d/Produkte/_export_liste.csv
// und legt für jedes Modell eine JSON-Datei an:
//   data/bau/<id>.json       (Bauelemente)
//   data/produkte/<id>.json  (Produkte)
//
// Bestehende Dateien behalten alle Werte, die man von Hand pflegt (Preise, Kontext,
// Werte, Freischalt-Level, Name). Aktualisiert werden nur Modell, Icon und Maße.
// Startwerte für neue Einträge stehen in scripts/import-3d.config.json.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'data');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/import-3d.config.json'), 'utf8'));

/** CSV mit Semikolon und BOM lesen; liefert Objekte mit den Spaltennamen als Schlüssel. */
function readCsv(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const [head, ...rows] = text.split(/\r?\n/).filter((l) => l.trim());
  const keys = head.split(';');
  return rows.map((r) => Object.fromEntries(r.split(';').map((v, i) => [keys[i], v.trim()])));
}

/** "SM_Build_SM_Store_Cart_01" → "store_cart_01", "SM_Apfel_Gruen" → "apfel_gruen" */
function idFromAsset(asset) {
  return asset.replace(/^SM_Build_/, '').replace(/^SM_/, '').toLowerCase();
}

/** Anzeigename aus dem Export: Unterstriche, Umlaute, Mengenangaben. */
function displayName(raw) {
  let s = raw.replace(/\.\d{3}$/, '').replace(/\.$/, '');
  for (const [from, to] of Object.entries(config.namen)) {
    s = s.split(from).join(to).split(from.toLowerCase()).join(to.toLowerCase());
  }
  s = s
    .replace(/(\d)_(\d+)L\b/g, '$1,$2 L')
    .replace(/_(\d)_(\d)$/, ' $1,$2 %')
    .replace(/(\d+)ml\b/g, '$1 ml')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

const round = (n) => Math.round(n * 1000) / 1000;
/** Maße aus cm (Breite = x, Höhe = y, Tiefe = z) in Meter. */
const sizeOf = (row) => [round(row.Breite_cm / 100), round(row.Hoehe_cm / 100), round(row.Tiefe_cm / 100)];
const posix = (p) => p.replace(/\\/g, '/');

function readJson(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

/** JSON kompakt schreiben: eine Zeile pro Feld, kurze Objekte/Listen in einer Zeile. */
function writeJson(file, obj) {
  const one = (v) => Array.isArray(v) ? `[${v.map(one).join(', ')}]`
    : v && typeof v === 'object' ? `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${one(x)}`).join(', ')}}`
    : JSON.stringify(v);
  const lines = Object.entries(obj).map(([k, v]) => `  "${k}": ${one(v)}`);
  fs.writeFileSync(file, `{\n${lines.join(',\n')}\n}\n`);
}

/** Feste Reihenfolge der Felder, damit Dateien gut lesbar bleiben. */
function ordered(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  for (const k of Object.keys(obj)) if (!(k in out)) out[k] = obj[k];
  return out;
}

const stats = { neu: 0, aktualisiert: 0, unveraendert: 0 };
const seen = { bau: new Set(), produkte: new Set() };

function save(folder, id, fresh, keep) {
  const file = path.join(DATA, folder, `${id}.json`);
  const old = readJson(file);
  // Bestehende Werte haben Vorrang, nur die Felder aus `keep` kommen immer aus dem Export
  const merged = old ? { ...fresh, ...old, ...Object.fromEntries(keep.map((k) => [k, fresh[k]])) } : fresh;
  const text = JSON.stringify(merged);
  if (old && JSON.stringify(old) === text) { stats.unveraendert++; return; }
  stats[old ? 'aktualisiert' : 'neu']++;
  writeJson(file, merged);
}

// ── Bauelemente ──
fs.mkdirSync(path.join(DATA, 'bau'), { recursive: true });
for (const row of readCsv(path.join(DATA, '3d/Baubar/_export_liste.csv'))) {
  if (config.ignorieren.includes(row.Asset)) continue;
  const id = idFromAsset(row.Asset);
  if (seen.bau.has(id)) continue; // Doppelte Zeilen im Export (z. B. ".001"-Varianten)
  seen.bau.add(id);
  const kategorie = row.Kategorie.toLowerCase();
  const icon = `3d/Icons_Baubar/T_Build_${row.Asset.replace(/^SM_Build_/, '')}.png`;
  const fresh = ordered({
    id,
    name: config.bauNamen[id] ?? displayName(row['Blender-Name']),
    kategorie,
    preis: 100,
    freischaltLevel: 1,
    ...config.bauStandard[kategorie],
    ...config.bauEinzeln[id],
    werte: { ...(config.bauEinzeln[id]?.werte ?? {}) },
    model: `3d/Baubar/${posix(row.Datei)}`,
    icon: fs.existsSync(path.join(DATA, icon)) ? icon : undefined,
    platzhalter: { groesse: sizeOf(row), farbe: '#b9c0c6' },
  }, ['id', 'name', 'kategorie', 'kontext', 'preis', 'freischaltLevel', 'werte', 'model', 'icon', 'platzhalter']);
  save('bau', id, fresh, ['model', 'icon', 'platzhalter']);
}

// ── Produkte ──
fs.mkdirSync(path.join(DATA, 'produkte'), { recursive: true });
for (const row of readCsv(path.join(DATA, '3d/Produkte/_export_liste.csv'))) {
  const id = idFromAsset(row.Asset);
  if (seen.produkte.has(id)) continue;
  seen.produkte.add(id);
  const kategorie = config.produktKategorien[row.Kategorie];
  if (!kategorie) throw new Error(`Unbekannte Produktkategorie "${row.Kategorie}" bei ${row.Asset}`);
  const icon = `3d/Icons_Produkte/T_Icon_${row.Asset.replace(/^SM_/, '')}.png`;
  const fresh = ordered({
    id,
    name: displayName(row['Blender-Name']),
    kategorie,
    ...config.produktStandard[kategorie],
    // Preise sind Startwerte je Kategorie, bis die echte Preisliste eingespielt ist
    preisOffen: true,
    freischaltLevel: 1,
    model: `3d/Produkte/${posix(row.Datei)}`,
    icon: fs.existsSync(path.join(DATA, icon)) ? icon : undefined,
    groesse: sizeOf(row),
  }, ['id', 'name', 'kategorie', 'ek', 'vk', 'preisOffen', 'frisch', 'freischaltLevel', 'model', 'icon', 'groesse']);
  save('produkte', id, fresh, ['model', 'icon', 'groesse']);
}

// Dateien ohne Modell im Export melden (nicht löschen – könnten von Hand angelegt sein)
for (const folder of ['bau', 'produkte']) {
  for (const f of fs.readdirSync(path.join(DATA, folder))) {
    const id = f.replace(/\.json$/, '');
    if (!seen[folder].has(id)) console.log(`Hinweis: data/${folder}/${f} kommt im Export nicht vor`);
  }
}
console.log(`Bauelemente: ${seen.bau.size}, Produkte: ${seen.produkte.size}`);
console.log(`Dateien neu: ${stats.neu}, aktualisiert: ${stats.aktualisiert}, unverändert: ${stats.unveraendert}`);
