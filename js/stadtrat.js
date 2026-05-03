// ══════════════════════════════════
// STADTRAT — Hauptprogression
// 5 Meilensteine als roter Faden
// ══════════════════════════════════

let STADTRAT_AUFTRAEGE = [];
let aktiverStadtratAuftrag = null;  // id des aktuellen Meilensteins
let erledigteStadtratAuftraege = []; // ids
let freigeschaltete_tiers = [1];     // Start: nur Tier 1 sichtbar

async function stadtratLaden() {
  try {
    let r = await fetch("data/stadtrat.json");
    STADTRAT_AUFTRAEGE = await r.json();
    console.log("[Stadtrat] " + STADTRAT_AUFTRAEGE.length + " Meilensteine geladen");
  } catch(e) {
    console.error("[Stadtrat] Fehler:", e);
    STADTRAT_AUFTRAEGE = [];
  }
}

// ── Initialisierung ──
function stadtratInit() {
  if (!STADTRAT_AUFTRAEGE.length) return;

  // Ersten noch nicht erledigten Auftrag aktivieren
  for (let a of STADTRAT_AUFTRAEGE) {
    if (!erledigteStadtratAuftraege.includes(a.id)) {
      aktiverStadtratAuftrag = a.id;
      break;
    }
  }

  stadtratBannerAktualisieren();
}

// ── Fortschritt prüfen (jede Runde) ──
function stadtratFortschrittPruefen() {
  if (!aktiverStadtratAuftrag) return;

  let auftrag = STADTRAT_AUFTRAEGE.find(function(a) { return a.id === aktiverStadtratAuftrag; });
  if (!auftrag) return;

  // Alle Ziele erfüllt?
  let alleErfuellt = auftrag.ziele.every(function(z) {
    return (lager[z.material] || 0) >= z.menge;
  });

  if (alleErfuellt) {
    stadtratAuftragAbschliessen(auftrag);
  }

  stadtratBannerAktualisieren();
}

// ── Auftrag abschließen ──
function stadtratAuftragAbschliessen(auftrag) {
  // Materialien abziehen
  for (let z of auftrag.ziele) {
    lager[z.material] = Math.max(0, (lager[z.material] || 0) - z.menge);
  }

  // Belohnung
  geld += auftrag.belohnung_geld;
  erledigteStadtratAuftraege.push(auftrag.id);

  // Tier freischalten
  if (auftrag.belohnung_tier) {
    if (!freigeschaltete_tiers.includes(auftrag.belohnung_tier)) {
      freigeschaltete_tiers.push(auftrag.belohnung_tier);
      // Alle Tiers bis dahin freischalten
      for (let t = 1; t <= auftrag.belohnung_tier; t++) {
        if (!freigeschaltete_tiers.includes(t)) freigeschaltete_tiers.push(t);
      }
    }
  }

  // Nächsten Auftrag aktivieren
  aktiverStadtratAuftrag = null;
  for (let a of STADTRAT_AUFTRAEGE) {
    if (!erledigteStadtratAuftraege.includes(a.id)) {
      aktiverStadtratAuftrag = a.id;
      break;
    }
  }

  // Notification + Story
  geldAnzeigenAktualisieren();
  lagerAnzeigenAktualisieren();
  spielstandSpeichernSofort();

  // Story-Modal zeigen
  stadtratStoryZeigen(auftrag);
  stadtratBannerAktualisieren();
}

// ── Story-Modal ──
function stadtratStoryZeigen(auftrag) {
  // Titel
  let titleEl = document.getElementById("stadtrat-modal-titel");
  let textEl  = document.getElementById("stadtrat-modal-text");
  let geldEl  = document.getElementById("stadtrat-modal-geld");
  let modal   = document.getElementById("modal-stadtrat");

  if (!modal) {
    // Modal dynamisch erstellen
    let m = document.createElement("div");
    m.id = "modal-stadtrat";
    m.innerHTML =
      "<div id='stadtrat-modal-inhalt'>" +
        "<div id='stadtrat-modal-emoji' style='font-size:52px;text-align:center;margin-bottom:12px'>🏭</div>" +
        "<h2 id='stadtrat-modal-titel' style='font-family:var(--font-head);font-size:22px;font-weight:800;text-align:center;letter-spacing:1px;margin-bottom:8px'></h2>" +
        "<p id='stadtrat-modal-text' style='font-size:13px;color:var(--text2);text-align:center;line-height:1.6;margin-bottom:16px'></p>" +
        "<div id='stadtrat-modal-geld' style='text-align:center;font-family:var(--font-mono);font-size:24px;font-weight:700;color:var(--green);margin-bottom:16px'></div>" +
        "<button onclick='stadtratModalSchliessen()' style='width:100%'>Weiter →</button>" +
      "</div>";
    document.body.appendChild(m);
    modal = m;
  }

  document.getElementById("stadtrat-modal-emoji").textContent = auftrag.emoji;
  document.getElementById("stadtrat-modal-titel").textContent = "✅ " + auftrag.titel;
  document.getElementById("stadtrat-modal-text").textContent  = auftrag.belohnung_text;
  document.getElementById("stadtrat-modal-geld").textContent  = "+" + auftrag.belohnung_geld.toLocaleString("de-DE") + " €";
  modal.style.display = "flex";
}

