// ══════════════════════════════════
// PRODUKTION
// Maschinen, Materialien, Produktionsloop
// ══════════════════════════════════

// ── Fokus-Bonus: je nach Unternehmensfokus ──
function fokusBonus(typ) {
  if (!window.unternehmen || !unternehmen.fokus) return 1.0;
  let f = unternehmen.fokus;
  if (typ === "geschwindigkeit" && f === "fertigung")  return 1.15;
  if (typ === "abbau"          && f === "bergbau")     return 1.25;
  if (typ === "forschung"      && f === "forschung")   return 1.30;
  if (typ === "verkauf"        && f === "handel")      return 1.20;
  return 1.0;
}


function getMaterial(id) {
  return lager[id] || 0;
}

function setMaterial(id, wert) {
  // Lagerkapazität prüfen
  let max = typeof lagerKapazitaet === "function" ? lagerKapazitaet() : 100;
  lager[id] = Math.max(0, Math.min(max, wert));
}

function getrezept(id) {
  return REZEPTE.find(function(r) { return r.id === id; });
}

function maschinenMaterialVerfuegbar(maschine, material) {
  let buffer = (maschine.foerderbandInput && maschine.foerderbandInput[material]) || 0;
  return getMaterial(material) + buffer;
}

function maschinenMaterialEntnehmen(maschine, material, menge) {
  let buffer = (maschine.foerderbandInput && maschine.foerderbandInput[material]) || 0;
  let rest = menge;
  if (buffer > 0) {
    let entnommen = Math.min(buffer, rest);
    maschine.foerderbandInput[material] = buffer - entnommen;
    rest -= entnommen;
    if (maschine.foerderbandInput[material] === 0) delete maschine.foerderbandInput[material];
  }
  if (rest > 0) {
    setMaterial(material, getMaterial(material) - rest);
  }
}

// ── Maschine kaufen ──

function maschineKaufen(maschineId) {
  let md = MASCHINEN.find(function(m) { return m.id === maschineId; });
  if (!md) return;

  // Aktives Gebäude aus Context
  let gebId = window.aktivesGebaeudeId;

  // Kein Context → passendes Gebäude nach Hallentyp suchen
  if (!gebId) {
    let passendesGeb = null;

    // Erst nach Hallentyp-Match suchen
    for (let gsId of gekaufte_grundstuecke) {
      for (let gId of gebaeudeVonGrundstueck(gsId)) {
        let gData = GEBAEUDE.find(function(g) { return g.id === gId; });
        if (!gData || gData.typ !== "fabrik") continue;
        if (md.hallenTyp && !md.hallenTyp.includes(gData.hallenTyp)) continue;
        passendesGeb = gData;
        break;
      }
      if (passendesGeb) break;
    }

    if (!passendesGeb) {
      let hallenTypText = md.hallenTyp ? md.hallenTyp.join(" oder ") : "eine Fabrik";
      alert("Kein passendes Gebäude! " + md.name + " benötigt: " + hallenTypText);
      return;
    }
    gebId = passendesGeb.id;
  }

  let gebaeudeData = GEBAEUDE.find(function(g) { return g.id === gebId; });
  if (!gebaeudeData) return;

  // Hallentyp-Kompatibilität prüfen
  let b = new building();
  if (!b.hallenTypKompatibel(gebaeudeData, md)) {
    let benoetigter = md.hallenTyp ? md.hallenTyp.join(" oder ") : "?";
    alert(
      "❌ Falscher Hallentyp!\n" +
      md.name + " benötigt: " + benoetigter + "\n" +
      gebaeudeData.name + " ist: " + gebaeudeData.hallenTyp
    );
    return;
  }

  // Platzkontrolle über Tile-Grid
  if (!b.maschinePasstRein(gebaeudeData, md)) {
    let tw = md.tileGroesse ? md.tileGroesse.w : 2;
    let th = md.tileGroesse ? md.tileGroesse.h : 2;
    alert(
      "❌ Kein Platz in " + gebaeudeData.name + "!\n" +
      md.name + " benötigt " + tw + "×" + th + " Tiles."
    );
    return;
  }

  // Geld prüfen
  if (geld < md.kosten) {
    alert("Nicht genug Geld! Benötigt: " + md.kosten.toLocaleString("de-DE") + " €");
    return;
  }

  geld -= md.kosten;

  installierte_maschinen.push({
    id:                  md.id,
    instanceId:          md.id + "_" + Date.now() + "_" + Math.random().toString(36).substr(2,5),
    name:                md.name,
    emoji:               md.emoji,
    kosten:              md.kosten,
    groesse:             md.groesse,
    rezepte:             md.rezepte,
    kostenProRunde:      md.kostenProRunde,
    aktivesRezept:       md.aktivesRezept,
    laeuft:              false,   // erst platzieren!
    platziert:           false,   // muss im Fabrikplan platziert werden
    gebaeudeId:          gebId,
    sessionProduktionen: 0,
    fabrikPos:           {}
  });

  geldAnzeigenAktualisieren();
  uebersichtAktualisieren();
  spielstandSpeichernSofort();  // Kauf sofort in Cloud
  shopGenerieren();
}

