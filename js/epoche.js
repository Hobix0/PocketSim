// ══════════════════════════════════
// EPOCHE — Progressionssystem
// Ersetzt stadtrat.js komplett
// ══════════════════════════════════

// ── Meilensteine Epoche 2 (Atomzeitalter) ──
const EPOCHE2_MEILENSTEINE = [
  {
    id: "e2_m1",
    titel: "Elektronik-Pionier",
    beschreibung: "Die nächste Stufe der Industrie beginnt mit Elektronik. Baue deine erste Elektronikfabrik und produziere die neuen Bauteile.",
    ziele: [
      { material: "elektronikmodul", menge: 10, text: "10 Elektronikmodule bauen" },
      { material: "titanlegierung",  menge: 8,  text: "8 Titanlegierungen fertigen" }
    ],
    belohnung_geld: 80000,
    belohnung_text: "Willkommen im Atomzeitalter. Dein Unternehmen ist jetzt ein echter Hightech-Konzern.",
    freischaltet_tier: 5,
    epoche: 2
  },
  {
    id: "e2_m2",
    titel: "Kernkraft-Projekt",
    beschreibung: "Energie ist das Fundament jeder Großindustrie. Bau ein Kernkraftwerk und erzeuge saubere Energie für dein Imperium.",
    ziele: [
      { material: "reaktorkern",      menge: 1,  text: "1 Reaktorkern fertigen" },
      { material: "steuerungscomputer",menge: 2, text: "2 Steuerungscomputer bauen" }
    ],
    belohnung_geld: 150000,
    belohnung_text: "Kernkraft läuft! Dein Energiebedarf ist für Jahrzehnte gedeckt.",
    freischaltet_tier: null,
    epoche: 2
  },
  {
    id: "e2_m3",
    titel: "Hochleistungs-Export",
    beschreibung: "Der internationale Markt wartet auf deine Technologie. Liefere Hochleistungsmotoren an internationale Kunden.",
    ziele: [
      { material: "hochleistungsmotor", menge: 3, text: "3 Hochleistungsmotoren bauen" },
      { material: "antriebseinheit",    menge: 10, text: "10 Antriebseinheiten fertigen" }
    ],
    belohnung_geld: 250000,
    belohnung_text: "Du bist jetzt ein internationaler Technologielieferant. Epoche 3 (Raumzeitalter) wartet!",
    freischaltet_tier: null,
    freischaltet_epoche: 3,
    epoche: 2
  }
];

let EPOCHEN_DATEN = [];
let aktuelleEpoche = 1;
let epocheMeilensteine = [];   // abgeschlossene Meilenstein-IDs
let freigeschaltete_tiers = [1, 2]; // Epoche 1: Tier 1+2 sichtbar, Tier 3 als Vorschau

// ── Meilensteine Epoche 1 ──
const EPOCHE1_MEILENSTEINE = [
  {
    id: "e1_m1",
    titel: "Erste Produktion",
    beschreibung: "Deine Fabrik läuft. Die ersten Eisenplatten verlassen den Schmelzofen.",
    ziele: [
      { material: "eisenplatte", menge: 20, text: "20 Eisenplatten produzieren" }
    ],
    belohnung_geld: 8000,
    belohnung_text: "Erster Beweis dass dein Unternehmen funktioniert.",
    freischaltet_tier: null,
    epoche: 1
  },
  {
    id: "e1_m2",
    titel: "Grundversorgung",
    beschreibung: "Stahl und Plastik — die Basis jeder modernen Produktion.",
    ziele: [
      { material: "stahl",   menge: 15, text: "15 Stahl erzeugen" },
      { material: "plastik", menge: 10, text: "10 Plastik raffinieren" }
    ],
    belohnung_geld: 18000,
    belohnung_text: "Du hast Zugang zu Tier 3 Bauteilen freigeschaltet.",
    freischaltet_tier: 3,
    epoche: 1
  },
  {
    id: "e1_m3",
    titel: "Erste Bauteile",
    beschreibung: "Zahnräder und Kabel — die Komponenten die alles antreiben.",
    ziele: [
      { material: "zahnrad",     menge: 10, text: "10 Zahnräder fertigen" },
      { material: "kupferkabel", menge: 15, text: "15 Kupferkabel produzieren" }
    ],
    belohnung_geld: 30000,
    belohnung_text: "Dein Unternehmen wird regional bekannt. Neue Aufträge fließen ein.",
    freischaltet_tier: null,
    epoche: 1
  },
  {
    id: "e1_m4",
    titel: "Industriekonzern",
    beschreibung: "Ein vollständiger Elektromotor — das Herzstück jeder Maschine.",
    ziele: [
      { material: "motor_klein",  menge: 3,  text: "3 Elektromotoren bauen" },
      { material: "schaltkreis",  menge: 5,  text: "5 Schaltkreise löten" },
      { material: "betonplatte",  menge: 10, text: "10 Betonplatten gießen" }
    ],
    belohnung_geld: 80000,
    belohnung_text: "Epoche 1 abgeschlossen! Das Atomzeitalter steht bevor.",
    freischaltet_tier: null,
    freischaltet_epoche: 2,
    epoche: 1
  }
];

