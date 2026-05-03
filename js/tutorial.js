// ══════════════════════════════════
// TUTORIAL — Schritt-für-Schritt
// Spotlight + Tooltip System
// ══════════════════════════════════

let tutorialAktiv   = false;
let tutorialSchritt = 0;
let tutorialTimer   = null;

// ══════════════════════════════════
// SCHRITTE
// ══════════════════════════════════

const TUTORIAL_SCHRITTE = [
  {
    id: "willkommen",
    titel: "Willkommen in deiner Fabrik",
    text: "Das ist deine Übersicht — dein Cockpit. Hier siehst du was läuft, was fehlt, was als nächstes zu tun ist. Lass uns deine erste Fabrik aufbauen.",
    ziel: null,
    position: "mitte",
    weiter: "manuell",
    aktion: null,
    pfeil: false
  },
  {
    id: "shop_oeffnen",
    titel: "Schritt 1 — Grundstück kaufen",
    text: "Ohne Grundstück keine Fabrik. Öffne den Shop und kaufe dein erstes Gelände. Es ist kostenlos zum Start.",
    ziel: "[data-screen='shop']",
    position: "rechts",
    weiter: "screen:shop",
    aktion: function() { tutorialScreenWechseln("shop"); },
    pfeil: true
  },
  {
    id: "grundstueck_kaufen",
    titel: "Grundstück auswählen",
    text: "Scrolle zum Abschnitt 'Grundstücke' und kaufe das Industriegelände Aethon-Süd. Es kostet 0 € — dein Startgelände.",
    ziel: "#shop-inhalt",
    position: "rechts",
    weiter: "zustand:grundstueck",
    aktion: null,
    pfeil: false,
    check: function() { return gekaufte_grundstuecke && gekaufte_grundstuecke.length > 0; }
  },
  {
    id: "gebaeude_kaufen",
    titel: "Schritt 2 — Fabrikhalle bauen",
    text: "Gut! Jetzt brauchst du eine Halle. Kaufe eine Kleine Fabrikhalle (8.000 €). Sie ist die Heimat deiner ersten Maschinen.",
    ziel: "#shop-inhalt",
    position: "rechts",
    weiter: "zustand:gebaeude",
    aktion: null,
    pfeil: false,
    check: function() {
      return gekaufte_gebaeude && Object.keys(gekaufte_gebaeude).some(function(id) {
        return id.includes("fabrik") || id.includes("halle");
      });
    }
  },
  {
    id: "maschine_kaufen",
    titel: "Schritt 3 — Erste Maschine",
    text: "Eine leere Halle produziert nichts. Kaufe einen Schmelzofen (3.500 €). Er verwandelt Eisenerz in Eisenplatten.",
    ziel: "#shop-inhalt",
    position: "rechts",
    weiter: "zustand:maschine",
    aktion: null,
    pfeil: false,
    check: function() {
      return installierte_maschinen && installierte_maschinen.length > 0;
    }
  },
  {
    id: "rohstoff_kaufen",
    titel: "Schritt 4 — Rohstoffe beschaffen",
    text: "Der Schmelzofen braucht Eisenerz und Kohle. Im Shop unter 'Materialien kaufen' kannst du Rohstoffe direkt bestellen.",
    ziel: "#shop-inhalt",
    position: "rechts",
    weiter: "zustand:rohstoffe",
    aktion: null,
    pfeil: false,
    check: function() {
      return (lager["eisenerz"] || 0) >= 5 && (lager["kohle"] || 0) >= 2;
    }
  },
  {
    id: "produktion_starten",
    titel: "Schritt 5 — Produktion starten",
    text: "Geh zur Übersicht und starte deinen Schmelzofen. Klicke auf die Maschine → 'Starten'. Dann läuft sie automatisch.",
    ziel: "[data-screen='uebersicht']",
    position: "rechts",
    weiter: "zustand:produktion",
    aktion: function() { tutorialScreenWechseln("uebersicht"); },
    pfeil: true,
    check: function() {
      return installierte_maschinen && installierte_maschinen.some(function(m) { return m.laeuft; });
    }
  },
  {
    id: "lager_checken",
    titel: "Schritt 6 — Lager beobachten",
    text: "Deine ersten Eisenplatten entstehen! Öffne das Lager und warte bis mindestens 5 Eisenplatten vorhanden sind.",
    ziel: "[data-screen='lager']",
    position: "rechts",
    weiter: "zustand:lager",
    aktion: function() { tutorialScreenWechseln("lager"); },
    pfeil: true,
    check: function() { return (lager["eisenplatte"] || 0) >= 5; }
  },
  {
    id: "auftrag_checken",
    titel: "Schritt 7 — Erster Auftrag",
    text: "Schau dir die Aufträge an. Dort warten Kunden auf deine Produkte. Erfülle deinen ersten Auftrag und kassiere den Bonus.",
    ziel: "[data-screen='auftraege']",
    position: "rechts",
    weiter: "manuell",
    aktion: function() { tutorialScreenWechseln("auftraege"); },
    pfeil: true
  },
  {
    id: "abschluss",
    titel: "Du weißt wie es geht 🎉",
    text: "Produktion läuft, Lager füllt sich, Aufträge kommen rein. Jetzt liegt es an dir wie groß dein Unternehmen wird. Mehr Maschinen, neue Materialien, neue Epoche — der Weg ist offen.",
    ziel: null,
    position: "mitte",
    weiter: "manuell",
    aktion: null,
    pfeil: false,
    abschluss: true
  }
];

