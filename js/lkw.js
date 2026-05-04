// ══════════════════════════════════
// LKW-SYSTEM — Logistik
// Ohne LKW: Marktverkauf -20%
// Mit LKW:  Auftragsbonus 100%
//           Routen zwischen Standorten
// ══════════════════════════════════

let gekaufte_lkws  = [];  // [{id, typ, name, route, unterwegs, ladung, rundenBisAnkunft}]
let lkw_routen     = [];  // gespeicherte Routen
let lkw_statistik  = { lieferungen: 0, gesamtEinnahmen: 0 };

// ── LKW-Typen ──
const LKW_TYPEN = [
  {
    id:          "lkw_mk1",
    name:        "LKW Mk1",
    emoji:       "🚚",
    beschreibung:"Einfacher Lieferwagen. 50 Einheiten, 1 Route.",
    kosten:      25000,
    kapazitaet:  50,
    maxRouten:   1,
    geschwindigkeit: 3,   // Runden für Lieferung
    betriebskosten: 200,  // €/Runde
    bedingung:   null,
    epoche:      1
  },
  {
    id:          "lkw_mk2",
    name:        "LKW Mk2",
    emoji:       "🚛",
    beschreibung:"Schwerlasttransporter. 150 Einheiten, 3 Routen.",
    kosten:      65000,
    kapazitaet:  150,
    maxRouten:   3,
    geschwindigkeit: 2,
    betriebskosten: 450,
    bedingung:   "lkw_mk1",
    epoche:      1
  },
  {
    id:          "lkw_mk3",
    name:        "Schwerlast-Konvoi",
    emoji:       "🏗️",
    beschreibung:"Konvoi für Massenlieferungen. 500 Einheiten, unbegrenzte Routen.",
    kosten:      150000,
    kapazitaet:  500,
    maxRouten:   99,
    geschwindigkeit: 4,
    betriebskosten: 1200,
    bedingung:   "lkw_mk2",
    epoche:      2
  }
];

// ── Kaufen ──
function hatGarage() {
  // gekaufte_gebaeude = { gsId: ["gebaeude_id", ...] }
  for (let gsId in (gekaufte_gebaeude || {})) {
    let liste = gekaufte_gebaeude[gsId] || [];
    if (liste.some(function(id) { return id === "garage" || id.startsWith("garage"); })) {
      return true;
    }
  }
  return false;
}

function maxLkwKapazitaet() {
  let count = 0;
  for (let gsId in (gekaufte_gebaeude || {})) {
    let liste = gekaufte_gebaeude[gsId] || [];
    for (let id of liste) {
      if (id === "garage" || id.startsWith("garage")) count += 2;
    }
  }
  return count;
}

function lkwKaufen(typId) {
  let typ = LKW_TYPEN.find(function(t) { return t.id === typId; });
  if (!typ) return;

  // Garage-Prüfung
  if (!hatGarage()) {
    zeigeNotification("❌ Keine Garage vorhanden! Baue zuerst eine Garage.", "red");
    return;
  }

  // Stellplatz-Prüfung
  let max = maxLkwKapazitaet();
  if (gekaufte_lkws.length >= max) {
    zeigeNotification("❌ Keine freien Stellplätze! Baue weitere Garagen. (" + gekaufte_lkws.length + "/" + max + ")", "red");
    return;
  }

  // Bedingung prüfen
  if (typ.bedingung && !gekaufte_lkws.some(function(l) { return l.typ === typ.bedingung; })) {
    zeigeNotification("❌ Erst " + LKW_TYPEN.find(function(t){return t.id===typ.bedingung;}).name + " kaufen!", "red");
    return;
  }
  if (geld < typ.kosten) {
    zeigeNotification("❌ Nicht genug Geld! Benötigt: " + typ.kosten.toLocaleString("de-DE") + " €", "red");
    return;
  }

  geld -= typ.kosten;
  let newLkw = {
    id:               "lkw_" + Date.now(),
    typ:              typId,
    name:             typ.name + " #" + (gekaufte_lkws.filter(function(l){return l.typ===typId;}).length + 1),
    route:            null,
    unterwegs:        false,
    ladung:           null,
    rundenBisAnkunft: 0
  };
  gekaufte_lkws.push(newLkw);

  geldAnzeigenAktualisieren();
  spielstandSpeichernSofort();
  lkwScreenAktualisieren();
  zeigeNotification("✅ " + typ.name + " gekauft!", "green");
}