// ── Init ──
function epocheInit() {
  // Aus Spielstand laden falls vorhanden
  if (window.unternehmen && unternehmen.epoche) {
    aktuelleEpoche = unternehmen.epoche || 1;
  }

  // Meilensteine aus State laden
  if (window.unternehmen && unternehmen.epocheMeilensteine) {
    epocheMeilensteine = unternehmen.epocheMeilensteine;
  }

  // Freigeschaltete Tiers aus State laden
  if (window.unternehmen && unternehmen.freigeschaltete_tiers) {
    freigeschaltete_tiers = unternehmen.freigeschaltete_tiers;
  }

  epocheHeaderChipAktualisieren();
  epocheBannerAktualisieren();
  console.log("[Epoche] Epoche " + aktuelleEpoche + " aktiv, Tiers: " + freigeschaltete_tiers.join(","));
}

// ── Jede Runde prüfen ──
function stadtratFortschrittPruefen() {
  epocheFortschrittPruefen();
}

function epocheFortschrittPruefen() {
  let meilensteine = aktuelleEpoche === 1 ? EPOCHE1_MEILENSTEINE :
                     aktuelleEpoche === 2 ? EPOCHE2_MEILENSTEINE : [];
  let aktueller = meilensteine.find(function(m) {
    return !epocheMeilensteine.includes(m.id);
  });
  if (!aktueller) return;

  // Fortschritt aktualisieren (kein Auto-Abschluss)
  epocheHeaderChipAktualisieren();
  epocheBannerAktualisieren();
}

// ── Manuell liefern (Satisfactory-Style) ──
function stadtratManuellLiefern() {
  epocheManuellLiefern();
}

function epocheManuellLiefern() {
  let meilensteine = aktuelleEpoche === 1 ? EPOCHE1_MEILENSTEINE :
                     aktuelleEpoche === 2 ? EPOCHE2_MEILENSTEINE : [];
  let aktueller = meilensteine.find(function(m) {
    return !epocheMeilensteine.includes(m.id);
  });
  if (!aktueller) return;

  // Ziele prüfen
  for (let z of aktueller.ziele) {
    if ((lager[z.material] || 0) < z.menge) return;
  }

  // Materialien abziehen
  for (let z of aktueller.ziele) {
    lager[z.material] = Math.max(0, (lager[z.material] || 0) - z.menge);
  }

  // Belohnung
  geld += aktueller.belohnung_geld;
  epocheMeilensteine.push(aktueller.id);

  // Tier freischalten
  if (aktueller.freischaltet_tier) {
    if (!freigeschaltete_tiers.includes(aktueller.freischaltet_tier)) {
      freigeschaltete_tiers.push(aktueller.freischaltet_tier);
    }
  }

  // Epoche voranbringen
  if (aktueller.freischaltet_epoche) {
    aktuelleEpoche = aktueller.freischaltet_epoche;
    if (window.unternehmen) unternehmen.epoche = aktuelleEpoche;
  }

  // In State sichern
  if (window.unternehmen) {
    unternehmen.epocheMeilensteine    = epocheMeilensteine;
    unternehmen.freigeschaltete_tiers = freigeschaltete_tiers;
  }

  geldAnzeigenAktualisieren();
  lagerAnzeigenAktualisieren();
  spielstandSpeichernSofort();
  epocheFanfareZeigen(aktueller);
  epocheHeaderChipAktualisieren();
  epocheBannerAktualisieren();
}

