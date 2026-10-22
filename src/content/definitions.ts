import { asObject, bool, num, numList, numberMap, optStr, str, strList, vec3, type Raw } from './validate';

// Datenformate der Inhalte und ihre Prüfung.
// Ein neues Feld kommt hier dazu – Logik, die das Feld nicht kennt, bleibt unberührt.

/** Warenkategorie, z. B. "Molkerei & Eier" (data/sortiment/kategorien.json). */
export interface CategoryDef {
  id: string;
  name: string;
}

/** Ein Produkt (data/produkte/*.json). EK = Großhandelspreis, VK = Regalpreis. */
export interface ProductDef {
  id: string;
  name: string;
  kategorie: string;
  ek: number;
  vk: number;
  /** Stück pro Karton beim Einkauf. */
  gebinde: number;
  frisch: boolean;
  /** Muss gekühlt werden (nur in Regale mit Kühlung). */
  kuehlung: boolean;
  freischaltLevel: number;
  /** Forschung, die das freischaltet (aus data/forschung/baum.json, beim Laden gesetzt) */
  forschung?: string;
  /** true, solange EK/VK nur Startwerte je Kategorie sind (siehe scripts/import-3d.config.json). */
  preisOffen: boolean;
  /** Pfad unter data/, z. B. "3d/Produkte/…/SM_Apfel_Rot.fbx". */
  model?: string;
  icon?: string;
  /** Maße in Metern: Breite, Höhe, Tiefe. */
  groesse?: [number, number, number];
  /** Rohstoff (data/rohstoffe): nur für Maschinen, nicht für Regale und Kunden */
  rohstoff: boolean;
}

/** Maschine: welcher Typ (für die Rezepte) und was sie im Betrieb verbraucht. */
export interface MachineDef {
  typ: string;
  /** kW, solange sie läuft */
  strom: number;
  /** l/h, solange sie läuft */
  wasser: number;
  /** "zentral": Produktionslinie – holt Rohstoffe aus dem Zentrallager und liefert dorthin (sonst: Ladenlager) */
  lager?: 'zentral';
}

/** Produktion im Industriegebiet (data/produktion/standard.json) */
export interface ProductionLineDef {
  id: string;
  name: string;
  /** Diese Warengruppen kann die Linie herstellen (alle Produkte darin) */
  kategorien: string[];
  rohstoff: { id: string; name: string };
  farbe: string;
  strom: number;
  wasser: number;
  level: number;
}

export interface ProductionSettings {
  rohstoffAnteil: number;
  rohstoffEk: number;
  rohstoffGebinde: number;
  minutenGrund: number;
  minutenProStueck: number;
  linien: ProductionLineDef[];
}

/** Ein Rezept (data/rezepte/*.json): aus Waren wird in einer Maschine eine neue Ware. */
export interface RecipeDef {
  id: string;
  name: string;
  maschine: string;
  eingang: { ware: string; menge: number }[];
  ausgang: { ware: string; menge: number };
  /** Spielminuten */
  dauer: number;
  freischaltLevel: number;
  /** Forschung, die das freischaltet (aus data/forschung/baum.json, beim Laden gesetzt) */
  forschung?: string;
}

/** Eine Versorgungsart (Strom, Wasser) mit Hausanschluss und Ausbaustufen (data/versorgung). */
export interface UtilityDef {
  name: string;
  einheit: string;
  verbrauchEinheit: string;
  /** € je verbrauchter Einheit (kWh, l) */
  preis: number;
  stufen: { anschluss: number; preis: number; freischaltLevel: number }[];
}

export type UtilitySettings = Record<'strom' | 'wasser', UtilityDef>;

/** Lieferungen per LKW (data/logistik/standard.json) */
export interface LogisticsSettings {
  /** Uhrzeiten "HH:MM", zu denen normale Lieferungen kommen */
  liefertermine: string[];
  lieferkosten: { grund: number; proKarton: number; proPalette?: number };
  /** Express: kommt nach `minuten` Spielminuten, kostet `aufschlag` zusätzlich */
  express: { aufschlag: number; minuten: number };
  /** So lange wartet der LKW aufs Abladen, dann lädt der Fahrer selbst ab */
  wartezeitMinuten: number;
  fahrerAbladenProKarton: number;
  xpProKartonAbladen: number;
  lkw: {
    model: string;
    /** Länge (entlang der Fahrtrichtung), Höhe, Breite in m */
    groesse: [number, number, number];
    /** Ladefläche in Längsrichtung von … bis (m ab Mitte), Breite, Höhe über dem Boden, Kartonlagen */
    ladeflaeche: { von: number; bis: number; breite: number; hoehe: number; ebenen: number };
    /** m pro Sekunde (Simulationszeit) */
    geschwindigkeit: number;
    /** Zellgröße (m) des Fahrrasters, auf dem LKW ihren Weg zu Ladetoren suchen */
    fahrraster: number;
    /** Scheinwerfer, Rück-, Begrenzungsleuchten und Blinker */
    licht?: LightDef;
  };
}

