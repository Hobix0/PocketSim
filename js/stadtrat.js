// ══════════════════════════════════
// STADTRAT — Hauptprogression
// Satisfactory-Style: HUB Terminal
// ══════════════════════════════════

let STADTRAT_AUFTRAEGE      = [];
let aktiverStadtratAuftrag  = null;
let erledigteStadtratAuftraege = [];
let freigeschaltete_tiers   = [1];

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

// ── Init ──
function stadtratInit() {
  if (!STADTRAT_AUFTRAEGE.length) return;
  for (let a of STADTRAT_AUFTRAEGE) {
    if (!erledigteStadtratAuftraege.includes(a.id)) {
      aktiverStadtratAuftrag = a.id;
      break;
    }
  }
  stadtratAllesAktualisieren();
}

// ── Jede Runde: nur Fortschritt prüfen, NICHT auto-abschließen ──
function stadtratFortschrittPruefen() {
  if (!aktiverStadtratAuftrag) return;
  stadtratAllesAktualisieren();
}

// ── Aktualisiert Header-Chip + Banner ──
function stadtratAllesAktualisieren() {
  stadtratHeaderChipAktualisieren();
  stadtratBannerAktualisieren();
}

// ══════════════════════════════════
// HEADER CHIP
// ══════════════════════════════════

function stadtratHeaderChipAktualisieren() {
  let chip      = document.getElementById("stadtrat-header-chip");
  let chipEmoji = document.getElementById("sr-chip-emoji");
  let chipTitel = document.getElementById("sr-chip-titel");
  let chipFill  = document.getElementById("sr-chip-fill");
  let chipProz  = document.getElementById("sr-chip-prozent");

  if (!chip) return;

  // Kein aktiver Auftrag?
  if (!aktiverStadtratAuftrag) {
    let fertig = erledigteStadtratAuftraege.length >= STADTRAT_AUFTRAEGE.length;
    chip.style.display = fertig ? "flex" : "none";
    if (fertig && chipEmoji) chipEmoji.textContent = "🏆";
    if (fertig && chipTitel) chipTitel.textContent = "Gewonnen!";
    if (fertig && chipFill)  chipFill.style.width  = "100%";
    if (fertig && chipProz)  chipProz.textContent  = "✓";
    return;
  }

  let auftrag = STADTRAT_AUFTRAEGE.find(function(a) { return a.id === aktiverStadtratAuftrag; });
  if (!auftrag) return;

  // Gesamtfortschritt berechnen (alle Ziele zusammen)
  let gesamtHaben   = 0;
  let gesamtBenötigt = 0;
  let alleErfuellt  = true;

  for (let z of auftrag.ziele) {
    let haben = Math.min(lager[z.material] || 0, z.menge);
    gesamtHaben    += haben;
    gesamtBenötigt += z.menge;
    if ((lager[z.material] || 0) < z.menge) alleErfuellt = false;
  }

  let prozent = gesamtBenötigt > 0
    ? Math.round((gesamtHaben / gesamtBenötigt) * 100)
    : 0;

  chip.style.display = "flex";
  if (chipEmoji) chipEmoji.textContent = auftrag.emoji;
  if (chipTitel) chipTitel.textContent = auftrag.titel;
  if (chipFill)  {
    chipFill.style.width = prozent + "%";
    chipFill.style.background = alleErfuellt
      ? "var(--green)"
      : prozent >= 50 ? "var(--amber)" : "var(--cyan)";
    // Glow wenn fertig
    chipFill.style.boxShadow = alleErfuellt
      ? "0 0 8px var(--green)"
      : "none";
  }
  if (chipProz) {
    chipProz.textContent  = alleErfuellt ? "✓" : prozent + "%";
    chipProz.style.color  = alleErfuellt ? "var(--green)" : "var(--text2)";
  }

  // Chip pulsieren wenn bereit zum Liefern
  chip.classList.toggle("sr-chip-bereit", alleErfuellt);
}

// ══════════════════════════════════
// ÜBERSICHT BANNER
// ══════════════════════════════════

