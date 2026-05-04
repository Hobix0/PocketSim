// ══════════════════════════════════
// HALLENPLAN — Tile Renderer + Drag & Drop + Förderbänder
// ══════════════════════════════════
// Förderband-Daten pro Gebäude


// Förderband-Daten pro Gebäude (WICHTIG!)
window.foerderband_verbindungen = window.foerderband_verbindungen || {};


const TILE_SVGS = {
  leicht: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Crect width='16' height='16' fill='%231c1f26'/%3E%3Crect x='0' y='0' width='15' height='15' fill='%23222631'/%3E%3Crect x='1' y='1' width='13' height='1' fill='%23282c38'/%3E%3Crect x='1' y='1' width='1' height='13' fill='%23282c38'/%3E%3C/svg%3E",
  schwer: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Crect width='20' height='20' fill='%23141630'/%3E%3Crect x='0' y='0' width='19' height='19' fill='%231a1d40'/%3E%3Crect x='1' y='1' width='1' height='1' fill='%23252850'/%3E%3Crect x='17' y='1' width='1' height='1' fill='%23252850'/%3E%3Crect x='1' y='17' width='1' height='1' fill='%23252850'/%3E%3Crect x='17' y='17' width='1' height='1' fill='%23252850'/%3E%3Crect x='9' y='9' width='2' height='2' fill='%23252850'/%3E%3Crect x='1' y='1' width='17' height='1' fill='%230e1025'/%3E%3Crect x='1' y='1' width='1' height='17' fill='%230e1025'/%3E%3C/svg%3E",
  wand:   "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='8'%3E%3Crect width='16' height='8' fill='%230a0c18'/%3E%3Crect x='0' y='0' width='16' height='7' fill='%2312152a'/%3E%3Crect x='0' y='7' width='16' height='1' fill='%230a0c18'/%3E%3Crect x='0' y='1' width='16' height='1' fill='%231a1d38'/%3E%3C/svg%3E",
  mark:   "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14'%3E%3Crect width='14' height='14' fill='%230a0b0d'/%3E%3Cpolygon points='0,0 6,0 0,6' fill='%23f59e0b'/%3E%3Cpolygon points='8,0 14,0 14,6' fill='%23f59e0b'/%3E%3Cpolygon points='0,8 6,14 0,14' fill='%23f59e0b'/%3E%3Cpolygon points='14,8 14,14 8,14' fill='%23f59e0b'/%3E%3C/svg%3E",
  saule:  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%230c0d10'/%3E%3Crect x='4' y='4' width='32' height='32' fill='%23181a20'/%3E%3Crect x='4' y='4' width='32' height='2' fill='%23282c38'/%3E%3Crect x='4' y='4' width='2' height='32' fill='%23282c38'/%3E%3Crect x='4' y='34' width='32' height='2' fill='%23080909'/%3E%3Crect x='34' y='4' width='2' height='32' fill='%23080909'/%3E%3Crect x='10' y='10' width='20' height='20' fill='%231e2230'/%3E%3C/svg%3E",
  gitter: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='8' height='8' fill='%230d0f28'/%3E%3Crect x='0' y='0' width='8' height='1' fill='%23343880'/%3E%3Crect x='0' y='0' width='1' height='8' fill='%23343880'/%3E%3Crect x='2' y='2' width='4' height='4' fill='%23080a1a'/%3E%3C/svg%3E",
  kanal:  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='8'%3E%3Crect width='40' height='8' fill='%231a1d40'/%3E%3Crect x='10' y='1' width='20' height='6' fill='%230a0b1f'/%3E%3Crect x='10' y='1' width='20' height='1' fill='%230e1030'/%3E%3Crect x='10' y='6' width='20' height='1' fill='%23252860'/%3E%3C/svg%3E",
  tuer:   "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%230c0d10'/%3E%3Crect x='4' y='0' width='32' height='40' fill='%231e2230'/%3E%3Crect x='6' y='4' width='28' height='32' fill='%23252c3a'/%3E%3Crect x='6' y='4' width='28' height='2' fill='%232a3048'/%3E%3Crect x='4' y='0' width='2' height='40' fill='%23282e3c'/%3E%3Crect x='34' y='0' width='2' height='40' fill='%23282e3c'/%3E%3Crect x='26' y='20' width='6' height='3' fill='%23f59e0b' opacity='0.7'/%3E%3C/svg%3E"
};

function tileBg(typ, hallenTyp) {
  let configs = {
    leicht: { bg: "#1e2230", img: TILE_SVGS.leicht, size: "16px 16px" },
    schwer: { bg: "#1a1e48", img: TILE_SVGS.schwer, size: "20px 20px" },
    wand:   { bg: "#0d1025", img: TILE_SVGS.wand,   size: "16px 8px"  },
    mark:   { bg: "#0a0b0d", img: TILE_SVGS.mark,   size: "14px 14px" },
    saule:  { bg: "#0e0f14", img: TILE_SVGS.saule,  size: "40px 40px" },
    gitter: { bg: "#0f1132", img: TILE_SVGS.gitter, size: "8px 8px"   },
    kanal:  { bg: "#1a1e48", img: TILE_SVGS.kanal,  size: "40px 8px"  },
    tuer:   { bg: "#1e2230", img: TILE_SVGS.tuer,   size: "40px 40px" }
  };
  let key = configs[typ] ? typ : "leicht";
  let c   = configs[key];
  return "background-color:" + c.bg + ";background-image:url('" + c.img + "');background-size:" + c.size + ";image-rendering:pixelated;";
}

