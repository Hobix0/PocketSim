// ══════════════════════════════════
// SPIELMODUS — Startup / Normal / Hardcore
// ══════════════════════════════════

let SPIELMODI = [];

async function spielmodiLaden() {
  let antwort = await fetch("data/spielmodi.json");
  SPIELMODI = await antwort.json();
}

// ── Intro Modal beim ersten Start ──
function introModalZeigen() {
  let modal = document.getElementById("modal-intro");
  if (!modal) return;
  modal.style.display = "flex";
  introModalGenerieren();
}

function introModalGenerieren() {
  let body = document.getElementById("intro-body");
  if (!body) return;

  let html =
    "<div class='intro-story'>" +
      "<div class='intro-story-icon'>🏙️</div>" +
      "<h3 class='intro-story-titel'>Willkommen in Remscheid</h3>" +
      "<p class='intro-story-text'>" +
        "Du übernimmst ein brachliegendes Industriegelände am Stadtrand. " +
        "Der Stadtrat hat Großes mit dir vor — aber zunächst musst du " +
        "beweisen, dass dein Betrieb Zukunft hat." +
      "</p>" +
    "</div>" +
    "<div class='intro-modi'>";

  for (let modus of SPIELMODI) {
    html +=
      "<div class='intro-modus-karte' onclick='spielmodusWaehlen(\"" + modus.id + "\")' " +
        "style='border-color:" + modus.farbe + "'>" +
        "<div class='intro-modus-header'>" +
          "<span class='intro-modus-emoji'>" + modus.emoji + "</span>" +
          "<div>" +
            "<div class='intro-modus-name' style='color:" + modus.farbe + "'>" + modus.name + "</div>" +
            "<div class='intro-modus-startkapital'>💰 " + modus.startkapital.toLocaleString("de-DE") + " € Startkapital</div>" +
          "</div>" +
        "</div>" +
        "<p class='intro-modus-beschreibung'>" + modus.beschreibung + "</p>" +
        "<div class='intro-modus-details'>" +
          (modus.freieRunden > 0
            ? "<span class='intro-tag tag-gruen'>✓ " + modus.freieRunden + " Runden kostenlos</span>"
            : "<span class='intro-tag tag-grau'>✗ Keine Gnadenfrist</span>") +
          (modus.rabattRunden > 0
            ? "<span class='intro-tag tag-gruen'>✓ " + modus.rabattRunden + " Runden " + modus.rabattProzent + "% Rabatt</span>"
            : "") +
          (modus.verkaufsBonus > 1.0
            ? "<span class='intro-tag tag-gruen'>✓ +" + Math.round((modus.verkaufsBonus - 1) * 100) + "% Verkaufspreise</span>"
            : "") +
          (modus.maschinenausfaelle
            ? "<span class='intro-tag tag-rot'>✗ Maschinenausfälle möglich</span>"
            : "<span class='intro-tag tag-gruen'>✓ Keine Maschinenausfälle</span>") +
          "<span class='intro-tag " + (modus.preisschwankung > 0.15 ? "tag-rot" : "tag-gruen") + "'>" +
            (modus.preisschwankung > 0.15 ? "✗" : "✓") +
            " Preisschwankung ±" + Math.round(modus.preisschwankung * 100) + "%" +
          "</span>" +
        "</div>" +
        "<button style='background:" + modus.farbe + "; color:" + (modus.id === "hardcore" ? "#fff" : "#000") + "'>" +
          modus.emoji + " " + modus.name + " starten" +
        "</button>" +
      "</div>";
  }

  html += "</div>";
  body.innerHTML = html;
}

