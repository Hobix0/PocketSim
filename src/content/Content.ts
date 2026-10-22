import { readData, readFolderEntries } from '../core/Data';
import { Registry } from './Registry';
import type { FigureSettings } from '../voxel/figure';
import type { ResearchNode, ResearchSettings } from '../economy/Research';
import {
  validateBuild, validateCategory, validateProduct,
  type BuildDef, type BuildSettings, type CategoryDef, type ContextInfo, type ProductDef, type RoleDef,
  type StaffSettings, type StorageSettings, type ValueInfo, type WorkSettings, type CustomerSettings,
  type RecipeDef, type UtilitySettings, validateRecipe, type ProductionSettings, type LogisticsSettings, type DaylightSettings, type TerrainSettings, type MarkingSettings, type EffectSettings,
} from './definitions';

/** Funktionen, die ein Bauteil haben kann (je eine Komponente, siehe createBuildEntity) */
export const FUNKTIONEN = ['einkauf', 'rampe'];

// Alle Spielinhalte an einem Ort. Wird einmal beim Start geladen und geprüft;
// fehlerhafte Daten stoppen den Start mit einer klaren Meldung.

export class Content {
  readonly kategorien: Registry<CategoryDef>;
  readonly produkte: Registry<ProductDef>;
  /** Rohstoffe für Maschinen (data/rohstoffe) – getrennt von Produkten und von der Versorgung */
  readonly rohstoffe: Registry<ProductDef>;
  /** Alles, was es im Großhandel und als Karton gibt: Produkte und Rohstoffe */
  readonly waren: Registry<ProductDef>;
  readonly rezepte: Registry<RecipeDef>;
  /** Produktionslinien im Industriegebiet (data/produktion) */
  readonly produktion: ProductionSettings;
  readonly versorgung: UtilitySettings;
  /** Lieferungen per LKW (data/logistik/standard.json) */
  readonly logistik: LogisticsSettings;
  /** Tag und Nacht, Lampen (data/licht/standard.json) */
  readonly licht: DaylightSettings;
  /** Gelände-Werkzeug (data/gelaende/standard.json) */
  readonly gelaende: TerrainSettings;
  /** Bodenmarkierungen: Farben, Breiten, Stempel (data/markierungen/standard.json) */
  readonly markierungen: MarkingSettings;
  /** Effekte und Bewegungen (data/effekte/standard.json) */
  readonly effekte: EffectSettings;
  readonly bau: Registry<BuildDef>;
  readonly werte: Record<string, ValueInfo>;
  readonly kontexte: Record<string, ContextInfo>;
  readonly lager: StorageSettings;
  readonly baumenue: BuildSettings;
  readonly rollen: Record<string, RoleDef>;
  readonly personal: StaffSettings;
  readonly namen: string[];
  readonly arbeit: WorkSettings;
  /** Aussehen der Voxel-Figuren (data/figuren/standard.json) */
  readonly figuren: FigureSettings;
  /** Kunden: Öffnungszeiten, Andrang, Ruf (data/kunden/standard.json) */
  readonly kunden: CustomerSettings;
  /** Forschungsbaum (data/forschung/baum.json) und Ideen (data/forschung/standard.json) */
  readonly forschung: ResearchNode[];
  readonly forschungWerte: ResearchSettings;
  /** Anzeigetexte, z. B. "auswaehlen" → "Auswählen" (data/texte/standard.json). */
  readonly texte: Record<string, string>;

