// ══════════════════════════════════
// STATISTIK
// Aufzeichnung + Graph-Rendering
// ══════════════════════════════════

const MAX_HISTORIE = 20;

// ── Runde aufzeichnen ──
function statistikAufzeichnen() {
  let einnahmen = 0;

  // Einnahmen aus Produktionswert schätzen
  for (let m of installierte_maschinen) {
    if (!m.laeuft) continue;
    let rezept = REZEPTE.find(function(r) { return r.id === m.aktivesRezept; });
    if (!rezept) continue;
    for (let out of rezept.outputs) {
      let mat   = MATERIALIEN.find(function(mat) { return mat.id === out.material; });
      let preis = (marktpreise && marktpreise[out.material])
        ? marktpreise[out.material] : (mat ? mat.verkaufpreis : 0);
      einnahmen += out.menge * preis;
    }
  }

  let kosten  = gesamtkosten || 0;
  let gewinn  = einnahmen - kosten;

  // Lagergesamtwert berechnen
  let lagerWert = 0;
  for (let key in lager) {
    let mat   = MATERIALIEN.find(function(m) { return m.id === key; });
    let preis = (marktpreise && marktpreise[key])
      ? marktpreise[key] : (mat ? mat.verkaufpreis : 0);
    lagerWert += (lager[key] || 0) * preis;
  }

  statistikHistorie.push({
    runde:     spielRundeGesamt,
    einnahmen: einnahmen,
    kosten:    kosten,
    gewinn:    gewinn,
    geld:      geld,
    lagerWert: lagerWert
  });

  // Auf MAX kürzen
  if (statistikHistorie.length > MAX_HISTORIE) {
    statistikHistorie.shift();
  }
}

// ── Statistik Screen aktualisieren ──
function statistikScreenAktualisieren() {
  let bereich = document.getElementById("statistik-bereich");
  if (!bereich) return;

  if (statistikHistorie.length < 2) {
    bereich.innerHTML =
      "<p class='screen-hinweis'>Noch zu wenig Daten. " +
      "Lass einige Runden laufen...</p>";
    return;
  }

  let html = "";

  // ── KPI Karten ──
  let letzte = statistikHistorie[statistikHistorie.length - 1];
  let vorher = statistikHistorie[statistikHistorie.length - 2];

  let gewinnTrend = letzte.gewinn - vorher.gewinn;
  let gewinnFarbe = letzte.gewinn >= 0 ? "var(--green)" : "var(--red)";
  let trendPfeil  = gewinnTrend > 0 ? "↑" : gewinnTrend < 0 ? "↓" : "→";
  let trendFarbe  = gewinnTrend > 0 ? "var(--green)" : gewinnTrend < 0 ? "var(--red)" : "var(--text3)";

  html +=
    "<div class='stat-kpis'>" +

      kpiKarte("💰 Geld", geld.toLocaleString("de-DE") + " €", null, "var(--accent)") +
      kpiKarte("📈 Umsatz/Runde", letzte.einnahmen.toLocaleString("de-DE") + " €",
        trendPfeil, trendFarbe) +
      kpiKarte("💸 Kosten/Runde", letzte.kosten.toLocaleString("de-DE") + " €",
        null, "var(--red)") +
      kpiKarte("📊 Gewinn/Runde", letzte.gewinn.toLocaleString("de-DE") + " €",
        trendPfeil, gewinnFarbe) +

    "</div>";

  // ── Gewinn/Verlust Graph ──
  html += "<div class='stat-sektion-titel'>📈 Produktionswert vs. Kosten</div>";
  html += graphHTML();

  // ── ROI pro Maschine ──
  html += "<div class='stat-sektion-titel'>⚙️ ROI pro Maschine</div>";
  html += roiHTML();

  // ── Lager-Wert ──
  html += "<div class='stat-sektion-titel'>📦 Lagerbestand-Wert</div>";
  html += lagerWertHTML();

  bereich.innerHTML = html;
}

