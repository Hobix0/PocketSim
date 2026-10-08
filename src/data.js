// Spielinhalte: Werkzeugfertigung in einer Remscheider Fabrikhalle.
// Rohmaterial kommt über den Wareneingang, fertige Ware geht über den Versand.

export const ITEMS = {
  // Einkauf
  rundstahl:   { name: 'Rundstahl',        color: 0x7c8794, shape: 'bar',    price: 4,  buy: 4 },
  stahlblech:  { name: 'Stahlblech',       color: 0xa9b3bd, shape: 'sheet',  price: 5,  buy: 5 },
  holz:        { name: 'Kantholz',         color: 0xc29560, shape: 'plank',  price: 2,  buy: 2 },
  granulat:    { name: 'Kunststoffgranulat', color: 0x2f6fd0, shape: 'sack', price: 3,  buy: 3 },
  kupfer:      { name: 'Kupferdraht',      color: 0xd9824a, shape: 'coil',   price: 6,  buy: 6 },
  // Halbzeuge
  rohling:     { name: 'Stahlrohling',     color: 0x8d969f, shape: 'billet', price: 3 },
  welle:       { name: 'Welle',            color: 0xc7ced6, shape: 'shaft',  price: 12 },
  stiel:       { name: 'Holzstiel',        color: 0xd8ad74, shape: 'stick',  price: 3 },
  schmiedeteil:{ name: 'Schmiederohling',  color: 0x5b4f49, shape: 'forged', price: 10 },
  gehaertet:   { name: 'Gehärtetes Teil',  color: 0x3c4450, shape: 'forged', price: 16 },
  blechteil:   { name: 'Blechteil',        color: 0xb9c2ca, shape: 'plate',  price: 4 },
  gehaeuse:    { name: 'Blechgehäuse',     color: 0x2b5ea8, shape: 'box',    price: 12 },
  griff:       { name: 'Kunststoffgriff',  color: 0xd23a2f, shape: 'grip',   price: 3 },
  zahnrad:     { name: 'Zahnrad',          color: 0xd0d6dd, shape: 'gear',   price: 18 },
  spule:       { name: 'Spule',            color: 0xc8733a, shape: 'spool',  price: 20 },
  // Produkte
  hammer:      { name: 'Hammer',           color: 0x4a525c, shape: 'hammer', price: 26 },
  schluessel:  { name: 'Schraubenschlüssel', color: 0xd9dfe5, shape: 'wrench', price: 24 },
  zange:       { name: 'Zange',            color: 0xd23a2f, shape: 'pliers', price: 45 },
  getriebe:    { name: 'Getriebe',         color: 0x56606b, shape: 'gearbox', price: 80 },
  motor:       { name: 'Elektromotor',     color: 0x2f3a46, shape: 'motor',  price: 70 },
  koffer:      { name: 'Werkzeugkoffer',   color: 0xee6018, shape: 'case',   price: 160 },
  akkuschrauber: { name: 'Akkuschrauber',  color: 0x2d8a4e, shape: 'drill',  price: 260 },
};
export const ITEM_IDS = Object.keys(ITEMS);
export const BUYABLE = ITEM_IDS.filter(id => ITEMS[id].buy);