let dragState = {
  aktiv: false, maschineIndex: null,
  vonX: null, vonY: null,
  tileW: null, tileH: null, gebaeudeId: null
};

function maschineHatFoerderbandEingang(globalIdx) {
  for (let gebId in foerderband_verbindungen) {
    for (let v of foerderband_verbindungen[gebId]) {
      if (v.zu === globalIdx) return true;
    }
  }
  return false;
}

function getMaschinenInput(idx, material, menge) {
  let m = installierte_maschinen[idx];

  if (m.foerderbandInput?.[material] >= menge) {
    m.foerderbandInput[material] -= menge;
    return true;
  }

  if ((lager[material] || 0) >= menge) {
    lager[material] -= menge;
    return true;
  }

  return false;
}

function maschinenPositionenInitialisieren(gebaeudeId) {
  let gebData = GEBAEUDE.find(function(g) { return g.id === gebaeudeId; });
  if (!gebData) return;
  let tileGr = typeof effektiveTileGroesse === "function"
    ? effektiveTileGroesse(gebaeudeId)
    : { w: gebData.tileBreite || 10, h: gebData.tileHoehe || 10 };
  let tW = tileGr.w, tH = tileGr.h;
  let meineMaschinen = maschinenVonGebaeude(gebaeudeId);
  let grid = [];
  for (let y = 0; y < tH; y++) grid.push(new Array(tW).fill(null));

  for (let i = 0; i < meineMaschinen.length; i++) {
    let m = meineMaschinen[i];
    let gi = installierte_maschinen.indexOf(m);
    let key = gebaeudeId + "_" + gi;
    let md = MASCHINEN.find(function(md) { return md.id === m.id; });
    let tw = md && md.tileGroesse ? md.tileGroesse.w : 2;
    let th = md && md.tileGroesse ? md.tileGroesse.h : 2;
    if (maschinenPositionen[key]) {
      let p = maschinenPositionen[key];
      for (let dy = 0; dy < th; dy++)
        for (let dx = 0; dx < tw; dx++)
          if (p.y+dy < tH && p.x+dx < tW) grid[p.y+dy][p.x+dx] = gi;
    }
  }

  for (let i = 0; i < meineMaschinen.length; i++) {
    let m = meineMaschinen[i];
    let gi = installierte_maschinen.indexOf(m);
    let key = gebaeudeId + "_" + gi;
    if (maschinenPositionen[key]) continue;
    let md = MASCHINEN.find(function(md) { return md.id === m.id; });
    let tw = md && md.tileGroesse ? md.tileGroesse.w : 2;
    let th = md && md.tileGroesse ? md.tileGroesse.h : 2;
    for (let y = 1; y <= tH-th-1 && !maschinenPositionen[key]; y++) {
      for (let x = 1; x <= tW-tw-1 && !maschinenPositionen[key]; x++) {
        let frei = true;
        for (let dy = 0; dy < th && frei; dy++)
          for (let dx = 0; dx < tw && frei; dx++)
            if (grid[y+dy][x+dx] !== null) frei = false;
        if (frei) {
          maschinenPositionen[key] = { x: x, y: y };
          for (let dy = 0; dy < th; dy++)
            for (let dx = 0; dx < tw; dx++)
              grid[y+dy][x+dx] = gi;
        }
      }
    }
  }
}

function tileMapGenerieren(gebData, tW, tH) {
  let map = [], isSchwer = false;
  for (let y = 0; y < tH; y++) {
    map.push([]);
    for (let x = 0; x < tW; x++) {
      if ((x===0&&y===0)||(x===tW-1&&y===0)||(x===0&&y===tH-1)||(x===tW-1&&y===tH-1))
        map[y].push("saule");
      else if (y===0||y===tH-1||x===0||x===tW-1)
        map[y].push("wand");
      else if (isSchwer && y===Math.floor(tH/2))
        map[y].push("kanal");
      else if (isSchwer && x%4===2 && y%3===2 && y!==Math.floor(tH/2))
        map[y].push("gitter");
      else if (!isSchwer && y===Math.floor(tH/2))
        map[y].push("mark");
      else
        map[y].push(isSchwer ? "schwer" : "leicht");
    }
  }
  map[0][Math.floor(tW/2)] = "tuer";
  return map;
}