/** Maße und Ersatzfarbe. Die Maße gelten auch, wenn es ein Modell gibt (Grundfläche fürs Bauen). */
export interface PlaceholderDef {
  groesse: [number, number, number]; // Breite, Höhe, Tiefe in Metern
  farbe: string;
}

/**
 * Bau-Ebene: bestimmt Höhe und Kollision beim Bauen.
 * boden = Fliesen/Gehweg, wand = Wände/Fenster/Türen, anbau = an Wänden (Markise …),
 * objekt = steht auf dem Boden, decke = hängt unter der Decke.
 */
export type BuildLayer = 'boden' | 'wand' | 'anbau' | 'objekt' | 'decke';
const LAYERS: BuildLayer[] = ['boden', 'wand', 'anbau', 'objekt', 'decke'];

/** Regal mit Fächern für Ware. Mit `ebenen` (Höhen der Böden) wird die Ware sichtbar einsortiert. */
export interface ShelfDef {
  /** Höhen der Regalböden in Metern; je Boden ein Fach. */
  ebenen?: number[];
  /** Anzahl Fächer, wenn keine Ebenen angegeben sind (Ware dann nicht sichtbar). */
  faecher: number;
  /** Stück pro Fach. */
  kapazitaet: number;
  /** Lage der Ware in der Tiefe (lokales X) und nutzbare Länge (lokales Z). */
  mitte: number;
  laenge: number;
  kuehlung: boolean;
}

/**
 * Kasse: wo Kunden anstehen und wo das Personal steht (lokale Koordinaten x, z des Modells).
 * Die Warteschlange beginnt bei `kunde` und wächst in `richtung`, je Kunde um `abstand` Meter.
 */
export interface CheckoutDef {
  kunde: [number, number];
  personal: [number, number];
  richtung: [number, number];
  abstand: number;
  /** Bedientheke (Café-Tresen): Kunden bestellen hier, bedient wird aus dem eigenen Regalfach, bezahlt gleich hier */
  bedienung: boolean;
}