export const RECIPES = {
  r_rohling:   { building: 'saege',      time: 1.5, in: { rundstahl: 1 }, out: { rohling: 2 } },
  r_welle:     { building: 'drehbank',   time: 2,   in: { rohling: 1 },   out: { welle: 1 } },
  r_stiel:     { building: 'drehbank',   time: 1.5, in: { holz: 1 },      out: { stiel: 2 } },
  r_schmieden: { building: 'schmiede',   time: 2.5, in: { rohling: 1 },   out: { schmiedeteil: 1 } },
  r_haerten:   { building: 'haerteofen', time: 4,   in: { schmiedeteil: 2 }, out: { gehaertet: 2 } },
  r_schluessel:{ building: 'schleifen',  time: 2,   in: { gehaertet: 1 }, out: { schluessel: 1 } },
  r_hammer:    { building: 'werkbank',   time: 3,   in: { gehaertet: 1, stiel: 1 }, out: { hammer: 1 } },
  r_blechteil: { building: 'stanze',     time: 1,   in: { stahlblech: 1 }, out: { blechteil: 2 } },
  r_gehaeuse:  { building: 'kantbank',   time: 2,   in: { blechteil: 2 }, out: { gehaeuse: 1 } },
  r_griff:     { building: 'spritzguss', time: 2,   in: { granulat: 1 },  out: { griff: 2 } },
  r_zahnrad:   { building: 'fraese',     time: 3,   in: { rohling: 1 },   out: { zahnrad: 1 } },
  r_spule:     { building: 'wickel',     time: 2.5, in: { kupfer: 2 },    out: { spule: 1 } },
  r_zange:     { building: 'montage',    time: 4,   in: { gehaertet: 2, griff: 2 }, out: { zange: 1 } },
  r_getriebe:  { building: 'montage',    time: 5,   in: { zahnrad: 2, welle: 1, gehaeuse: 1 }, out: { getriebe: 1 } },
  r_motor:     { building: 'montage',    time: 5,   in: { spule: 1, welle: 1, gehaeuse: 1 }, out: { motor: 1 }, unlock: 'elektro' },
  r_koffer:    { building: 'montage',    time: 6,   in: { gehaeuse: 1, hammer: 1, schluessel: 1, zange: 1 }, out: { koffer: 1 } },
  r_akku:      { building: 'montage',    time: 8,   in: { motor: 1, getriebe: 1, griff: 2 }, out: { akkuschrauber: 1 }, unlock: 'akku' },
};

