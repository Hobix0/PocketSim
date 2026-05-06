// ══════════════════════════════════
// STATE — Spielstand & Variablen
// ══════════════════════════════════

let geld = 100000;

// ── Unternehmen ──
let unternehmen = null; // null = noch nicht gegründet
let gekaufte_grundstuecke  = [];
let gekaufte_gebaeude      = {};
let installierte_maschinen = [];
let produktionLaeuft       = false;
let spielPausiert          = false;
let lager                  = {};
let gesamtkosten           = 0;
let mitarbeiter            = 0;

let erforschte_technologien = [];
let aktive_forschung        = null;
let forschungsBonus = {
  produktionMultiplikator:   1.0,
  kostenMultiplikator:       1.0,
  lohnMultiplikator:         1.0,
  personalReduktion:         0,
  freigeschaltete_maschinen: []
};

// Wirtschaft
let marktpreise = {};
let preisTrend  = {};
let autoVerkauf = {};

// Aufträge
let aktive_auftraege         = [];
let abgeschlossene_auftraege = 0;
let verfallene_auftraege     = 0;

// Spielmodus
let aktiverSpielModus = null;
let spielRundeGesamt  = 0;

// Ereignisse
let aktiveEreignisse   = [];
let ereignisGeschichte = [];

// Statistik
let statistikHistorie = [];

// Hallen-Upgrades
let gekaufte_hallen_upgrades = {};

// Förderbänder
let foerderband_verbindungen = {};

// Tile-Positionen
let maschinenPositionen = {};

// ── Hilfsfunktionen ──

function hatGrundstueck() {
  return gekaufte_grundstuecke.length > 0;
}

function hatGebaeude(gebaeudeId) {
  if (gebaeudeId) {
    for (let gsId in gekaufte_gebaeude) {
      if (gekaufte_gebaeude[gsId].includes(gebaeudeId)) return true;
    }
    return false;
  }
  for (let gsId in gekaufte_gebaeude) {
    if (gekaufte_gebaeude[gsId].length > 0) return true;
  }
  return false;
}

function lagerKapazitaet() {
  if (hatGebaeude("lagerhalle")) {
    let lagerGeb = GEBAEUDE.find(function(g) { return g.id === "lagerhalle"; });
    return lagerGeb ? lagerGeb.kapazitaetProMaterial : 1000;
  }
  return 100;
}

function gebaeudeVonGrundstueck(gsId) {
  return gekaufte_gebaeude[gsId] || [];
}

function grundstueckVonGebaeude(gebId) {
  for (let gsId in gekaufte_gebaeude) {
    if (gekaufte_gebaeude[gsId].includes(gebId)) return gsId;
  }
  return null;
}

function maschinenVonGebaeude(gebId) {
  return installierte_maschinen.filter(function(m) {
    return m.gebaeudeId === gebId;
  });
}

function spielPauseUmschalten() {
  spielPausiert = !spielPausiert;
  if (spielPausiert) {
    if (typeof window.produktionsPauseStart === "undefined") window.produktionsPauseStart = null;
    if (window.produktionsPauseStart === null) window.produktionsPauseStart = Date.now();
    if (typeof zeigeNotification === "function") zeigeNotification("⏸️ Spiel pausiert", "accent");
  } else {
    if (typeof window.produktionsPauseStart !== "undefined" && window.produktionsPauseStart !== null) {
      if (typeof window.rundenStart !== "undefined") {
        window.rundenStart += Date.now() - window.produktionsPauseStart;
      }
      window.produktionsPauseStart = null;
    }
    if (typeof zeigeNotification === "function") zeigeNotification("▶️ Spiel fortgesetzt", "green");
  }
  // Pause-Icon aktualisieren
  let pauseIcon = document.getElementById("pause-icon");
  let pauseBtn  = document.getElementById("btn-pause");
  if (pauseIcon) pauseIcon.textContent = spielPausiert ? "▶" : "⏸";
  if (pauseBtn)  pauseBtn.setAttribute("title", spielPausiert ? "Weiter" : "Pause");
  // rundenStatus in Header aktualisieren
  if (typeof rundenStatusAktualisieren === "function") rundenStatusAktualisieren();
  if (typeof hallenplanAktualisieren === "function" && window.aktivesGebaeudeId) {
    hallenplanAktualisieren(window.aktivesGebaeudeId);
  }
}

function erstesGrundstueck() {
  if (gekaufte_grundstuecke.length === 0) return null;
  return GRUNDSTUECKE.find(function(g) {
    return g.id === gekaufte_grundstuecke[0];
  });
}

// ── Speichern ──