// ── Header Chip ──
function epocheHeaderChipAktualisieren() {
  // Nutzt dieselbe DOM-Struktur wie stadtrat
  let chip     = document.getElementById("stadtrat-header-chip");
  let chipEmoji= document.getElementById("sr-chip-emoji");
  let chipTitel= document.getElementById("sr-chip-titel");
  let chipFill = document.getElementById("sr-chip-fill");
  let chipProz = document.getElementById("sr-chip-prozent");
  if (!chip) return;

  let meilensteine = aktuelleEpoche === 1 ? EPOCHE1_MEILENSTEINE :
                     aktuelleEpoche === 2 ? EPOCHE2_MEILENSTEINE : [];
  let aktueller = meilensteine.find(function(m) {
    return !epocheMeilensteine.includes(m.id);
  });

  if (!aktueller) {
    chip.style.display = "flex";
    if (chipEmoji) chipEmoji.textContent = "🏆";
    if (chipTitel) chipTitel.textContent = "Epoche " + aktuelleEpoche;
    if (chipFill)  chipFill.style.width  = "100%";
    if (chipProz)  chipProz.textContent  = "✓";
    return;
  }

  let gesamtHaben = 0, gesamtNötig = 0, alleErfüllt = true;
  for (let z of aktueller.ziele) {
    gesamtHaben += Math.min(lager[z.material] || 0, z.menge);
    gesamtNötig += z.menge;
    if ((lager[z.material] || 0) < z.menge) alleErfüllt = false;
  }
  let pct = gesamtNötig > 0 ? Math.round((gesamtHaben / gesamtNötig) * 100) : 0;

  chip.style.display = "flex";
  chip.classList.toggle("sr-chip-bereit", alleErfüllt);
  if (chipEmoji) chipEmoji.textContent = "⚙️";
  if (chipTitel) chipTitel.textContent = aktueller.titel;
  if (chipFill) {
    chipFill.style.width = pct + "%";
    chipFill.style.background = alleErfüllt ? "var(--green)" : pct >= 50 ? "var(--amber)" : "var(--cyan)";
    chipFill.style.boxShadow = alleErfüllt ? "0 0 8px var(--green)" : "none";
  }
  if (chipProz) {
    chipProz.textContent = alleErfüllt ? "✓" : pct + "%";
    chipProz.style.color = alleErfüllt ? "var(--green)" : "var(--text2)";
  }
}

// Alias
function stadtratHeaderChipAktualisieren() { epocheHeaderChipAktualisieren(); }