// kind: belt | splitter | junction | machine | inbound | outbound | rack | feeder | collector | parking | grid | decor
// Maschinen: Ausgang vorne (Drehrichtung), Eingänge hinten und seitlich.
// Aufgabe-/Abnahmestation: vorne ist die Bandseite, der Stapler kommt von hinten oder seitlich.
export const BUILDINGS = {
  band:       { name: 'Rollenbahn',       kind: 'belt',     size: 1, cost: 10,   cat: 'logistik',   desc: 'Transportiert Teile. Ziehen zum Verlegen, R zum Drehen.' },
  verteiler:  { name: 'Verteiler',        kind: 'splitter', size: 1, cost: 40,   cat: 'logistik',   desc: 'Verteilt Teile reihum auf alle anderen Seiten.' },
  kreuzung:   { name: 'Kreuzung',         kind: 'junction', size: 1, cost: 30,   cat: 'logistik',   desc: 'Zwei Bahnen kreuzen sich, ohne sich zu vermischen.' },
  regal:      { name: 'Palettenregal',    kind: 'rack',     size: 2, cost: 400,  cat: 'lager',      desc: 'Lagert bis zu 6 Paletten. Gabelstapler lagern ein und aus.', slots: 6 },
  aufgabe:    { name: 'Aufgabestation',   kind: 'feeder',   size: 2, cost: 350,  cat: 'lager',      desc: 'Eingangspunkt: Der Stapler bringt Paletten, die Teile laufen vorne auf die Rollenbahn.' },
  abnahme:    { name: 'Abnahmestation',   kind: 'collector', size: 2, cost: 350, cat: 'lager',      desc: 'Abgabepunkt: Teile vom Band (vorne) werden palettiert, der Stapler holt volle Paletten ab.' },
  station:    { name: 'Staplerstation',   kind: 'parking',  size: 2, cost: 1500, cat: 'lager',      desc: 'Parkplatz und Ladestation. Enthält einen Gabelstapler, bis zu drei möglich.', maxForklifts: 3, forkliftCost: 1200 },
  eingang:    { name: 'Wareneingang',     kind: 'inbound',  size: 2, cost: 800,  cat: 'lager',      desc: 'Rolltor an der Außenwand. Hier kommen bestellte Paletten per LKW an.', wall: true },
  versand:    { name: 'Versand',          kind: 'outbound', size: 2, cost: 800,  cat: 'lager',      desc: 'Rolltor an der Außenwand. Verkauft Paletten vom Stapler und Teile vom Band.', wall: true },

  saege:      { name: 'Bandsäge',         kind: 'machine',  size: 2, cost: 400,  cat: 'fertigung',  power: 20,  desc: 'Sägt Rundstahl in Rohlinge.' },
  drehbank:   { name: 'Drehbank',         kind: 'machine',  size: 2, cost: 600,  cat: 'fertigung',  power: 30,  desc: 'Dreht Wellen aus Rohlingen und Stiele aus Holz.' },
  schmiede:   { name: 'Gesenkschmiede',   kind: 'machine',  size: 2, cost: 1500, cat: 'fertigung',  power: 80,  desc: 'Schmiedet Rohlinge unter dem Fallhammer.', unlock: 'schmieden' },
  haerteofen: { name: 'Härteofen',        kind: 'machine',  size: 2, cost: 1800, cat: 'fertigung',  power: 110, desc: 'Härtet Schmiedeteile.', unlock: 'schmieden' },
  schleifen:  { name: 'Schleifmaschine',  kind: 'machine',  size: 2, cost: 900,  cat: 'fertigung',  power: 25,  desc: 'Schleift gehärtete Teile zu Schraubenschlüsseln.', unlock: 'schmieden' },
  stanze:     { name: 'Stanze',           kind: 'machine',  size: 2, cost: 1200, cat: 'fertigung',  power: 45,  desc: 'Stanzt Blechteile aus Stahlblech.', unlock: 'blech' },
  kantbank:   { name: 'Abkantpresse',     kind: 'machine',  size: 2, cost: 1400, cat: 'fertigung',  power: 40,  desc: 'Kantet Blechteile zu Gehäusen.', unlock: 'blech' },
  spritzguss: { name: 'Spritzguss',       kind: 'machine',  size: 2, cost: 2200, cat: 'fertigung',  power: 70,  desc: 'Spritzt Griffe aus Granulat.', unlock: 'kunststoff' },
  fraese:     { name: 'CNC-Fräse',        kind: 'machine',  size: 2, cost: 2600, cat: 'fertigung',  power: 55,  desc: 'Fräst Zahnräder aus Rohlingen.', unlock: 'cnc' },
  wickel:     { name: 'Wickelmaschine',   kind: 'machine',  size: 2, cost: 2400, cat: 'fertigung',  power: 35,  desc: 'Wickelt Spulen aus Kupferdraht.', unlock: 'elektro' },
  werkbank:   { name: 'Montagetisch',     kind: 'machine',  size: 2, cost: 700,  cat: 'montage',    power: 10,  desc: 'Handmontage: Hammerkopf und Stiel werden zum Hammer.', unlock: 'schmieden' },
  montage:    { name: 'Montagezelle',     kind: 'machine',  size: 3, cost: 6000, cat: 'montage',    power: 90,  desc: 'Roboterzelle für Baugruppen mit vielen Teilen.', unlock: 'montagezelle' },

  trafo:      { name: 'Trafostation',     kind: 'grid',     size: 2, cost: 2500, cat: 'energie',    supply: 300, desc: 'Anschluss ans Stadtnetz (300 kW). Strom kostet laufend Geld.' },

  // Altbestand in der Halle – kann gegen Entsorgungskosten entfernt werden
  altregal:   { name: 'Altes Regal',      kind: 'decor',    size: 2, cost: 0, removeCost: 120, desc: 'Altbestand. Abriss kostet Entsorgung.' },
  altbuero:   { name: 'Meisterbüro',      kind: 'decor',    size: 3, cost: 0, removeCost: 400, desc: 'Altbestand. Abriss kostet Entsorgung.' },
  palette:    { name: 'Alte Palette',     kind: 'decor',    size: 1, cost: 0, removeCost: 20,  desc: 'Altbestand. Abriss kostet Entsorgung.' },
};