function stadtratBannerAktualisieren() {
  let banner = document.getElementById("stadtrat-banner");
  if (!banner) return;

  if (!aktiverStadtratAuftrag) {
    if (erledigteStadtratAuftraege.length >= STADTRAT_AUFTRAEGE.length) {
      banner.innerHTML =
        "<div class='sr-fertig'>" +
          "<span>🏆</span>" +
          "<div>" +
            "<div style='font-family:var(--font-head);font-size:16px;font-weight:800;letter-spacing:1px'>Bergisches Imperium</div>" +
            "<div style='font-size:12px;color:var(--text3);margin-top:2px'>Du hast alle Meilensteine abgeschlossen. Glückwunsch!</div>" +
          "</div>" +
        "</div>";
    } else {
      banner.innerHTML = "";
    }
    return;
  }

  let auftrag  = STADTRAT_AUFTRAEGE.find(function(a) { return a.id === aktiverStadtratAuftrag; });
  if (!auftrag) return;

  let aktIdx   = STADTRAT_AUFTRAEGE.indexOf(auftrag) + 1;
  let total    = STADTRAT_AUFTRAEGE.length;
  let erledigt = erledigteStadtratAuftraege.length;

  // Fortschritt + ob alle Ziele erfüllt
  let alleErfuellt = true;
  let zieleHTML = "";

  for (let z of auftrag.ziele) {
    let haben     = lager[z.material] || 0;
    let fertig    = haben >= z.menge;
    let prozent   = Math.min(100, Math.round((haben / z.menge) * 100));
    let mat       = MATERIALIEN ? MATERIALIEN.find(function(m) { return m.id === z.material; }) : null;
    let name      = mat ? mat.name : z.material;
    let emoji     = mat ? mat.emoji : "📦";
    let fillFarbe = fertig ? "var(--green)" : prozent >= 50 ? "var(--amber)" : "var(--cyan)";

    if (!fertig) alleErfuellt = false;

    zieleHTML +=
      "<div class='sr-ziel-karte" + (fertig ? " sr-ziel-fertig" : "") + "'>" +
        "<div class='sr-zk-top'>" +
          "<span class='sr-zk-emoji'>" + emoji + "</span>" +
          "<span class='sr-zk-name'>" + name + "</span>" +
          (fertig ? "<span class='sr-zk-check'>✓</span>" : "") +
        "</div>" +
        "<div class='sr-zk-balken'>" +
          "<div style='height:100%;border-radius:2px;width:" + prozent + "%;background:" + fillFarbe + ";transition:width 0.5s" + (fertig ? ";box-shadow:0 0 6px var(--green)" : "") + "'></div>" +
        "</div>" +
        "<div class='sr-zk-stand'>" +
          "<span style='font-family:var(--font-mono);color:" + (fertig ? "var(--green)" : "var(--text)") + ";font-weight:700'>" + haben.toLocaleString("de-DE") + "</span>" +
          "<span style='color:var(--text3);font-size:11px'> / " + z.menge.toLocaleString("de-DE") + "</span>" +
        "</div>" +
      "</div>";
  }

  // Progress-Dots für alle Meilensteine
  let dotsHTML = STADTRAT_AUFTRAEGE.map(function(a, i) {
    let ist    = a.id === aktiverStadtratAuftrag;
    let done   = erledigteStadtratAuftraege.includes(a.id);
    return "<div class='sr-dot" +
      (done ? " sr-dot-done" : ist ? " sr-dot-aktiv" : " sr-dot-locked") +
      "' title='" + a.titel + "'>" +
      (done ? "✓" : (i + 1)) +
    "</div>";
  }).join("");

  banner.innerHTML =
    "<div class='sr-banner-haupt'>" +

      // ── Kopfzeile ──
      "<div class='sr-banner-kopf'>" +
        "<div class='sr-banner-links'>" +
          "<span class='sr-akt-badge'>Akt " + auftrag.akt + "</span>" +
          "<span class='sr-banner-emoji'>" + auftrag.emoji + "</span>" +
          "<div>" +
            "<div class='sr-banner-name'>" + auftrag.titel + "</div>" +
            "<div class='sr-banner-sub'>" + auftrag.beschreibung.substring(0, 80) + "…</div>" +
          "</div>" +
        "</div>" +
        "<div class='sr-dots'>" + dotsHTML + "</div>" +
      "</div>" +

      // ── Ziele ──
      "<div class='sr-ziele-grid'>" + zieleHTML + "</div>" +

      // ── Button ──
      (alleErfuellt
        ? "<button class='sr-btn-liefern sr-btn-bereit' onclick='stadtratManuellLiefern()'>" +
            "🚚 Jetzt an Stadtrat liefern — +" + auftrag.belohnung_geld.toLocaleString("de-DE") + " €" +
          "</button>"
        : "<button class='sr-btn-liefern sr-btn-warten' disabled>" +
            "⏳ Ziele noch nicht erfüllt" +
          "</button>") +

    "</div>";
}

// ══════════════════════════════════
// MANUELLES LIEFERN (Satisfactory-Style)
// ══════════════════════════════════

function stadtratManuellLiefern() {
  if (!aktiverStadtratAuftrag) return;

  let auftrag = STADTRAT_AUFTRAEGE.find(function(a) { return a.id === aktiverStadtratAuftrag; });
  if (!auftrag) return;

  // Nochmal prüfen ob wirklich alles da
  for (let z of auftrag.ziele) {
    if ((lager[z.material] || 0) < z.menge) {
      return; // Sicherheitscheck
    }
  }

  stadtratAuftragAbschliessen(auftrag);
}