  constructor() {
    // Kategorien stehen als Liste in einer Datei; sie werden wie Ordner-Einträge behandelt
    const kat = readData<unknown[]>('sortiment/kategorien').map((data, i) => ({
      file: (data as { id?: string }).id ?? `#${i}`,
      data,
    }));
    this.kategorien = new Registry('sortiment/kategorien', kat, validateCategory);
    this.produkte = new Registry('produkte', readFolderEntries('produkte'), validateProduct);
    this.bau = new Registry('bau', readFolderEntries('bau'), validateBuild);
    this.rohstoffe = new Registry('rohstoffe', readFolderEntries('rohstoffe'), (raw, where) => ({ ...validateProduct(raw, where), rohstoff: true }));
    // Produktionslinien: je Linie ein Rohstoff (Grundstoffe der Warengruppe)
    this.produktion = readData<ProductionSettings>('produktion/standard');
    for (const l of this.produktion.linien) {
      this.rohstoffe.add({
        id: l.rohstoff.id, name: l.rohstoff.name, kategorie: 'rohstoffe', ek: this.produktion.rohstoffEk, vk: 0,
        gebinde: this.produktion.rohstoffGebinde, frisch: false, kuehlung: false, freischaltLevel: l.level, rohstoff: true,
      } as ProductDef);
    }
    this.waren = new Registry('waren', [], validateProduct);
    for (const p of [...this.produkte.all(), ...this.rohstoffe.all()]) {
      if (this.waren.has(p.id)) throw new Error(`rohstoffe/${p.id}.json: id gibt es schon als Produkt`);
      this.waren.add(p);
    }
    this.rezepte = new Registry('rezepte', readFolderEntries('rezepte'), validateRecipe);
    // Je Produkt ein Rezept auf seiner Linie: Rohstoffe für rohstoffAnteil des Einkaufspreises
    const pr = this.produktion;
    for (const l of pr.linien) {
      for (const p of this.produkte.all().filter((x) => l.kategorien.includes(x.kategorie))) {
        this.rezepte.add({
          id: `herstellen_${p.id}`, name: `${p.name} herstellen`, maschine: l.id,
          eingang: [{ ware: l.rohstoff.id, menge: Math.max(1, Math.round((p.ek * p.gebinde * pr.rohstoffAnteil) / pr.rohstoffEk)) }],
          ausgang: { ware: p.id, menge: p.gebinde },
          dauer: Math.round(pr.minutenGrund + pr.minutenProStueck * p.gebinde),
          freischaltLevel: l.level,
        });
      }
    }
    this.versorgung = readData<UtilitySettings>('versorgung/standard');
    this.logistik = readData<LogisticsSettings>('logistik/standard');
    this.licht = readData<DaylightSettings>('licht/standard');
    this.gelaende = readData<TerrainSettings>('gelaende/standard');
    this.markierungen = readData<MarkingSettings>('markierungen/standard');
    this.effekte = readData<EffectSettings>('effekte/standard');
    for (const st of this.markierungen.stempel) {
      if (!st.formen?.length || st.groesse?.length !== 2) throw new Error(`markierungen: Stempel „${st.id}“ braucht formen und groesse [b, t]`);
    }
    this.werte = readData<Record<string, ValueInfo>>('werte/standard');
    this.kontexte = readData<Record<string, ContextInfo>>('interaktion/kontexte');
    this.lager = readData<StorageSettings>('lager/standard');
    this.baumenue = readData<BuildSettings>('baumenue/standard');
    this.rollen = readData<Record<string, RoleDef>>('personal/rollen');
    this.personal = readData<StaffSettings>('personal/standard');
    this.namen = readData<string[]>('personal/namen');
    this.arbeit = readData<WorkSettings>('arbeit/standard');
    this.figuren = readData<FigureSettings>('figuren/standard');
    this.kunden = readData<CustomerSettings>('kunden/standard');
    this.texte = readData<Record<string, string>>('texte/standard');
    this.forschungWerte = readData<ResearchSettings>('forschung/standard');
    this.forschung = this.loadResearch();
    for (const r of this.rezepte.all()) {
      if (r.forschung || !r.id.startsWith('herstellen_')) continue;
      const linie = this.bau.all().find((b) => b.maschine?.typ === r.maschine);
      if (linie?.forschung) r.forschung = linie.forschung;
    }
    this.crossCheck();
  }