function hallenplanDaten(gebaeudeId) {
  let gebData = GEBAEUDE.find(function(g) { return g.id === gebaeudeId; });
  if (!gebData) return null;
  maschinenPositionenInitialisieren(gebaeudeId);
  let tileGr = typeof effektiveTileGroesse === "function"
    ? effektiveTileGroesse(gebaeudeId)
    : { w: gebData.tileBreite || 10, h: gebData.tileHoehe || 10 };
  let tW = tileGr.w, tH = tileGr.h;
  let meineMaschinen = maschinenVonGebaeude(gebaeudeId);
  let grid = [];
  for (let y = 0; y < tH; y++) grid.push(new Array(tW).fill(null));
  let platzierteMaschinen = [];

  for (let i = 0; i < meineMaschinen.length; i++) {
    let m = meineMaschinen[i];
    let gi = installierte_maschinen.indexOf(m);
    let md = MASCHINEN.find(function(md) { return md.id === m.id; });
    let tw = md && md.tileGroesse ? md.tileGroesse.w : 2;
    let th = md && md.tileGroesse ? md.tileGroesse.h : 2;
    let pos = maschinenPositionen[gebaeudeId + "_" + gi] || { x: 1, y: 1 };
    for (let dy = 0; dy < th; dy++)
      for (let dx = 0; dx < tw; dx++)
        if (pos.y+dy < tH && pos.x+dx < tW)
          grid[pos.y+dy][pos.x+dx] = gi;
    platzierteMaschinen.push({
      maschine: m, maschineData: md,
      index: i, globalIndex: gi,
      x: pos.x, y: pos.y, w: tw, h: th
    });
  }

  return {
    gebData: gebData, gebaeudeId: gebaeudeId,
    tileBreite: tW, tileHoehe: tH,
    grid: grid, tileMap: tileMapGenerieren(gebData, tW, tH),
    platzierteMaschinen: platzierteMaschinen,
    meineMaschinen: meineMaschinen
  };
}

function hallenplanRendern(daten) {
  if (!daten) return "<p class='screen-hinweis'>Keine Hallendaten.</p>";
  let geb = daten.gebData, isSchwer = false;
  let lFarbe = "#f59e0b";
  let lName  = (geb.emoji || "🏭") + " " + (geb.name || geb.typ);

  let belegte = 0;
  for (let m of daten.meineMaschinen) {
    let md = MASCHINEN.find(function(md) { return md.id === m.id; });
    if (md && md.tileGroesse) belegte += md.tileGroesse.w * md.tileGroesse.h;
    else belegte += 4;
  }
  let gesamt  = daten.tileBreite * daten.tileHoehe;
  let prozent = Math.round((belegte / gesamt) * 100);
  let bFarbe  = prozent < 50 ? "var(--green)" : prozent < 80 ? "var(--accent)" : "var(--red)";
  let prodBonus = typeof upgradeProduktionsBonus === "function"
    ? upgradeProduktionsBonus(daten.gebaeudeId) : 1.0;
  let bonusText = prodBonus > 1.0
    ? " <span style=\"color:var(--green);font-size:10px;font-family:var(--font-body);font-weight:400\">+" +
      Math.round((prodBonus-1)*100) + "% Prod.</span>" : "";

  return "<div class=\"halle-container\" style=\"--linie-farbe:" + lFarbe + "\" id=\"halle-" + daten.gebaeudeId + "\">" +
    "<div class=\"halle-header\">" +
      "<div class=\"halle-header-links\">" +
        "<span class=\"halle-titel\">" + lName + bonusText + "</span>" +
        "<span class=\"halle-groesse\">" + daten.tileBreite + "×" + daten.tileHoehe + " Tiles · " + geb.groesse.l + "×" + geb.groesse.b + "m</span>" +
      "</div>" +
      "<div class=\"halle-header-rechts\">" +
        "<span class=\"halle-auslastung-zahl\" style=\"color:" + bFarbe + "\">" + prozent + "%</span>" +
        "<span class=\"halle-auslastung-label\">belegt</span>" +
      "</div>" +
    "</div>" +
    "<div class=\"halle-balken-container\"><div class=\"halle-balken-fill\" style=\"width:" + prozent + "%;background:" + bFarbe + "\"></div></div>" +
    "<div class=\"halle-stats\">" +
      "<div class=\"halle-stat\"><span class=\"halle-stat-wert\">" + belegte + "</span><span class=\"halle-stat-label\">belegt</span></div>" +
      "<div class=\"halle-stat\"><span class=\"halle-stat-wert\">" + (gesamt-belegte) + "</span><span class=\"halle-stat-label\">frei</span></div>" +
      "<div class=\"halle-stat\"><span class=\"halle-stat-wert\">" + daten.meineMaschinen.length + "</span><span class=\"halle-stat-label\">Maschinen</span></div>" +
      "<div class=\"halle-stat\"><span class=\"halle-stat-wert\">" + daten.meineMaschinen.filter(function(m){return m.laeuft;}).length + "</span><span class=\"halle-stat-label\">Aktiv</span></div>" +
    "</div>" +
    "<div class=\"halle-typ-badge\" style=\"color:" + lFarbe + ";border-color:" + lFarbe + "\">" +
      "<span class=\"halle-typ-dot\" style=\"background:" + lFarbe + "\"></span>" +
      (isSchwer ? "Verstärkter Boden" : "Standardboden") +
      " <span style=\"font-size:10px;color:var(--text3);margin-left:8px\">↔ verschiebbar · 🔗 Förderbänder</span>" +
    "</div>" +
    "<div class=\"halle-grundriss-wrapper\">" +
      "<div class=\"halle-grundriss-titel\">📐 Grundriss</div>" +
      "<div class=\"tile-grid-container\">" + tileGridHTML(daten) + "</div>" +
    "</div>" +
    "</div>";
}