/** Ein Bauelement (data/bau/*.json). `werte` werden auf Raum-/Gebäudeebene summiert. */
export interface BuildDef {
  id: string;
  name: string;
  kategorie: string;
  ebene: BuildLayer;
  regal?: ShelfDef;
  kasse?: CheckoutDef;
  maschine?: MachineDef;
  /** Türen und Durchgänge: Figuren dürfen hindurchgehen, obwohl es eine Wand ist. */
  durchgang: boolean;
  /** Außenfläche (z. B. Gehweg): zählt beim Einrasten von Wänden nicht als Innenraum */
  aussen: boolean;
  /** Interaktions-Kontext (data/interaktion/kontexte.json). Ohne Kontext ist das Element nicht anklickbar. */
  kontext?: string;
  /** Besondere Fähigkeiten, z. B. ["einkauf"]. Jede Funktion wird zu einer Komponente (siehe factory). */
  funktionen: string[];
  /** Senkt das Gelände ab (Rampenabfahrt vor einem Ladetor): Tiefe, flacher Teil und Schräge (m) entlang +X, Breite */
  absenkung?: { tiefe: number; flach: number; schraege: number; breite: number };
  /** Nur befahrbar (LKW), nicht begehbar */
  fahrbahn: boolean;
  /** Lichtschiene: Schienenleuchten hängen daran */
  schiene: boolean;
  /** Schienenleuchte: lässt sich nur unter eine Lichtschiene hängen */
  anSchiene: boolean;
  /** Nicht im Baumenü (ersetzt durch neuere Bauteile); bleibt für alte Spielstände ladbar */
  ausgeblendet: boolean;
  /** Platz im Baumenü: "bereich/gruppe", z. B. "lager/regalsysteme" */
  gruppe?: string;
  /** Variante einer Familie (z. B. Wandregal in Weiß): Familie, Name und Farbe des Farbtupfers */
  variante?: { familie: string; name: string; farbe: string };
  /** Palettenplätze: so viele Paletten nebeneinander (entlang lokal Z) auf dieser Höhe (m), z. B. Traverse oder Bodenstellplatz */
  palettenplaetze?: { anzahl: number; hoehe: number };
  /** Fahrzeug für Paletten (steht hier geparkt): Gabelstapler oder Hubwagen */
  fahrzeug?: VehicleKind;
  /** Palettenregal-System: Stützrahmen (Höhe aus dem Platzhalter), Traversen-Ebene zwischen zwei Rahmen (Feldbreite in m) oder Zubehör */
  palettenregal?: { teil: 'rahmen' | 'traverse' | 'zubehoer'; breite?: number };
  /** Unterstand für Einkaufswagen: so viele Wagen stehen darin */
  wagenbox?: { anzahl: number };
  /** Sitzplätze (x, z in m relativ zum Bauteil, optional Blickrichtung in Grad: 0 = nach vorne +X), z. B. Stühle am Bistrotisch */
  sitze?: [number, number, number?][];
  /** Umkleidekabine: Modell des geschlossenen Vorhangs und wo man davor wartet (x, z in m relativ zum Bauteil) */
  umkleide?: { vorhang: string; eingang: [number, number] };
  /** Verfallenes Altbau-Teil: wird beim Renovieren durch `zu` ersetzt (null: kommt weg); `kosten` je Teil */
  renovierung?: { zu: string | null; kosten: number };
  /** Wohnetage oder Dach über dem Erdgeschoss: nur zu sehen, wenn auch das Dach zu sehen ist (herausgezoomt) */
  obergeschoss: boolean;
  /** Lampe: wo sie leuchtet (relativ zum Bauteil), wie groß die Leuchtfläche ist, Farbe, Stärke, Reichweite (m) */
  licht?: LightDef;
  /** Ablagefläche für Kartons: gestapelt auf der Oberseite (`ebenen`) oder auf Regalböden (`boeden`, Höhen in m). */
  ablage?: { ebenen?: number; boeden?: number[] };
  preis: number;
  freischaltLevel: number;
  /** Forschung, die das freischaltet (aus data/forschung/baum.json, beim Laden gesetzt) */
  forschung?: string;
  werte: Record<string, number>;
  platzhalter: PlaceholderDef;
  model?: string;
  icon?: string;
}

export interface LightDef {
  position: [number, number, number];
  groesse: [number, number, number];
  farbe: string;
  staerke: number;
  reichweite: number;
  /** Weitere Leuchtflächen ohne eigenes Licht (z. B. Rückleuchten); `blinkt`: Blinker/Warnblinker */
  zusatz?: { position: [number, number, number]; groesse: [number, number, number]; farbe: string; blinkt?: boolean }[];
}

/** Gelände-Werkzeug (data/gelaende/standard.json) */
export interface TerrainSettings {
  zelle: number;
  maxHoehe: number;
  /** Höhenstufe der Voxel-Darstellung (m) */
  stufe: number;
  preisProKubikmeter: number;
  tempo: number;
  pinsel: number[];
  erde: string;
}

/** Eine Form eines Stempels im 100 × 100-Feld: SVG-Pfad (gefüllt, mit `linie` als Umriss) oder Text */
export interface StampShape {
  pfad?: string;
  linie?: number;
  text?: string;
  /** Schriftgröße im 100er-Feld */
  groesse?: number;
  /** CSS-Schrift, `{g}` wird durch die Größe ersetzt */
  schrift?: string;
}

/** Stempel-Vorlage für Bodenmarkierungen */
export interface StampDef {
  id: string;
  name: string;
  /** Breite × Tiefe in m (bei Größe 100 %) */
  groesse: [number, number];
  preis: number;
  formen: StampShape[];
}

/** Bodenmarkierungen (data/markierungen/standard.json) */
export interface MarkingSettings {
  /** Pixel je Meter auf der Malschicht */
  aufloesung: number;
  /** Abstand der Malschicht über Rasen und Bodenplatten (m) */
  hoehe: number;
  deckkraft: number;
  preisProQuadratmeter: number;
  /** Strichbreiten (m) */
  breiten: number[];
  stempelGroessen: number[];
  farben: { id: string; name: string; farbe: string }[];
  stempel: StampDef[];
}