export const CATEGORIES = [
  { id: 'lager',     name: 'Lager & Stapler' },
  { id: 'logistik',  name: 'Fördertechnik' },
  { id: 'fertigung', name: 'Fertigung' },
  { id: 'montage',   name: 'Montage' },
  { id: 'energie',   name: 'Energie' },
];

export const RESEARCH = [
  { id: 'schmieden',    name: 'Gesenkschmieden',     cost: 1500,  req: { welle: 40 },      prereq: [],                         desc: 'Schmiede, Härteofen, Schleifmaschine und Montagetisch: Hämmer und Schraubenschlüssel.' },
  { id: 'blech',        name: 'Blechbearbeitung',    cost: 2000,  req: { rohling: 120 },   prereq: [],                         desc: 'Stanze und Abkantpresse, Stahlblech im Einkauf.' },
  { id: 'band2',        name: 'Schnellere Rollenbahnen', cost: 2500, req: { welle: 120 },  prereq: [],                         desc: 'Alle Bahnen +60 % schneller.', effect: { beltMul: 1.6 } },
  { id: 'netz2',        name: 'Netzausbau',          cost: 3000,  req: { hammer: 40 },     prereq: ['schmieden'],              desc: 'Trafostationen liefern doppelte Leistung.', effect: { gridMul: 2 } },
  { id: 'kunststoff',   name: 'Kunststofftechnik',   cost: 4000,  req: { schluessel: 40 }, prereq: ['schmieden'],              desc: 'Spritzguss, Granulat im Einkauf: Kunststoffgriffe.' },
  { id: 'cnc',          name: 'CNC-Fertigung',       cost: 5000,  req: { gehaeuse: 40 },   prereq: ['blech'],                  desc: 'CNC-Fräse für Zahnräder.' },
  { id: 'montagezelle', name: 'Roboter-Montage',     cost: 8000,  req: { hammer: 80, gehaeuse: 60 }, prereq: ['schmieden', 'blech', 'kunststoff'], desc: 'Montagezelle: Zangen, Getriebe, Werkzeugkoffer.' },
  { id: 'lean',         name: 'Lean Production',     cost: 12000, req: { zange: 40 },      prereq: ['montagezelle'],           desc: 'Alle Maschinen arbeiten 25 % schneller.', effect: { machineMul: 1.25 } },
  { id: 'elektro',      name: 'Elektromotoren',      cost: 15000, req: { getriebe: 30 },   prereq: ['montagezelle', 'cnc'],    desc: 'Wickelmaschine und Kupferdraht: Elektromotoren.' },
  { id: 'band3',        name: 'Hochleistungsbahnen', cost: 12000, req: { koffer: 20 },     prereq: ['band2', 'montagezelle'],  desc: 'Bahnen nochmals +40 % schneller.', effect: { beltMul: 1.4 } },
  { id: 'akku',         name: 'Akkuwerkzeuge',       cost: 30000, req: { motor: 40 },      prereq: ['elektro'],                desc: 'Akkuschrauber: das Spitzenprodukt der Halle.' },
];
export const RESEARCH_BY_ID = Object.fromEntries(RESEARCH.map(r => [r.id, r]));

// Material, das am Wareneingang bestellt werden kann, je nach Forschung
export const BUY_UNLOCK = { stahlblech: 'blech', granulat: 'kunststoff', kupfer: 'elektro' };