function tileGridHTML(daten) {
  let tW = daten.tileBreite, tH = daten.tileHoehe, geb = daten.gebData;
  let isSchwer = geb.hallenTyp === "schwer";
  let lFarbe   = isSchwer ? "#6366f1" : "#f59e0b";

  // WICHTIG: alle HTML-Attribute mit doppelten Anführungszeichen
  let gridHTML = "<div class=\"tile-grid\" id=\"tile-grid-" + daten.gebaeudeId + "\" " +
    "style=\"grid-template-columns:repeat(" + tW + ",var(--tile-size));grid-template-rows:repeat(" + tH + ",var(--tile-size))\">";

  for (let y = 0; y < tH; y++) {
    for (let x = 0; x < tW; x++) {
      let mi  = daten.grid[y][x];
      let tt  = daten.tileMap[y][x];
      let bg  = tileBg(tt, geb.hallenTyp);
      let istRand = (y===0||y===tH-1||x===0||x===tW-1);

      if (mi === null) {
        if (istRand) {
          gridHTML += "<div class=\"tile\" style=\"" + bg + "\"></div>";
        } else {
          // Alle Attribute mit doppelten Anführungszeichen
          gridHTML +=
            "<div class=\"tile tile-frei\" style=\"" + bg + "\" " +
            "data-x=\"" + x + "\" data-y=\"" + y + "\" data-gebaeude=\"" + daten.gebaeudeId + "\" " +
            "ondragover=\"tileOnDragOver(event)\" " +
            "ondragleave=\"tileOnDragLeave(event)\" " +
            "ondrop=\"tileOnDrop(event," + x + "," + y + ",this.dataset.gebaeude)\"></div>";

        }
      } else {
        let pm = daten.platzierteMaschinen.find(function(p) { return p.globalIndex === mi; });
        if (pm && pm.x === x && pm.y === y) {
          gridHTML += maschinenTileHTML(pm, daten.gebaeudeId, lFarbe);
        }
      }
    }
  }

  gridHTML += "</div>";

  // Förderband SVG Overlay
  let svgOverlay = "";
  if (typeof foerderbandSVGRendern === "function") {
    svgOverlay = foerderbandSVGRendern(daten);
  }

  // Förderband Steuerbereich
  let fbSteuer = "";
  if (typeof foerderbandVerbindungen === "function") {
    let vbs     = foerderbandVerbindungen(daten.gebaeudeId);
    let istAktiv = typeof foerderbandModus !== "undefined" && foerderbandModus.aktiv;

    let btnStyle = istAktiv
      ? "background:var(--red);color:#fff;border:none;"
      : "background:var(--surface2);color:var(--text2);border:1px solid var(--border);";
    let btnText  = istAktiv ? "✕ Abbrechen" : "🔗 Förderband verbinden";
    // onclick mit doppelten Anführungszeichen als Attribut-Wrapper
    let btnClick = istAktiv
      ? "foerderbandModusBeenden()"
      : "foerderbandModusStarten(\"" + daten.gebaeudeId + "\")";  // ← gebId direkt

    let vbList = "";
    if (vbs.length > 0) {
      vbList = "<div class=\"foerderband-liste\">";
      for (let v of vbs) {
        let mV = installierte_maschinen[v.von];
        let mZ = installierte_maschinen[v.zu];
        let mat = MATERIALIEN.find(function(m) { return m.id === v.material; });
        if (!mV || !mZ) continue;
        vbList +=
          "<div class=\"foerderband-item\">" +
            "<span>" + mV.emoji + " " + mV.name + "</span>" +
            "<span class=\"foerderband-pfeil\">" + (mat ? mat.emoji : "📦") + " →</span>" +
            "<span>" + mZ.emoji + " " + mZ.name + "</span>" +
            "<button class=\"foerderband-loeschen-btn\" " +
              "data-von=\"" + v.von + "\" data-zu=\"" + v.zu + "\" data-geb=\"" + daten.gebaeudeId + "\">✕</button>" +
          "</div>";
      }
      vbList += "</div>";
    }

    fbSteuer =
      "<div class=\"foerderband-steuer\">" +
        "<button style=\"width:auto;padding:7px 14px;font-size:12px;border-radius:7px;letter-spacing:0;text-transform:none;" + btnStyle + "\" " +
        "data-gebid=\"" + daten.gebaeudeId + "\" " +
        "data-fb-action=\"" + (istAktiv ? "beenden" : "starten") + "\">" + btnText + "</button>" +
        (vbs.length > 0 ?
          "<span style=\"font-size:11px;color:var(--text3);margin-left:8px\">" + vbs.length + " Verbindung" + (vbs.length > 1 ? "en" : "") + "</span>"
          : "") +
      "</div>" + vbList;
  }

  return "<div class=\"foerderband-wrapper\">" +
    gridHTML +
    (svgOverlay ? "<div class=\"foerderband-overlay\">" + svgOverlay + "</div>" : "") +
    "</div>" + fbSteuer;
}