  /** Forschungsbaum lesen, prüfen und an Bauteilen, Rezepten und Produkten eintragen */
  private loadResearch(): ResearchNode[] {
    const raw = readData<Partial<ResearchNode>[]>('forschung/baum');
    const nodes: ResearchNode[] = raw.map((r, i) => {
      if (!r.id || !r.name) throw new Error(`forschung/baum.json: Eintrag ${i} braucht id und name`);
      return {
        id: r.id, name: r.name, icon: r.icon ?? '💡', beschreibung: r.beschreibung ?? '', baum: r.baum ?? 'laden',
        spalte: r.spalte ?? 0, zeile: r.zeile ?? 0, level: r.level ?? 1, kosten: r.kosten ?? 0,
        voraussetzungen: r.voraussetzungen ?? [],
        schaltetFrei: { bau: r.schaltetFrei?.bau ?? [], rezepte: r.schaltetFrei?.rezepte ?? [], kategorien: r.schaltetFrei?.kategorien ?? [] },
        start: r.start ?? false, bald: r.bald ?? false,
      };
    });
    const ids = new Set(nodes.map((n) => n.id));
    const baeume = new Set((this.forschungWerte.baeume ?? []).map((b) => b.id));
    for (const n of nodes) {
      const where = `forschung/baum.json (${n.id})`;
      if (!baeume.has(n.baum)) throw new Error(`${where}: unbekannter Baum "${n.baum}" (siehe forschung/standard.json → baeume)`);
      for (const v of n.voraussetzungen) if (!ids.has(v)) throw new Error(`${where}: unbekannte Voraussetzung "${v}"`);
      const mark = (d: { forschung?: string }, art: string, id: string) => {
        if (d.forschung) throw new Error(`${where}: ${art} "${id}" wird schon von "${d.forschung}" freigeschaltet`);
        d.forschung = n.id;
      };
      for (const id of n.schaltetFrei.bau) mark(this.bau.get(id), 'Bauteil', id);
      for (const id of n.schaltetFrei.rezepte) mark(this.rezepte.get(id), 'Rezept', id);
      for (const k of n.schaltetFrei.kategorien) {
        if (!this.kategorien.has(k)) throw new Error(`${where}: unbekannte Kategorie "${k}"`);
        for (const p of this.produkte.all()) if (p.kategorie === k) mark(p, 'Produkt', p.id);
      }
    }
    return nodes;
  }

  /** Text zu einem Schlüssel; Platzhalter wie {level} werden ersetzt. Ohne Text: der Schlüssel selbst. */
  text(key: string, werte: Record<string, string | number> = {}): string {
    return (this.texte[key] ?? key).replace(/\{(\w+)\}/g, (m, name: string) => (name in werte ? String(werte[name]) : m));
  }

  /** Querverweise prüfen: Kategorien, Kontexte und Werte müssen bekannt sein. */
  private crossCheck(): void {
    for (const p of this.waren.all()) {
      if (!this.kategorien.has(p.kategorie)) throw new Error(`${p.rohstoff ? 'rohstoffe' : 'produkte'}/${p.id}.json: unbekannte Kategorie "${p.kategorie}"`);
    }
    const maschinen = new Set(this.bau.all().flatMap((b) => (b.maschine ? [b.maschine.typ] : [])));
    for (const r of this.rezepte.all()) {
      const where = `rezepte/${r.id}.json`;
      if (!maschinen.has(r.maschine)) throw new Error(`${where}: keine Maschine vom Typ "${r.maschine}" in data/bau`);
      for (const l of [...r.eingang, r.ausgang]) if (!this.waren.has(l.ware)) throw new Error(`${where}: unbekannte Ware "${l.ware}"`);
    }
    const gruppen = new Set(this.baumenue.bereiche.flatMap((a) => a.gruppen.map((g) => `${a.id}/${g.id}`)));
    for (const b of this.bau.all()) {
      if (b.gruppe && !gruppen.has(b.gruppe)) throw new Error(`bau/${b.id}.json: unbekannte Gruppe "${b.gruppe}" (siehe baumenue/standard.json → bereiche)`);
      if (b.variante && !(b.variante.familie in this.baumenue.familien)) throw new Error(`bau/${b.id}.json: Familie "${b.variante.familie}" fehlt in baumenue/standard.json → familien`);
      for (const f of b.funktionen) if (!FUNKTIONEN.includes(f)) throw new Error(`bau/${b.id}.json: unbekannte Funktion "${f}" (bekannt: ${FUNKTIONEN.join(', ')})`);
      if (b.kontext && !(b.kontext in this.kontexte)) throw new Error(`bau/${b.id}.json: unbekannter Kontext "${b.kontext}"`);
      for (const key of Object.keys(b.werte)) {
        if (!(key in this.werte)) throw new Error(`bau/${b.id}.json: Wert "${key}" fehlt in werte/standard.json`);
      }
    }
  }
}