export const GOALS = [
  { id: 'g1', text: 'Der Stapler lagert die erste Palette Rundstahl ins Regal ein', reward: 300, check: g => g.palletsIn('rack') >= 1 },
  { id: 'g2', text: 'Stell eine Aufgabestation für Rundstahl auf und führ das Band zu einer Bandsäge', reward: 400, check: g => (g.stats.produced.rohling || 0) >= 1 },
  { id: 'g3', text: 'Sammle Rohlinge an einer Abnahmestation – der Stapler bringt sie ins Lager', reward: 500, check: g => g.palletsIn('rack', 'rohling') >= 1 },
  { id: 'g4', text: 'Versende 40 Wellen (Drehbank, Rohlinge aus dem Lager)', reward: 800, check: g => (g.stats.sold.welle || 0) >= 40 },
  { id: 'g5', text: 'Erforsche „Gesenkschmieden“', reward: 800, check: g => g.research.has('schmieden') },
  { id: 'g6', text: 'Versende 20 Hämmer', reward: 1500, check: g => (g.stats.sold.hammer || 0) >= 20 },
  { id: 'g7', text: 'Schließe einen Auftrag ab', reward: 1500, check: g => g.stats.contractsDone >= 1 },
  { id: 'g8', text: 'Erforsche „Roboter-Montage“', reward: 3000, check: g => g.research.has('montagezelle') },
  { id: 'g9', text: 'Versende 5 Werkzeugkoffer', reward: 6000, check: g => (g.stats.sold.koffer || 0) >= 5 },
  { id: 'g10', text: 'Versende 10 Akkuschrauber', reward: 20000, check: g => (g.stats.sold.akkuschrauber || 0) >= 10 },
];

export const EVENTS = [
  { id: 'baumarkt',  title: 'Baumarkt-Aktion',  text: 'Hämmer & Schlüssel +60 %',      duration: 90, price: { hammer: 1.6, schluessel: 1.6 } },
  { id: 'stahl',     title: 'Stahlpreis steigt', text: 'Rundstahl & Blech kosten 50 % mehr', duration: 90, buy: { rundstahl: 1.5, stahlblech: 1.5 } },
  { id: 'messe',     title: 'Eisenwarenmesse',  text: 'Werkzeugkoffer +80 %',          duration: 90, price: { koffer: 1.8 } },
  { id: 'krise',     title: 'Energiekrise',     text: 'Netzstrom kostet das Dreifache', duration: 60, gridCost: 3 },
  { id: 'foerder',   title: 'Förderprogramm',   text: 'Die Stadt Remscheid zahlt dir einen Zuschuss', duration: 0, grant: true },
  { id: 'flaute',    title: 'Auftragsflaute',   text: 'Alle Verkaufspreise −20 %',      duration: 60, priceAll: 0.8 },
  { id: 'industrie', title: 'Industrieboom',    text: 'Getriebe & Motoren +50 %',       duration: 90, price: { getriebe: 1.5, motor: 1.5 } },
];

export const CONFIG = {
  hallW: 40,
  hallH: 26,
  columnEvery: 8,          // Hallenstützen in diesem Raster (blockieren Felder)
  startMoney: 9000,
  palletQty: 20,           // Teile pro Palette
  palletInterval: 14,      // Sekunden pro LKW-Palette am Wareneingang (Stufe 1)
  dockSlots: 3,            // Paletten, die am Tor warten können
  forkliftSpeed: 2.4,      // Felder pro Sekunde
  forkliftHandling: 1.2,   // Sekunden zum Auf- und Abladen
  partialPickup: 25,       // Teilpalette wird nach so vielen Sekunden ohne Nachschub abgeholt
  tickRate: 30,            // feste Simulationsrate
  beltSpeed: 1.2,          // Felder pro Sekunde
  beltSpacing: 0.25,
  beltHeight: 0.5,         // Auflagehöhe der Rollenbahn
  gridCostPerKWs: 0.012,
  dayLength: 480,
  refund: 0.8,
  saveVersion: 4,
};
