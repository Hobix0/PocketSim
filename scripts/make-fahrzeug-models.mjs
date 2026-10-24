// Erzeugt die Fahrzeug-Modelle (data/modelle/<id>.json, typ "modell", Objekttyp "fahrzeug").
// Vorne ist +X, Ursprung unten in der Mitte. Funktionsteile (Scheinwerfer, Rücklichter, Räder, Ladebordwand)
// markiert das Skript selbst – wie im Voxel-Editor unter „Funktionsteile“.
//
// Aufruf: npm run modelle:fahrzeuge   (Baukasten: scripts/lib/voxel-model.mjs)

import { model } from './lib/voxel-model.mjs';

const CAB = '#f1eee6', CAB_D = '#d9d4c8', CAB_DD = '#b9b3a5';
const GRUEN_UE = '#5fd08a', GRUEN_D = '#3f8f5a', PLANE = '#3f7a5a', PLANE_D = '#326348';
const CHROM = '#c9ced2', ALU = '#cdd2d6', ALU_D = '#a7aeb4', STAHL = '#b8bec4', STAHL_D = '#8f969d';
const SCHWARZ = '#1f1f22', GUMMI = '#2a2a2d', GUMMI_P = '#36363a', FELGE = '#9aa1a6', DUNKEL = '#2f3a45', GRAU = '#5d6268';
const BODEN = '#6b4a32', BODEN_D = '#5a3d29', SITZ = '#3b3b40', SITZ_H = '#4a4a50';
// Glasfarben: werden im Spiel durchsichtig gezeichnet (man sieht ins Fahrerhaus)
const GLAS = '#cfe6ec', GLAS_FRONT = '#bcd8df';
const SCHEINWERFER = '#fff3c4', RUECKLICHT = '#c4271f', BLINKER = '#f0a030', RUECKFAHR = '#f2f2ea', NEBEL = '#fff7d6';
const WARN_R = '#d23a2f', WARN_W = '#f2f0e8', ADBLUE = '#2f6fb0';

