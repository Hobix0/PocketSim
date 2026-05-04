// ══════════════════════════════════
// EREIGNIS-SYSTEM
// Zufällige Events die den Spielverlauf beeinflussen
// ══════════════════════════════════

let EREIGNISSE          = [];

// ── Laden ──
async function ereignisseLaden() {
  try {
    let antwort = await fetch("data/ereignisse.json");
    EREIGNISSE  = await antwort.json();
  } catch(e) {
    EREIGNISSE = [];
  }
}

// ── Bedingung prüfen ──
function ereignisBedingungErfuellt(bedingung) {
  if (!bedingung)                   return true;
  if (bedingung === "hatGroßfabrik") return hatGebaeude("grossfabrik") || hatGebaeude("fabrik");
  if (bedingung === "hatMitarbeiter") return mitarbeiter > 0;
  if (bedingung === "hatMaschine")    return installierte_maschinen.length > 0;
  if (bedingung === "hatForschung")   return erforschte_technologien.length > 0;
  return true;
}

// ── Jede Runde prüfen ob Ereignis eintritt ──
function ereignisPruefen() {
  // Aktive Ereignisse runterzählen
  let abgelaufen = [];
  for (let ae of aktiveEreignisse) {
    ae.rundenVerbleibend--;
    if (ae.rundenVerbleibend <= 0) abgelaufen.push(ae);
  }
  for (let ae of abgelaufen) {
    ereignisEffektBeenden(ae);
    aktiveEreignisse = aktiveEreignisse.filter(function(e) { return e.id !== ae.id; });
  }

  // Hardcore: höhere Wahrscheinlichkeit
  let basisChance = aktiverSpielModus && aktiverSpielModus.id === "hardcore" ? 35 : 20;

  // Nur alle paar Runden ein Ereignis (nicht jeden Zug)
  if (spielRundeGesamt < 3) return;
  if (Math.random() * 100 > basisChance) return;
  if (aktiveEreignisse.length >= 2) return; // Max 2 gleichzeitig

  // Passendes Ereignis wählen (gewichtet)
  let verfuegbare = EREIGNISSE.filter(function(e) {
    return ereignisBedingungErfuellt(e.bedingung) &&
           !aktiveEreignisse.some(function(ae) { return ae.id === e.id; });
  });

  if (verfuegbare.length === 0) return;

  // Gewichtete Zufallsauswahl
  let gesamtGewicht = verfuegbare.reduce(function(sum, e) {
    return sum + (e.wahrscheinlichkeit || 5);
  }, 0);

  let zufall = Math.random() * gesamtGewicht;
  let kumuliert = 0;
  let gewaehlt  = null;

  for (let e of verfuegbare) {
    kumuliert += e.wahrscheinlichkeit || 5;
    if (zufall <= kumuliert) { gewaehlt = e; break; }
  }

  if (!gewaehlt) gewaehlt = verfuegbare[0];

  ereignisAuslosen(gewaehlt);
}

// ── Ereignis auslösen ──
function ereignisAuslosen(ereignis) {
  let effekt = ereignis.effekt;
  let eintrag = {
    id:               ereignis.id,
    name:             ereignis.name,
    rundenVerbleibend: effekt.runden || 1,
    effekt:           effekt
  };

  // Soforteffekte anwenden
  if (effekt.typ === "geldBonus") {
    geld += effekt.betrag;
    geldAnzeigenAktualisieren();
  }
  else if (effekt.typ === "lagerVerlust") {
    let verlustProzent = effekt.prozent / 100;
    for (let key in lager) {
      lager[key] = Math.floor(lager[key] * (1 - verlustProzent));
    }
    lagerAnzeigenAktualisieren();
  }
  else if (effekt.typ === "maschinenAusfall") {
    let laufend = installierte_maschinen.filter(function(m) { return m.laeuft; });
    for (let i = 0; i < Math.min(effekt.anzahl, laufend.length); i++) {
      let idx = Math.floor(Math.random() * laufend.length);
      laufend[idx].laeuft = false;
      laufend.splice(idx, 1);
    }
  }

  // Dauernde Effekte: in aktiveEreignisse eintragen
  if (effekt.runden && effekt.runden > 0) {
    aktiveEreignisse.push(eintrag);
  }

  // Geschichte
  ereignisGeschichte.unshift({
    name:  ereignis.name,
    emoji: ereignis.emoji,
    typ:   ereignis.typ,
    runde: spielRundeGesamt
  });
  if (ereignisGeschichte.length > 5) ereignisGeschichte.pop();

  // Modal zeigen
  ereignisModalZeigen(ereignis, eintrag);
  spielstandSpeichern();
}

// ── Effekt beenden ──
function ereignisEffektBeenden(aktEreignis) {
  // Benachrichtigung
  let e = EREIGNISSE.find(function(er) { return er.id === aktEreignis.id; });
  if (e) {
    zeigeNotification(
      e.emoji + " Ereignis beendet: " + e.name,
      e.typ === "positiv" ? "green" : "red"
    );
  }
}

