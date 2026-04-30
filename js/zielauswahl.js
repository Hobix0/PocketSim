// ── Zielauswahl Modal ──
// Wird geöffnet wenn Gebäude oder Maschine gekauft wird
// damit der Spieler wählen kann wo es platziert wird

let zielAuswahlTyp = null;  // "gebaeude" oder "maschine"
let zielAuswahlId  = null;  // ID des zu kaufenden Items

function zielAuswahlOeffnen(typ, itemId) {
  zielAuswahlTyp = typ;
  zielAuswahlId  = itemId;

  let modal  = document.getElementById("modal-zielauswahl");
  let body   = document.getElementById("zielauswahl-body");
  let titel  = document.getElementById("zielauswahl-titel");

  if (typ === "gebaeude") {
    let data = GEBAEUDE.find(function(g) { return g.id === itemId; });
    titel.textContent = "📍 Wo soll " + (data ? data.name : itemId) + " gebaut werden?";
    body.innerHTML    = zielauswahlGrundstueckHTML(data);

  } else if (typ === "maschine") {
    let data = MASCHINEN.find(function(m) { return m.id === itemId; });
    titel.textContent = "📍 In welches Gebäude kommt " + (data ? data.name : itemId) + "?";
    body.innerHTML    = zielauswahlGebaeudeHTML(data);
  }

  modal.style.display = "flex";
  zielAuswahlEventListeners();
}

function zielAuswahlSchliessen() {
  document.getElementById("modal-zielauswahl").style.display = "none";
  zielAuswahlTyp = null;
  zielAuswahlId  = null;
}

// ── Grundstück-Auswahl (für Gebäude) ──
function zielauswahlGrundstueckHTML(gebaeudeData) {
  if (gekaufte_grundstuecke.length === 0) {
    return "<p class='ziel-hinweis'>Kein Grundstück vorhanden. Kaufe zuerst ein Grundstück!</p>";
  }

  let html = "<div class='ziel-liste'>";

  for (let gsId of gekaufte_grundstuecke) {
    let gs = GRUNDSTUECKE.find(function(g) { return g.id === gsId; });
    if (!gs) continue;

    let vorhandene  = gebaeudeVonGrundstueck(gsId);
    let freiePlaetze = gs.maxGebaeude - vorhandene.length;
    let schonDrauf  = vorhandene.includes(gebaeudeData ? gebaeudeData.id : "");
    let keinPlatz   = freiePlaetze <= 0;
    let gesperrt    = schonDrauf || keinPlatz;

    // Status Text
    let statusText = "";
    let statusKlasse = "";
    if (schonDrauf) {
      statusText   = "Bereits vorhanden";
      statusKlasse = "ziel-status-nein";
    } else if (keinPlatz) {
      statusText   = "Kein Platz mehr";
      statusKlasse = "ziel-status-nein";
    } else {
      statusText   = freiePlaetze + " Plätze frei";
      statusKlasse = "ziel-status-ok";
    }

    // Vorhandene Gebäude anzeigen
    let gebIcons = vorhandene.map(function(gId) {
      let gd = GEBAEUDE.find(function(g) { return g.id === gId; });
      return gd ? gd.emoji : "🏭";
    }).join(" ");

    html +=
      "<div class='ziel-option" + (gesperrt ? " ziel-option-gesperrt" : "") + "' " +
        "data-ziel-id='" + gsId + "'" + (gesperrt ? "" : " onclick='zielBestaetigen(\"" + gsId + "\")'") + ">" +

        "<div class='ziel-option-bild'>" +
          (gs.bild ? "<img src='" + gs.bild + "' />" : "<span>" + gs.emoji + "</span>") +
        "</div>" +

        "<div class='ziel-option-body'>" +
          "<div class='ziel-option-name'>" + gs.name + "</div>" +
          "<div class='ziel-option-meta'>📍 " + gs.standort + " · 📐 " + gs.groesse.l + "×" + gs.groesse.b + "m</div>" +
          "<div class='ziel-option-gebaeude'>" +
            (gebIcons ? gebIcons : "<span class='ziel-leer'>Noch keine Gebäude</span>") +
            " <span class='ziel-slash'>·</span> " +
            "<span class='" + statusKlasse + "'>" + statusText + "</span>" +
          "</div>" +
        "</div>" +

        (!gesperrt ? "<div class='ziel-option-pfeil'>›</div>" : "<div class='ziel-option-sperr'>✕</div>") +

      "</div>";
  }

  html += "</div>";
  return html;
}