// ── Liefer-LKW: 7,5-Tonner mit Pritsche, Schiebeverdeck (nach vorne geschoben – die Ladung bleibt von oben
// sichtbar) und Ladebordwand. 4-cm-Würfel: 180 × 83 × 62 = 7,2 × 3,32 × 2,48 m.
// Passend zu data/logistik/standard.json → lkw: Ladefläche oben auf 1,15 m (Boden bis y 28 = 1,16 m), von −3,5 bis +1,4 m,
// innen 2,2 m breit. Zwei Achsen: vorne einfach bereift, hinten Zwillingsreifen (Radstand 4 m).
model({
  id: 'lkw', name: 'Liefer-LKW (7,5 t)', dims: [180, 83, 62], size: 0.04, menue: 'lager', objekt: 'fahrzeug',
  draw: ({ box, hole, cyl, frame, text, textWidth, nx, nz, part, mark }) => {
    const ZL = 3, ZR = nz - 4; // Außenwände des Aufbaus (z 3 und 58)
    const mid = nz / 2;
    const BETT = 124; // Ende der Ladefläche (Stirnwand) – x 2 … 124
    const CAB0 = 127; // Rückwand des Fahrerhauses

    // ── Fahrgestell: Längsträger, Querträger, Hilfsrahmen unter der Pritsche
    for (const z of [17, 18, 19, 20, nz - 21, nz - 20, nz - 19, nz - 18]) box(3, nx - 4, 13, 18, z, z, DUNKEL);
    for (let x = 8; x < nx - 6; x += 16) box(x, x + 1, 14, 17, 21, nz - 22, DUNKEL);
    for (const z of [16, 17, 18, 19, 20, 21, nz - 22, nz - 21, nz - 20, nz - 19, nz - 18, nz - 17]) box(2, BETT, 19, 24, z, z, '#3a3f44');
    for (let x = 4; x < BETT; x += 12) box(x, x + 1, 22, 24, ZL, ZR, '#3a3f44');

    // ── Räder: Felge mit Nabe und Radmuttern, Reifen mit Profil. Je Achse ein Funktionsteil „Rad“ (dreht beim Fahren)
    const RY = 10, R = 10;
    const rad = (x, z0, z1) => cyl('z', x, RY, R, z0, z1, (i, j, t) => {
      const d = i * i + j * j;
      if (d > 72) return (Math.atan2(j, i) * 8 / Math.PI + 16) % 2 < 1 ? GUMMI : GUMMI_P; // Profil
      if (d > 49) return GUMMI;
      if (t === z0 || t === z1) {
        if (d <= 4) return CHROM;
        if (d >= 13 && d <= 18 && (i + j) % 2 === 0) return CHROM; // Radmuttern
      }
      return d > 36 ? '#7d848a' : FELGE;
    });
    const XV = 149, XH = 49; // Vorder- und Hinterachse
    rad(XV, 4, 9); rad(XV, nz - 10, nz - 5);
    rad(XH, 3, 7); rad(XH, 9, 13); rad(XH, nz - 14, nz - 10); rad(XH, nz - 8, nz - 4);
    // Achsen, Differenzial, Blattfedern
    cyl('z', XV, RY, 1, 10, nz - 11, STAHL_D); cyl('z', XH, RY, 2, 14, nz - 15, STAHL_D);
    cyl('x', RY, mid, 3, XH - 3, XH + 3, DUNKEL);
    for (const z of [16, nz - 17]) for (const [x, w] of [[XV, 9], [XH, 12]]) box(x - w, x + w, 12, 13, z, z + 1, STAHL_D);
    const radFilter = (xc) => (x, y) => (x - xc) ** 2 + (y - RY) ** 2 <= (R + 0.5) ** 2;
    mark(part('rad'), XV - R, XV + R, 0, RY + R, 0, nz - 1, radFilter(XV));
    mark(part('rad'), XH - R, XH + R, 0, RY + R, 0, nz - 1, radFilter(XH));

    // Kotflügel hinten mit Schmutzfängern
    for (const [z0, z1] of [[1, 14], [nz - 15, nz - 2]]) {
      for (let x = XH - 14; x <= XH + 14; x++) {
        const y = 21 + Math.round(Math.max(0, Math.abs(x - XH) - 9) * -0.5);
        box(x, x, Math.max(16, y), Math.max(16, y) + 1, z0, z1, SCHWARZ);
      }
      box(XH - 15, XH - 15, 3, 17, z0, z1, SCHWARZ);
      box(XH - 15, XH - 15, 4, 6, z0 + 3, z1 - 3, WARN_W);
    }

    // ── Pritsche: Siebdruckboden mit Zurrleisten, Bordwände aus Alu, Stirnwand, Rungen, Spriegel
    box(2, BETT, 25, 28, ZL, ZR, (x, y, z) => (y < 28 ? BODEN_D : x % 10 === 0 ? BODEN_D : BODEN));
    for (const z of [ZL + 1, ZR - 1]) box(2, BETT, 28, 28, z, z, STAHL_D); // Zurrschienen
    for (const z of [ZL, ZR]) {
      box(2, BETT, 29, 38, z, z, (x, y) => (y === 38 ? ALU_D : y % 3 === 0 ? ALU_D : ALU));
      // Innenseite glatt (zwei Würfel dick – die Schrift außen scheint nicht durch)
      const zi = z === ZL ? z + 1 : z - 1;
      box(2, BETT - 4, 29, 38, zi, zi, (x, y) => (y === 38 ? ALU_D : ALU));
      for (let x = 16; x < BETT; x += 30) box(x, x + 1, 30, 32, z, z, DUNKEL); // Bordwandverschlüsse
      box(2, BETT, 25, 28, z, z, STAHL); // Außenrahmen
    }
    // Stirnwand (vorne) mit Rippen
    box(BETT - 3, BETT, 29, 80, ZL, ZR, (x, y, z) => (z % 6 === 0 ? ALU_D : ALU));
    // Rungen und Portalrahmen hinten
    for (const x of [2, 32, 62, 92]) for (const z of [ZL, ZR]) box(x, x + 1, 29, 78, z, z, STAHL_D);
    box(2, 3, 77, 80, ZL, ZR, STAHL_D);
    // Längsholme und Spriegel (Dachbögen)
    for (const z of [ZL, ZL + 1, ZR - 1, ZR]) box(2, BETT, 77, 78, z, z, STAHL);
    for (let x = 6; x < BETT - 16; x += 15) box(x, x, 79, 80, ZL, ZR, STAHL);
    // Schiebeverdeck: Plane nach vorne zusammengeschoben (Falten), Seitenplanen oben eingerollt
    for (let x = BETT - 20; x < BETT - 3; x++) box(x, x, 70 + (x % 4 < 2 ? 0 : 1), 81, ZL, ZR, x % 4 < 2 ? PLANE : PLANE_D);
    for (const [z0, z1] of [[ZL, ZL + 2], [ZR - 2, ZR]]) box(4, BETT - 21, 73, 76, z0, z1, (x, y) => (y === 73 || x % 9 === 0 ? PLANE_D : PLANE));
    // Schriftzug auf den Bordwänden
    const schrift = 'URBAN EVOLUTION';
    const w = textWidth(schrift);
    text(ZR, 36, Math.floor((BETT + 2) / 2 - w / 2), schrift, GRUEN_D, 1, '+z');
    text(ZL, 36, Math.floor((BETT + 2) / 2 + w / 2), schrift, GRUEN_D, 1, '-z');

    // ── Ladebordwand hinten (hochgeklappt): Alu mit Rippen, Warnflaggen an den Kanten; dreht um die untere Kante
    box(0, 1, 15, 40, ZL, ZR, (x, y) => (y % 4 === 0 ? ALU_D : ALU));
    for (const z of [ZL, ZL + 1, ZR - 1, ZR]) box(0, 0, 30, 40, z, z, (x, y) => (Math.floor(y / 2) % 2 ? WARN_R : WARN_W));
    box(0, 0, 37, 38, mid - 6, mid + 5, STAHL_D); // Griff
    mark(part('beweglich', { kante: 'unten', achse: 'z', winkel: 90 }), 0, 1, 15, 40, ZL, ZR);
    // Hubwerk unter der Ladefläche: Träger und Hydraulikzylinder
    box(2, 9, 13, 18, 8, nz - 9, DUNKEL);
    for (const z of [12, nz - 13]) cyl('x', 15, z, 1, 2, 10, CHROM);

    // ── Heck: Unterfahrschutz mit Leuchten, Kennzeichen
    box(0, 2, 9, 13, 4, nz - 5, GRAU);
    const rl = part('ruecklicht');
    for (const [z0, z1, zA0, zA1, zW0, zW1] of [[5, 11, 12, 14, 15, 16], [nz - 12, nz - 6, nz - 15, nz - 13, nz - 17, nz - 16]]) {
      box(0, 0, 9, 13, z0, z1, RUECKLICHT);
      box(0, 0, 9, 13, zA0, zA1, BLINKER);
      box(0, 0, 9, 13, zW0, zW1, RUECKFAHR);
      mark(rl, 0, 0, 9, 13, z0, z1);
    }
    box(0, 1, 3, 9, mid - 9, mid + 8, WARN_W); frame(0, 0, 3, 9, mid - 9, mid + 8, SCHWARZ);
    text(0, 8, mid - 8, 'UE75', SCHWARZ, 1, '-x');

    // ── Seitliche Anbauten: Unterfahrschutz, Tank, AdBlue, Batteriekasten, Auspuff, Begrenzungsleuchten
    for (const z of [ZL, ZR]) {
      box(XH + 15, 104, 8, 9, z, z, STAHL); box(XH + 15, 104, 14, 15, z, z, STAHL);
      for (let x = XH + 17; x < 104; x += 14) box(x, x, 8, 15, z, z, STAHL_D);
      // Begrenzungsleuchten (gelb) unten am Aufbau
      for (const x of [15, 50, 85]) box(x, x + 2, 24, 25, z === ZL ? z - 1 : z + 1, z === ZL ? z - 1 : z + 1, BLINKER);
    }
    cyl('x', 13, 9, 5, 108, 124, (i, j) => (j > 3 ? '#e6e8ea' : CHROM)); // Dieseltank
    for (const x of [111, 121]) box(x, x, 8, 18, 4, 14, STAHL_D);
    box(118, 120, 18, 19, 7, 9, SCHWARZ);
    box(104, 106, 9, 15, 5, 10, ADBLUE); box(105, 105, 16, 16, 7, 7, '#1f4f80');
    box(108, 124, 9, 18, nz - 11, nz - 5, DUNKEL); box(108, 124, 18, 18, nz - 11, nz - 5, GRAU); // Batteriekasten
    cyl('x', 7, nz - 14, 2, 96, 104, STAHL_D); box(94, 96, 5, 7, nz - 14, nz - 12, CHROM); // Auspuff

    // ── Fahrerhaus (Frontlenker): x 127 … 179, Unterkante 0,88 m, Dach 3,0 m
    const CZ0 = 4, CZ1 = nz - 5;
    box(CAB0, nx - 1, 22, 75, CZ0, CZ1, CAB);
    box(CAB0, nx - 1, 22, 31, CZ0, CZ1, CAB_D); // unten dunkler
    // Innenraum aushöhlen (durch die Scheiben sieht man hinein)
    hole(CAB0 + 2, nx - 3, 27, 73, CZ0 + 2, CZ1 - 2);
    box(CAB0 + 2, nx - 3, 27, 28, CZ0 + 2, CZ1 - 2, '#2b2e33'); // Boden
    // Radkästen vorne
    for (const [z0, z1] of [[CZ0, CZ0 + 6], [CZ1 - 6, CZ1]]) {
      for (let x = XV - 14; x <= XV + 14; x++) for (let y = 22; y <= 26; y++) {
        const d = Math.hypot(x - XV, y - RY);
        if (d <= 13) box(x, x, y, y, z0, z1, d > 12 ? SCHWARZ : null);
        if (d <= 12) hole(x, x, y, y, z0, z1);
      }
    }
    // Sitze, Armaturenbrett, Lenkrad (Fahrer links = kleines z), Liegeplatz hinten
    for (const [z0, z1] of [[9, 20], [nz - 21, nz - 10]]) {
      box(158, 166, 29, 37, z0, z1, SITZ); box(156, 158, 29, 56, z0, z1, SITZ); box(156, 158, 57, 61, z0 + 3, z1 - 3, SITZ_H);
    }
    box(171, 176, 38, 46, CZ0 + 2, CZ1 - 2, '#33363b'); box(174, 176, 46, 47, CZ0 + 2, CZ1 - 2, '#26282c');
    cyl('x', 50, 15, 4, 168, 168, (i, j) => (i * i + j * j >= 9 ? SCHWARZ : null)); cyl('x', 47, 15, 1, 169, 172, SCHWARZ);
    box(CAB0 + 2, CAB0 + 9, 29, 34, CZ0 + 2, CZ1 - 2, '#45484e');
    // Türen mit Fugen, Griffen, Seitenscheiben; Trittstufen
    for (const z of [CZ0, CZ1]) {
      box(146, 146, 24, 72, z, z, CAB_DD); box(171, 171, 24, 72, z, z, CAB_DD);
      box(147, 170, 72, 72, z, z, CAB_DD);
      const zi = z === CZ0 ? z + 1 : z - 1; // die Wand ist zwei Würfel dick
      box(150, 169, 50, 69, Math.min(z, zi), Math.max(z, zi), GLAS); frame(149, 170, 49, 70, z, z, SCHWARZ);
      box(173, 176, 54, 69, Math.min(z, zi), Math.max(z, zi), GLAS); // Ausstellfenster
      box(165, 168, 44, 45, z, z, SCHWARZ); // Griff
      box(CAB0, nx - 1, 34, 37, z, z, GRUEN_UE); // Firmenstreifen
      box(CAB0, 145, 38, 39, z, z, GRUEN_D);
    }
    for (const z of [[CZ0, CZ0 + 2], [CZ1 - 2, CZ1]]) {
      // Trittstufen vor dem Vorderrad
      box(161, 169, 7, 8, z[0], z[1], SCHWARZ); box(161, 169, 14, 15, z[0], z[1], SCHWARZ);
      for (const x of [161, 169]) box(x, x, 7, 21, z[0], z[1], DUNKEL);
    }
    // Logo auf der Tür
    text(CZ0, 48, 165, 'UE', GRUEN_D, 2, '-z'); text(CZ1, 48, 152, 'UE', GRUEN_D, 2, '+z');

    // Front: Frontscheibe mit Rahmen und Wischern, Sonnenblende
    box(nx - 2, nx - 1, 47, 70, CZ0 + 2, CZ1 - 2, GLAS_FRONT);
    frame(nx - 1, nx - 1, 46, 71, CZ0 + 1, CZ1 - 1, SCHWARZ);
    for (const [z0, z1] of [[8, 25], [32, 49]]) for (let z = z0; z <= z1; z++) box(nx - 1, nx - 1, 47 + Math.floor((z - z0) / 6), 47 + Math.floor((z - z0) / 6), z, z, SCHWARZ);
    box(nx - 3, nx - 1, 72, 73, CZ0, CZ1, DUNKEL);
    // Kühlergrill mit Chromleisten und Logo
    box(nx - 1, nx - 1, 30, 43, 14, nz - 15, (x, y) => (y % 3 === 0 ? CHROM : '#2b3036'));
    box(nx - 1, nx - 1, 33, 39, mid - 6, mid + 5, GRUEN_D);
    text(nx - 1, 38, mid + 2, 'UE', WARN_W);
    // Scheinwerfer mit Chromring, Blinker außen
    const sw = part('scheinwerfer');
    for (const [z0, z1, zb0, zb1] of [[6, 13, CZ0, CZ0 + 1], [nz - 14, nz - 7, CZ1 - 1, CZ1]]) {
      box(nx - 1, nx - 1, 22, 28, z0 - 1, z1 + 1, CHROM);
      box(nx - 1, nx - 1, 23, 27, z0, z1, SCHEINWERFER);
      mark(sw, nx - 1, nx - 1, 23, 27, z0, z1);
      box(nx - 1, nx - 1, 23, 26, zb0, zb1, BLINKER);
    }
    // Stoßstange mit Nebelscheinwerfern, Lufteinlass, Kennzeichen, Abschlepphaken
    box(nx - 4, nx - 1, 12, 21, CZ0, CZ1, GRAU);
    box(nx - 1, nx - 1, 19, 20, 17, nz - 18, '#2b3036');
    for (const [z0, z1] of [[7, 10], [nz - 11, nz - 8]]) box(nx - 1, nx - 1, 14, 16, z0, z1, NEBEL);
    box(nx - 1, nx - 1, 11, 18, mid - 9, mid + 8, WARN_W); frame(nx - 1, nx - 1, 11, 18, mid - 9, mid + 8, SCHWARZ);
    text(nx - 1, 17, mid + 7, 'UE75', SCHWARZ);
    // Spiegel an Auslegern (ragen seitlich heraus)
    for (const [z, zo] of [[CZ0, 0], [CZ1, nz - 1]]) {
      const zs = Math.min(z, zo), ze = Math.max(z, zo);
      box(172, 172, 66, 66, zs, ze, SCHWARZ); box(172, 172, 46, 46, zs, ze, SCHWARZ);
      box(171, 174, 46, 66, zo, zo, SCHWARZ); box(171, 171, 48, 64, zo, zo, '#4d7590');
    }
    // Dach und Windabweiser mit Begrenzungsleuchten
    for (let x = CAB0 + 10; x <= nx - 6; x++) {
      const y = Math.round(76 + Math.min(1, (x - CAB0 - 10) / 26) * 5);
      box(x, x, 76, y, CZ0 + 1, CZ1 - 1, x > nx - 10 ? CAB_D : CAB);
    }
    for (const z of [14, 15, 24, 25, 36, 37, 46, 47]) box(171, 172, 81, 82, z, z, BLINKER);
    text(nx - 6, 81, mid + 3, 'UE', GRUEN_D);
  },
});