function kpiKarte(label, wert, pfeil, farbe) {
  return (
    "<div class='stat-kpi-karte'>" +
      "<div class='stat-kpi-label'>" + label + "</div>" +
      "<div class='stat-kpi-wert' style='color:" + farbe + "'>" +
        wert +
        (pfeil ? "<span class='stat-kpi-trend' style='color:" + farbe + "'>" + pfeil + "</span>" : "") +
      "</div>" +
    "</div>"
  );
}

// ── Graph ──
function graphHTML() {
  let breite  = 600;
  let hoehe   = 160;
  let padding = { top: 16, bottom: 24, left: 60, right: 16 };
  let inBreite = breite - padding.left - padding.right;
  let inHoehe  = hoehe  - padding.top  - padding.bottom;

  // Wertebereich ermitteln
  let alleWerte = statistikHistorie.flatMap(function(h) {
    return [h.einnahmen, h.kosten, h.gewinn];
  });
  let maxWert = Math.max(...alleWerte, 1);
  let minWert = Math.min(...alleWerte, 0);
  let spanne  = maxWert - minWert || 1;

  function xPos(i) {
    return padding.left + (i / (statistikHistorie.length - 1)) * inBreite;
  }

  function yPos(wert) {
    return padding.top + inHoehe - ((wert - minWert) / spanne) * inHoehe;
  }

  // Linien-Pfade
  function liniePfad(feld) {
    return statistikHistorie.map(function(h, i) {
      return (i === 0 ? "M" : "L") + xPos(i).toFixed(1) + " " + yPos(h[feld]).toFixed(1);
    }).join(" ");
  }

  // Null-Linie
  let nullY  = yPos(0);
  let nullLinie = minWert < 0 ?
    "<line x1='" + padding.left + "' y1='" + nullY + "' x2='" + (breite - padding.right) + "' y2='" + nullY + "' stroke='var(--border2)' stroke-width='1' stroke-dasharray='4,4'/>" : "";

  // Y-Achsen Labels
  let yLabels = "";
  let schritte = [0, 0.25, 0.5, 0.75, 1.0];
  for (let s of schritte) {
    let wert  = minWert + s * spanne;
    let y     = padding.top + inHoehe - s * inHoehe;
    let label = Math.abs(wert) >= 1000
      ? (wert / 1000).toFixed(0) + "k"
      : wert.toFixed(0);
    yLabels +=
      "<text x='" + (padding.left - 6) + "' y='" + (y + 4) + "' " +
      "text-anchor='end' fill='#4b5563' font-size='10' font-family='Rajdhani,sans-serif'>" +
      label + "</text>" +
      "<line x1='" + padding.left + "' y1='" + y + "' x2='" + (breite - padding.right) + "' y2='" + y + "' " +
      "stroke='#1e2128' stroke-width='0.5'/>";
  }

  // X-Achsen Labels (jede 5. Runde)
  let xLabels = "";
  statistikHistorie.forEach(function(h, i) {
    if (i % 4 === 0 || i === statistikHistorie.length - 1) {
      xLabels +=
        "<text x='" + xPos(i) + "' y='" + (hoehe - 4) + "' " +
        "text-anchor='middle' fill='#4b5563' font-size='10' font-family='Rajdhani,sans-serif'>" +
        "R" + h.runde + "</text>";
    }
  });

  // Fläche unter Gewinn-Linie (grün/rot)
  let gewinnArea = "";
  if (statistikHistorie.length > 1) {
    let areaPath = statistikHistorie.map(function(h, i) {
      return (i === 0 ? "M" : "L") + xPos(i).toFixed(1) + " " + yPos(h.gewinn).toFixed(1);
    }).join(" ");
    areaPath += " L" + xPos(statistikHistorie.length - 1) + " " + nullY +
                " L" + xPos(0) + " " + nullY + " Z";
    gewinnArea = "<path d='" + areaPath + "' fill='rgba(16,185,129,0.08)'/>";
  }

  let svg =
    "<div class='stat-graph-container'>" +
    "<svg viewBox='0 0 " + breite + " " + hoehe + "' " +
         "preserveAspectRatio='none' style='width:100%; height:" + hoehe + "px'>" +

      // Hintergrund
      "<rect width='" + breite + "' height='" + hoehe + "' fill='#080910' rx='4'/>" +

      // Gitterlinien + Labels
      yLabels + xLabels +

      // Null-Linie
      nullLinie +

      // Fläche
      gewinnArea +

      // Kosten-Linie (rot, gestrichelt)
      "<path d='" + liniePfad("kosten") + "' " +
        "fill='none' stroke='#ef4444' stroke-width='1.5' " +
        "stroke-dasharray='5,3' opacity='0.7'/>" +

      // Einnahmen-Linie (amber)
      "<path d='" + liniePfad("einnahmen") + "' " +
        "fill='none' stroke='#f59e0b' stroke-width='2'/>" +

      // Gewinn-Linie (grün)
      "<path d='" + liniePfad("gewinn") + "' " +
        "fill='none' stroke='#10b981' stroke-width='2.5'/>" +

      // Punkte auf Gewinn-Linie
      statistikHistorie.map(function(h, i) {
        let farbe = h.gewinn >= 0 ? "#10b981" : "#ef4444";
        return "<circle cx='" + xPos(i).toFixed(1) + "' cy='" + yPos(h.gewinn).toFixed(1) + "' " +
               "r='3' fill='" + farbe + "'/>";
      }).join("") +

    "</svg>" +

    // Legende
    "<div class='stat-graph-legende'>" +
      "<span class='stat-leg-item' style='color:#10b981'>— Gewinn</span>" +
      "<span class='stat-leg-item' style='color:#f59e0b'>— Produktion</span>" +
      "<span class='stat-leg-item' style='color:#ef4444'>- - Kosten</span>" +
    "</div>" +
    "</div>";

  return svg;
}

