// Spieldaten: Gebäude, Ladentypen, Einrichtung, Produkte und Waren.
// Alles hier ist reine Konfiguration – die Logik steckt in sim.js.

export const CONFIG = {
  tickRate: 20,             // Simulationsschritte je Sekunde
  W: 14,                    // Breite einer Etage in Feldern (1 Feld = 1 m)
  D: 10,                    // Tiefe einer Etage
  floorHeight: 3.4,         // Geschosshöhe in Metern
  startMoney: 6500,
  startRep: 50,
  doorX: 9,                 // Eingangstür Erdgeschoss in der Vorderwand (z = D)
  // Treppenhaus hinten links, auf jeder Etage gleich (Podest-Treppe)
  stairs: { x: 0, z: 0, w: 2, d: 3 },
  stairUp: [0, 3],          // Antrittsfeld nach oben
  stairDown: [1, 3],        // Austrittsfeld der Treppe von unten
  dayStart: 7 * 60,         // Uhrzeit in Minuten
  openFrom: 8 * 60,
  openUntil: 19 * 60,
  minutesPerSecond: 1,      // Spielminuten je Sim-Sekunde
  walkSpeed: 1.45,          // Felder je Sekunde
  climbSpeed: 0.9,
  wage: 75,                 // Lohn je Barista und Tag
  maxStaff: 8,
  sellRefund: 0.5,
  autoFee: 0.1,             // Aufschlag bei automatischer Nachbestellung
  baseCustomersPerHour: 10,
};

// Etagen des Gebäudes. Erdgeschoss gehört dir, weitere Etagen lassen sich anmieten.
export const FLOORS = [
  { name: 'Erdgeschoss', short: 'EG', unlockCost: 0, rent: 95 },
  { name: '1. Obergeschoss', short: '1.OG', unlockCost: 14000, rent: 90 },
  { name: '2. Obergeschoss', short: '2.OG', unlockCost: 28000, rent: 90 },
];

// Ladentypen. Nur das Café ist schon spielbar, die anderen sind vorbereitet.
export const SHOP_TYPES = {
  cafe: {
    name: 'Café', available: true, color: '#c8814a',
    desc: 'Kaffee, Tee und frische Backwaren. Gäste setzen sich gern für einen Moment.',
    sitChance: 0.45, defaultName: 'Café Bohne',
  },
  baeckerei: { name: 'Bäckerei', available: false, color: '#d9a35b', desc: 'Brot und Brötchen zum Mitnehmen.' },
  buchladen: { name: 'Buchladen', available: false, color: '#5b7fa6', desc: 'Bücher, Zeitschriften und Leseecken.' },
  boutique: { name: 'Boutique', available: false, color: '#b45d84', desc: 'Mode und Accessoires.' },
};

// Einrichtung. w × d in Feldern, Vorderseite zeigt in lokaler +z-Richtung.
// shops: für welche Ladentypen ('*' = alle). decor: Ambiente-Punkte.
export const FURNITURE = {
  theke: {
    name: 'Theke mit Kasse', cat: 'service', shops: ['cafe'], w: 2, d: 2, cost: 1200,
    desc: 'Hier bestellen und bezahlen die Gäste. Braucht eine Barista. Gäste stellen sich vorne an.',
    register: true,
  },
  kaffeemaschine: {
    name: 'Siebträger-Station', cat: 'service', shops: ['cafe'], w: 1, d: 1, cost: 1500,
    desc: 'Pflicht für Kaffee und Tee. Jede weitere Maschine macht die Zubereitung schneller.',
    machine: true,
  },
  vitrine: {
    name: 'Kuchenvitrine', cat: 'service', shops: ['cafe'], w: 2, d: 1, cost: 900, decor: 2,
    desc: 'Pflicht für Croissants, Kuchen, Muffins und Sandwiches.',
    display: true,
  },
  tisch: { name: 'Bistrotisch', cat: 'seating', shops: ['cafe'], w: 1, d: 1, cost: 140, table: true, desc: 'Stühle direkt daneben werden zu Sitzplätzen.' },
  tisch_lang: { name: 'Langer Tisch', cat: 'seating', shops: ['cafe'], w: 2, d: 1, cost: 260, table: true, desc: 'Platz für bis zu sechs Stühle.' },
  stuhl: { name: 'Stuhl', cat: 'seating', shops: ['cafe'], w: 1, d: 1, cost: 70, seat: 'chair', desc: 'Zählt nur als Sitzplatz, wenn ein Tisch angrenzt.' },
  sessel: { name: 'Lesesessel', cat: 'seating', shops: ['cafe'], w: 1, d: 1, cost: 340, seat: 'free', decor: 2, desc: 'Gemütlicher Sitzplatz, braucht keinen Tisch.' },
  sofa: { name: 'Sofa', cat: 'seating', shops: ['cafe'], w: 2, d: 1, cost: 680, seat: 'free', decor: 3, desc: 'Zwei Sitzplätze, braucht keinen Tisch.' },
  pflanze: { name: 'Topfpflanze', cat: 'decor', shops: '*', w: 1, d: 1, cost: 60, decor: 2, desc: 'Etwas Grün.' },
  palme: { name: 'Zimmerpalme', cat: 'decor', shops: '*', w: 1, d: 1, cost: 190, decor: 4, desc: 'Großes Grün für die Ecke.' },
  lampe: { name: 'Stehlampe', cat: 'decor', shops: '*', w: 1, d: 1, cost: 120, decor: 3, desc: 'Warmes Licht.' },
  regal: { name: 'Bücherregal', cat: 'decor', shops: '*', w: 2, d: 1, cost: 380, decor: 5, desc: 'Bücher zum Schmökern.' },
  teppich: { name: 'Teppich', cat: 'decor', shops: '*', w: 2, d: 2, cost: 220, decor: 4, floorLayer: true, desc: 'Begehbar, Möbel dürfen darauf stehen.' },
  musikbox: { name: 'Musikbox', cat: 'decor', shops: '*', w: 1, d: 1, cost: 950, decor: 9, desc: 'Gute Musik hebt die Stimmung deutlich.' },
};