// ── Gebäude-Auswahl (für Maschinen) ──
function zielauswahlGebaeudeHTML(maschineData) {
  let alleFabriken = [];
  for (let gsId of gekaufte_grundstuecke) {
    for (let gebId of gebaeudeVonGrundstueck(gsId)) {
      let gData = GEBAEUDE.find(function(g) { return g.id === gebId; });
      if (gData && gData.typ === "fabrik") {
        alleFabriken.push({ gebaeudeData: gData, gsId: gsId });
      }
    }
  }

  if (alleFabriken.length === 0) {
    return "<p class='ziel-hinweis'>Keine Fabrik vorhanden! Kaufe eine Leichthalle oder Schwerhalle.</p>";
  }

  let b    = new building();
  let html = "<div class='ziel-liste'>";

  for (let eintrag of alleFabriken) {
    let gData = eintrag.gebaeudeData;
    let gsId  = eintrag.gsId;
    let gs    = GRUNDSTUECKE.find(function(g) { return g.id === gsId; });

    // Kompatibilitätsinfo holen
    let kompa   = b.hallenKompatibilitaetsInfo(gData.id, maschineData ? maschineData.id : "");
    let gesperrt = !kompa.ok;

    // Hallentyp Farbe
    let hallenFarbe = gData.hallenTyp === "schwer" ? "#6366f1" : "#f59e0b";
    let hallenLabel = gData.hallenTyp === "schwer" ? "⚙️ Schwerhalle" : "🏗️ Leichthalle";

    // Auslastung
    let daten   = hallenplanDaten(gData.id);
    let belegte = 0;
    if (daten) {
      for (let m of daten.meineMaschinen) {
        let md = MASCHINEN.find(function(md) { return md.id === m.id; });
        if (md && md.tileGroesse) belegte += md.tileGroesse.w * md.tileGroesse.h;
      }
    }
    let gesamt  = gData.tileBreite * gData.tileHoehe || 100;
    let prozent = Math.round((belegte / gesamt) * 100);
    let balkenFarbe = prozent < 50 ? "var(--green)" : prozent < 80 ? "var(--accent)" : "var(--red)";

    let bildHTML = gData.bild
      ? "<img src='" + gData.bild + "' />"
      : "<span style='font-size:22px'>" + gData.emoji + "</span>";

    html +=
      "<div class='ziel-option" + (gesperrt ? " ziel-option-gesperrt" : "") + "' " +
        "style='border-left: 3px solid " + hallenFarbe + "' " +
        "data-ziel-id='" + gData.id + "'" +
        (!gesperrt ? " onclick='zielBestaetigen(\"" + gData.id + "\")'": "") + ">" +

        "<div class='ziel-option-bild'>" + bildHTML + "</div>" +

        "<div class='ziel-option-body'>" +
          "<div class='ziel-option-name'>" + gData.name +
            (gs ? " <span class='ziel-gs-label'>· " + gs.standort + "</span>" : "") +
          "</div>" +

          // Hallentyp Badge
          "<div style='margin: 3px 0'>" +
            "<span class='ziel-halle-badge' style='color:" + hallenFarbe + "; border-color:" + hallenFarbe + "'>" +
              hallenLabel +
            "</span>" +
          "</div>" +

          // Auslastungsbalken
          "<div class='ziel-auslastung-balken'>" +
            "<div style='width:" + prozent + "%; background:" + balkenFarbe + "'></div>" +
          "</div>" +
          "<div class='ziel-option-meta'>" +
            (daten ? (daten.tileBreite * daten.tileHoehe - belegte) + " Tiles frei · " : "") +
            "<span style='color:" + balkenFarbe + "'>" + prozent + "% belegt</span>" +
          "</div>" +

          // Fehlergrund falls gesperrt
          (gesperrt ? "<div class='ziel-status-nein'>✕ " + kompa.grund + "</div>" : "") +
        "</div>" +

        (!gesperrt ? "<div class='ziel-option-pfeil'>›</div>" : "<div class='ziel-option-sperr'>✕</div>") +

      "</div>";
  }

  html += "</div>";
  return html;
}

// ── Kauf bestätigen ──
function zielBestaetigen(zielId) {
  if (zielAuswahlTyp === "gebaeude") {
    // Gebäude auf Grundstück bauen
    window.aktivesGrundstueckId = zielId;
    gebaeude.gebaudeKaufen(zielAuswahlId);

  } else if (zielAuswahlTyp === "maschine") {
    // Maschine in Gebäude installieren
    window.aktivesGebaeudeId = zielId;
    maschineKaufen(zielAuswahlId);
  }

  zielAuswahlSchliessen();
  shopGenerieren();
}

// ── Event Listeners ──
function zielAuswahlEventListeners() {
  let modal = document.getElementById("modal-zielauswahl");

  // Klick außerhalb schließt
  modal.onclick = function(e) {
    if (e.target === modal) zielAuswahlSchliessen();
  };

  // Schließen-Button
  let btnClose = document.getElementById("btn-zielauswahl-schliessen");
  if (btnClose) {
    btnClose.onclick = zielAuswahlSchliessen;
  }
}