function maschinenTileHTML(pm, gebaeudeId, linienFarbe) {
  let m      = pm.maschine;
  let md     = pm.maschineData;
  let mFarbe = md && md.farbe ? md.farbe : linienFarbe;
  let led    = m.laeuft ? "var(--green)" : "var(--red)";
  let isSchwer = false;
  let bgCol  = isSchwer ? "#161838" : "#1a1d24";

  let istVerbinde = typeof foerderbandModus !== "undefined" && foerderbandModus.aktiv;
  let istQuelle   = istVerbinde && foerderbandModus.quelleIdx === pm.globalIndex;
  let istDragging = dragState.aktiv && dragState.maschineIndex === pm.globalIndex;

  let vbs = typeof foerderbandVerbindungen === "function" ? foerderbandVerbindungen(gebaeudeId) : [];
  let hatVb = vbs.some(function(v) { return v.von === pm.globalIndex || v.zu === pm.globalIndex; });

  let klassen = "tile tile-maschine" +
    (istDragging ? " tile-dragging" : "") +
    (istQuelle   ? " tile-foerder-quelle" : "") +
    (istVerbinde && !istQuelle ? " tile-foerder-ziel" : "");

  // ALLE Attribute mit doppelten Anführungszeichen
  // Zahlen-Argumente brauchen keine Anführungszeichen
  // String-Argumente: data-Attribute nutzen statt inline strings
  let onclickAttr = istVerbinde
    ? "onclick=\"foerderbandTileKlick(event," + pm.globalIndex + ",this.dataset.gebaeude)\""
    : "onclick=\"verwaltenOeffnen('maschine'," + pm.globalIndex + ")\"";

  let dragAttrs = !istVerbinde
    ? "ondragstart=\"tileOnDragStart(event," + pm.globalIndex + "," + pm.x + "," + pm.y + "," + pm.w + "," + pm.h + ",this.dataset.gebaeude)\" " +
      "ondragend=\"tileOnDragEnd(event)\" "
    : "";

  return "<div class=\"" + klassen + "\" " +
    "style=\"" +
      "grid-column:" + (pm.x+1) + "/span " + pm.w + ";" +
      "grid-row:"    + (pm.y+1) + "/span " + pm.h + ";" +
      "background:"  + bgCol + ";" +
      "border:1.5px solid " + mFarbe + ";\" " +
    "draggable=\"" + (!istVerbinde ? "true" : "false") + "\" " +
    "data-maschine-index=\"" + pm.globalIndex + "\" " +
    "data-gebaeude=\"" + gebaeudeId + "\" " +
    "data-tw=\"" + pm.w + "\" data-th=\"" + pm.h + "\" " +
    dragAttrs +
    onclickAttr + ">" +

    "<div class=\"tile-led\" style=\"background:" + led + ";box-shadow:0 0 3px " + led + "\"></div>" +
    "<div class=\"tile-emoji\">" + m.emoji + "</div>" +
    (pm.w >= 2 ? "<div class=\"tile-name\">" + m.name.split(" ")[0] + "</div>" : "") +
    "<div class=\"tile-size\">" + pm.w + "×" + pm.h + "</div>" +
    (m.laeuft ? "<div class=\"tile-puls\" style=\"border-color:" + mFarbe + ";border-width:1px\"></div>" : "") +
    (!istVerbinde ? "<div class=\"tile-drag-handle\">⠿</div>" : "") +
    (hatVb ? "<div style=\"position:absolute;bottom:3px;right:3px;font-size:8px;opacity:0.6\">🔗</div>" : "") +
    "</div>";
}

// ══════════════════════════════════
// DRAG & DROP
// ══════════════════════════════════

function tileOnDragStart(event, mi, vonX, vonY, tw, th, gebId) {
  dragState = { aktiv: true, maschineIndex: mi, vonX: vonX, vonY: vonY, tileW: tw, tileH: th, gebaeudeId: gebId };
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", String(mi));
  event.target.style.opacity = "0.3";
  setTimeout(function() { dropZonenHervorheben(gebId, tw, th, mi); }, 50);
}