// ══════════════════════════════════
// START / STOP
// ══════════════════════════════════

function tutorialStarten() {
  // Nicht starten wenn schon abgeschlossen
  if (localStorage.getItem("pocketsim_tutorial_done") === "1") return;

  tutorialAktiv   = true;
  tutorialSchritt = 0;
  tutorialRendern();

  // Auto-Check alle 2 Sekunden
  tutorialTimer = setInterval(tutorialAutoCheck, 2000);
}

function tutorialSkippen() {
  tutorialBeenden(true);
}

function tutorialBeenden(skip) {
  tutorialAktiv = false;
  clearInterval(tutorialTimer);
  tutorialTimer = null;

  // Overlay entfernen
  let overlay = document.getElementById("tutorial-overlay");
  let tooltip  = document.getElementById("tutorial-tooltip");
  if (overlay) overlay.style.display = "none";
  if (tooltip) tooltip.style.display = "none";

  // Spotlight entfernen
  document.querySelectorAll(".tutorial-highlight").forEach(function(el) {
    el.classList.remove("tutorial-highlight");
  });
  document.body.classList.remove("tutorial-aktiv");

  if (!skip) {
    localStorage.setItem("pocketsim_tutorial_done", "1");
  }
}

// ══════════════════════════════════
// RENDERN
// ══════════════════════════════════

function tutorialRendern() {
  if (!tutorialAktiv) return;

  let schritt = TUTORIAL_SCHRITTE[tutorialSchritt];
  if (!schritt) { tutorialBeenden(false); return; }

  // Overlay
  let overlay = document.getElementById("tutorial-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "tutorial-overlay";
    document.body.appendChild(overlay);
  }
  overlay.style.display = "block";
  document.body.classList.add("tutorial-aktiv");

  // Spotlight: altes entfernen
  document.querySelectorAll(".tutorial-highlight").forEach(function(el) {
    el.classList.remove("tutorial-highlight");
  });

  // Ziel-Element highlighten
  let zielEl = schritt.ziel ? document.querySelector(schritt.ziel) : null;
  if (zielEl) zielEl.classList.add("tutorial-highlight");

  // Tooltip positionieren
  tutorialTooltipRendern(schritt, zielEl);
}