function spielmodusWaehlen(modusId) {
  let modus = SPIELMODI.find(function(m) { return m.id === modusId; });
  if (!modus) return;

  aktiverSpielModus = modus;
  geld = modus.startkapital;
  spielRundeGesamt = 0;

  // Modal schließen
  document.getElementById("modal-intro").style.display = "none";

  // Story-Notification je nach Modus
  if (modus.id === "startup") {
    setTimeout(function() {
      zeigeStoryNachricht(
        "📜 Stadtrat Remscheid",
        "Hiermit gewähren wir Ihrem Betrieb einen Steueraufschub von " +
        modus.freieRunden + " Runden. Nutzen Sie die Zeit für den Aufbau " +
        "Ihrer Produktionsanlagen. Viel Erfolg!",
        "green"
      );
    }, 500);
  } else if (modus.id === "normal") {
    setTimeout(function() {
      zeigeStoryNachricht(
        "🏭 Betrieb registriert",
        "Ihr Unternehmen wurde beim Gewerbeamt angemeldet. " +
        "Laufende Kosten fallen sofort an — aber der Markt schätzt " +
        "professionellen Betrieb mit +20% besseren Preisen.",
        "amber"
      );
    }, 500);
  } else if (modus.id === "hardcore") {
    setTimeout(function() {
      zeigeStoryNachricht(
        "💀 Kein Pardon",
        "Volle Kosten, volatile Märkte, alternde Maschinen. " +
        "Nur die Härtesten überleben. Viel Glück — du wirst es brauchen.",
        "red"
      );
    }, 500);
  }

  geldAnzeigenAktualisieren();
  spielstandSpeichernSofort();
}

// ── Story-Nachrichten ──
function zeigeStoryNachricht(titel, text, farbe) {
  let modal = document.getElementById("modal-story");
  if (!modal) return;

  let farbeCSS = farbe === "green" ? "var(--green)" :
                 farbe === "red"   ? "var(--red)"   : "var(--accent)";

  document.getElementById("story-titel").textContent = titel;
  document.getElementById("story-text").textContent  = text;
  document.getElementById("story-icon").style.color  = farbeCSS;
  document.getElementById("story-border").style.borderColor = farbeCSS;

  modal.style.display = "flex";

  // Auto-close nach 5 Sekunden
  setTimeout(function() {
    modal.style.display = "none";
  }, 5000);
}

function storyModalSchliessen() {
  document.getElementById("modal-story").style.display = "none";
}

// ── Kosten-Modifikator je nach Modus und Runde ──
function kostenModifikator() {
  if (!aktiverSpielModus) return 1.0;

  // Freie Runden
  if (spielRundeGesamt < aktiverSpielModus.freieRunden) {
    return 0.0;
  }

  // Rabatt-Runden
  let rundeNachGnadenfrist = spielRundeGesamt - aktiverSpielModus.freieRunden;
  if (rundeNachGnadenfrist < aktiverSpielModus.rabattRunden) {
    return 1.0 - (aktiverSpielModus.rabattProzent / 100);
  }

  return 1.0;
}

// ── Verkaufsbonus ──
function verkaufsBonus() {
  if (!aktiverSpielModus) return 1.0;
  return aktiverSpielModus.verkaufsBonus || 1.0;
}

// ── Runden-Status Banner ──
function rundenStatusAktualisieren() {
  if (!aktiverSpielModus) return;

  let banner = document.getElementById("spielmodus-banner");
  if (!banner) return;

  let mod = kostenModifikator();
  let text = "";
  let farbe = "var(--accent)";

  if (mod === 0.0) {
    let verbleibend = aktiverSpielModus.freieRunden - spielRundeGesamt;
    text  = aktiverSpielModus.emoji + " Steueraufschub: " + verbleibend + " Runden verbleibend";
    farbe = "var(--green)";
  } else if (mod < 1.0) {
    let rundeNach = spielRundeGesamt - aktiverSpielModus.freieRunden;
    let verbleibend = aktiverSpielModus.rabattRunden - rundeNach;
    text  = "💸 " + aktiverSpielModus.rabattProzent + "% Kostenrabatt: " + verbleibend + " Runden";
    farbe = "var(--accent)";
  } else {
    banner.style.display = "none";
    return;
  }

  banner.style.display     = "block";
  banner.style.background  = farbe === "var(--green)" ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)";
  banner.style.borderColor = farbe;
  banner.style.color       = farbe;
  banner.textContent       = text;
}

// ── Maschinenausfall (Hardcore) ──
function maschinenausfallPruefen() {
  if (!aktiverSpielModus || !aktiverSpielModus.maschinenausfaelle) return;

  for (let m of installierte_maschinen) {
    if (!m.laeuft) continue;
    // 3% Chance pro Maschine pro Runde
    if (Math.random() < 0.03) {
      m.laeuft = false;
      m.ausfall = true;
      zeigeNotification("⚠️ Maschinenausfall: " + m.name + " ausgefallen! Verwalten → Reparieren.", "red");
    }
  }
}