// ── Maschine produzieren ──

function maschineProduzieren(maschine) {
  if (!maschine.laeuft) return false;

  let rezept = getrezept(maschine.aktivesRezept);
  if (!rezept) return false;

  // Inputs prüfen
  for (let inp of rezept.inputs) {
    if (maschinenMaterialVerfuegbar(maschine, inp.material) < inp.menge) return false;
  }

  // Inputs abziehen
  for (let inp of rezept.inputs) {
    maschinenMaterialEntnehmen(maschine, inp.material, inp.menge);
  }

  // Outputs hinzufügen
  for (let out of rezept.outputs) {
    let bonus = 1.0;

    // Produktionsbonus aus Forschung
    if (forschungsBonus.produktionMultiplikator > 1.0) {
      // Bonus gilt für alle Holzmaschinen
      let md = MASCHINEN.find(function(m) { return m.id === maschine.id; });
      if (md && md.produktionslinie === "holz") {
        bonus = forschungsBonus.produktionMultiplikator;
      }
    }

    let ausgabe = Math.round(out.menge * bonus);
    setMaterial(out.material, getMaterial(out.material) + ausgabe);
  }

  maschine.sessionProduktionen = (maschine.sessionProduktionen || 0) + 1;
  return true;
}

// ── Material kaufen ──

function materialKaufen(materialId, menge) {
  let mat = MATERIALIEN.find(function(m) { return m.id === materialId; });
  if (!mat || !mat.imShop) return;

  let gesamtpreis = mat.kaufpreis * menge;
  if (geld < gesamtpreis) {
    alert("Nicht genug Geld! Benötigt: " + gesamtpreis.toLocaleString("de-DE") + " €");
    return;
  }

  // Lagerkapazität prüfen
  let max       = typeof lagerKapazitaet === "function" ? lagerKapazitaet() : 100;
  let aktuell   = lager[materialId] || 0;
  let platz     = max - aktuell;

  if (platz <= 0) {
    alert("Lager voll! Max. " + max + " Stk pro Material.\nBaue eine Lagerhalle für mehr Kapazität.");
    return;
  }

  let kaufMenge = Math.min(menge, platz);
  let bezahlt   = mat.kaufpreis * kaufMenge;

  geld -= bezahlt;
  lager[materialId] = aktuell + kaufMenge;

  if (kaufMenge < menge) {
    alert("Nur " + kaufMenge + " von " + menge + " Stk gekauft — Lager war nicht ganz leer.");
  }

  geldAnzeigenAktualisieren();
  lagerAnzeigenAktualisieren();
  spielstandSpeichern();

  if (typeof soundKaufen === "function") soundKaufen();
}

// ── Material verkaufen ──

function materialVerkaufen(materialId) {
  let mat = MATERIALIEN.find(function(m) { return m.id === materialId; });
  if (!mat || !mat.verkaufbar) return;

  // Menge aus Input lesen
  let input = document.getElementById("verkauf-menge-" + materialId);
  let menge = input ? parseInt(input.value) || 1 : 1;
  menge     = Math.min(menge, lager[materialId] || 0);

  if (menge <= 0) return;

  // Aktuellen Marktpreis verwenden falls verfügbar
  let preis     = (marktpreise && marktpreise[materialId]) ? marktpreise[materialId] : mat.verkaufpreis;
  let einnahmen = menge * preis;

  geld              += einnahmen;
  lager[materialId] -= menge;

  geldAnzeigenAktualisieren();
  lagerAnzeigenAktualisieren();
  spielstandSpeichern();

  if (typeof soundVerkaufen === "function") soundVerkaufen();

  // Aufträge prüfen
  if (typeof auftraegeScreenAktualisieren === "function") {
    auftraegeScreenAktualisieren();
  }
}