/** Effekte und Bewegungen (data/effekte/standard.json) */
export interface EffectSettings {
  an: boolean;
  /** Menge der Partikel, 1 = normal */
  menge: number;
  /** Schwebende Texte („+12,40 €“) zeigen */
  texte: boolean;
  staub: string[];
  muenzen: string[];
  funkeln: string[];
  rauch: string[];
  /** Bauvorschau: Nachführen (Position, Drehung) und Schweben (m) */
  vorschau: { folgen: number; drehen: number; schweben: number };
  /** Auspuff des LKW (lokal, vorne ist +X) */
  lkwAuspuff: [number, number, number];
}

/** Tag und Nacht (data/licht/standard.json) */
export interface DaylightSettings {
  sonnenaufgang: string;
  sonnenuntergang: string;
  daemmerungMinuten: number;
  tag: { sonne: number; umgebung: number };
  nacht: { sonne: number; umgebung: number; himmel: string; sonnenfarbe: string };
  daemmerung: { sonnenfarbe: string; himmel: string };
  lampen: { anzahl: number; nachtVerstaerkung: number; buendeln?: { abstand: number; zusatz: number; maxFaktor: number; tiefer?: number; abfall?: number } };
  /** Warmer Grund-Look: Farben des Umgebungslichts, Sonnenfarbe, Dunst (m), Belichtung, Schattenweichheit */
  stimmung: { himmelLicht: string; bodenLicht: string; sonne: string; nebel: { nah: number; fern: number }; belichtung: number; schattenWeich: number };
}

/** Ein Interaktions-Kontext, z. B. "Regal" (data/interaktion/kontexte.json). */
export interface ContextInfo {
  name: string;
}

/** Einstellungen des Baumenüs (data/baumenue/standard.json). */
/** Baumenü: ein Bereich (linke Leiste) mit seinen Gruppen */
export interface BuildArea {
  id: string;
  name: string;
  icon: string;
  gruppen: { id: string; name: string; spezial?: 'grundstuecke' | 'gelaende' | 'markierungen' }[];
}

export interface BuildSettings {
  /** Bereiche und Gruppen des Baumenüs */
  bereiche: BuildArea[];
  /** Anzeigenamen der Familien (Varianten eines Bauteils) */
  familien: Record<string, string>;
  /** Rückfall für Bauteile ohne "gruppe" (z. B. aus dem Voxel-Editor): alter Reiter → Gruppe */
  alteKategorien?: Record<string, string>;
  raster: number;
  deckenhoehe: number;
  /** Palettenregal: mögliche Höhen der Traversen-Ebenen über dem Boden (m), von unten nach oben */
  regalEbenen?: number[];
  /** Wände ein-/ausblenden (Sockelhöhe, Umkreis, Überstand, Tempo) */
  waende?: { sockel: number; radius: number; ueberstand: number; tempo: number };
  /** Palettenregal: Feldbreiten (m) zum Einrasten der Stützrahmen und Abstand Rücken an Rücken (m) */
  regalFelder?: number[];
  regalDistanz?: number;
  rueckerstattung: number;
  /** Wie weit Wände von der Fliesenkante nach außen rücken (halbe Wandstärke) */
  wandVersatz?: number;
  /** Dach über allen Innenräumen: ab diesem Kameraabstand sichtbar, Dicke, Überstand über die Wände, Farben */
  dach?: { abAbstand: number; dicke: number; ueberstand: number; farbe: string; kante: string };
  kategorien: BuildCategory[];
}

/**
 * Ein Tab im Baumenü. Ein Bauteil gehört dazu, wenn seine Kategorie in `kategorien` steht
 * (falls angegeben) und seine Ebene in `ebenen` (falls angegeben).
 * `spezial` = eigener Inhalt statt Bauteilen (z. B. "grundstuecke").
 */
export interface BuildCategory {
  id: string;
  name: string;
  kategorien?: string[];
  ebenen?: BuildLayer[];
  spezial?: 'grundstuecke' | 'gelaende' | 'markierungen';
}

/** Gruppe eines Bauteils im Baumenü ("bereich/gruppe") */
export function buildGroupOf(def: BuildDef, s: BuildSettings): string | null {
  if (def.gruppe) return def.gruppe;
  const alt = s.kategorien.find((k) => inBuildCategory(def, k));
  return alt ? s.alteKategorien?.[alt.id] ?? null : null;
}

export function inBuildCategory(def: BuildDef, c: BuildCategory): boolean {
  if (c.spezial) return false;
  return (!c.kategorien || c.kategorien.includes(def.kategorie)) && (!c.ebenen || c.ebenen.includes(def.ebene));
}