// ── Auftrag mit LKW erfüllen ──
function auftragMitLkwLiefern(auftragId, lkwId) {
  let auftrag = aktive_auftraege.find(function(a) { return a.id === auftragId; });
  let lkw     = gekaufte_lkws.find(function(l) { return l.id === lkwId; });
  if (!auftrag || !lkw) return;

  let vorlage = AUFTRAEGE_VORLAGEN.find(function(v) { return v.id === auftrag.vorlageId; });
  if (!vorlage) return;

  let bestand = lager[vorlage.material] || 0;
  let typ = LKW_TYPEN.find(function(t) { return t.id === lkw.typ; });

  if (bestand < vorlage.menge) {
    zeigeNotification("❌ Nicht genug " + vorlage.material + " im Lager!", "red");
    return;
  }
  if (lkw.unterwegs) {
    zeigeNotification("❌ " + lkw.name + " ist bereits unterwegs!", "red");
    return;
  }
  if (vorlage.menge > (typ ? typ.kapazitaet : 50)) {
    zeigeNotification("❌ Ladung zu groß für " + lkw.name + "!", "red");
    return;
  }

  // Materialien verladen
  lager[vorlage.material] -= vorlage.menge;
  lkw.unterwegs        = true;
  lkw.ladung           = { auftragId: auftrag.id, vorlageId: vorlage.id, material: vorlage.material, menge: vorlage.menge, bonus: auftrag.bonus };
  lkw.rundenBisAnkunft = typ ? typ.geschwindigkeit : 3;
  lkw.route            = "→ Lieferung: " + vorlage.name;

  lagerAnzeigenAktualisieren();
  spielstandSpeichern();
  auftraegeScreenAktualisieren();
  lkwScreenAktualisieren();
  zeigeNotification("🚚 " + lkw.name + " ist unterwegs — Ankunft in " + lkw.rundenBisAnkunft + " Runden", "green");
}

// ── Lieferung direkt (ohne LKW, Marktabschlag) ──
// Wird in auftragErfuellen() geprüft: hat Spieler LKW?
function hatVerfuegbarenLkw() {
  return gekaufte_lkws.some(function(l) { return !l.unterwegs; });
}

function lkwBonus() {
  // Mit LKW: voller Bonus. Ohne: -25%
  return hatVerfuegbarenLkw() ? 1.0 : 0.75;
}

// ── Jede Runde: LKWs bewegen ──
function lkwRundeTick() {
  let etwasGeliefert = false;
  for (let lkw of gekaufte_lkws) {
    if (!lkw.unterwegs || lkw.rundenBisAnkunft <= 0) continue;
    lkw.rundenBisAnkunft--;

    if (lkw.rundenBisAnkunft <= 0) {
      // Lieferung angekommen!
      if (lkw.ladung && lkw.ladung.auftragId) {
        lkwLieferungAbschliessen(lkw);
        etwasGeliefert = true;
      }
    }
  }
  if (etwasGeliefert) {
    lkwScreenAktualisieren();
    uebersichtKPIsAktualisieren();
  }
}