export const FURNITURE_CATS = [
  { id: 'service', name: 'Theke' },
  { id: 'seating', name: 'Sitzen' },
  { id: 'decor', name: 'Deko' },
];

// Waren im Lager. pack = Portionen je Lieferung, fresh = verdirbt am Abend.
export const SUPPLIES = {
  bohnen: { name: 'Kaffeebohnen', unit: 'Portionen', pack: 100, cost: 24 },
  milch: { name: 'Milch', unit: 'Portionen', pack: 40, cost: 12 },
  tee: { name: 'Tee', unit: 'Beutel', pack: 50, cost: 9 },
  croissant: { name: 'Croissants', unit: 'Stück', pack: 12, cost: 9, fresh: true },
  kuchen: { name: 'Kuchen', unit: 'Stück', pack: 12, cost: 16, fresh: true },
  muffin: { name: 'Muffins', unit: 'Stück', pack: 12, cost: 10, fresh: true },
  sandwich: { name: 'Sandwiches', unit: 'Stück', pack: 8, cost: 14, fresh: true },
};

// Produkte. fair = Preis, den Gäste im Schnitt für angemessen halten.
// needs: Einrichtung, die im Laden stehen muss. uses: verbrauchte Waren.
export const PRODUCTS = {
  espresso: { name: 'Espresso', kind: 'drink', shop: 'cafe', price: 2.2, fair: 2.3, prep: 3, pop: 2, needs: 'machine', uses: { bohnen: 1 } },
  cappuccino: { name: 'Cappuccino', kind: 'drink', shop: 'cafe', price: 3.4, fair: 3.5, prep: 5, pop: 4, needs: 'machine', uses: { bohnen: 1, milch: 1 } },
  latte: { name: 'Latte Macchiato', kind: 'drink', shop: 'cafe', price: 3.8, fair: 3.9, prep: 6, pop: 3, needs: 'machine', uses: { bohnen: 1, milch: 1 } },
  tee: { name: 'Tee', kind: 'drink', shop: 'cafe', price: 2.6, fair: 2.7, prep: 2, pop: 1.5, needs: 'machine', uses: { tee: 1 } },
  croissant: { name: 'Croissant', kind: 'snack', shop: 'cafe', price: 2.4, fair: 2.6, prep: 1, pop: 3, needs: 'display', uses: { croissant: 1 } },
  kuchen: { name: 'Kuchen', kind: 'snack', shop: 'cafe', price: 3.9, fair: 4.2, prep: 2, pop: 2.5, needs: 'display', uses: { kuchen: 1 } },
  muffin: { name: 'Muffin', kind: 'snack', shop: 'cafe', price: 2.9, fair: 3.0, prep: 1, pop: 2, needs: 'display', uses: { muffin: 1 } },
  sandwich: { name: 'Sandwich', kind: 'snack', shop: 'cafe', price: 4.9, fair: 5.2, prep: 2, pop: 2, needs: 'display', uses: { sandwich: 1 } },
};

// Kundenandrang über den Tag (Faktor je volle Stunde)
export const DEMAND_CURVE = {
  7: 0.2, 8: 1.2, 9: 1.1, 10: 0.9, 11: 0.9, 12: 1.4, 13: 1.4,
  14: 0.9, 15: 1.2, 16: 1.2, 17: 0.8, 18: 0.6, 19: 0,
};

export const productsFor = (shopType) => Object.keys(PRODUCTS).filter((id) => PRODUCTS[id].shop === shopType);
export const suppliesFor = (shopType) => {
  const set = new Set();
  for (const id of productsFor(shopType)) for (const s of Object.keys(PRODUCTS[id].uses)) set.add(s);
  return [...set];
};
export const furnitureFor = (shopType) => Object.keys(FURNITURE).filter((id) => {
  const s = FURNITURE[id].shops;
  return s === '*' || s.includes(shopType);
});