// ── ROI pro Maschine ──
function roiHTML() {
  if (installierte_maschinen.length === 0) {
    return "<p class='screen-hinweis' style='padding:12px'>Keine Maschinen installiert.</p>";
  }

  let html = "<div class='roi-liste'>";

  for (let m of installierte_maschinen) {
    let md     = MASCHINEN.find(function(md) { return md.id === m.id; });
    let rezept = REZEPTE.find(function(r) { return r.id === m.aktivesRezept; });

    // Einnahmen pro Runde schätzen
    let einnahmenRunde = 0;
    if (rezept) {
      for (let out of rezept.outputs) {
        let mat   = MATERIALIEN.find(function(mat) { return mat.id === out.material; });
        let preis = (marktpreise && marktpreise[out.material])
          ? marktpreise[out.material] : (mat ? mat.verkaufpreis : 0);
        einnahmenRunde += out.menge * preis;
      }
    }

    let kostenRunde  = m.kostenProRunde;
    let gewinnRunde  = einnahmenRunde - kostenRunde;
    let kaufpreis    = m.kosten || (md ? md.kosten : 0);
    let breakEven    = gewinnRunde > 0
      ? Math.ceil(kaufpreis / gewinnRunde)
      : null;

    let gwFarbe = gewinnRunde >= 0 ? "var(--green)" : "var(--red)";
    let linie   = md ? (PRODUKTIONSLINIEN[md.produktionslinie] || null) : null;
    let lFarbe  = linie ? linie.farbe : "var(--border2)";

    html +=
      "<div class='roi-karte' style='border-left-color:" + lFarbe + "'>" +
        "<div class='roi-karte-header'>" +
          "<span class='roi-emoji'>" + m.emoji + "</span>" +
          "<div class='roi-info'>" +
            "<div class='roi-name'>" + m.name + "</div>" +
            "<div class='roi-rezept'>" + (rezept ? rezept.name : "Kein Rezept") + "</div>" +
          "</div>" +
          "<div class='roi-status' style='background:" + (m.laeuft ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)") + "; color:" + (m.laeuft ? "var(--green)" : "var(--red)") + "'>" +
            (m.laeuft ? "▶ Läuft" : "⏹ Stop") +
          "</div>" +
        "</div>" +

        "<div class='roi-stats'>" +
          "<div class='roi-stat'>" +
            "<span class='roi-stat-wert' style='color:var(--accent)'>" +
              einnahmenRunde.toLocaleString("de-DE") + " €" +
            "</span>" +
            "<span class='roi-stat-label'>Produktion/Runde</span>" +
          "</div>" +
          "<div class='roi-stat'>" +
            "<span class='roi-stat-wert' style='color:var(--red)'>" +
              kostenRunde.toLocaleString("de-DE") + " €" +
            "</span>" +
            "<span class='roi-stat-label'>Kosten/Runde</span>" +
          "</div>" +
          "<div class='roi-stat'>" +
            "<span class='roi-stat-wert' style='color:" + gwFarbe + "'>" +
              gewinnRunde.toLocaleString("de-DE") + " €" +
            "</span>" +
            "<span class='roi-stat-label'>Gewinn/Runde</span>" +
          "</div>" +
          "<div class='roi-stat'>" +
            "<span class='roi-stat-wert' style='color:var(--text)'>" +
              (breakEven ? breakEven + "R" : "∞") +
            "</span>" +
            "<span class='roi-stat-label'>Break-even</span>" +
          "</div>" +
        "</div>" +

        // Fortschrittsbalken: Sessions
        "<div class='roi-sessions'>" +
          "<div style='display:flex; justify-content:space-between; font-size:10px; color:var(--text3); margin-bottom:3px'>" +
            "<span>Produktionen diese Session</span>" +
            "<span>" + (m.sessionProduktionen || 0) + "x</span>" +
          "</div>" +
          "<div style='height:3px; background:var(--surface2); border-radius:2px; overflow:hidden'>" +
            "<div style='height:100%; width:" +
              Math.min(100, ((m.sessionProduktionen || 0) / 20) * 100) + "%; " +
              "background:" + lFarbe + "; border-radius:2px'></div>" +
          "</div>" +
        "</div>" +

      "</div>";
  }

  html += "</div>";
  return html;
}