function lkwLieferungAbschliessen(lkw) {
  // Transfer-Lieferung?
  if (lkw.ladung && lkw.ladung.typ === "transfer") {
    lkwTransferAbschliessen(lkw);
    lkw.unterwegs = false; lkw.ladung = null; lkw.rundenBisAnkunft = 0; lkw.route = null;
    return;
  }
  let auftrag = aktive_auftraege.find(function(a) { return a.id === lkw.ladung.auftragId; });

  if (auftrag) {
    geld += lkw.ladung.bonus;
    abgeschlossene_auftraege++;
    aktive_auftraege = aktive_auftraege.filter(function(a) { return a.id !== auftrag.id; });
    lkw_statistik.lieferungen++;
    lkw_statistik.gesamtEinnahmen += lkw.ladung.bonus;

    geldAnzeigenAktualisieren();
    auftraegeAuffuellen();
    spielstandSpeichern();
    zeigeNotification("📦 " + lkw.name + " hat geliefert! +" + lkw.ladung.bonus.toLocaleString("de-DE") + " €", "green");
    if (typeof soundVerkaufen === "function") soundVerkaufen();
  }

  // LKW entladen
  lkw.unterwegs        = false;
  lkw.ladung           = null;
  lkw.rundenBisAnkunft = 0;
  lkw.route            = null;
}