function spielstandDatenErstellen() {
  return {
    geld:                     geld,
    unternehmen:              unternehmen,
    epoche_state: (typeof epocheZuStand === "function") ? epocheZuStand() : null,
    lkw_state: (typeof lkwZuStand === "function") ? lkwZuStand() : null,
    fabrik_verbindungen: (typeof fabrik_verbindungen !== "undefined") ? fabrik_verbindungen : [],
    gekaufte_grundstuecke:    gekaufte_grundstuecke,
    gekaufte_gebaeude:        gekaufte_gebaeude,
    lager:                    lager,
    mitarbeiter:              mitarbeiter,
    erforschte_technologien:  erforschte_technologien,
    aktive_forschung:         aktive_forschung,
    forschungsBonus:          forschungsBonus,
    autoVerkauf:              autoVerkauf,
    marktpreise:              marktpreise,
    aktive_auftraege:         aktive_auftraege,
    abgeschlossene_auftraege: abgeschlossene_auftraege,
    verfallene_auftraege:     verfallene_auftraege,
    aktiverSpielModus:        aktiverSpielModus,
    spielRundeGesamt:         spielRundeGesamt,
    aktiveEreignisse:         aktiveEreignisse,
    ereignisGeschichte:       ereignisGeschichte,
    statistikHistorie:        statistikHistorie,
    gekaufte_hallen_upgrades: gekaufte_hallen_upgrades,
    foerderband_verbindungen: foerderband_verbindungen,
    spielPausiert:            spielPausiert,
    maschinenPositionen:      maschinenPositionen,
    maschinen: installierte_maschinen.map(function(m) {
      return {
        id:            m.id,
        gebaeudeId:    m.gebaeudeId,
        aktivesRezept: m.aktivesRezept,
        laeuft:        m.laeuft
      };
    })
  };
}

function spielstandSpeichern() {
  let daten = spielstandDatenErstellen();
  localStorage.setItem("pocketsim", JSON.stringify(daten));
  localStorage.setItem("pocketsim_ts", Date.now().toString());
  if (typeof cloudSyncDebounced === "function") cloudSyncDebounced();
}

// Für wichtige Aktionen (Kauf, Spielmodus-Start etc.) sofort in Cloud
function spielstandSpeichernSofort() {
  let daten = spielstandDatenErstellen();
  localStorage.setItem("pocketsim", JSON.stringify(daten));
  localStorage.setItem("pocketsim_ts", Date.now().toString());
  if (typeof cloudSpeichernWichtig === "function") cloudSpeichernWichtig();
  else if (typeof cloudSyncDebounced === "function") cloudSyncDebounced();
}

// ── Laden ──