function tileOnDragEnd(event) {
  event.target.style.opacity = "";
  dropZonenZuruecksetzen();
  let gebId = dragState.gebaeudeId;
  dragState = { aktiv: false, maschineIndex: null, vonX: null, vonY: null, tileW: null, tileH: null, gebaeudeId: null };
  if (gebId) hallenplanAktualisieren(gebId);
}

function tileOnDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  let x   = parseInt(event.currentTarget.dataset.x);
  let y   = parseInt(event.currentTarget.dataset.y);
  let gId = event.currentTarget.dataset.gebaeude;

  document.querySelectorAll(".tile-drop-hover").forEach(function(el) {
    el.classList.remove("tile-drop-hover");
  });

  if (dragState.aktiv) {
    for (let dy = 0; dy < dragState.tileH; dy++) {
      for (let dx = 0; dx < dragState.tileW; dx++) {
        let t = document.querySelector(
          "[data-x=\"" + (x+dx) + "\"][data-y=\"" + (y+dy) + "\"][data-gebaeude=\"" + gId + "\"]"
        );
        if (t) t.classList.add("tile-drop-hover");
      }
    }
  }

  if (kannPlatziertWerden(gId, x, y, dragState.tileW, dragState.tileH, dragState.maschineIndex)) {
    event.currentTarget.classList.add("tile-drop-valid");
  } else {
    event.currentTarget.classList.add("tile-drop-invalid");
  }
}

function tileOnDragLeave(event) {
  event.currentTarget.classList.remove("tile-drop-valid", "tile-drop-invalid", "tile-drop-hover");
}

function tileOnDrop(event, zielX, zielY, gebId) {
  event.preventDefault();
  dropZonenZuruecksetzen();
  if (!dragState.aktiv || dragState.maschineIndex === null) return;

  if (!kannPlatziertWerden(gebId, zielX, zielY, dragState.tileW, dragState.tileH, dragState.maschineIndex)) {
    let g = document.getElementById("tile-grid-" + gebId);
    if (g) { g.classList.add("grid-shake"); setTimeout(function(){g.classList.remove("grid-shake");}, 400); }
    return;
  }

  maschinenPositionen[gebId + "_" + dragState.maschineIndex] = { x: zielX, y: zielY };
  spielstandSpeichern();
  hallenplanAktualisieren(gebId);
  if (typeof soundKaufen === "function") soundKaufen();
}

function dropZonenHervorheben(gebId, tw, th, ausnahme) {
  let daten = hallenplanDaten(gebId);
  if (!daten) return;
  for (let y = 0; y < daten.tileHoehe; y++) {
    for (let x = 0; x < daten.tileBreite; x++) {
      if (kannPlatziertWerden(gebId, x, y, tw, th, ausnahme)) {
        let t = document.querySelector(
          "[data-x=\"" + x + "\"][data-y=\"" + y + "\"][data-gebaeude=\"" + gebId + "\"]"
        );
        if (t) t.classList.add("tile-drop-possible");
      }
    }
  }
}

function dropZonenZuruecksetzen() {
  document.querySelectorAll(
    ".tile-drop-possible,.tile-drop-valid,.tile-drop-invalid,.tile-drop-hover"
  ).forEach(function(el) {
    el.classList.remove("tile-drop-possible", "tile-drop-valid", "tile-drop-invalid", "tile-drop-hover");
  });
}

function kannPlatziertWerden(gebId, zielX, zielY, tw, th, ausnahme) {
  let gebData = GEBAEUDE.find(function(g){return g.id===gebId;});
  if (!gebData) return false;
  let tileGr = typeof effektiveTileGroesse === "function"
    ? effektiveTileGroesse(gebId)
    : { w: gebData.tileBreite||10, h: gebData.tileHoehe||10 };
  let tW = tileGr.w, tH = tileGr.h;
  if (zielX<1||zielY<1||zielX+tw>tW-1||zielY+th>tH-1) return false;

  let grid = [];
  for (let y = 0; y < tH; y++) grid.push(new Array(tW).fill(null));
  let mm = maschinenVonGebaeude(gebId);
  for (let i = 0; i < mm.length; i++) {
    let gi = installierte_maschinen.indexOf(mm[i]);
    if (gi === ausnahme) continue;
    let md = MASCHINEN.find(function(md){return md.id===mm[i].id;});
    let mtw = md && md.tileGroesse ? md.tileGroesse.w : 2;
    let mth = md && md.tileGroesse ? md.tileGroesse.h : 2;
    let pos = maschinenPositionen[gebId + "_" + gi];
    if (!pos) continue;
    for (let dy = 0; dy < mth; dy++)
      for (let dx = 0; dx < mtw; dx++)
        if (pos.y+dy<tH&&pos.x+dx<tW) grid[pos.y+dy][pos.x+dx] = gi;
  }

  for (let dy = 0; dy < th; dy++)
    for (let dx = 0; dx < tw; dx++)
      if (grid[zielY+dy][zielX+dx] !== null) return false;

  return true;
}

function hallenplanAktualisieren(gebId) {
  let bereich = document.getElementById("hallenplan-bereich");
  if (!bereich) return;
  bereich.innerHTML = hallenplanRendern(hallenplanDaten(gebId));
}