// ── Kosten-Modifikator durch aktive Ereignisse ──
function ereignisKostenModifikator() {
  let faktor = 1.0;
  for (let ae of aktiveEreignisse) {
    if (ae.effekt.typ === "kostenErhoehung" &&
        (ae.effekt.kategorie === "alle" || !ae.effekt.kategorie)) {
      faktor *= ae.effekt.faktor;
    }
    if (ae.effekt.typ === "lohnErhoehung") {
      // wird separat in kosten.js behandelt
    }
  }
  return faktor;
}

// ── Verkaufs-Modifikator durch aktive Ereignisse ──
function ereignisVerkaufsModifikator() {
  let faktor = 1.0;
  for (let ae of aktiveEreignisse) {
    if (ae.effekt.typ === "verkaufsBonus") {
      faktor *= ae.effekt.faktor;
    }
    if (ae.effekt.typ === "preisBonus") {
      faktor *= ae.effekt.faktor; // vereinfacht
    }
  }
  return faktor;
}

// ── Lohn-Modifikator ──
function ereignisLohnModifikator() {
  let faktor = 1.0;
  for (let ae of aktiveEreignisse) {
    if (ae.effekt.typ === "lohnErhoehung") {
      faktor *= ae.effekt.faktor;
    }
  }
  return faktor;
}

// ── Personal-Reduktion ──
function ereignisPersonalReduktion() {
  let reduktion = 0;
  for (let ae of aktiveEreignisse) {
    if (ae.effekt.typ === "personalBonus") {
      reduktion += ae.effekt.reduktion;
    }
  }
  return reduktion;
}

// ── Modal ──
function ereignisModalZeigen(ereignis, eintrag) {
  let modal = document.getElementById("modal-ereignis");
  if (!modal) return;

  let istPositiv = ereignis.typ === "positiv";
  let farbe      = istPositiv ? "var(--green)" : "var(--red)";
  let bgFarbe    = istPositiv ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.06)";

  // Effekt-Text
  let effektText = "";
  let e = ereignis.effekt;
  if (e.typ === "geldBonus")        effektText = "💰 +" + e.betrag.toLocaleString("de-DE") + " € sofort";
  if (e.typ === "lagerVerlust")     effektText = "📦 -" + e.prozent + "% aller Lagerbestände";
  if (e.typ === "maschinenAusfall") effektText = "🔧 " + e.anzahl + " Maschine(n) ausgefallen";
  if (e.typ === "kostenErhoehung")  effektText = "💸 Betriebskosten ×" + e.faktor + " für " + e.runden + " Runden";
  if (e.typ === "lohnErhoehung")    effektText = "👷 Lohnkosten ×" + e.faktor + " für " + e.runden + " Runden";
  if (e.typ === "verkaufsBonus")    effektText = "📈 Verkaufspreise ×" + e.faktor + " für " + e.runden + " Runden";
  if (e.typ === "preisBonus")       effektText = "📈 " + e.material + " Preise ×" + e.faktor + " für " + e.runden + " Runden";
  if (e.typ === "personalBonus")    effektText = "👷 Personalbedarf -" + e.reduktion + " für " + e.runden + " Runden";

  document.getElementById("ereignis-modal-inhalt").style.background =
    "var(--surface)";
  document.getElementById("ereignis-modal-inhalt").style.borderColor = farbe;

  document.getElementById("ereignis-emoji").textContent    = ereignis.emoji;
  document.getElementById("ereignis-emoji").style.color    = farbe;
  document.getElementById("ereignis-titel").textContent    = ereignis.name;
  document.getElementById("ereignis-typ-badge").textContent =
    istPositiv ? "✨ Positives Ereignis" : "⚠️ Negatives Ereignis";
  document.getElementById("ereignis-typ-badge").style.color      = farbe;
  document.getElementById("ereignis-typ-badge").style.borderColor = farbe;
  document.getElementById("ereignis-typ-badge").style.background  = bgFarbe;
  document.getElementById("ereignis-beschreibung").textContent    = ereignis.beschreibung;
  document.getElementById("ereignis-effekt-text").textContent     = effektText;
  document.getElementById("ereignis-runden-info").textContent     =
    e.runden ? "Dauer: " + e.runden + " Runden" : "Soforteffekt";

  modal.style.display = "flex";

  // Auto-close nach 6s
  clearTimeout(window.ereignisTimeout);
  window.ereignisTimeout = setTimeout(function() {
    modal.style.display = "none";
  }, 6000);
}

function ereignisModalSchliessen() {
  document.getElementById("modal-ereignis").style.display = "none";
  clearTimeout(window.ereignisTimeout);
}

// ── Aktive Ereignisse Banner ──
function aktiveEreignisseBannerAktualisieren() {
  let container = document.getElementById("aktive-ereignisse-banner");
  if (!container) return;

  if (aktiveEreignisse.length === 0) {
    container.style.display = "none";
    return;
  }

  container.style.display = "flex";
  container.innerHTML = aktiveEreignisse.map(function(ae) {
    let e       = EREIGNISSE.find(function(er) { return er.id === ae.id; });
    let positiv = e && e.typ === "positiv";
    let farbe   = positiv ? "var(--green)" : "var(--red)";
    return "<div class='ereignis-chip' style='border-color:" + farbe + "; color:" + farbe + "'>" +
      (e ? e.emoji : "⚡") + " " +
      (e ? e.name : ae.id) +
      " <span style='opacity:0.6'>(" + ae.rundenVerbleibend + "R)</span>" +
    "</div>";
  }).join("");
}