// ── Manuell produzieren (Shop) ──

function manuellProduzieren(rezeptId, menge) {
  let erfolgreich = 0;
  for (let i = 0; i < menge; i++) {
    let dummy = {
      id:                  "manuell",
      laeuft:              true,
      aktivesRezept:       rezeptId,
      sessionProduktionen: 0
    };
    if (maschineProduzieren(dummy)) erfolgreich++;
    else break;
  }

  if (erfolgreich > 0) {
    lagerAnzeigenAktualisieren();
    spielstandSpeichern();
  }
}

// ── Personal ──

function hatGenugPersonal() {
  return mitarbeiter >= mitarbeiterBenoetigt();
}

// ── Produktions-Intervall ──

function produktionStarten() {
  const INTERVALL = 30000;
  window.rundenStart = Date.now();
  window.produktionsPauseStart = null;

  // Timer-Animationsframe
  function timerAktualisieren() {
    let balken = document.getElementById("runden-timer-balken");
    let text   = document.getElementById("runden-timer-text");
    let nummer = document.getElementById("runden-nummer");

    if (spielPausiert) {
      if (text) text.textContent = "Pause";
      if (nummer) nummer.textContent = "Runde " + spielRundeGesamt;
      requestAnimationFrame(timerAktualisieren);
      return;
    }

    let vergangen  = Date.now() - window.rundenStart;
    let prozent    = Math.min(100, (vergangen / INTERVALL) * 100);
    let verbleibend = Math.max(0, Math.ceil((INTERVALL - vergangen) / 1000));

    if (balken) {
      balken.style.width = prozent + "%";
      // Farbe wechselt je nach Zeit
      balken.style.background =
        prozent < 50 ? "var(--green)" :
        prozent < 80 ? "var(--accent)" : "var(--red)";
    }
    if (text)   text.textContent   = "Nächste Runde in " + verbleibend + "s";
    if (nummer) nummer.textContent = "Runde " + spielRundeGesamt;

    requestAnimationFrame(timerAktualisieren);
  }

  requestAnimationFrame(timerAktualisieren);

  setInterval(function() {
    if (spielPausiert) return;
    window.rundenStart = Date.now();
    spielRundeGesamt++;

    // ... rest des Produktions-Codes bleibt gleich
    if (typeof rundenStatusAktualisieren === "function") {
      rundenStatusAktualisieren();
    }
    if (typeof maschinenausfallPruefen === "function") {
      maschinenausfallPruefen();
    }

    if (typeof foerderbandTransferDurchfuehren === "function") {
      foerderbandTransferDurchfuehren();
    }

    if (typeof debugUnendlichGeld !== "undefined" && debugUnendlichGeld) {
      geld = 999999999;
      geldAnzeigenAktualisieren();
      statistikAufzeichnen();
    }

    let kosten = (typeof debugKeineKosten !== "undefined" && debugKeineKosten)
      ? 0 : kostenBerechnen();

    if (kosten > 0 && geld < kosten) {
      let el = document.getElementById("betrieb-status");
      if (el) {
        el.style.display    = "block";
        el.style.background = "var(--red)";
        el.style.color      = "#fff";
        el.textContent      = "⚠️ Nicht genug Geld — Betrieb steht still!";
      }
      return;
    }

    let el = document.getElementById("betrieb-status");
    if (el) el.style.display = "none";

    if (kosten > 0) geld -= kosten;

    if (typeof alleMinenFordern === "function") alleMinenFordern();

    if (hatGenugPersonal()) {
      for (let m of installierte_maschinen) {
        let outputs = maschineProduzierenMitFeedback(m);
        if (outputs && outputs.length > 0) {
          produktionsFeedbackZeigen(m, outputs);
        }
      }
    }

    if (hatGebaeude("labor") && typeof forschungsFortschritt === "function") {
      forschungsFortschritt();
    }

    if (typeof marktpreiseAktualisieren === "function") marktpreiseAktualisieren();
    if (typeof autoVerkaufDurchfuehren  === "function") autoVerkaufDurchfuehren();
    if (typeof lkwRundeTick === "function") lkwRundeTick();
    if (typeof auftraegeRundeAktualisieren === "function") auftraegeRundeAktualisieren();

    // Ereignis prüfen
    if (typeof ereignisPruefen === "function") ereignisPruefen();

    geldAnzeigenAktualisieren();
    statistikAufzeichnen();
    lagerAnzeigenAktualisieren();
    personalAnzeigenAktualisieren();
    statistikAktualisieren();

    let marktScreen = document.getElementById("screen-markt");
    if (marktScreen && marktScreen.classList.contains("aktiv")) {
      if (typeof marktScreenAktualisieren === "function") marktScreenAktualisieren();
    }

    let auftraegeScreen = document.getElementById("screen-auftraege");
    if (auftraegeScreen && auftraegeScreen.classList.contains("aktiv")) {
      if (typeof auftraegeScreenAktualisieren === "function") auftraegeScreenAktualisieren();
    }

    let mineScreen = document.getElementById("screen-mine");
    if (mineScreen && mineScreen.classList.contains("aktiv") && window.aktivesMineId) {
      if (typeof mineScreenAktualisieren === "function") mineScreenAktualisieren(window.aktivesMineId);
    }

    // Hallenplan aktualisieren falls sichtbar
    if (window.aktivesGebaeudeId) {
      let hallenBereich = document.getElementById("hallenplan-bereich");
      let maschScreen   = document.getElementById("screen-maschinen");
      if (hallenBereich && hallenBereich.classList.contains("aktiv")) {
        if (typeof hallenplanAktualisieren === "function") hallenplanAktualisieren();
      }
      if (maschScreen && maschScreen.classList.contains("aktiv")) {
        if (typeof maschinenScreenAktualisieren === "function") maschinenScreenAktualisieren();
      }
    }

    spielstandSpeichern();

  }, INTERVALL);
}