function tutorialTooltipRendern(schritt, zielEl) {
  let tooltip = document.getElementById("tutorial-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "tutorial-tooltip";
    document.body.appendChild(tooltip);
  }

  let fortHTML = TUTORIAL_SCHRITTE.map(function(s, i) {
    return "<div class='tut-dot" + (i < tutorialSchritt ? " done" : i === tutorialSchritt ? " aktiv" : "") + "'></div>";
  }).join("");

  let istLetzter = schritt.abschluss;
  let btnText    = istLetzter ? "🚀 Los geht's!" : "Weiter →";
  let btnDisabled = schritt.weiter !== "manuell" && !istLetzter && !schritt.check ? "" : "";

  tooltip.innerHTML =
    "<div class='tut-header'>" +
      "<div class='tut-schritt-num'>Schritt " + (tutorialSchritt + 1) + " / " + TUTORIAL_SCHRITTE.length + "</div>" +
      "<button class='tut-skip' onclick='tutorialSkippen()'>Tutorial überspringen</button>" +
    "</div>" +
    "<div class='tut-dots'>" + fortHTML + "</div>" +
    "<div class='tut-titel'>" + schritt.titel + "</div>" +
    "<p class='tut-text'>" + schritt.text + "</p>" +
    (schritt.pfeil && zielEl ? "<div class='tut-pfeil'>👆 Klick oben</div>" : "") +
    "<div class='tut-footer'>" +
      (schritt.weiter === "manuell" || istLetzter
        ? "<button class='tut-btn-weiter' onclick='tutorialWeiter()'>" + btnText + "</button>"
        : "<div class='tut-auto-hint'>⏳ Warte auf Aktion...</div>") +
    "</div>";

  // Tooltip positionieren
  tooltip.style.display = "block";
  tooltip.className = "tut-" + schritt.position;

  if (schritt.position === "mitte") {
    tooltip.style.left   = "50%";
    tooltip.style.top    = "50%";
    tooltip.style.transform = "translate(-50%, -50%)";
    tooltip.style.right  = "auto";
    tooltip.style.bottom = "auto";
  } else if (zielEl && schritt.position === "rechts") {
    let rect = zielEl.getBoundingClientRect();
    let tooltipH = 220;
    let top = Math.min(rect.top, window.innerHeight - tooltipH - 20);
    tooltip.style.left      = "auto";
    tooltip.style.right     = "12px";
    tooltip.style.top       = Math.max(80, top) + "px";
    tooltip.style.transform = "none";
    tooltip.style.bottom    = "auto";
  } else {
    // Fallback: unten rechts
    tooltip.style.left      = "auto";
    tooltip.style.right     = "12px";
    tooltip.style.bottom    = "80px";
    tooltip.style.top       = "auto";
    tooltip.style.transform = "none";
  }
}

// ══════════════════════════════════
// NAVIGATION
// ══════════════════════════════════

function tutorialWeiter() {
  if (tutorialSchritt >= TUTORIAL_SCHRITTE.length - 1) {
    tutorialBeenden(false);
    return;
  }
  let schritt = TUTORIAL_SCHRITTE[tutorialSchritt];
  // Aktion ausführen wenn vorhanden
  if (schritt.aktion) schritt.aktion();
  tutorialSchritt++;
  tutorialRendern();
}

function tutorialAutoCheck() {
  if (!tutorialAktiv) return;
  let schritt = TUTORIAL_SCHRITTE[tutorialSchritt];
  if (!schritt || schritt.weiter === "manuell") return;

  // Screen-basierter Übergang
  if (schritt.weiter.startsWith("screen:")) {
    let screen = schritt.weiter.split(":")[1];
    let aktiv  = document.getElementById("screen-" + screen);
    if (aktiv && aktiv.classList.contains("aktiv")) {
      tutorialSchritt++;
      tutorialRendern();
    }
    return;
  }

  // Zustand-basierter Übergang
  if (schritt.weiter.startsWith("zustand:") && schritt.check) {
    if (schritt.check()) {
      // Kurze Verzögerung damit der Spieler den Erfolg sieht
      setTimeout(function() {
        if (tutorialAktiv) {
          tutorialSchritt++;
          tutorialRendern();
        }
      }, 800);
    }
  }
}

function tutorialScreenWechseln(screen) {
  // Screen-Wechsel über bestehende Navigation
  let btn = document.querySelector("[data-screen='" + screen + "']");
  if (btn) btn.click();
}

// ══════════════════════════════════
// INTEGRATION
// ══════════════════════════════════

// Wird nach Gründung aufgerufen
function tutorialNachGruendungStarten() {
  setTimeout(tutorialStarten, 1500);
}

// Reset für Tests
function tutorialReset() {
  localStorage.removeItem("pocketsim_tutorial_done");
  tutorialSchritt = 0;
}