function spielstandLaden() {
  let gespeichert = localStorage.getItem("pocketsim");
  if (!gespeichert) return;

  let stand = JSON.parse(gespeichert);

  geld        = stand.geld        || 100000;
  mitarbeiter = stand.mitarbeiter || 0;

  // ── Unternehmen laden (Haupt-Bug-Fix) ──
  if (stand.unternehmen) {
    unternehmen = stand.unternehmen;
  }

  // ── Epochen-State laden ──
  if (stand.epoche_state && typeof epocheAusStand === "function") {
    epocheAusStand(stand.epoche_state);
  }
  if (stand.lkw_state && typeof lkwAusStand === "function") {
    lkwAusStand(stand.lkw_state);
  }
  if (stand.fabrik_verbindungen) {
    fabrik_verbindungen = stand.fabrik_verbindungen;
  }

  gekaufte_grundstuecke   = stand.gekaufte_grundstuecke   || [];
  erforschte_technologien = stand.erforschte_technologien || [];
  aktive_forschung        = stand.aktive_forschung        || null;
  aktiverSpielModus       = stand.aktiverSpielModus       || null;
  spielRundeGesamt        = stand.spielRundeGesamt        || 0;
  aktiveEreignisse        = stand.aktiveEreignisse        || [];
  ereignisGeschichte      = stand.ereignisGeschichte      || [];
  statistikHistorie       = stand.statistikHistorie       || [];
  gekaufte_hallen_upgrades = stand.gekaufte_hallen_upgrades || {};
  foerderband_verbindungen = stand.foerderband_verbindungen || {};

  if (stand.maschinenPositionen) maschinenPositionen = stand.maschinenPositionen;

  forschungsBonus = stand.forschungsBonus || {
    produktionMultiplikator:   1.0,
    kostenMultiplikator:       1.0,
    lohnMultiplikator:         1.0,
    personalReduktion:         0,
    freigeschaltete_maschinen: []
  };

  if (stand.autoVerkauf) autoVerkauf = stand.autoVerkauf;
  if (stand.marktpreise) marktpreise = stand.marktpreise;
  spielPausiert           = stand.spielPausiert || false;

  aktive_auftraege         = stand.aktive_auftraege         || [];
  abgeschlossene_auftraege = stand.abgeschlossene_auftraege || 0;
  verfallene_auftraege     = stand.verfallene_auftraege     || 0;

  if (Array.isArray(stand.gekaufte_gebaeude)) {
    gekaufte_gebaeude = {};
    if (gekaufte_grundstuecke.length > 0) {
      let migriert = stand.gekaufte_gebaeude.map(function(id) {
        if (id === "produktionshalle") return "leichthalle";
        if (id === "schmelzhuette")    return "schwerhalle";
        if (id === "metallhuette")     return "schwerhalle";
        return id;
      });
      gekaufte_gebaeude[gekaufte_grundstuecke[0]] = migriert.filter(function(id, idx, arr) {
        return arr.indexOf(id) === idx;
      });
    }
  } else {
    gekaufte_gebaeude = stand.gekaufte_gebaeude || {};
  }

  for (let gsId of gekaufte_grundstuecke) {
    if (!gekaufte_gebaeude[gsId]) gekaufte_gebaeude[gsId] = [];
  }

  if (stand.lager) {
    for (let key in stand.lager) {
      lager[key] = stand.lager[key];
    }
  }

  if (stand.maschinen) {
    for (let g of stand.maschinen) {
      let md = MASCHINEN.find(function(m) { return m.id === g.id; });
      if (!md) continue;

      let gebId = g.gebaeudeId;
      if (!gebId) {
        let passendesGeb = GEBAEUDE.find(function(geb) {
          return geb.typ === "fabrik" &&
                 hatGebaeude(geb.id) &&
                 (!md.hallenTyp || md.hallenTyp.includes(geb.hallenTyp));
        });
        gebId = passendesGeb ? passendesGeb.id : null;
      }

      installierte_maschinen.push({
        id:                  md.id,
        name:                md.name,
        emoji:               md.emoji,
        kosten:              md.kosten,
        groesse:             md.groesse,
        rezepte:             md.rezepte,
        kostenProRunde:      md.kostenProRunde,
        aktivesRezept:       g.aktivesRezept || md.aktivesRezept,
        laeuft:              g.laeuft !== undefined ? g.laeuft : true,
        gebaeudeId:          gebId,
        sessionProduktionen: 0
      });
    }
  }

  if (installierte_maschinen.length > 0) produktionLaeuft = true;
}