// ── Banner ──
function epocheBannerAktualisieren() {
  let banner = document.getElementById("stadtrat-banner");
  if (!banner) return;

  let meilensteine = aktuelleEpoche === 1 ? EPOCHE1_MEILENSTEINE :
                     aktuelleEpoche === 2 ? EPOCHE2_MEILENSTEINE : [];
  let aktueller = meilensteine.find(function(m) {
    return !epocheMeilensteine.includes(m.id);
  });

  if (!aktueller) {
    banner.innerHTML = "<div class='sr-fertig'>🏆 <div><div style='font-family:var(--font-head);font-size:15px;font-weight:800'>Epoche " + aktuelleEpoche + " abgeschlossen!</div></div></div>";
    return;
  }

  let aktIdx = meilensteine.indexOf(aktueller) + 1;
  let alleErfüllt = aktueller.ziele.every(function(z) { return (lager[z.material]||0) >= z.menge; });

  let dotsHTML = meilensteine.map(function(m, i) {
    let done = epocheMeilensteine.includes(m.id);
    let ist  = m.id === aktueller.id;
    return "<div class='sr-dot " + (done?"sr-dot-done":ist?"sr-dot-aktiv":"sr-dot-locked") + "' title='" + m.titel + "'>" + (done?"✓":(i+1)) + "</div>";
  }).join("");

  let zieleHTML = aktueller.ziele.map(function(z) {
    let haben  = lager[z.material] || 0;
    let fertig = haben >= z.menge;
    let pct    = Math.min(100, Math.round((haben/z.menge)*100));
    let mat    = MATERIALIEN.find(function(m) { return m.id === z.material; });
    let fill   = fertig ? "var(--green)" : pct>=50 ? "var(--amber)" : "var(--cyan)";
    return "<div class='sr-ziel-karte" + (fertig?" sr-ziel-fertig":"") + "'>" +
      "<div class='sr-zk-top'><span class='sr-zk-emoji'>" + (mat?mat.emoji:"📦") + "</span>" +
      "<span class='sr-zk-name'>" + (mat?mat.name:z.material) + "</span>" +
      (fertig?"<span class='sr-zk-check'>✓</span>":"") + "</div>" +
      "<div class='sr-zk-balken'><div style='height:100%;border-radius:2px;width:"+pct+"%;background:"+fill+";transition:width .5s'></div></div>" +
      "<div class='sr-zk-stand'><span style='font-family:var(--font-mono);color:"+(fertig?"var(--green)":"var(--text)")+";font-weight:700'>"+haben.toLocaleString("de-DE")+"</span><span style='color:var(--text3);font-size:11px'> / "+z.menge+"</span></div>" +
    "</div>";
  }).join("");

  banner.innerHTML =
    "<div class='sr-banner-haupt'>" +
      "<div class='sr-banner-kopf'>" +
        "<div class='sr-banner-links'>" +
          "<span class='sr-akt-badge'>Epoche " + aktuelleEpoche + "</span>" +
          "<span class='sr-banner-emoji'>⚙️</span>" +
          "<div><div class='sr-banner-name'>" + aktueller.titel + "</div>" +
          "<div class='sr-banner-sub'>" + aktueller.beschreibung + "</div></div>" +
        "</div>" +
        "<div class='sr-dots'>" + dotsHTML + "</div>" +
      "</div>" +
      "<div class='sr-ziele-grid'>" + zieleHTML + "</div>" +
      (alleErfüllt
        ? "<button class='sr-btn-liefern sr-btn-bereit' onclick='epocheManuellLiefern()'>▶ Meilenstein abschließen — +" + aktueller.belohnung_geld.toLocaleString("de-DE") + " €</button>"
        : "<button class='sr-btn-liefern sr-btn-warten' disabled>⏳ Ziele noch nicht erfüllt</button>") +
    "</div>";
}