function hallenplanGenerieren(gebId) {
  return hallenplanRendern(hallenplanDaten(gebId));
}

// ══════════════════════════════════
// FÖRDERBÄNDER (integriert aus foerderband.js)
// ══════════════════════════════════

let foerderbandModus = {
  aktiv: false, quelleIdx: null, gebaeudeId: null
};

function foerderbandVerbindungen(gebaeudeId) {
  return foerderband_verbindungen[gebaeudeId] || [];
}

function foerderbandVerbinden(gebaeudeId, vonIdx, zuIdx) {
  if (vonIdx === zuIdx) return false;
  if (!foerderband_verbindungen[gebaeudeId]) foerderband_verbindungen[gebaeudeId] = [];

  let exists = foerderband_verbindungen[gebaeudeId].some(function(v) {
    return v.von === vonIdx && v.zu === zuIdx;
  });
  if (exists) { zeigeNotification("⚠️ Verbindung existiert bereits!", "red"); return false; }

  let kompa = foerderbandKompatibilitaet(vonIdx, zuIdx);
  if (!kompa.ok) { zeigeNotification("❌ " + kompa.grund, "red"); return false; }

  foerderband_verbindungen[gebaeudeId].push({ von: vonIdx, zu: zuIdx, material: kompa.material });
  spielstandSpeichern();
  zeigeNotification("✅ Förderband: " + installierte_maschinen[vonIdx].name + " → " + installierte_maschinen[zuIdx].name, "green");
  return true;
}

function foerderbandLoeschen(gebaeudeId, vonIdx, zuIdx) {
  if (!foerderband_verbindungen[gebaeudeId]) return;
  foerderband_verbindungen[gebaeudeId] = foerderband_verbindungen[gebaeudeId].filter(function(v) {
    return !(v.von === vonIdx && v.zu === zuIdx);
  });
  spielstandSpeichern();
  zeigeNotification("🗑️ Förderband entfernt", "red");
}

function foerderbandLoeschenUndAktualisieren(gebaeudeId, vonIdx, zuIdx) {
  foerderbandLoeschen(gebaeudeId, vonIdx, zuIdx);
  hallenplanAktualisieren(gebaeudeId);
}

function foerderbandKompatibilitaet(vonIdx, zuIdx) {
  let mVon = installierte_maschinen[vonIdx];
  let mZu  = installierte_maschinen[zuIdx];
  if (!mVon || !mZu) return { ok: false, grund: "Maschine nicht gefunden" };

  let rezeptVon = REZEPTE.find(function(r) { return r.id === mVon.aktivesRezept; });
  let rezeptZu  = REZEPTE.find(function(r) { return r.id === mZu.aktivesRezept; });
  if (!rezeptVon || !rezeptZu) return { ok: false, grund: "Kein Rezept aktiv" };

  for (let out of rezeptVon.outputs) {
    for (let inp of rezeptZu.inputs) {
      if (out.material === inp.material) {
        let mat = MATERIALIEN.find(function(m) { return m.id === out.material; });
        return { ok: true, material: out.material, matName: mat ? mat.name : out.material, matEmoji: mat ? mat.emoji : "📦" };
      }
    }
  }

  let vonOutputs = rezeptVon.outputs.map(function(o) {
    let m = MATERIALIEN.find(function(mat) { return mat.id === o.material; });
    return m ? m.name : o.material;
  }).join(", ");
  let zuInputs = rezeptZu.inputs.map(function(i) {
    let m = MATERIALIEN.find(function(mat) { return mat.id === i.material; });
    return m ? m.name : i.material;
  }).join(", ");

  return { ok: false, grund: "Kein passendes Material! " + mVon.name + " → " + vonOutputs + " | " + mZu.name + " braucht: " + zuInputs };
}

function maschineProduzieren(maschineIdx) {
  const m = installierte_maschinen[maschineIdx];
  if (!m || !m.laeuft) return;

  const rezept = REZEPTE.find(r => r.id === m.aktivesRezept);
  if (!rezept) return;

  while (true) {
    // ✅ Prüfen, ob ALLE Inputs verfügbar sind
    let kannProduzieren = rezept.inputs.every(inp => {
      const fb = m.foerderbandInput?.[inp.material] || 0;
      const lag = lager[inp.material] || 0;
      return fb + lag >= inp.menge;
    });

    if (!kannProduzieren) break;

    // ✅ Inputs VERBRAUCHEN
    for (let inp of rezept.inputs) {
      let rest = inp.menge;

      // Förderband zuerst
      if (m.foerderbandInput?.[inp.material]) {
        const nutz = Math.min(m.foerderbandInput[inp.material], rest);
        m.foerderbandInput[inp.material] -= nutz;
        rest -= nutz;
      }

      // Lager als Fallback
      if (rest > 0) {
        lager[inp.material] -= rest;
      }
    }

    // ✅ Outputs ERZEUGEN
    for (let out of rezept.outputs) {
      lager[out.material] = (lager[out.material] || 0) + out.menge;
    }
  }
}

