// Spielinhalte: Items, Rezepte, Gebäude, Forschung, Ziele, Ereignisse.

export const ITEMS = {
  holz:         { name: 'Holz',          color: 0x8b5a2b, shape: 'log',   price: 2 },
  eisenerz:     { name: 'Eisenerz',      color: 0x8a5a4a, shape: 'ore',   price: 3 },
  kupfererz:    { name: 'Kupfererz',     color: 0xc8743a, shape: 'ore',   price: 3 },
  kohle:        { name: 'Kohle',         color: 0x26262b, shape: 'ore',   price: 3 },
  sand:         { name: 'Sand',          color: 0xe6c88c, shape: 'pile',  price: 1 },
  bretter:      { name: 'Bretter',       color: 0xdba468, shape: 'plank', price: 5 },
  eisenplatte:  { name: 'Eisenplatte',   color: 0xb4bec8, shape: 'plate', price: 9 },
  kupferplatte: { name: 'Kupferplatte',  color: 0xe8884a, shape: 'plate', price: 9 },
  glas:         { name: 'Glas',          color: 0x9fe6f5, shape: 'glass', price: 12 },
  zahnrad:      { name: 'Zahnrad',       color: 0xcfd5dd, shape: 'gear',  price: 22 },
  draht:        { name: 'Kupferdraht',   color: 0xf09a55, shape: 'coil',  price: 6 },
  stahl:        { name: 'Stahlträger',   color: 0x5a6878, shape: 'beam',  price: 36 },
  schaltkreis:  { name: 'Schaltkreis',   color: 0x2fae6c, shape: 'chip',  price: 55 },
  motor:        { name: 'Motor',         color: 0x3e4c60, shape: 'motor', price: 160 },
  moebel:       { name: 'Möbel',         color: 0xb47844, shape: 'crate', price: 85 },
};
export const ITEM_IDS = Object.keys(ITEMS);

export const RECIPES = {
  r_eisen:       { name: 'Eisenplatte',  building: 'schmelzofen', time: 2,   in: { eisenerz: 1 },  out: { eisenplatte: 1 } },
  r_kupfer:      { name: 'Kupferplatte', building: 'schmelzofen', time: 2,   in: { kupfererz: 1 }, out: { kupferplatte: 1 } },
  r_glas:        { name: 'Glas',         building: 'schmelzofen', time: 3,   in: { sand: 2 },      out: { glas: 1 }, unlock: 'glas' },
  r_bretter:     { name: 'Bretter',      building: 'saegewerk',   time: 1.5, in: { holz: 1 },      out: { bretter: 2 } },
  r_zahnrad:     { name: 'Zahnrad',      building: 'presse',      time: 1.5, in: { eisenplatte: 2 }, out: { zahnrad: 1 } },
  r_draht:       { name: 'Kupferdraht',  building: 'presse',      time: 1,   in: { kupferplatte: 1 }, out: { draht: 2 } },
  r_stahl:       { name: 'Stahlträger',  building: 'hochofen',    time: 4,   in: { eisenplatte: 2, kohle: 1 }, out: { stahl: 1 } },
  r_schaltkreis: { name: 'Schaltkreis',  building: 'montage',     time: 3,   in: { draht: 3, eisenplatte: 1 }, out: { schaltkreis: 1 } },
  r_moebel:      { name: 'Möbel',        building: 'montage',     time: 4,   in: { bretter: 4, glas: 1 }, out: { moebel: 1 }, unlock: 'glas' },
  r_motor:       { name: 'Motor',        building: 'montage',     time: 5,   in: { zahnrad: 2, stahl: 1 }, out: { motor: 1 }, unlock: 'motorbau' },
};