// ── Screen / UI ──
function lkwScreenAktualisieren() {
  let bereich = document.getElementById("lkw-bereich");
  if (!bereich) return;

  // Safety: warte bis Daten geladen
  if (typeof MASCHINEN === "undefined" || !MASCHINEN || !MASCHINEN.length ||
      typeof MATERIALIEN === "undefined" || !MATERIALIEN || !MATERIALIEN.length) {
    bereich.innerHTML = "<div style='padding:20px;color:var(--text3);text-align:center'>⏳ Lade Daten...</div>";
    setTimeout(lkwScreenAktualisieren, 500);
    return;
  }

  let html = "";

  // ── KPIs ──
  let verfuegbar  = gekaufte_lkws.filter(function(l) { return !l.unterwegs; }).length;
  let unterwegs   = gekaufte_lkws.filter(function(l) { return l.unterwegs; }).length;

  html +=
    "<div class='lkw-kpi-grid'>" +
      "<div class='kpi-card'><span class='kpi-label'>Meine LKWs</span><span class='kpi-value'>" + gekaufte_lkws.length + "</span></div>" +
      "<div class='kpi-card'><span class='kpi-label'>Verfügbar</span><span class='kpi-value positive'>" + verfuegbar + "</span></div>" +
      "<div class='kpi-card'><span class='kpi-label'>Unterwegs</span><span class='kpi-value accent'>" + unterwegs + "</span></div>" +
      "<div class='kpi-card'><span class='kpi-label'>Lieferungen</span><span class='kpi-value'>" + lkw_statistik.lieferungen + "</span></div>" +
    "</div>";

  // ── Info: Kein LKW = Malus ──
  // Garage-Status anzeigen
  let garageVorhanden = typeof hatGarage === "function" && hatGarage();
  let maxPlätze = typeof maxLkwKapazitaet === "function" ? maxLkwKapazitaet() : 0;

  if (!garageVorhanden) {
    html +=
      "<div class='lkw-kein-lkw-hint' style='border-color:rgba(239,68,68,0.3);background:rgba(239,68,68,0.06)'>" +
        "<div class='lkw-hint-icon'>🚗</div>" +
        "<div>" +
          "<div class='lkw-hint-titel' style='color:var(--red)'>Keine Garage vorhanden</div>" +
          "<div class='lkw-hint-text'>Kaufe zuerst eine Garage (12.000 €) im Shop. Jede Garage bietet 2 LKW-Stellplätze.</div>" +
        "</div>" +
      "</div>";
  } else if (maxPlätze > 0) {
    html +=
      "<div class='lkw-garage-status'>" +
        "🚗 Garage aktiv · <strong>" + gekaufte_lkws.length + " / " + maxPlätze + "</strong> Stellplätze belegt" +
      "</div>";
  }

  if (gekaufte_lkws.length === 0) {
    html +=
      "<div class='lkw-kein-lkw-hint'>" +
        "<div class='lkw-hint-icon'>⚠️</div>" +
        "<div>" +
          "<div class='lkw-hint-titel'>Ohne LKW: −25% Auftragsbonus</div>" +
          "<div class='lkw-hint-text'>Aufträge können direkt erfüllt werden, aber du erhältst nur 75% des Bonus. Mit einem LKW bekommst du den vollen Betrag — und er liefert automatisch.</div>" +
        "</div>" +
      "</div>";
  }

  // ── Meine LKWs ──
  if (gekaufte_lkws.length > 0) {
    html += "<div class='lkw-flotte'><div class='lkw-section-title'>Meine Flotte</div>";
    for (let lkw of gekaufte_lkws) {
      let typ = LKW_TYPEN.find(function(t) { return t.id === lkw.typ; });
      if (!typ) continue;

      let fortPct = lkw.unterwegs
        ? Math.round(((typ.geschwindigkeit - lkw.rundenBisAnkunft) / typ.geschwindigkeit) * 100)
        : 0;
      let mat = lkw.ladung ? MATERIALIEN.find(function(m) { return m.id === lkw.ladung.material; }) : null;

      html +=
        "<div class='lkw-karte " + (lkw.unterwegs ? "unterwegs" : "bereit") + "'>" +
          "<div class='lkw-karte-header'>" +
            "<span class='lkw-emoji'>" + typ.emoji + "</span>" +
            "<div class='lkw-info'>" +
              "<span class='lkw-name'>" + lkw.name + "</span>" +
              "<span class='lkw-typ'>" + typ.kapazitaet + " Einh. · " + typ.geschwindigkeit + "R Lieferzeit</span>" +
            "</div>" +
            "<div class='lkw-status-badge " + (lkw.unterwegs ? "badge-unterwegs" : "badge-bereit") + "'>" +
              (lkw.unterwegs ? "Unterwegs" : "Verfügbar") +
            "</div>" +
          "</div>" +
          (lkw.unterwegs && lkw.ladung ?
            "<div class='lkw-ladung'>" +
              "<div class='lkw-ladung-info'>" +
                (mat ? mat.emoji : "📦") + " " + lkw.ladung.menge + "× " + (mat ? mat.name : lkw.ladung.material) +
                " → +" + lkw.ladung.bonus.toLocaleString("de-DE") + " €" +
              "</div>" +
              "<div class='lkw-progress-track'><div class='lkw-progress-fill' style='width:" + fortPct + "%'></div></div>" +
              "<div class='lkw-ankunft'>Ankunft in " + lkw.rundenBisAnkunft + " Runde" + (lkw.rundenBisAnkunft !== 1 ? "n" : "") + "</div>" +
            "</div>"
          : "") +
        "</div>";
    }
    html += "</div>";
  }

  // ── Grundstück-Transfer ──
  if (gekaufte_grundstuecke && gekaufte_grundstuecke.length > 1 && gekaufte_lkws.length > 0) {
    html += "<div class='lkw-section-title' style='margin-top:16px'>🗺️ Grundstück-Transfer</div>";
    html += "<div class='lkw-transfer-hint'>Schicke Waren von einem Grundstück zu einem anderen. Wähle Quelle, Ziel, Material und Menge.</div>";
    html += "<div class='lkw-transfer-row'>";
    
    let verfuegbareTr = gekaufte_lkws.filter(function(l) { return !l.unterwegs; });
    
    if (verfuegbareTr.length === 0) {
      html += "<p style='font-size:12px;color:var(--text3)'>Alle LKWs sind gerade unterwegs.</p>";
    } else {
      // Einfaches Transfer-UI
      let gsOptionen = (gekaufte_grundstuecke || []).map(function(id) {
        let gs = typeof GRUNDSTUECKE !== "undefined" ? GRUNDSTUECKE.find(function(g) { return g.id === id; }) : null;
        return "<option value='" + id + "'>" + (gs ? gs.name : id) + "</option>";
      }).join("");
      
      let matOptionen = Object.entries(lager)
        .filter(function(e) { return e[1] > 0; })
        .map(function(e) {
          let m = typeof MATERIALIEN !== "undefined" ? MATERIALIEN.find(function(m) { return m.id === e[0]; }) : null;
          return "<option value='" + e[0] + "'>" + (m ? m.name : e[0]) + " (" + e[1] + ")</option>";
        }).join("");
        
      html +=
        "<div class='lkw-transfer-form'>" +
          "<select id='tr-von' class='lkw-select'>" + gsOptionen + "</select>" +
          "<span style='color:var(--text3)'>→</span>" +
          "<select id='tr-nach' class='lkw-select'>" + gsOptionen + "</select>" +
          "<select id='tr-mat' class='lkw-select'>" + matOptionen + "</select>" +
          "<input id='tr-menge' type='number' value='10' min='1' class='lkw-select' style='width:70px' />" +
          "<button onclick='lkwTransferUI()' style='min-height:36px;padding:6px 12px;font-size:12px'>Transfer →</button>" +
        "</div>";
    }
    html += "</div>";
  }

  // ── LKW kaufen ──
  html += "<div class='lkw-section-title' style='margin-top:16px'>LKWs kaufen</div>";
  html += "<div class='lkw-shop-grid'>";
  for (let typ of LKW_TYPEN) {
    let hatBedingung = !typ.bedingung || gekaufte_lkws.some(function(l){ return l.typ === typ.bedingung; });
    let kannKaufen   = hatBedingung && geld >= typ.kosten;
    let bereitsGekauft = gekaufte_lkws.some(function(l){ return l.typ === typ.id; });

    html +=
      "<div class='lkw-shop-karte" + (!hatBedingung ? " gesperrt" : "") + "'>" +
        "<div class='lsk-header'>" +
          "<span class='lsk-emoji'>" + typ.emoji + "</span>" +
          "<div class='lsk-info'>" +
            "<span class='lsk-name'>" + typ.name + "</span>" +
            "<span class='lsk-details'>" + typ.kapazitaet + " Einh. · " + typ.maxRouten + " Route" + (typ.maxRouten > 1 ? "n" : "") + " · " + typ.geschwindigkeit + "R</span>" +
          "</div>" +
        "</div>" +
        "<p class='lsk-desc'>" + typ.beschreibung + "</p>" +
        "<div class='lsk-stats'>" +
          "<span>💰 Betrieb: " + typ.betriebskosten + " €/R</span>" +
        "</div>" +
        (!hatBedingung ?
          "<div class='lsk-locked'>🔒 Erst " + (LKW_TYPEN.find(function(t){return t.id===typ.bedingung;}) || {}).name + " kaufen</div>" :
          "<button class='lsk-kaufen-btn" + (!kannKaufen ? " disabled" : "") + "' " +
            (!kannKaufen ? "disabled" : "onclick='lkwKaufen(\"" + typ.id + "\")'") + ">" +
            typ.kosten.toLocaleString("de-DE") + " € kaufen" +
          "</button>") +
      "</div>";
  }
  html += "</div>";

  bereich.innerHTML = html;
}