function stadtratModalSchliessen() {
  let modal = document.getElementById("modal-stadtrat");
  if (modal) modal.style.display = "none";
}

// ── Banner im Header / Übersicht ──
function stadtratBannerAktualisieren() {
  let banner = document.getElementById("stadtrat-banner");
  if (!banner) return;

  if (!aktiverStadtratAuftrag) {
    if (erledigteStadtratAuftraege.length >= STADTRAT_AUFTRAEGE.length) {
      banner.innerHTML =
        "<div class='sr-banner-fertig'>🏆 Bergisches Imperium — Du hast gewonnen!</div>";
    } else {
      banner.innerHTML = "";
    }
    return;
  }

  let auftrag = STADTRAT_AUFTRAEGE.find(function(a) { return a.id === aktiverStadtratAuftrag; });
  if (!auftrag) return;

  let aktNr = STADTRAT_AUFTRAEGE.indexOf(auftrag) + 1;
  let total  = STADTRAT_AUFTRAEGE.length;

  // Fortschritt berechnen
  let zieleHTML = auftrag.ziele.map(function(z) {
    let haben = lager[z.material] || 0;
    let prozent = Math.min(100, Math.round((haben / z.menge) * 100));
    let mat = MATERIALIEN ? MATERIALIEN.find(function(m) { return m.id === z.material; }) : null;
    let name = mat ? mat.name : z.material;
    let emoji = mat ? mat.emoji : "📦";
    let fertig = haben >= z.menge;

    return "<div class='sr-ziel" + (fertig ? " sr-ziel-fertig" : "") + "'>" +
      "<span class='sr-ziel-name'>" + emoji + " " + name + "</span>" +
      "<span class='sr-ziel-stand'>" +
        "<span style='color:" + (fertig ? "var(--green)" : "var(--text)") + "'>" + haben + "</span>" +
        "<span style='color:var(--text3)'> / " + z.menge + "</span>" +
      "</span>" +
      "<div class='sr-ziel-balken'>" +
        "<div class='sr-ziel-fill' style='width:" + prozent + "%; background:" +
          (fertig ? "var(--green)" : "var(--amber)") + "'></div>" +
      "</div>" +
    "</div>";
  }).join("");

  banner.innerHTML =
    "<div class='sr-banner-header'>" +
      "<span class='sr-akt-badge'>Akt " + auftrag.akt + "</span>" +
      "<span class='sr-titel'>" + auftrag.emoji + " " + auftrag.titel + "</span>" +
      "<span class='sr-fortschritt'>" + aktNr + " / " + total + "</span>" +
    "</div>" +
    "<div class='sr-ziele'>" + zieleHTML + "</div>";
}

// ── Tier-Sichtbarkeit ──
function materialIstSichtbar(material) {
  if (!material.tier) return true;  // kein Tier → immer sichtbar
  return freigeschaltete_tiers.includes(material.tier) ||
         freigeschaltete_tiers.includes(material.tier - 1); // nächste Stufe als Vorschau
}

// State-Integration (wird in spielstandDatenErstellen ergänzt)
function stadtratZuStand() {
  return {
    aktiver:    aktiverStadtratAuftrag,
    erledigt:   erledigteStadtratAuftraege,
    tiers:      freigeschaltete_tiers
  };
}

function stadtratAusStand(stand) {
  if (!stand) return;
  aktiverStadtratAuftrag      = stand.aktiver   || null;
  erledigteStadtratAuftraege  = stand.erledigt  || [];
  freigeschaltete_tiers       = stand.tiers     || [1];
}