// kind: belt | splitter | junction | miner | lumber | machine | depot | storage | grid | generator
export const BUILDINGS = {
  band:        { name: 'Förderband',    kind: 'belt',      size: 1, cost: 8,     cat: 'logistik',   desc: 'Transportiert Waren. Ziehen zum Verlegen, R zum Drehen.' },
  verteiler:   { name: 'Verteiler',     kind: 'splitter',  size: 1, cost: 40,    cat: 'logistik',   desc: 'Verteilt Waren reihum auf alle anderen Seiten.' },
  kreuzung:    { name: 'Kreuzung',      kind: 'junction',  size: 1, cost: 30,    cat: 'logistik',   desc: 'Lässt zwei Bänder sich kreuzen.' },
  lager:       { name: 'Lager',         kind: 'storage',   size: 2, cost: 300,   cat: 'logistik',   desc: 'Puffert bis zu 200 Waren und gibt sie an Bänder weiter.', capacity: 200 },
  depot:       { name: 'Handelsdepot',  kind: 'depot',     size: 3, cost: 1500,  cat: 'logistik',   desc: 'Verkauft alles, was angeliefert wird – und erfüllt Aufträge.' },

  bohrer:      { name: 'Bohrer',        kind: 'miner',     size: 2, cost: 250,   cat: 'gewinnung',  power: 25, desc: 'Fördert Erz, Kohle oder Sand. Je mehr Vorkommen unter ihm, desto schneller.' },
  holzfaeller: { name: 'Holzfäller',    kind: 'lumber',    size: 2, cost: 200,   cat: 'gewinnung',  power: 10, desc: 'Fällt Bäume im Umkreis von 3 Feldern. Neben einen Wald stellen.' },

  schmelzofen: { name: 'Schmelzofen',   kind: 'machine',   size: 2, cost: 400,   cat: 'produktion', power: 50,  desc: 'Verhüttet Erz zu Platten und Sand zu Glas.' },
  saegewerk:   { name: 'Sägewerk',      kind: 'machine',   size: 2, cost: 300,   cat: 'produktion', power: 30,  desc: 'Sägt Holz zu Brettern.' },
  presse:      { name: 'Presse',        kind: 'machine',   size: 2, cost: 500,   cat: 'produktion', power: 45,  desc: 'Presst Zahnräder und zieht Draht.', unlock: 'mechanik' },
  hochofen:    { name: 'Hochofen',      kind: 'machine',   size: 3, cost: 2500,  cat: 'produktion', power: 120, desc: 'Veredelt Eisen mit Kohle zu Stahl.', unlock: 'stahl' },
  montage:     { name: 'Montagehalle',  kind: 'machine',   size: 3, cost: 3000,  cat: 'produktion', power: 90,  desc: 'Baut komplexe Bauteile aus mehreren Zutaten.', unlock: 'montage' },

  netz:        { name: 'Netzanschluss', kind: 'grid',      size: 2, cost: 2000,  cat: 'energie',    supply: 250, desc: 'Bezieht Strom aus dem Stadtnetz (250 kW). Kostet laufend Geld.' },
  windrad:     { name: 'Windrad',       kind: 'generator', size: 1, cost: 700,   cat: 'energie',    supply: 40,  desc: 'Kostenloser Strom, schwankt mit dem Wind.', unlock: 'energie' },
  kraftwerk:   { name: 'Kohlekraftwerk',kind: 'generator', size: 3, cost: 3500,  cat: 'energie',    supply: 450, desc: 'Verbrennt 1 Kohle alle 4 s für 450 kW.', unlock: 'energie', fuel: 'kohle', burnTime: 4 },
  solar:       { name: 'Solarfeld',     kind: 'generator', size: 2, cost: 1200,  cat: 'energie',    supply: 70,  desc: 'Liefert tagsüber bis zu 70 kW.', unlock: 'solar' },
};

export const CATEGORIES = [
  { id: 'logistik',   name: 'Logistik' },
  { id: 'gewinnung',  name: 'Gewinnung' },
  { id: 'produktion', name: 'Produktion' },
  { id: 'energie',    name: 'Energie' },
];

// Vorkommen auf der Karte
export const DEPOSITS = {
  1: { id: 'wald',     item: 'holz',      name: 'Wald' },
  2: { id: 'eisen',    item: 'eisenerz',  name: 'Eisenerz',  color: 0x9a5b48 },
  3: { id: 'kupfer',   item: 'kupfererz', name: 'Kupfererz', color: 0xd27a3c },
  4: { id: 'kohle',    item: 'kohle',     name: 'Kohle',     color: 0x2c2c32 },
  5: { id: 'sand',     item: 'sand',      name: 'Sand',      color: 0xe8cf94 },
};