/** Eine Rolle für Angestellte (data/personal/rollen.json). */
export interface RoleDef {
  name: string;
  beschreibung: string;
  lohnProTag: number;
  farbe: string;
  /** Was die Person tut: "auffuellen" oder "kassieren" (je Verhalten eine Komponente) */
  verhalten: 'auffuellen' | 'kassieren' | 'abladen' | 'einkaufen' | 'bedienen' | 'paletten';
  /** Bewirbt sich erst, wenn diese Forschung erledigt ist (z. B. Barista → Café-Ecke) */
  forschung?: string;
}

/** Einkäufer: automatisches Nachbestellen (data/personal/standard.json → "einkauf") */
export interface BuyerSettings {
  /** Wie oft der Einkäufer die Bestände prüft (Spielminuten) */
  pruefenAlleMinuten: number;
  /** So viele volle Kartons je Produkt sollen zusätzlich zum Regalplatz da sein */
  reserveKartons: number;
  /** Unter diesen Kontostand bestellt der Einkäufer nichts */
  mindestGuthaben: number;
  /** "normal" (nächster Liefertermin) oder "express" */
  versand: 'normal' | 'express';
}

/** Einstellungen für Personal (data/personal/standard.json). */
export interface StaffSettings {
  bewerberAnzahl: number;
  tempo: { min: number; max: number };
  gehgeschwindigkeit: number;
  sekundenProStueck: number;
  startPunkt: [number, number, number];
  einkauf: BuyerSettings;
}

/** Belohnungen für Arbeit (data/arbeit/standard.json). */
export interface WorkSettings {
  xpProKartonVonHand: number;
  /** Kassieren von Hand (Klick auf die Kasse) */
  xpProKundeVonHand: number;
  /** Jeder bezahlte Einkauf, auch über Kassierer */
  xpProKunde: number;
  /** Maschine von Hand gestartet */
  xpProProduktionVonHand?: number;
}

/** Kunden: Öffnungszeiten, Andrang, Verhalten, Ruf (data/kunden/standard.json). */
export interface CustomerSettings {
  oeffnung: string;
  schluss: string;
  /** Neue Kunden pro Spielstunde, je Stunde des Tages (24 Werte), bei mittlerem Ruf */
  kundenProStunde: number[];
  maxImLaden: number;
  wuensche: { min: number; max: number };
  menge: { min: number; max: number };
  /** Anteil der Wünsche, die aus dem aktuellen Sortiment kommen (der Rest: irgendein freigeschaltetes Produkt) */
  wunschAusSortiment: number;
  gehgeschwindigkeit: { min: number; max: number };
  sekundenProGriff: number;
  /** So lange (Sekunden) wartet ein Kunde an der Kasse, bevor er geht */
  geduld: number;
  kassierenSekundenProArtikel: number;
  ruf: { start: number; zufrieden: number; jeFehlendemArtikel: number; keineKasse: number; zuLangeGewartet: number };
  /** Andrang bei Ruf 0 und Ruf 100 (dazwischen gleichmäßig) */
  rufFaktor: { min: number; max: number };
  /** Zeitfaktor, wenn geschlossen ist und niemand mehr im Laden ist */
  nachtVorlauf: number;
  /**
   * Preisempfinden, bezogen auf den empfohlenen Verkaufspreis (vk aus den Produktdaten):
   * bis vk × (1 + toleranz) kauft jeder; darüber sinkt die Kaufchance um `elastizitaet` je 100 % Aufschlag.
   * Ab vk × schnaeppchenAb oder billiger freut sich der Kunde (kleiner Ruf-Bonus).
   */
  preis: { toleranz: number; elastizitaet: number; schnaeppchenAb: number; rufJeZuTeuer: number; rufJeSchnaeppchen: number; min: number; max: number };
  /**
   * Einkaufswagen: Wer mindestens `abArtikel` Teile kaufen will, holt sich einen leeren Wagen aus einer Wagenbox
   * (wenn eine da ist), packt nach dem Bezahlen ein (`packSekundenProArtikel`) und bringt ihn zurück.
   */
  einkaufswagen?: { model: string; abArtikel: number; packSekundenProArtikel: number };
  /** Café: Wer etwas aus diesen Kategorien gekauft hat, setzt sich (wenn ein Platz frei ist) so lange hin (Sekunden) */
  cafe?: { kategorien: string[]; chance: number; sitzSekunden: { min: number; max: number }; sitzTiefe: number; zubereitenSekundenProArtikel: number };
  /** Mode: Wer Kleidung im Korb hat, probiert sie (mit `chance`) in einer freien Umkleide an; `passtNicht`: hängt ein Teil zurück */
  anprobieren?: { kategorien: string[]; chance: number; sekunden: { min: number; max: number }; passtNicht: number };
  /**
   * Auswahl (Balancing): Je mehr verschiedene Produkte im Regal stehen, desto mehr Kunden kommen
   * (Faktor `min` bei keinem, 1 bei `referenz` Produkten, bis `max`) und desto größer ist der Einkauf
   * (je `wunschJeProdukte` Produkte ein Wunsch mehr, höchstens `wunschBonusMax`).
   */
  auswahl?: { referenz: number; min: number; max: number; wunschJeProdukte: number; wunschBonusMax: number };
  /** Zusätzliche Kunden gleichzeitig im Laden je weiterer Kasse */
  maxImLadenProKasse?: number;
  /** Ruf-Gewinne werden nach oben hin kleiner (0 = gleichbleibend, 1 = bei 100 kein Gewinn mehr) */
  rufSaettigung?: number;
}