function maschineProduzierenMitFeedback(maschine) {
  if (!maschine.laeuft) return [];

  let rezept = getrezept(maschine.aktivesRezept);
  if (!rezept) return [];

  for (let inp of rezept.inputs) {
    if (maschinenMaterialVerfuegbar(maschine, inp.material) < inp.menge) return [];
  }

  for (let inp of rezept.inputs) {
    maschinenMaterialEntnehmen(maschine, inp.material, inp.menge);
  }

  let ergebnis = [];   // ← "out" → "ergebnis" wegen Namenskonflikt

  for (let ausgang of rezept.outputs) {    // ← "out" → "ausgang"
    let bonus     = 1.0;
    let md        = MASCHINEN.find(function(m) { return m.id === maschine.id; });
    let upgBonus  = typeof upgradeProduktionsBonus === "function" && maschine.gebaeudeId
      ? upgradeProduktionsBonus(maschine.gebaeudeId) : 1.0;

    if (forschungsBonus.produktionMultiplikator > 1.0 && md && md.produktionslinie === "holz") {
      bonus = forschungsBonus.produktionMultiplikator;
    }

    let ausgabe = Math.round(ausgang.menge * bonus * upgBonus);
    setMaterial(ausgang.material, getMaterial(ausgang.material) + ausgabe);
    ergebnis.push({ material: ausgang.material, menge: ausgabe });
  }

  maschine.sessionProduktionen = (maschine.sessionProduktionen || 0) + 1;
  return ergebnis;
}

// Floating-Text Animation über dem Maschinen-Tile
function produktionsFeedbackZeigen(maschine, outputs) {
  let gi  = installierte_maschinen.indexOf(maschine);
  let key = window.aktivesGebaeudeId + "_" + gi;
  let pos = (typeof maschinenPositionen !== "undefined") ? maschinenPositionen[key] : null;
  if (!pos) return;

  let grid = document.getElementById("tile-grid-" + window.aktivesGebaeudeId);
  if (!grid) return;

  let tileSize = parseInt(getComputedStyle(document.documentElement)
    .getPropertyValue("--tile-size")) || 48;

  for (let i = 0; i < outputs.length; i++) {
    let out = outputs[i];
    let mat = MATERIALIEN.find(function(m) { return m.id === out.material; });
    if (!mat) continue;

    let el = document.createElement("div");
    el.className = "prod-feedback";
    el.textContent = "+" + out.menge + " " + mat.emoji;

    // Position relativ zum Grid berechnen
    let gridRect = grid.getBoundingClientRect();
    let tileX    = pos.x * (tileSize + 1) + tileSize / 2;
    let tileY    = pos.y * (tileSize + 1);

    el.style.cssText =
      "left:"  + tileX + "px;" +
      "top:"   + tileY + "px;" +
      "animation-delay:" + (i * 150) + "ms";

    grid.appendChild(el);

    // Nach Animation entfernen
    setTimeout(function() {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 1200 + i * 150);
  }
}