// ── Auftraege-Screen: LKW-Auswahl zeigen ──
function lkwAuswahl(auftragId) {
  let verfuegbare = gekaufte_lkws.filter(function(l) { return !l.unterwegs; });
  if (verfuegbare.length === 0) {
    // Kein LKW verfügbar — Direktlieferung mit Malus
    auftragErfuellenOhneLkw(auftragId);
    return;
  }

  // Modal für LKW-Auswahl
  let modal = document.getElementById("modal-lkw");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "modal-lkw";
    modal.style.cssText = "position:fixed;inset:0;z-index:400;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);display:flex;align-items:flex-end;justify-content:center;padding:10px";
    document.body.appendChild(modal);
  }

  let auftrag = aktive_auftraege.find(function(a) { return a.id === auftragId; });
  let vorlage = auftrag ? AUFTRAEGE_VORLAGEN.find(function(v){ return v.id === auftrag.vorlageId; }) : null;

  let optionenHTML = verfuegbare.map(function(lkw) {
    let typ = LKW_TYPEN.find(function(t){ return t.id === lkw.typ; });
    return "<button class='lkw-auswahl-btn' onclick='auftragMitLkwLiefern(\"" + auftragId + "\",\"" + lkw.id + "\");document.getElementById(\"modal-lkw\").style.display=\"none\"'>" +
      (typ ? typ.emoji : "🚚") + " " + lkw.name + " — " + (typ ? typ.geschwindigkeit : 3) + " Runden</button>";
  }).join("");

  modal.innerHTML =
    "<div style='background:var(--surface);border:1px solid var(--border);border-top:3px solid var(--amber);border-radius:16px 16px 10px 10px;padding:20px;width:100%;max-width:400px'>" +
      "<div style='font-family:var(--font-head);font-size:16px;font-weight:800;margin-bottom:6px'>LKW auswählen</div>" +
      "<p style='font-size:12px;color:var(--text3);margin-bottom:14px'>Welchen LKW soll die Lieferung fahren?</p>" +
      optionenHTML +
      "<button onclick='auftragErfuellenOhneLkw(\"" + auftragId + "\");document.getElementById(\"modal-lkw\").style.display=\"none\"' " +
        "style='width:100%;margin-top:8px;background:var(--surface2)!important;color:var(--text3)!important;border:1px solid var(--border)!important;font-size:12px!important'>" +
        "⚠️ Ohne LKW liefern (−25% Bonus)" +
      "</button>" +
      "<button onclick='document.getElementById(\"modal-lkw\").style.display=\"none\"' " +
        "style='width:100%;margin-top:4px;background:transparent!important;color:var(--text3)!important;border:none!important;font-size:11px!important'>Abbrechen</button>" +
    "</div>";
  modal.style.display = "flex";
}