// ── Auftrag abschließen ──
function stadtratAuftragAbschliessen(auftrag) {
  // Materialien abziehen
  for (let z of auftrag.ziele) {
    lager[z.material] = Math.max(0, (lager[z.material] || 0) - z.menge);
  }

  // Belohnung
  geld += auftrag.belohnung_geld;

  // Tier freischalten
  if (auftrag.belohnung_tier) {
    for (let t = 1; t <= auftrag.belohnung_tier; t++) {
      if (!freigeschaltete_tiers.includes(t)) freigeschaltete_tiers.push(t);
    }
  }

  erledigteStadtratAuftraege.push(auftrag.id);

  // Nächsten aktivieren
  aktiverStadtratAuftrag = null;
  for (let a of STADTRAT_AUFTRAEGE) {
    if (!erledigteStadtratAuftraege.includes(a.id)) {
      aktiverStadtratAuftrag = a.id;
      break;
    }
  }

  geldAnzeigenAktualisieren();
  lagerAnzeigenAktualisieren();
  spielstandSpeichernSofort();

  // Story-Fanfare
  stadtratFanfareZeigen(auftrag);
  stadtratAllesAktualisieren();
}

// ══════════════════════════════════
// FANFARE MODAL
// ══════════════════════════════════

function stadtratFanfareZeigen(auftrag) {
  let modal = document.getElementById("modal-stadtrat");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "modal-stadtrat";
    document.body.appendChild(modal);
  }

  // Nächster Meilenstein für Vorschau
  let naechster = STADTRAT_AUFTRAEGE.find(function(a) {
    return !erledigteStadtratAuftraege.includes(a.id);
  });

  let naechsterHTML = naechster
    ? "<div class='sr-fanfare-naechster'>" +
        "<div style='font-family:var(--font-head);font-size:9px;letter-spacing:3px;color:var(--text3);text-transform:uppercase;margin-bottom:6px'>Nächster Meilenstein</div>" +
        "<div style='display:flex;align-items:center;gap:10px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px 14px'>" +
          "<span style='font-size:26px'>" + naechster.emoji + "</span>" +
          "<div>" +
            "<div style='font-family:var(--font-head);font-size:15px;font-weight:700'>" + naechster.titel + "</div>" +
            "<div style='font-size:11px;color:var(--text3);margin-top:2px'>" +
              naechster.ziele.map(function(z) {
                let mat = MATERIALIEN ? MATERIALIEN.find(function(m) { return m.id === z.material; }) : null;
                return (mat ? mat.emoji + " " : "") + z.menge + "× " + (mat ? mat.name : z.material);
              }).join(" · ") +
            "</div>" +
          "</div>" +
        "</div>" +
      "</div>"
    : "<div style='text-align:center;font-family:var(--font-head);font-size:14px;color:var(--green);padding:10px'>🏆 Alle Meilensteine abgeschlossen!</div>";

  modal.innerHTML =
    "<div class='sr-fanfare-overlay'>" +
      "<div class='sr-fanfare-box'>" +
        "<div class='sr-fanfare-konfetti'>🎊</div>" +
        "<div class='sr-fanfare-emoji'>" + auftrag.emoji + "</div>" +
        "<div class='sr-fanfare-akt'>Akt " + auftrag.akt + " abgeschlossen</div>" +
        "<h2 class='sr-fanfare-titel'>" + auftrag.titel + "</h2>" +
        "<p class='sr-fanfare-text'>" + auftrag.belohnung_text + "</p>" +
        "<div class='sr-fanfare-reward'>" +
          "<span class='sr-fanfare-reward-zahl'>+" + auftrag.belohnung_geld.toLocaleString("de-DE") + " €</span>" +
          "<span class='sr-fanfare-reward-label'>Belohnung erhalten</span>" +
        "</div>" +
        naechsterHTML +
        "<button class='sr-fanfare-weiter' onclick='stadtratFanfareSchliessen()'>Weiter →</button>" +
      "</div>" +
    "</div>";

  modal.style.display = "flex";
}

function stadtratFanfareSchliessen() {
  let modal = document.getElementById("modal-stadtrat");
  if (modal) modal.style.display = "none";
}

function stadtratDetailOeffnen() {
  // Zur Übersicht navigieren und Banner fokussieren
  if (typeof tabWechseln === "function") tabWechseln("uebersicht");
  setTimeout(function() {
    let banner = document.getElementById("stadtrat-banner");
    if (banner) banner.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 100);
}

// ── Tier-Sichtbarkeit ──
function materialIstSichtbar(material) {
  if (!material.tier) return true;
  return freigeschaltete_tiers.includes(material.tier) ||
         (material.tier - 1) <= Math.max(...freigeschaltete_tiers);
}

// ── State ──
function stadtratZuStand() {
  return {
    aktiver:  aktiverStadtratAuftrag,
    erledigt: erledigteStadtratAuftraege,
    tiers:    freigeschaltete_tiers
  };
}

function stadtratAusStand(stand) {
  if (!stand) return;
  aktiverStadtratAuftrag     = stand.aktiver   || null;
  erledigteStadtratAuftraege = stand.erledigt  || [];
  freigeschaltete_tiers      = stand.tiers     || [1];
}