/** Raster für die Wegfindung (data/navigation/standard.json). */
export interface NavSettings {
  zelle: number;
  /** Abstand der Figuren zu Hindernissen */
  radius: number;
}

/** Ein Ziel für den Einstieg (data/ziele/start.json); wann es erfüllt ist, steht im Code. */
export interface GoalDef {
  id: string;
  text: string;
  belohnung: { geld?: number; xp?: number };
}

/** Einstellungen für Kartons (data/lager/standard.json). */
export interface StorageSettings {
  karton: { groesse: [number, number, number]; farbe: string };
  /** Europalette: Maße (m), Lagen Kartons, Rabatt beim Kauf ganzer Paletten, Modell */
  palette: { groesse: [number, number, number]; lagen: number; rabatt: number; model: string };
  /** Gabelstapler und Hubwagen: Tempo (m/s), Hubgeschwindigkeit (m/s), größte Hubhöhe (m), Modelle */
  fahrzeuge: Record<VehicleKind, { tempo: number; hub: number; maxHoehe: number; model: string; gabel?: string; vorn: number; gabelY: number; modellVersatz: number; plaetze?: number }>;
  sekundenAufnehmen: number;
  palettenEinraeumenSekundenProKarton: number;
}

export type VehicleKind = 'gabelstapler' | 'hubwagen' | 'rollwagen';

/** Anzeigename und Einheit eines Werts (data/werte/standard.json). */
export interface ValueInfo {
  name: string;
  einheit: string;
}

export function validateCategory(raw: unknown, where: string): CategoryDef {
  const o = asObject(raw, where);
  return { id: str(o, 'id', where), name: str(o, 'name', where) };
}

export function validateProduct(raw: unknown, where: string): ProductDef {
  const o = asObject(raw, where);
  return {
    id: str(o, 'id', where),
    name: str(o, 'name', where),
    kategorie: str(o, 'kategorie', where),
    ek: num(o, 'ek', where, 0),
    vk: num(o, 'vk', where, 0),
    gebinde: num(o, 'gebinde', where, 1),
    frisch: bool(o, 'frisch', where),
    kuehlung: o.kuehlung === undefined ? false : bool(o, 'kuehlung', where),
    freischaltLevel: num(o, 'freischaltLevel', where, 1),
    preisOffen: o.preisOffen === undefined ? false : bool(o, 'preisOffen', where),
    model: optStr(o, 'model', where),
    icon: optStr(o, 'icon', where),
    groesse: o.groesse === undefined ? undefined : vec3(o, 'groesse', where),
    rohstoff: o.rohstoff === undefined ? false : bool(o, 'rohstoff', where),
  };
}

export function validateRecipe(raw: unknown, where: string): RecipeDef {
  const o = asObject(raw, where);
  const line = (r: unknown, w: string) => { const l = asObject(r, w); return { ware: str(l, 'ware', w), menge: num(l, 'menge', w, 1) }; };
  if (!Array.isArray(o.eingang) || !o.eingang.length) throw new Error(`${where}: "eingang" muss eine Liste mit mindestens einer Ware sein`);
  return {
    id: str(o, 'id', where),
    name: str(o, 'name', where),
    maschine: str(o, 'maschine', where),
    eingang: o.eingang.map((r, i) => line(r, `${where} → eingang[${i}]`)),
    ausgang: line(o.ausgang, `${where} → ausgang`),
    dauer: num(o, 'dauer', where, 1),
    freischaltLevel: num(o, 'freischaltLevel', where, 1),
  };
}