// ── Lagerwert ──
function lagerWertHTML() {
  let total = 0;
  let items = [];

  for (let mat of MATERIALIEN) {
    let menge = lager[mat.id] || 0;
    if (menge === 0) continue;
    let preis = (marktpreise && marktpreise[mat.id])
      ? marktpreise[mat.id] : mat.verkaufpreis;
    let wert = menge * preis;
    total += wert;
    items.push({ mat: mat, menge: menge, preis: preis, wert: wert });
  }

  items.sort(function(a, b) { return b.wert - a.wert; });

  if (items.length === 0) {
    return "<p class='screen-hinweis' style='padding:12px'>Lager ist leer.</p>";
  }

  let html =
    "<div class='lager-wert-total'>" +
      "<span class='lager-wert-zahl'>" + total.toLocaleString("de-DE") + " €</span>" +
      "<span class='lager-wert-label'>Gesamtwert im Lager</span>" +
    "</div>" +
    "<div class='lager-wert-liste'>";

  for (let item of items) {
    let prozent    = Math.round((item.wert / total) * 100);
    let linie      = PRODUKTIONSLINIEN[item.mat.produktionslinie] || null;
    let balkenFarbe = linie ? linie.farbe : "var(--border2)";

    html +=
      "<div class='lager-wert-item'>" +
        "<div class='lager-wert-item-kopf'>" +
          "<span>" + item.mat.emoji + " " + item.mat.name + "</span>" +
          "<span style='color:var(--accent); font-family:var(--font-head); font-weight:700'>" +
            item.wert.toLocaleString("de-DE") + " €" +
          "</span>" +
        "</div>" +
        "<div style='height:4px; background:var(--surface2); border-radius:2px; overflow:hidden'>" +
          "<div style='height:100%; width:" + prozent + "%; " +
            "background:" + balkenFarbe + "; border-radius:2px; transition:width 0.5s'></div>" +
        "</div>" +
        "<div style='display:flex; justify-content:space-between; font-size:10px; color:var(--text3); margin-top:2px'>" +
          "<span>" + item.menge + " Stk × " + item.preis + " €</span>" +
          "<span>" + prozent + "%</span>" +
        "</div>" +
      "</div>";
  }

  html += "</div>";
  return html;
}