export const RESEARCH = [
  { id: 'mechanik',  name: 'Mechanik',             cost: 800,   req: { eisenplatte: 30 },  prereq: [],                       desc: 'Presse: Zahnräder & Kupferdraht.' },
  { id: 'glas',      name: 'Glasherstellung',      cost: 1200,  req: { eisenplatte: 60 },  prereq: [],                       desc: 'Schmelzofen kann Sand zu Glas schmelzen.' },
  { id: 'netz2',     name: 'Netzausbau',           cost: 2000,  req: { kupferplatte: 60 }, prereq: [],                       desc: 'Netzanschlüsse liefern doppelte Leistung.', effect: { gridMul: 2 } },
  { id: 'band2',     name: 'Schnellbänder',        cost: 1500,  req: { zahnrad: 40 },      prereq: ['mechanik'],             desc: 'Alle Förderbänder +60 % schneller.', effect: { beltMul: 1.6 } },
  { id: 'energie',   name: 'Energietechnik',       cost: 2500,  req: { draht: 100 },       prereq: ['mechanik'],             desc: 'Windräder und Kohlekraftwerke.' },
  { id: 'stahl',     name: 'Stahlverhüttung',      cost: 3000,  req: { zahnrad: 60 },      prereq: ['mechanik'],             desc: 'Hochofen: Stahlträger aus Eisen und Kohle.' },
  { id: 'tiefbohr',  name: 'Tiefbohrung',          cost: 4000,  req: { eisenplatte: 400 }, prereq: ['mechanik'],             desc: 'Bohrer und Holzfäller +50 % Förderleistung.', effect: { minerMul: 1.5 } },
  { id: 'montage',   name: 'Fließbandmontage',     cost: 5000,  req: { draht: 200 },       prereq: ['mechanik'],             desc: 'Montagehalle: Schaltkreise und Möbel.' },
  { id: 'motorbau',  name: 'Motorenbau',           cost: 9000,  req: { stahl: 60 },        prereq: ['stahl', 'montage'],     desc: 'Montagehalle kann Motoren bauen.' },
  { id: 'solar',     name: 'Photovoltaik',         cost: 6000,  req: { schaltkreis: 40 },  prereq: ['energie', 'montage'],   desc: 'Solarfelder – kostenloser Strom bei Tag.' },
  { id: 'lean',      name: 'Lean Production',      cost: 12000, req: { moebel: 25 },       prereq: ['montage', 'glas'],      desc: 'Alle Maschinen arbeiten 25 % schneller.', effect: { machineMul: 1.25 } },
  { id: 'band3',     name: 'Hochleistungsbänder',  cost: 10000, req: { schaltkreis: 80 },  prereq: ['band2', 'montage'],     desc: 'Förderbänder nochmals +40 % schneller.', effect: { beltMul: 1.4 } },
];
export const RESEARCH_BY_ID = Object.fromEntries(RESEARCH.map(r => [r.id, r]));

// Tutorial-/Kampagnenziele, nacheinander
export const GOALS = [
  { id: 'g1', text: 'Baue einen Bohrer auf ein Eisenerz-Vorkommen', reward: 200,  check: g => g.countBuildings(e => e.type === 'bohrer' && e.res === 'eisenerz') > 0 },
  { id: 'g2', text: 'Verbinde ihn per Förderband mit dem Handelsdepot', reward: 200, check: g => (g.stats.sold.eisenerz || 0) >= 1 },
  { id: 'g3', text: 'Baue einen Schmelzofen und liefere 10 Eisenplatten', reward: 400, check: g => (g.stats.sold.eisenplatte || 0) >= 10 },
  { id: 'g4', text: 'Erforsche „Mechanik“ (Menü Forschung)', reward: 500,  check: g => g.research.has('mechanik') },
  { id: 'g5', text: 'Liefere 20 Zahnräder', reward: 800, check: g => (g.stats.sold.zahnrad || 0) >= 20 },
  { id: 'g6', text: 'Schließe einen Auftrag ab', reward: 1000, check: g => g.stats.contractsDone >= 1 },
  { id: 'g7', text: 'Erforsche „Stahlverhüttung“', reward: 1500, check: g => g.research.has('stahl') },
  { id: 'g8', text: 'Liefere 10 Motoren', reward: 5000, check: g => (g.stats.sold.motor || 0) >= 10 },
];

export const EVENTS = [
  { id: 'bauboom',  title: 'Bauboom',        text: 'Bretter & Glas +60 %',        duration: 90, price: { bretter: 1.6, glas: 1.6 } },
  { id: 'stahl',    title: 'Stahlknappheit', text: 'Stahlträger +80 %',            duration: 90, price: { stahl: 1.8 } },
  { id: 'messe',    title: 'Möbelmesse',     text: 'Möbel +100 %',                 duration: 90, price: { moebel: 2 } },
  { id: 'elektro',  title: 'Elektronikboom', text: 'Schaltkreise & Draht +50 %',   duration: 90, price: { schaltkreis: 1.5, draht: 1.5 } },
  { id: 'krise',    title: 'Energiekrise',   text: 'Netzstrom kostet das Dreifache', duration: 60, gridCost: 3 },
  { id: 'sturm',    title: 'Sturmfront',     text: 'Windräder liefern doppelt',     duration: 75, wind: 2 },
  { id: 'foerder',  title: 'Förderprogramm', text: 'Die Stadt Remscheid zahlt dir einen Zuschuss', duration: 0, grant: true },
  { id: 'flaute',   title: 'Marktflaute',    text: 'Alle Preise −20 %',             duration: 60, priceAll: 0.8 },
];

export const CONFIG = {
  mapSize: 72,
  startMoney: 4000,
  beltSpeed: 1.25,        // Felder pro Sekunde
  beltSpacing: 0.25,
  minerRate: 0.22,        // Items/s pro Vorkommensfeld
  lumberRate: 0.06,       // Items/s pro Waldfeld im Umkreis
  gridCostPerKWs: 0.012,  // € pro kW·s Netzstrom
  dayLength: 360,         // Sekunden pro Tag
  refund: 0.8,
};