function foerderbandTransferDurchfuehren() {
  if (spielPausiert) return;

  for (let gebId in foerderband_verbindungen) {
    for (let v of foerderband_verbindungen[gebId]) {
      const von = installierte_maschinen[v.von];
      const zu  = installierte_maschinen[v.zu];
      if (!von || !zu || !von.laeuft || !zu.laeuft) continue;

      const rezeptZu = REZEPTE.find(r => r.id === zu.aktivesRezept);
      if (!rezeptZu) continue;

      const inp = rezeptZu.inputs.find(i => i.material === v.material);
      if (!inp) continue;

      // ✅ EINHEITLICHER PUFFER
      zu.foerderbandInput ??= {};
      zu.foerderbandInput[v.material] ??= 0;

      // ✅ Förderband liefert MAXIMAL inp.menge pro Tick
      if ((lager[v.material] || 0) >= inp.menge) {
        lager[v.material] -= inp.menge;
        zu.foerderbandInput[v.material] += inp.menge;
      }
    }
  }
}

// ── Verbinde-Modus ──

function foerderbandModusStarten(gebaeudeId) {
  let gebId = gebaeudeId || window.aktivesGebaeudeId;
  if (!gebId) return;
  foerderbandModus = { aktiv: true, quelleIdx: null, gebaeudeId: gebId };
  hallenplanAktualisieren(gebId);
  if (typeof zeigeNotification === "function") {
    zeigeNotification("🔗 Verbinde-Modus aktiv — Klicke eine Quell-Maschine", "green");
  }
}

function foerderbandModusBeenden() {
  let gebId = foerderbandModus.gebaeudeId;
  foerderbandModus = { aktiv: false, quelleIdx: null, gebaeudeId: null };
  if (gebId) hallenplanAktualisieren(gebId);
}

function foerderbandTileKlick(event, globalIdx, gebaeudeId) {
  event.stopPropagation();
  if (!foerderbandModus.aktiv) return;

  if (foerderbandModus.quelleIdx === null) {
    foerderbandModus.quelleIdx  = globalIdx;
    foerderbandModus.gebaeudeId = gebaeudeId;
    hallenplanAktualisieren(gebaeudeId);
    let m = installierte_maschinen[globalIdx];
    zeigeNotification("🔗 Quelle: " + (m ? m.name : "?") + " — Klicke das Ziel", "green");
  } else {
    let vonIdx = foerderbandModus.quelleIdx;
    foerderbandModus = { aktiv: false, quelleIdx: null, gebaeudeId: null };
    foerderbandVerbinden(gebaeudeId, vonIdx, globalIdx);
    hallenplanAktualisieren(gebaeudeId);
  }
}

// ── SVG Overlay ──

function foerderbandSVGRendern(daten) {
  const tileSize = parseInt(
    getComputedStyle(document.documentElement).getPropertyValue("--tile-size")
  ) || 48;
  const step = tileSize + 1;

  const verbindungen = foerderbandVerbindungen(daten.gebaeudeId);
  if (!verbindungen.length) return "";

  const svgW = daten.tileBreite * step;
  const svgH = daten.tileHoehe * step;

  let lines = "";
  let offsetMap = {}; // Für mehrere Pfeile pro Maschine

  function nextOffset(key) {
    offsetMap[key] = (offsetMap[key] || 0) + 1;
    return (offsetMap[key] - 1) * 6 - 6;
  }

  for (let v of verbindungen) {
    const von = daten.platzierteMaschinen.find(p => p.globalIndex === v.von);
    const zu  = daten.platzierteMaschinen.find(p => p.globalIndex === v.zu);
    if (!von || !zu) continue;

    const off = nextOffset(v.von + "->" + v.zu);

    const x1 = (von.x + von.w / 2) * step;
    const y1 = (von.y + von.h / 2) * step + off;
    const x2 = (zu.x  + zu.w  / 2) * step;
    const y2 = (zu.y  + zu.h  / 2) * step + off;

    const aktiv = installierte_maschinen[v.von]?.laeuft &&
                  installierte_maschinen[v.zu]?.laeuft;

    const farbe = aktiv ? "#f59e0b" : "#6b7280";

    lines += `
      <line x1="${x1}" y1="${y1}"
            x2="${x2}" y2="${y2}"
            stroke="${farbe}"
            stroke-width="2.5"
            marker-end="url(#arrow)" />
    `;
  }

  return `
    <svg class="foerderband-svg"
         viewBox="0 0 ${svgW} ${svgH}"
         width="${svgW}" height="${svgH}">
      <defs>
        <marker id="arrow"
                markerWidth="10"
                markerHeight="8"
                refX="9"
                refY="4"
                orient="auto">
          <polygon points="0,0 10,4 0,8" fill="#f59e0b"/>
        </marker>
      </defs>
      ${lines}
    </svg>
  `;
}