function auftragErfuellenOhneLkw(auftragId) {
  // Original-Funktion, aber mit Bonus-Malus
  let auftrag = aktive_auftraege.find(function(a) { return a.id === auftragId; });
  if (!auftrag) return;
  let vorlage = AUFTRAEGE_VORLAGEN.find(function(v) { return v.id === auftrag.vorlageId; });
  if (!vorlage) return;
  if ((lager[vorlage.material] || 0) < vorlage.menge) {
    zeigeNotification("❌ Nicht genug Material!", "red"); return;
  }
  lager[vorlage.material] -= vorlage.menge;
  let bonusMitMalus = Math.floor(auftrag.bonus * 0.75);
  geld += bonusMitMalus;
  abgeschlossene_auftraege++;
  aktive_auftraege = aktive_auftraege.filter(function(a) { return a.id !== auftragId; });
  geldAnzeigenAktualisieren();
  lagerAnzeigenAktualisieren();
  spielstandSpeichern();
  auftraegeAuffuellen();
  auftraegeScreenAktualisieren();
  zeigeNotification("📦 Geliefert (ohne LKW): +" + bonusMitMalus.toLocaleString("de-DE") + " € (−25%)", "green");
}

// ── State Integration ──
function lkwZuStand() {
  return {
    lkws:              gekaufte_lkws,
    statistik:         lkw_statistik,
    grundstueck_lager: window.grundstueck_lager || {}
  };
}

function lkwAusStand(stand) {
  if (!stand) return;
  gekaufte_lkws           = stand.lkws              || [];
  lkw_statistik           = stand.statistik         || { lieferungen: 0, gesamtEinnahmen: 0 };
  window.grundstueck_lager = stand.grundstueck_lager || {};
}