export function validateBuild(raw: unknown, where: string): BuildDef {
  const o = asObject(raw, where);
  const ph = asObject(o.platzhalter, `${where} → platzhalter`);
  return {
    id: str(o, 'id', where),
    name: str(o, 'name', where),
    kategorie: str(o, 'kategorie', where),
    ebene: layer(o, where),
    regal: o.regal === undefined ? undefined : shelf(o.regal, `${where} → regal`),
    kasse: o.kasse === undefined ? undefined : checkout(o.kasse, `${where} → kasse`),
    maschine: o.maschine === undefined ? undefined : machine(o.maschine, `${where} → maschine`),
    durchgang: o.durchgang === undefined ? false : bool(o, 'durchgang', where),
    aussen: o.aussen === undefined ? false : bool(o, 'aussen', where),
    kontext: optStr(o, 'kontext', where),
    funktionen: strList(o, 'funktionen', where),
    ablage: o.ablage === undefined ? undefined : storage(o.ablage, `${where} → ablage`),
    licht: o.licht === undefined ? undefined : light(o.licht, `${where} → licht`),
    absenkung: o.absenkung === undefined ? undefined : (() => {
      const w = `${where} → absenkung`, x = asObject(o.absenkung, w);
      return { tiefe: num(x, 'tiefe', w, 0.1), flach: num(x, 'flach', w, 1), schraege: num(x, 'schraege', w, 1), breite: num(x, 'breite', w, 1) };
    })(),
    fahrbahn: o.fahrbahn === undefined ? false : bool(o, 'fahrbahn', where),
    schiene: o.schiene === undefined ? false : bool(o, 'schiene', where),
    anSchiene: o.anSchiene === undefined ? false : bool(o, 'anSchiene', where),
    ausgeblendet: o.ausgeblendet === undefined ? false : bool(o, 'ausgeblendet', where),
    gruppe: optStr(o, 'gruppe', where),
    variante: o.variante === undefined ? undefined : (() => {
      const v = asObject(o.variante, `${where} → variante`);
      return { familie: str(v, 'familie', `${where} → variante`), name: str(v, 'name', `${where} → variante`), farbe: str(v, 'farbe', `${where} → variante`) };
    })(),
    palettenplaetze: o.palettenplaetze === undefined ? undefined : (() => {
      const p = asObject(o.palettenplaetze, `${where} → palettenplaetze`);
      return { anzahl: num(p, 'anzahl', `${where} → palettenplaetze`, 1), hoehe: num(p, 'hoehe', `${where} → palettenplaetze`, 0) };
    })(),
    fahrzeug: o.fahrzeug === undefined ? undefined : (() => {
      if (o.fahrzeug !== 'gabelstapler' && o.fahrzeug !== 'hubwagen' && o.fahrzeug !== 'rollwagen') throw new Error(`${where}: fahrzeug muss gabelstapler, hubwagen oder rollwagen sein`);
      return o.fahrzeug;
    })(),
    palettenregal: o.palettenregal === undefined ? undefined : (() => {
      const p = asObject(o.palettenregal, `${where} → palettenregal`);
      const teil = str(p, 'teil', `${where} → palettenregal`);
      if (teil !== 'rahmen' && teil !== 'traverse' && teil !== 'zubehoer') throw new Error(`${where}: palettenregal.teil muss rahmen, traverse oder zubehoer sein`);
      return { teil, breite: p.breite === undefined ? undefined : num(p, 'breite', `${where} → palettenregal`) };
    })(),
    wagenbox: o.wagenbox === undefined ? undefined : { anzahl: num(asObject(o.wagenbox, `${where} → wagenbox`), 'anzahl', `${where} → wagenbox`, 1) },
    sitze: o.sitze === undefined ? undefined : (() => {
      if (!Array.isArray(o.sitze) || o.sitze.some((p) => !Array.isArray(p) || p.length < 2 || p.some((v) => typeof v !== 'number'))) throw new Error(`${where}: sitze muss eine Liste aus [x, z] sein`);
      return (o.sitze as number[][]).map((p) => [p[0], p[1], p[2]] as [number, number, number?]);
    })(),
    umkleide: o.umkleide === undefined ? undefined : (() => {
      const u = asObject(o.umkleide, `${where} → umkleide`);
      const e = u.eingang;
      if (!Array.isArray(e) || e.length !== 2 || e.some((v) => typeof v !== 'number')) throw new Error(`${where}: umkleide.eingang muss [x, z] sein`);
      return { vorhang: str(u, 'vorhang', `${where} → umkleide`), eingang: [e[0], e[1]] as [number, number] };
    })(),
    renovierung: o.renovierung === undefined ? undefined : (() => {
      const r = asObject(o.renovierung, `${where} → renovierung`);
      return { zu: r.zu === null ? null : str(r, 'zu', `${where} → renovierung`), kosten: num(r, 'kosten', `${where} → renovierung`, 0) };
    })(),
    obergeschoss: o.obergeschoss === undefined ? false : bool(o, 'obergeschoss', where),
    preis: num(o, 'preis', where, 0),
    freischaltLevel: num(o, 'freischaltLevel', where, 1),
    werte: numberMap(o, 'werte', where),
    platzhalter: { groesse: vec3(ph, 'groesse', `${where} → platzhalter`), farbe: str(ph, 'farbe', `${where} → platzhalter`) },
    model: optStr(o, 'model', where),
    icon: optStr(o, 'icon', where),
  };
}