// Alias für alte Aufrufe
function stadtratBannerAktualisieren() { epocheBannerAktualisieren(); }
function stadtratAllesAktualisieren()  { epocheHeaderChipAktualisieren(); epocheBannerAktualisieren(); }
function stadtratDetailOeffnen()       {
  if (typeof tabWechseln === "function") tabWechseln("uebersicht");
  setTimeout(function() {
    let b = document.getElementById("stadtrat-banner");
    if (b) b.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 100);
}

// ── Fanfare ──
function epocheFanfareZeigen(meilenstein) {
  let naechster = EPOCHE1_MEILENSTEINE.find(function(m) {
    return !epocheMeilensteine.includes(m.id);
  });

  let modal = document.getElementById("modal-stadtrat");
  if (!modal) { modal = document.createElement("div"); modal.id = "modal-stadtrat"; document.body.appendChild(modal); }

  let nextHTML = naechster
    ? "<div class='sr-fanfare-naechster'><div style='font-family:var(--font-head);font-size:9px;letter-spacing:3px;color:var(--text3);text-transform:uppercase;margin-bottom:6px'>Nächstes Ziel</div>" +
      "<div style='background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:10px'>" +
      "<span style='font-size:20px'>⚙️</span>" +
      "<div><div style='font-family:var(--font-head);font-size:14px;font-weight:700'>" + naechster.titel + "</div>" +
      "<div style='font-size:11px;color:var(--text3);margin-top:2px'>" +
        naechster.ziele.map(function(z) {
          let m = MATERIALIEN.find(function(m){return m.id===z.material;});
          return (m?m.emoji:"")+" "+z.menge+"× "+(m?m.name:z.material);
        }).join(" · ") +
      "</div></div></div></div>"
    : "<div style='text-align:center;color:var(--green);font-family:var(--font-head);padding:10px;font-size:13px'>🏆 Alle Meilensteine von Epoche 1 geschafft!</div>";

  modal.innerHTML =
    "<div class='sr-fanfare-overlay'>" +
      "<div class='sr-fanfare-box'>" +
        "<div class='sr-fanfare-konfetti'>🎉</div>" +
        "<div class='sr-fanfare-akt'>Meilenstein abgeschlossen</div>" +
        "<h2 class='sr-fanfare-titel'>" + meilenstein.titel + "</h2>" +
        "<p class='sr-fanfare-text'>" + meilenstein.belohnung_text + "</p>" +
        "<div class='sr-fanfare-reward'>" +
          "<span class='sr-fanfare-reward-zahl'>+" + meilenstein.belohnung_geld.toLocaleString("de-DE") + " €</span>" +
          "<span class='sr-fanfare-reward-label'>Belohnung</span>" +
        "</div>" +
        nextHTML +
        "<button class='sr-fanfare-weiter' onclick='document.getElementById(\"modal-stadtrat\").style.display=\"none\"'>Weiter →</button>" +
      "</div>" +
    "</div>";
  modal.style.display = "flex";
}

// ── Tier-Sichtbarkeit ──
function materialIstSichtbar(material) {
  if (!material.tier) return true;
  let max = Math.max.apply(null, freigeschaltete_tiers);
  return material.tier <= max + 1; // aktueller Max + 1 als Vorschau
}

// ── State Integration ──
function epocheZuStand() {
  return {
    aktuelleEpoche:       aktuelleEpoche,
    epocheMeilensteine:   epocheMeilensteine,
    freigeschaltete_tiers: freigeschaltete_tiers
  };
}

function epocheAusStand(stand) {
  if (!stand) return;
  aktuelleEpoche         = stand.aktuelleEpoche       || 1;
  epocheMeilensteine     = stand.epocheMeilensteine   || [];
  freigeschaltete_tiers  = stand.freigeschaltete_tiers|| [1,2];
}


// ── Großes Epochen-Übergangs-Modal ──
function zeigeEpocheUebergang(neueEpoche) {
  let epocheNamen = {
    2: "Atomzeitalter",
    3: "Raumzeitalter",
    4: "Kolonialzeitalter",
    5: "Galaktisches Zeitalter"
  };
  let epocheEmojis = { 2: "⚛️", 3: "🚀", 4: "🌍", 5: "🌌" };
  let epocheTexte = {
    2: "Kernkraft, Elektronik, Massenproduktion. Die Welt wird kleiner — dein Unternehmen größer.",
    3: "Die Grenzen der Erde sind nicht mehr deine Grenzen. Der erste Raumhafen wartet.",
    4: "Ein Planet reicht dir nicht. Kolonien auf fremden Welten erweitern dein Imperium.",
    5: "Das Sonnensystem ist deins. Die Galaxis — der nächste Schritt."
  };

  let modal = document.getElementById("modal-stadtrat");
  if (!modal) { modal = document.createElement("div"); modal.id = "modal-stadtrat"; document.body.appendChild(modal); }

  modal.innerHTML =
    "<div class='sr-fanfare-overlay'>" +
      "<div class='sr-fanfare-box' style='border-top-color:var(--cyan)'>" +
        "<div style='font-size:60px;text-align:center;margin-bottom:10px'>" + (epocheEmojis[neueEpoche] || "⭐") + "</div>" +
        "<div style='font-family:var(--font-head);font-size:10px;letter-spacing:3px;text-transform:uppercase;color:var(--cyan);text-align:center'>Neue Epoche freigeschaltet</div>" +
        "<h2 class='sr-fanfare-titel' style='color:var(--cyan)'>Epoche " + neueEpoche + " — " + (epocheNamen[neueEpoche] || "Neue Ära") + "</h2>" +
        "<p class='sr-fanfare-text'>" + (epocheTexte[neueEpoche] || "") + "</p>" +
        "<div class='sr-fanfare-reward' style='background:rgba(6,182,212,0.1);border-color:rgba(6,182,212,0.3)'>" +
          "<span class='sr-fanfare-reward-zahl' style='color:var(--cyan)'>Tier " + (neueEpoche*2) + " + " + (neueEpoche*2+1) + " freigeschaltet</span>" +
          "<span class='sr-fanfare-reward-label'>Neue Materialien & Maschinen verfügbar</span>" +
        "</div>" +
        "<button class='sr-fanfare-weiter' onclick='document.getElementById("modal-stadtrat").style.display="none"'>Weiter erforschen →</button>" +
      "</div>" +
    "</div>";
  modal.style.display = "flex";
}
