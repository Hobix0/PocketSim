// ══════════════════════════════════
// SPIELMODUS
// Schwierigkeitsgrad entfernt —
// Spiel startet immer im Normal-Modus
// ══════════════════════════════════

let SPIELMODI = [];

async function spielmodiLaden() {
  try {
    let antwort = await fetch("data/spielmodi.json");
    SPIELMODI = await antwort.json();
  } catch(e) {
    SPIELMODI = [];
  }
}

// Wird aufgerufen wenn kein Spielstand vorhanden
function introModalZeigen() {
  // Kein Popup mehr — direkt Normal-Modus starten
  let modus = SPIELMODI.find(function(m) { return m.id === "normal"; });
  if (!modus && SPIELMODI.length > 0) modus = SPIELMODI[0];

  if (modus) {
    aktiverSpielModus = modus;
    geld = modus.startkapital;
    spielRundeGesamt = 0;
    geldAnzeigenAktualisieren();
    spielstandSpeichernSofort();
  }
}

function spielmodusWaehlen(modusId) {
  // Noch vorhanden für eventuelle spätere Nutzung
  let modus = SPIELMODI.find(function(m) { return m.id === modusId; });
  if (!modus) return;
  aktiverSpielModus = modus;
  geld = modus.startkapital;
  spielRundeGesamt = 0;
  geldAnzeigenAktualisieren();
  spielstandSpeichernSofort();
}

function zeigeStoryNachricht(titel, text, farbe) {
  // Story-Nachrichten bleiben erhalten
  let modal = document.getElementById("modal-story");
  if (!modal) return;
  let farbeCSS = farbe === "green" ? "var(--green)" :
                 farbe === "red"   ? "var(--red)"   : "var(--accent)";
  document.getElementById("story-titel").textContent = titel;
  document.getElementById("story-text").textContent  = text;
  document.getElementById("story-icon").style.color  = farbeCSS;
  document.getElementById("story-border").style.borderColor = farbeCSS;
  modal.style.display = "flex";
  setTimeout(function() { modal.style.display = "none"; }, 5000);
}

function storyModalSchliessen() {
  let el = document.getElementById("modal-story");
  if (el) el.style.display = "none";
}

function kostenModifikator() {
  if (!aktiverSpielModus) return 1.0;
  if (spielRundeGesamt < aktiverSpielModus.freieRunden) return 0.0;
  let rundeNach = spielRundeGesamt - aktiverSpielModus.freieRunden;
  if (rundeNach < aktiverSpielModus.rabattRunden) {
    return 1.0 - (aktiverSpielModus.rabattProzent / 100);
  }
  return 1.0;
}

function verkaufsBonus() {
  if (!aktiverSpielModus) return 1.0;
  return aktiverSpielModus.verkaufsBonus || 1.0;
}

function rundenStatusAktualisieren() {
  if (!aktiverSpielModus) return;
  let banner = document.getElementById("spielmodus-banner");
  if (!banner) return;
  let mod = kostenModifikator();
  if (mod === 0.0) {
    let verbleibend = aktiverSpielModus.freieRunden - spielRundeGesamt;
    banner.style.display = "block";
    banner.style.background = "rgba(16,185,129,0.1)";
    banner.style.borderColor = "var(--green)";
    banner.style.color = "var(--green)";
    banner.textContent = aktiverSpielModus.emoji + " Steueraufschub: " + verbleibend + " Runden verbleibend";
  } else if (mod < 1.0) {
    let verbleibend = aktiverSpielModus.rabattRunden - (spielRundeGesamt - aktiverSpielModus.freieRunden);
    banner.style.display = "block";
    banner.style.background = "rgba(245,158,11,0.1)";
    banner.style.borderColor = "var(--accent)";
    banner.style.color = "var(--accent)";
    banner.textContent = "💸 " + aktiverSpielModus.rabattProzent + "% Kostenrabatt: " + verbleibend + " Runden";
  } else {
    banner.style.display = "none";
  }
}

function maschinenausfallPruefen() {
  if (!aktiverSpielModus || !aktiverSpielModus.maschinenausfaelle) return;
  for (let m of installierte_maschinen) {
    if (!m.laeuft) continue;
    if (Math.random() < 0.03) {
      m.laeuft = false;
      zeigeNotification("⚠️ Maschinenausfall: " + m.name, "red");
    }
  }
}