function spielstandLadenAusSlot(stand) {
  geld        = stand.geld        || 100000;
  mitarbeiter = stand.mitarbeiter || 0;

  // ── Unternehmen laden (Haupt-Bug-Fix) ──
  if (stand.unternehmen) {
    unternehmen = stand.unternehmen;
  }

  // ── Epochen-State laden ──
  if (stand.epoche_state && typeof epocheAusStand === "function") {
    epocheAusStand(stand.epoche_state);
  }
  if (stand.lkw_state && typeof lkwAusStand === "function") {
    lkwAusStand(stand.lkw_state);
  }
  if (stand.fabrik_verbindungen) {
    fabrik_verbindungen = stand.fabrik_verbindungen;
  }

  gekaufte_grundstuecke   = stand.gekaufte_grundstuecke   || [];
  erforschte_technologien = stand.erforschte_technologien || [];
  aktive_forschung        = stand.aktive_forschung        || null;
  aktiverSpielModus       = stand.aktiveSpielModus       || null;
  spielRundeGesamt        = stand.spielRundeGesamt        || 0;
  aktiveEreignisse        = stand.aktiveEreignisse        || [];
  ereignisGeschichte      = stand.ereignisGeschichte      || [];
  statistikHistorie       = stand.statistikHistorie       || [];
  gekaufte_hallen_upgrades = stand.gekaufte_hallen_upgrades || {};
  foerderband_verbindungen = stand.foerderband_verbindungen || {};

  if (stand.maschinenPositionen) maschinenPositionen = stand.maschinenPositionen;

  forschungsBonus = stand.forschungsBonus || {
    produktionMultiplikator:   1.0,
    kostenMultiplikator:       1.0,
    lohnMultiplikator:         1.0,
    personalReduktion:         0,
    freigeschaltete_maschinen: []
  };

  if (stand.autoVerkauf) autoVerkauf = stand.autoVerkauf;
  if (stand.marktpreise) marktpreise = stand.marktpreise;
  spielPausiert           = stand.spielPausiert || false;

  aktive_auftraege         = stand.aktive_auftraege         || [];
  abgeschlossene_auftraege = stand.abgeschlossene_auftraege || 0;
  verfallene_auftraege     = stand.verfallene_auftraege     || 0;

  if (Array.isArray(stand.gekaufte_gebaeude)) {
    gekaufte_gebaeude = {};
    if (gekaufte_grundstuecke.length > 0) {
      let migriert = stand.gekaufte_gebaeude.map(function(id) {
        if (id === "produktionshalle") return "leichthalle";
        if (id === "schmelzhuette")    return "schwerhalle";
        if (id === "metallhuette")     return "schwerhalle";
        return id;
      });
      gekaufte_gebaeude[gekaufte_grundstuecke[0]] = migriert.filter(function(id, idx, arr) {
        return arr.indexOf(id) === idx;
      });
    }
  } else {
    gekaufte_gebaeude = stand.gekaufte_gebaeude || {};
  }

  for (let gsId of gekaufte_grundstuecke) {
    if (!gekaufte_gebaeude[gsId]) gekaufte_gebaeude[gsId] = [];
  }

  if (stand.lager) {
    for (let key in stand.lager) {
      lager[key] = stand.lager[key];
    }
  }

  installierte_maschinen = [];
  if (stand.maschinen) {
    for (let g of stand.maschinen) {
      let md = MASCHINEN.find(function(m) { return m.id === g.id; });
      if (!md) continue;

      let gebId = g.gebaeudeId;
      if (!gebId) {
        let passendesGeb = GEBAEUDE.find(function(geb) {
          return geb.typ === "fabrik" &&
                 hatGebaeude(geb.id) &&
                 (!md.hallenTyp || md.hallenTyp.includes(geb.hallenTyp));
        });
        gebId = passendesGeb ? passendesGeb.id : null;
      }

      installierte_maschinen.push({
        id:                  md.id,
        name:                md.name,
        emoji:               md.emoji,
        kosten:              md.kosten,
        groesse:             md.groesse,
        rezepte:             md.rezepte,
        kostenProRunde:      md.kostenProRunde,
        aktivesRezept:       g.aktivesRezept || md.aktivesRezept,
        laeuft:              g.laeuft !== undefined ? g.laeuft : true,
        gebaeudeId:          gebId,
        sessionProduktionen: 0
      });
    }
  }

  if (installierte_maschinen.length > 0) produktionLaeuft = true;
}

function spielstandZuruecksetzen() {
  if (!confirm("⚠️ Wirklich komplett zurücksetzen?\n\nAlle Daten, dein Unternehmen und Fortschritt werden unwiderruflich gelöscht.")) return;

  // 1. LocalStorage komplett leeren
  localStorage.removeItem("pocketsim");
  localStorage.removeItem("pocketsim_ts");
  localStorage.removeItem("pocketsim_tutorial_done");

  // 2. Cloud-Spielstand löschen (Supabase)
  if (typeof supabaseClient !== "undefined" && supabaseClient && typeof aktuellerUser !== "undefined" && aktuellerUser) {
    supabaseClient
      .from("spielstand")
      .delete()
      .eq("user_id", aktuellerUser.id)
      .then(function() {
        console.log("[Reset] Cloud-Spielstand gelöscht");
      });
  }

  // 3. Alle globalen Variablen zurücksetzen
  geld        = 0;
  unternehmen = null;
  lager       = {};
  installierte_maschinen = [];
  gekaufte_grundstuecke  = [];
  gekaufte_gebaeude      = {};
  mitarbeiter            = 0;
  aktive_auftraege       = [];
  abgeschlossene_auftraege = 0;
  verfallene_auftraege   = 0;
  spielRundeGesamt       = 0;
  erforschte_technologien = [];
  aktive_forschung       = null;
  aktuelleEpoche         = 1;
  gekaufte_lkws          = [];
  lkw_statistik          = { lieferungen: 0, gesamtEinnahmen: 0 };
  epocheMeilensteine     = [];
  freigeschaltete_tiers  = [1, 2];
  autoVerkauf            = {};
  marktpreise            = {};

  // 4. Header zurücksetzen
  let h1 = document.querySelector("#header h1");
  if (h1) h1.innerHTML = "Pocket<span>Sim</span>";
  let sub = document.querySelector("#header .subtitle");
  if (sub) sub.textContent = "Produktionsimperium";

  // 5. Gründungsscreen + Tutorial starten
  setTimeout(function() {
    if (typeof gruendungZeigen === "function") gruendungZeigen();
  }, 100);
}