function light(raw: unknown, where: string): LightDef {
  const o = asObject(raw, where);
  return {
    position: vec3(o, 'position', where),
    groesse: vec3(o, 'groesse', where),
    farbe: str(o, 'farbe', where),
    staerke: num(o, 'staerke', where, 0),
    reichweite: num(o, 'reichweite', where, 0.1),
    zusatz: o.zusatz === undefined ? undefined : (Array.isArray(o.zusatz) ? o.zusatz : []).map((z, i) => {
      const w = `${where} → zusatz[${i}]`, x = asObject(z, w);
      return { position: vec3(x, 'position', w), groesse: vec3(x, 'groesse', w), farbe: str(x, 'farbe', w), blinkt: x.blinkt === undefined ? false : bool(x, 'blinkt', w) };
    }),
  };
}

function layer(o: Raw, where: string): BuildLayer {
  const v = str(o, 'ebene', where);
  if (!LAYERS.includes(v as BuildLayer)) throw new Error(`${where}: "ebene" muss eines von ${LAYERS.join(', ')} sein`);
  return v as BuildLayer;
}

function shelf(raw: unknown, where: string): ShelfDef {
  const o = asObject(raw, where);
  const ebenen = o.ebenen === undefined ? undefined : numList(o, 'ebenen', where);
  return {
    ebenen,
    faecher: ebenen ? ebenen.length : num(o, 'faecher', where, 1),
    kapazitaet: num(o, 'kapazitaet', where, 1),
    mitte: o.mitte === undefined ? 0 : num(o, 'mitte', where),
    laenge: o.laenge === undefined ? 1 : num(o, 'laenge', where, 0),
    kuehlung: o.kuehlung === undefined ? false : bool(o, 'kuehlung', where),
  };
}

function machine(raw: unknown, where: string): MachineDef {
  const o = asObject(raw, where);
  const lager = o.lager === undefined ? undefined : str(o, 'lager', where);
  if (lager !== undefined && lager !== 'zentral') throw new Error(`${where}: lager muss "zentral" sein`);
  return { typ: str(o, 'typ', where), strom: num(o, 'strom', where, 0), wasser: o.wasser === undefined ? 0 : num(o, 'wasser', where, 0), ...(lager ? { lager } : {}) };
}

function checkout(raw: unknown, where: string): CheckoutDef {
  const o = asObject(raw, where);
  const pair = (key: string): [number, number] => {
    const v = numList(o, key, where);
    if (v.length !== 2) throw new Error(`${where}: "${key}" muss zwei Zahlen haben [x, z]`);
    return [v[0], v[1]];
  };
  return { kunde: pair('kunde'), personal: pair('personal'), richtung: pair('richtung'), abstand: num(o, 'abstand', where, 0.1), bedienung: o.bedienung === undefined ? false : bool(o, 'bedienung', where) };
}

function storage(raw: unknown, where: string): { ebenen?: number; boeden?: number[] } {
  const o = asObject(raw, where);
  if (o.boeden !== undefined) return { boeden: numList(o, 'boeden', where) };
  return { ebenen: num(o, 'ebenen', where, 1) };
}