// ══════════════════════════════════
// GRUNDSTÜCK-TRANSFER
// LKW schickt Waren von GS A → GS B
// Jedes Grundstück hat eigenes Lager
// ══════════════════════════════════

// grundstueck_lager = { "aethon_start": { eisenplatte: 50, ... }, "aethon_industrie": {...} }
// Das aktive Hauptlager ist das erste Grundstück
// Transfer-LKW bewegt Waren zwischen Grundstücken

function grundstueckLagerInitialisieren() {
  if (!window.grundstueck_lager) window.grundstueck_lager = {};
  for (let gs of (gekaufte_grundstuecke || [])) {
    if (!grundstueck_lager[gs]) grundstueck_lager[gs] = {};
  }
}

function aktivesGrundstueck() {
  // Erstes Grundstück = aktives Hauptlager
  return (gekaufte_grundstuecke && gekaufte_grundstuecke[0]) || null;
}

function lkwTransferStarten(vonGsId, nachGsId, material, menge, lkwId) {
  let lkw = gekaufte_lkws.find(function(l) { return l.id === lkwId; });
  if (!lkw || lkw.unterwegs) {
    zeigeNotification("❌ LKW nicht verfügbar!", "red"); return;
  }
  let typ = LKW_TYPEN.find(function(t) { return t.id === lkw.typ; });
  if (menge > (typ ? typ.kapazitaet : 50)) {
    zeigeNotification("❌ Ladung zu groß!", "red"); return;
  }

  // Waren vom Quell-Grundstück entnehmen
  let vonLager = (window.grundstueck_lager && grundstueck_lager[vonGsId]) || lager;
  let bestand = vonLager[material] || 0;
  if (bestand < menge) {
    zeigeNotification("❌ Nicht genug " + material + " auf Grundstück!", "red"); return;
  }
  vonLager[material] = Math.max(0, bestand - menge);

  lkw.unterwegs = true;
  lkw.ladung = {
    typ: "transfer",
    vonGs: vonGsId,
    nachGs: nachGsId,
    material: material,
    menge: menge
  };
  lkw.rundenBisAnkunft = typ ? typ.geschwindigkeit : 3;
  lkw.route = vonGsId + " → " + nachGsId;

  lagerAnzeigenAktualisieren();
  lkwScreenAktualisieren();
  zeigeNotification("🚚 Transfer gestartet: " + menge + "× " + material, "green");
}

function lkwTransferAbschliessen(lkw) {
  if (!lkw.ladung || lkw.ladung.typ !== "transfer") return;
  let nachLager = (window.grundstueck_lager && grundstueck_lager[lkw.ladung.nachGs]);
  if (!nachLager) {
    // Fallback: ins Hauptlager
    lager[lkw.ladung.material] = (lager[lkw.ladung.material] || 0) + lkw.ladung.menge;
  } else {
    nachLager[lkw.ladung.material] = (nachLager[lkw.ladung.material] || 0) + lkw.ladung.menge;
  }
  lagerAnzeigenAktualisieren();
  zeigeNotification("📦 Transfer angekommen: " + lkw.ladung.menge + "× " + lkw.ladung.material, "green");
}

function lkwTransferUI() {
  let von   = document.getElementById("tr-von");
  let nach  = document.getElementById("tr-nach");
  let mat   = document.getElementById("tr-mat");
  let menge = document.getElementById("tr-menge");
  if (!von || !nach || !mat || !menge) return;
  if (von.value === nach.value) {
    zeigeNotification("❌ Quelle und Ziel müssen unterschiedlich sein!", "red"); return;
  }
  let verfuegbar = gekaufte_lkws.find(function(l) { return !l.unterwegs; });
  if (!verfuegbar) {
    zeigeNotification("❌ Kein LKW verfügbar!", "red"); return;
  }
  lkwTransferStarten(von.value, nach.value, mat.value, parseInt(menge.value) || 1, verfuegbar.id);
}
