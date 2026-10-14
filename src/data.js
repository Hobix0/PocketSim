// Spieldaten: Gebäude, Ladentypen, Einrichtung, Produkte, Waren, Gestaltung und Herbst.
// Alles hier ist reine Konfiguration – die Logik steckt in sim.js.

export const CONFIG = {
  tickRate: 20,             // Simulationsschritte je Sekunde
  W: 14,                    // Breite einer Ladenetage in Feldern (1 Feld = 1 m)
  D: 10,                    // Tiefe einer Etage
  floorHeight: 3.4,         // Geschosshöhe in Metern
  startMoney: 7000,
  startRep: 50,
  doorX: 9,                 // Eingangstür des Ladens im Erdgeschoss (Vorderwand)
  // Treppenhaus als eigener Anbau links neben den Läden (x < 0)
  core: { x0: -3.2, door: -1.6, shopDoorZ: 7 },
  // Fenster in Rück- und rechter Wand (Meter entlang der Wand), dort hängt nichts
  windows: { back: [[4.5, 6.5], [9, 11]], right: [[3.6, 5.8]] },
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

// ───────────── Farben ─────────────

export const PAINT = [
  ['kreide', 'Kreideweiß', '#f4efe6'], ['creme', 'Creme', '#ecdfc8'], ['leinen', 'Leinen', '#ddcdb0'],
  ['rosa', 'Altrosa', '#dcb0a4'], ['senf', 'Senf', '#d0a03e'], ['kuerbis', 'Kürbis', '#d27537'],
  ['terrakotta', 'Terrakotta', '#b35a3b'], ['weinrot', 'Weinrot', '#7a2e35'], ['pflaume', 'Pflaume', '#5c3c53'],
  ['salbei', 'Salbei', '#a5b596'], ['olive', 'Olive', '#7a7a46'], ['tanne', 'Tanne', '#365648'],
  ['taube', 'Taubenblau', '#7d93a6'], ['nacht', 'Nachtblau', '#2c3a50'], ['karamell', 'Karamell', '#a5713f'],
  ['anthrazit', 'Anthrazit', '#3a3a3d'],
].map(([id, name, hex]) => ({ id, name, hex }));
export const paintHex = (id) => (PAINT.find((p) => p.id === id) || PAINT[1]).hex;

export const WALL_PATTERNS = [
  { id: 'glatt', name: 'Glatt gestrichen' },
  { id: 'streifen', name: 'Streifentapete' },
  { id: 'laub', name: 'Herbstlaub-Tapete' },
  { id: 'holz', name: 'Holzvertäfelung' },
  { id: 'metro', name: 'Metro-Fliesen' },
  { id: 'ziegel', name: 'Sichtmauerwerk' },
  { id: 'beton', name: 'Sichtbeton' },
  { id: 'karo', name: 'Karotapete' },
];

export const FLOOR_MATS = [
  { id: 'eiche', name: 'Eichenparkett' },
  { id: 'nuss', name: 'Nussbaum' },
  { id: 'fischgrat', name: 'Fischgrät' },
  { id: 'dielen', name: 'Alte Dielen' },
  { id: 'schachbrett', name: 'Schachbrett' },
  { id: 'terrazzo', name: 'Terrazzo' },
  { id: 'cotto', name: 'Cotto-Fliesen' },
  { id: 'beton', name: 'Estrich' },
];

export const FACADES = [
  { id: 'ziegel', name: 'Roter Klinker', hex: '#b5644c' },
  { id: 'ziegel_dunkel', name: 'Dunkler Klinker', hex: '#6e4436' },
  { id: 'putz_creme', name: 'Putz Creme', hex: '#e9dcc3' },
  { id: 'putz_salbei', name: 'Putz Salbei', hex: '#a7b398' },
  { id: 'putz_ocker', name: 'Putz Ocker', hex: '#d2a35a' },
  { id: 'putz_anthrazit', name: 'Putz Anthrazit', hex: '#4a4a4d' },
];

export const AWNINGS = [
  { id: 'tanne', name: 'Tanne', a: '#2f5d50', b: '#f4ece0' },
  { id: 'weinrot', name: 'Weinrot', a: '#7a2e35', b: '#f4ece0' },
  { id: 'senf', name: 'Senf', a: '#c8952f', b: '#f4ece0' },
  { id: 'nacht', name: 'Nachtblau', a: '#2c3a50', b: '#f4ece0' },
  { id: 'kuerbis', name: 'Kürbis', a: '#cf6d31', b: '#f4ece0' },
  { id: 'uni', name: 'Uni Anthrazit', a: '#3a3a3d', b: '#3a3a3d' },
];

export const FRAMES = [
  { id: 'tanne', name: 'Tannengrün', hex: '#2f4a42' },
  { id: 'schwarz', name: 'Schwarz', hex: '#1f1f22' },
  { id: 'weiss', name: 'Weiß', hex: '#ece8df' },
  { id: 'holz', name: 'Holz', hex: '#7a4f2e' },
  { id: 'weinrot', name: 'Weinrot', hex: '#6b2a30' },
];

// Kosten fürs Umgestalten
export const DESIGN_COST = { wall: 60, wainscot: 40, floor: 380, ceiling: 80, facade: 900, awning: 160, sign: 90, frames: 300, apron: 0 };

export const defaultDesign = () => ({
  walls: {
    back: { color: 'creme', pattern: 'glatt' }, left: { color: 'creme', pattern: 'glatt' },
    right: { color: 'creme', pattern: 'glatt' }, front: { color: 'creme', pattern: 'glatt' },
  },
  wainscot: { on: true, color: 'salbei' },
  floor: 'eiche',
  ceiling: 'kreide',
});
export const defaultExterior = () => ({ facade: 'ziegel', awning: 'tanne', sign: 'tanne', frames: 'tanne' });

// ───────────── Einrichtung ─────────────
// w × d in Feldern, Vorderseite zeigt in lokaler +z-Richtung.
// layer: 'floor' (blockiert), 'rug' (begehbar, unter Möbeln), 'wall' (an der Wand), 'ceil' (an der Decke)
// shops: für welche Ladentypen ('*' = alle). decor: Ambiente-Punkte. v: Farbvarianten.
const WOOD = ['#8a5a36', '#5c3b22', '#c4955f', '#2b2421', '#e7dccb'];
const FABRIC = ['#3f6b78', '#a65a3f', '#7a8a5a', '#c99a3b', '#6b4a5f', '#8f8f93', '#e5d7c0'];
const METAL = ['#26262a', '#c9a35a', '#e7e3db', '#2f5d50'];

export const FURNITURE = {
  // Theke & Ausstattung
  theke: { name: 'Theke mit Kasse', cat: 'service', shops: ['cafe'], w: 2, d: 2, cost: 1200, register: true, v: ['#5c3b22', '#2f4a42', '#e8dcc8', '#3a3a3e', '#7a2e35'], desc: 'Hier bestellen und bezahlen die Gäste. Braucht eine Barista. Gäste stellen sich vorne an.' },
  kaffeemaschine: { name: 'Siebträger-Station', cat: 'service', shops: ['cafe'], w: 1, d: 1, cost: 1500, machine: true, v: ['#b7382f', '#c9ccd1', '#2f5d50', '#e6d6b8', '#26262a'], desc: 'Pflicht für Kaffee, Tee und Kakao. Jede weitere Maschine macht die Zubereitung schneller.' },
  vitrine: { name: 'Kuchenvitrine', cat: 'service', shops: ['cafe'], w: 2, d: 1, cost: 900, decor: 2, display: true, v: WOOD, desc: 'Pflicht für Kuchen, Croissants & Co.' },

  // Sitzen
  tisch: { name: 'Bistrotisch', cat: 'seating', shops: ['cafe'], w: 1, d: 1, cost: 140, table: true, v: ['#efebe4', '#8a5a36', '#26262a', '#365648'], desc: 'Stühle direkt daneben werden zu Sitzplätzen.' },
  tisch_eckig: { name: 'Holztisch', cat: 'seating', shops: ['cafe'], w: 1, d: 1, cost: 150, table: true, v: WOOD, desc: 'Quadratischer Tisch aus Massivholz.' },
  tisch_lang: { name: 'Langer Tisch', cat: 'seating', shops: ['cafe'], w: 2, d: 1, cost: 260, table: true, v: WOOD, desc: 'Platz für bis zu sechs Stühle.' },
  stehtresen: { name: 'Stehtresen', cat: 'seating', shops: ['cafe'], w: 2, d: 1, cost: 320, table: true, tall: true, v: WOOD, desc: 'Hoher Tresen – Barhocker daneben werden zu Plätzen.' },
  stuhl: { name: 'Stuhl', cat: 'seating', shops: ['cafe'], w: 1, d: 1, cost: 70, seat: 'chair', v: WOOD.concat(['#365648', '#7a2e35']), desc: 'Zählt nur als Sitzplatz, wenn ein Tisch angrenzt.' },
  polsterstuhl: { name: 'Polsterstuhl', cat: 'seating', shops: ['cafe'], w: 1, d: 1, cost: 160, seat: 'chair', decor: 1, v: FABRIC, desc: 'Weich gepolstert. Braucht einen Tisch daneben.' },
  barhocker: { name: 'Barhocker', cat: 'seating', shops: ['cafe'], w: 1, d: 1, cost: 110, seat: 'chair', needsTall: true, v: METAL, desc: 'Gehört an einen Stehtresen.' },
  sessel: { name: 'Lesesessel', cat: 'seating', shops: ['cafe'], w: 1, d: 1, cost: 340, seat: 'free', decor: 2, v: FABRIC, desc: 'Gemütlicher Sitzplatz, braucht keinen Tisch.' },
  sofa: { name: 'Sofa', cat: 'seating', shops: ['cafe'], w: 2, d: 1, cost: 680, seat: 'free', decor: 3, v: FABRIC, desc: 'Zwei Sitzplätze, braucht keinen Tisch.' },
  bank: { name: 'Sitzbank', cat: 'seating', shops: ['cafe'], w: 2, d: 1, cost: 300, seat: 'free', decor: 1, v: WOOD, desc: 'Holzbank mit Kissen für zwei.' },
  bodenkissen: { name: 'Bodenkissen', cat: 'seating', shops: ['cafe'], w: 1, d: 1, cost: 90, seat: 'free', low: true, decor: 2, v: FABRIC, desc: 'Gemütlich am Boden sitzen.' },

  // Raum: Trennwände & Raumteiler
  trennwand: { name: 'Trennwand Stoff', cat: 'room', shops: '*', w: 2, d: 1, cost: 240, decor: 2, v: FABRIC, desc: 'Moderner Raumteiler mit Stoffbespannung.' },
  glaswand: { name: 'Glas-Trennwand', cat: 'room', shops: '*', w: 2, d: 1, cost: 420, decor: 3, v: METAL, desc: 'Industrie-Look mit Sprossen.' },
  palisade: { name: 'Holzlamellen', cat: 'room', shops: '*', w: 2, d: 1, cost: 300, decor: 3, v: WOOD, desc: 'Palisaden-Wand aus senkrechten Lamellen.' },
  pflanzwand: { name: 'Pflanzkasten-Teiler', cat: 'room', shops: '*', w: 2, d: 1, cost: 360, decor: 4, v: WOOD, desc: 'Hoher Kasten mit dichtem Grün.' },
  raumregal: { name: 'Raumteiler-Regal', cat: 'room', shops: '*', w: 2, d: 1, cost: 380, decor: 4, v: WOOD, desc: 'Offenes Regal mit Büchern und Pflanzen.' },
  regal: { name: 'Bücherregal', cat: 'room', shops: '*', w: 2, d: 1, cost: 380, decor: 5, v: WOOD, desc: 'Bücher zum Schmökern – gehört an eine Wand.' },
  musikbox: { name: 'Musikbox', cat: 'room', shops: '*', w: 1, d: 1, cost: 950, decor: 9, v: ['#7a2a24', '#2c3a50', '#365648'], desc: 'Gute Musik hebt die Stimmung deutlich.' },

  // An der Wand
  akustik: { name: 'Akustikpaneel', cat: 'wall', shops: '*', w: 1, d: 1, cost: 120, decor: 2, layer: 'wall', v: WOOD, desc: 'Holzlamellen auf Filz – dämpft den Lärm.' },
  akustik_filz: { name: 'Filz-Waben', cat: 'wall', shops: '*', w: 2, d: 1, cost: 180, decor: 3, layer: 'wall', v: ['#365648', '#c99a3b', '#7a2e35', '#8f8f93', '#d27537'], desc: 'Sechseckige Akustikwaben in Farbe.' },
  bild: { name: 'Gerahmtes Bild', cat: 'wall', shops: '*', w: 1, d: 1, cost: 90, decor: 2, layer: 'wall', v: ['#d27537', '#365648', '#2c3a50', '#b35a3b', '#d0a03e'], desc: 'Kunst für die Wand.' },
  bildgruppe: { name: 'Bildergalerie', cat: 'wall', shops: '*', w: 2, d: 1, cost: 220, decor: 4, layer: 'wall', v: METAL, desc: 'Mehrere kleine Rahmen als Gruppe.' },
  spiegel: { name: 'Runder Spiegel', cat: 'wall', shops: '*', w: 1, d: 1, cost: 140, decor: 2, layer: 'wall', v: METAL, desc: 'Lässt den Raum größer wirken.' },
  uhr: { name: 'Wanduhr', cat: 'wall', shops: '*', w: 1, d: 1, cost: 70, decor: 1, layer: 'wall', v: METAL, desc: 'Tickt leise vor sich hin.' },
  wandregal: { name: 'Wandregal', cat: 'wall', shops: '*', w: 2, d: 1, cost: 130, decor: 2, layer: 'wall', v: WOOD, desc: 'Tassen, Gläser und ein Pflänzchen.' },
  kreidetafel: { name: 'Kreidetafel', cat: 'wall', shops: '*', w: 2, d: 1, cost: 110, decor: 2, layer: 'wall', v: WOOD, desc: 'Handgeschriebene Herbstkarte.' },
  neon: { name: 'Neonschild', cat: 'wall', shops: '*', w: 2, d: 1, cost: 260, decor: 4, layer: 'wall', v: ['#ff8a4c', '#ff6fa8', '#7fe0ff', '#ffe28a'], glow: true, desc: 'Leuchtender Schriftzug „coffee“.' },
  wandlampe: { name: 'Wandleuchte', cat: 'wall', shops: '*', w: 1, d: 1, cost: 95, decor: 2, layer: 'wall', v: METAL, glow: true, desc: 'Warmes Licht an der Wand.' },
  lichterkette: { name: 'Lichterkette', cat: 'wall', shops: '*', w: 3, d: 1, cost: 80, decor: 3, layer: 'wall', v: ['#ffd27a', '#ffb0c8', '#bfe7ff'], glow: true, desc: 'Viele kleine Lichter – abends besonders schön.' },
  wandpflanze: { name: 'Wandpflanze', cat: 'wall', shops: '*', w: 1, d: 1, cost: 85, decor: 2, layer: 'wall', v: ['#c06a43', '#e7dccb', '#26262a'], desc: 'Rankt aus dem Topf an der Wand.' },
  kranz: { name: 'Herbstkranz', cat: 'wall', shops: '*', w: 1, d: 1, cost: 60, decor: 2, layer: 'wall', v: ['#d27537', '#b35a3b', '#d0a03e'], desc: 'Kranz aus Laub, Zapfen und Beeren.' },

  // Licht
  lampe: { name: 'Stehlampe', cat: 'light', shops: '*', w: 1, d: 1, cost: 120, decor: 3, glow: true, v: ['#f3e3c3', '#365648', '#d27537', '#26262a'], desc: 'Warmes Licht für die Ecke.' },
  pendel: { name: 'Pendelleuchte', cat: 'light', shops: '*', w: 1, d: 1, cost: 150, decor: 2, layer: 'ceil', glow: true, v: ['#26262a', '#c9a35a', '#365648', '#e7e3db', '#d27537'], desc: 'Hängt von der Decke – ideal über Tischen.' },
  rattanlampe: { name: 'Rattan-Leuchte', cat: 'light', shops: '*', w: 1, d: 1, cost: 170, decor: 3, layer: 'ceil', glow: true, v: ['#c9a36a', '#8a5a36'], desc: 'Geflochtener Lampenschirm.' },
  laterne: { name: 'Laterne', cat: 'light', shops: '*', w: 1, d: 1, cost: 70, decor: 2, glow: true, v: METAL, desc: 'Kerzenlaterne für den Boden.' },
  kerzen: { name: 'Kerzenleuchter', cat: 'light', shops: '*', w: 1, d: 1, cost: 110, decor: 3, glow: true, v: METAL, desc: 'Drei Kerzen auf einem Ständer.' },

  // Pflanzen
  pflanze: { name: 'Topfpflanze', cat: 'plants', shops: '*', w: 1, d: 1, cost: 60, decor: 2, v: ['#c06a43', '#e7dccb', '#26262a', '#365648'], desc: 'Etwas Grün.' },
  palme: { name: 'Zimmerpalme', cat: 'plants', shops: '*', w: 1, d: 1, cost: 190, decor: 4, v: ['#d8cfc2', '#26262a', '#c06a43'], desc: 'Großes Grün für die Ecke.' },
  monstera: { name: 'Monstera', cat: 'plants', shops: '*', w: 1, d: 1, cost: 160, decor: 4, v: ['#e7dccb', '#26262a', '#c06a43'], desc: 'Große Blätter, viel Dschungel.' },
  olive: { name: 'Olivenbaum', cat: 'plants', shops: '*', w: 1, d: 1, cost: 240, decor: 4, v: ['#c06a43', '#e7dccb'], desc: 'Silbriges Laub im Terrakottatopf.' },
  kaktus: { name: 'Kaktus', cat: 'plants', shops: '*', w: 1, d: 1, cost: 50, decor: 1, v: ['#c06a43', '#e7dccb', '#2c3a50'], desc: 'Pflegeleicht.' },
  haengepflanze: { name: 'Hängeampel', cat: 'plants', shops: '*', w: 1, d: 1, cost: 90, decor: 3, layer: 'ceil', v: ['#c9a36a', '#e7dccb', '#26262a'], desc: 'Grün, das von der Decke hängt.' },

  // Herbst & Gemütlich
  kuerbisse: { name: 'Kürbisse', cat: 'cozy', shops: '*', w: 1, d: 1, cost: 45, decor: 3, v: ['#d9773a', '#e9e1cf', '#7a8a5a'], desc: 'Ein kleiner Kürbishaufen.' },
  strohballen: { name: 'Strohballen', cat: 'cozy', shops: '*', w: 2, d: 1, cost: 120, decor: 4, v: ['#d9773a', '#b35a3b'], desc: 'Mit Kürbissen und Laterne.' },
  kamin: { name: 'Kamin', cat: 'cozy', shops: '*', w: 2, d: 1, cost: 2400, decor: 14, glow: true, v: ['#e9dcc3', '#6e4436', '#3a3a3d', '#a5b596'], desc: 'Knisterndes Feuer – der Mittelpunkt jedes Herbstcafés.' },
  deckenkorb: { name: 'Korb mit Decken', cat: 'cozy', shops: '*', w: 1, d: 1, cost: 75, decor: 2, v: FABRIC, desc: 'Kuschelige Wolldecken für kalte Tage.' },
  laubkorb: { name: 'Apfelkiste', cat: 'cozy', shops: '*', w: 1, d: 1, cost: 55, decor: 2, v: ['#b8302f', '#d0a03e', '#7aa04a'], desc: 'Holzkiste voller Äpfel.' },
  buecherstapel: { name: 'Bücherstapel', cat: 'cozy', shops: '*', w: 1, d: 1, cost: 40, decor: 1, v: ['#7a2e35', '#2c3a50', '#365648'], desc: 'Stapel mit Lesestoff.' },
  katzenkorb: { name: 'Katzenkörbchen', cat: 'cozy', shops: '*', w: 1, d: 1, cost: 450, decor: 6, pet: true, v: ['#c9a36a', '#7a2e35', '#365648'], desc: 'Hier zieht eine Café-Katze ein!' },

  // Teppiche
  teppich: { name: 'Orientteppich', cat: 'rugs', shops: '*', w: 2, d: 2, cost: 220, decor: 4, layer: 'rug', v: ['#9c3f32', '#2f4f5c', '#7a6a3a', '#5c3c53'], desc: 'Begehbar, Möbel dürfen darauf stehen.' },
  teppich_rund: { name: 'Runder Teppich', cat: 'rugs', shops: '*', w: 2, d: 2, cost: 180, decor: 3, layer: 'rug', v: ['#d0a03e', '#a5b596', '#dcb0a4', '#7d93a6'], desc: 'Weich und rund.' },
  laeufer: { name: 'Läufer', cat: 'rugs', shops: '*', w: 3, d: 1, cost: 120, decor: 2, layer: 'rug', v: ['#b35a3b', '#365648', '#2c3a50'], desc: 'Langer Teppich für Wege.' },
  teppich_gross: { name: 'Berberteppich', cat: 'rugs', shops: '*', w: 3, d: 2, cost: 320, decor: 4, layer: 'rug', v: ['#e9e1cf', '#c9b89a', '#8f8f93'], desc: 'Großer Wollteppich mit Rautenmuster.' },
};
for (const f of Object.values(FURNITURE)) f.layer ||= 'floor';

export const FURNITURE_CATS = [
  { id: 'service', name: 'Theke' },
  { id: 'seating', name: 'Sitzen' },
  { id: 'room', name: 'Raum' },
  { id: 'wall', name: 'Wand' },
  { id: 'light', name: 'Licht' },
  { id: 'plants', name: 'Pflanzen' },
  { id: 'cozy', name: 'Herbst' },
  { id: 'rugs', name: 'Teppiche' },
];

// ───────────── Waren & Produkte ─────────────

// pack = Portionen je Lieferung, fresh = verdirbt am Abend.
export const SUPPLIES = {
  bohnen: { name: 'Kaffeebohnen', unit: 'Portionen', pack: 100, cost: 24 },
  milch: { name: 'Hafer- & Kuhmilch', unit: 'Portionen', pack: 40, cost: 12 },
  tee: { name: 'Tee', unit: 'Beutel', pack: 50, cost: 9 },
  kuerbis: { name: 'Kürbissirup', unit: 'Portionen', pack: 40, cost: 14 },
  chai: { name: 'Chai-Gewürz', unit: 'Portionen', pack: 40, cost: 12 },
  kakao: { name: 'Kakao', unit: 'Portionen', pack: 40, cost: 10 },
  croissant: { name: 'Croissants', unit: 'Stück', pack: 12, cost: 9, fresh: true },
  kuchen: { name: 'Kuchen', unit: 'Stück', pack: 12, cost: 16, fresh: true },
  muffin: { name: 'Muffins', unit: 'Stück', pack: 12, cost: 10, fresh: true },
  sandwich: { name: 'Sandwiches', unit: 'Stück', pack: 8, cost: 14, fresh: true },
  apfelkuchen: { name: 'Apfelkuchen', unit: 'Stück', pack: 12, cost: 17, fresh: true },
  zimtschnecke: { name: 'Zimtschnecken', unit: 'Stück', pack: 12, cost: 12, fresh: true },
};

// fair = Preis, den Gäste im Schnitt für angemessen halten. recipe = Freischaltkosten.
// warm: im Kalten besonders gefragt. needs: Einrichtung, die im Laden stehen muss.
export const PRODUCTS = {
  espresso: { name: 'Espresso', kind: 'drink', shop: 'cafe', price: 2.2, fair: 2.3, prep: 3, pop: 2, needs: 'machine', uses: { bohnen: 1 } },
  cappuccino: { name: 'Cappuccino', kind: 'drink', shop: 'cafe', price: 3.4, fair: 3.5, prep: 5, pop: 4, needs: 'machine', uses: { bohnen: 1, milch: 1 } },
  latte: { name: 'Latte Macchiato', kind: 'drink', shop: 'cafe', price: 3.8, fair: 3.9, prep: 6, pop: 3, needs: 'machine', uses: { bohnen: 1, milch: 1 } },
  tee: { name: 'Tee', kind: 'drink', shop: 'cafe', price: 2.6, fair: 2.7, prep: 2, pop: 1.5, needs: 'machine', warm: true, uses: { tee: 1 } },
  kuerbislatte: { name: 'Kürbis-Latte', kind: 'drink', shop: 'cafe', price: 4.6, fair: 4.9, prep: 7, pop: 4, needs: 'machine', warm: true, recipe: 450, uses: { bohnen: 1, milch: 1, kuerbis: 1 } },
  chai: { name: 'Chai Latte', kind: 'drink', shop: 'cafe', price: 4.0, fair: 4.2, prep: 5, pop: 2.5, needs: 'machine', warm: true, recipe: 300, uses: { chai: 1, milch: 1 } },
  kakao: { name: 'Heiße Schokolade', kind: 'drink', shop: 'cafe', price: 3.5, fair: 3.7, prep: 4, pop: 2.5, needs: 'machine', warm: true, recipe: 220, uses: { kakao: 1, milch: 1 } },
  croissant: { name: 'Croissant', kind: 'snack', shop: 'cafe', price: 2.4, fair: 2.6, prep: 1, pop: 3, needs: 'display', uses: { croissant: 1 } },
  kuchen: { name: 'Kuchen', kind: 'snack', shop: 'cafe', price: 3.9, fair: 4.2, prep: 2, pop: 2.5, needs: 'display', uses: { kuchen: 1 } },
  muffin: { name: 'Muffin', kind: 'snack', shop: 'cafe', price: 2.9, fair: 3.0, prep: 1, pop: 2, needs: 'display', uses: { muffin: 1 } },
  sandwich: { name: 'Sandwich', kind: 'snack', shop: 'cafe', price: 4.9, fair: 5.2, prep: 2, pop: 2, needs: 'display', uses: { sandwich: 1 } },
  apfelkuchen: { name: 'Apfelkuchen', kind: 'snack', shop: 'cafe', price: 4.2, fair: 4.6, prep: 2, pop: 3.5, needs: 'display', warm: true, recipe: 350, uses: { apfelkuchen: 1 } },
  zimtschnecke: { name: 'Zimtschnecke', kind: 'snack', shop: 'cafe', price: 3.2, fair: 3.5, prep: 1, pop: 3, needs: 'display', warm: true, recipe: 280, uses: { zimtschnecke: 1 } },
};

// Kundenandrang über den Tag (Faktor je volle Stunde)
export const DEMAND_CURVE = {
  7: 0.2, 8: 1.2, 9: 1.1, 10: 0.9, 11: 0.9, 12: 1.4, 13: 1.4,
  14: 0.9, 15: 1.3, 16: 1.3, 17: 0.9, 18: 0.7, 19: 0,
};

// ───────────── Herbst: Wetter, Kalender, Stammgäste, Aufgaben ─────────────

export const WEATHER = {
  sonne: { name: 'Goldener Herbsttag', icon: '☀️', w: 3, demand: 1.0, sit: 0, ped: 1.0, temp: [12, 18] },
  wolken: { name: 'Bewölkt', icon: '⛅', w: 3, demand: 1.05, sit: 0.05, ped: 0.9, temp: [9, 14] },
  regen: { name: 'Regen', icon: '🌧️', w: 2, demand: 1.15, sit: 0.18, ped: 0.6, temp: [7, 12] },
  nebel: { name: 'Nebel', icon: '🌫️', w: 1.5, demand: 1.05, sit: 0.12, ped: 0.8, temp: [5, 10] },
  wind: { name: 'Herbststurm', icon: '🍂', w: 1.5, demand: 1.1, sit: 0.1, ped: 0.75, temp: [6, 11] },
};

const MONTHS = ['Oktober', 'November', 'Dezember'];
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
// Tag 1 ist Donnerstag, der 1. Oktober
export function calendar(day) {
  const lens = [31, 30, 31];
  let d = day - 1, m = 0;
  while (m < lens.length - 1 && d >= lens[m]) { d -= lens[m]; m++; }
  const wd = WEEKDAYS[(day + 2) % 7];
  return { weekday: wd, date: d + 1, month: MONTHS[m], weekend: wd === 'Sa' || wd === 'So', label: `${wd}, ${d + 1}. ${MONTHS[m].slice(0, 3)}.` };
}

export const REGULARS = [
  'Oma Hilde', 'Herr Okafor', 'Lina', 'Mats', 'Frau Berger', 'Jonas', 'Aylin', 'Herr Petrović',
  'Clara', 'Ben', 'Frau Nakamura', 'Theo', 'Mira', 'Herr Schulz', 'Juna', 'Emil',
];

export const PET_NAMES = ['Mochi', 'Zimt', 'Kürbis', 'Muffin', 'Krümel', 'Bohne', 'Nougat', 'Toffee'];
export const PET_COLORS = ['#e09a4c', '#3a3330', '#d9d2c5', '#8a7a6a', '#c46a2f'];

// Tagesaufgaben: gen erzeugt { text, goal, reward, kind, product? }
export const QUESTS = [
  { kind: 'serve', gen: (r, lvl) => { const n = 30 + Math.round(lvl * 10 + r() * 15); return { goal: n, text: `${n} Gäste bedienen`, reward: 60 + n * 2 }; } },
  { kind: 'sell', gen: (r, lvl, prods) => { const p = prods[Math.floor(r() * prods.length)]; const n = 8 + Math.round(lvl * 3 + r() * 8); return { product: p, goal: n, text: `${n}× ${PRODUCTS[p].name} verkaufen`, reward: 50 + n * 4 }; } },
  { kind: 'revenue', gen: (r, lvl) => { const n = Math.round((250 + lvl * 120 + r() * 150) / 10) * 10; return { goal: n, text: `${n} € Umsatz machen`, reward: Math.round(n * 0.15) }; } },
  { kind: 'sit', gen: (r, lvl) => { const n = 10 + Math.round(lvl * 3 + r() * 8); return { goal: n, text: `${n} Gäste setzen sich hin`, reward: 50 + n * 3 }; } },
  { kind: 'happy', gen: (r, lvl) => { const n = 12 + Math.round(lvl * 4 + r() * 8); return { goal: n, text: `${n} Gäste richtig glücklich machen`, reward: 70 + n * 3 }; } },
];

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
