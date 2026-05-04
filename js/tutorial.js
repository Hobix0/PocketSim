// ══════════════════════════════════
// TUTORIAL — Komplett neu
// Ansatz: Kein Overlay, kein Tooltip
// Stattdessen: In-Screen Hinweis-Banner
// der jeweils den nächsten Schritt zeigt
// + Spotlight Box auf Ziel-Element
// ══════════════════════════════════

let tutorialAktiv   = false;
let tutorialSchritt = 0;
let tutorialTimer   = null;

// ══════════════════════════════════
// SCHRITTE DEFINITION
// ══════════════════════════════════

const TUTORIAL_SCHRITTE = [
  {
    id:       "grundstueck",
    screen:   "shop",
    titel:    "Grundstück kaufen",
    icon:     "🏭",
    text:     "Geh in den Shop und kaufe dein erstes Gelände. Es ist kostenlos.",
    ziel:     "[data-screen='shop']",
    check:    function() { return gekaufte_grundstuecke && gekaufte_grundstuecke.length > 0; },
    aktion:   "shop",
    pfeil:    "Shop → Grundstücke → Kaufen"
  },
  {
    id:       "gebaeude",
    screen:   "shop",
    titel:    "Fabrikhalle bauen",
    icon:     "🏗️",
    text:     "Jetzt brauchst du eine Halle für deine Maschinen. Kaufe eine Kleine Fabrikhalle (8.000 €).",
    ziel:     null,
    check:    function() {
      if (!gekaufte_gebaeude) return false;
      return Object.values(gekaufte_gebaeude).some(function(arr) {
        return arr && arr.some(function(id) { return id.includes("fabrik"); });
      });
    },
    aktion:   "shop",
    pfeil:    "Shop → Gebäude → Kleine Fabrikhalle"
  },
  {
    id:       "maschine",
    screen:   "shop",
    titel:    "Schmelzofen kaufen",
    icon:     "🔥",
    text:     "Zeit für die erste Maschine! Kaufe einen Schmelzofen (3.500 €).",
    ziel:     null,
    check:    function() { return installierte_maschinen && installierte_maschinen.length > 0; },
    aktion:   "shop",
    pfeil:    "Shop → Maschinen → Schmelzofen"
  },
  {
    id:       "rohstoffe",
    screen:   "shop",
    titel:    "Rohstoffe kaufen",
    icon:     "⛏️",
    text:     "Der Schmelzofen braucht Eisenerz und Kohle. Kaufe mindestens 10 Eisenerz und 5 Kohle.",
    ziel:     null,
    check:    function() { return (lager["eisenerz"] || 0) >= 10 && (lager["kohle"] || 0) >= 5; },
    aktion:   "shop",
    pfeil:    "Shop → Materialien → Eisenerz + Kohle"
  },
  {
    id:       "produktion",
    screen:   "uebersicht",
    titel:    "Produktion starten",
    icon:     "⚙️",
    text:     "Geh zur Übersicht. Klicke auf deinen Schmelzofen und starte ihn.",
    ziel:     "[data-screen='uebersicht']",
    check:    function() { return installierte_maschinen && installierte_maschinen.some(function(m) { return m.laeuft; }); },
    aktion:   "uebersicht",
    pfeil:    "Übersicht → Schmelzofen → Starten"
  },
  {
    id:       "lager",
    screen:   "lager",
    titel:    "Erste Produktion",
    icon:     "📦",
    text:     "Warte bis 5 Eisenplatten im Lager sind. Du kannst das im Lager-Tab verfolgen.",
    ziel:     "[data-screen='lager']",
    check:    function() { return (lager["eisenplatte"] || 0) >= 5; },
    aktion:   "lager",
    pfeil:    "Lager → Eisenplatte beobachten"
  },
  {
    id:       "auftrag",
    screen:   "auftraege",
    titel:    "Erster Auftrag",
    icon:     "📋",
    text:     "Schau dir die Aufträge an und erfülle deinen ersten wenn genug Material da ist.",
    ziel:     "[data-screen='auftraege']",
    check:    function() { return abgeschlossene_auftraege && abgeschlossene_auftraege > 0; },
    aktion:   "auftraege",
    pfeil:    "Aufträge → Liefern"
  },
  {
    id:       "fertig",
    screen:   "uebersicht",
    titel:    "Du hast es drauf! 🎉",
    icon:     "🚀",
    text:     "Fabrik läuft, Lager füllt sich, Aufträge werden erfüllt. Jetzt liegt es an dir wie groß dein Imperium wird.",
    ziel:     null,
    check:    null,
    aktion:   "uebersicht",
    pfeil:    null,
    abschluss: true
  }
];

// ══════════════════════════════════
// START / STOP
// ══════════════════════════════════

function tutorialStarten() {
  if (localStorage.getItem("pocketsim_tutorial_done") === "1") return;

  tutorialAktiv   = true;
  tutorialSchritt = 0;

  tutorialBannerErstellen();
  tutorialRendern();
  tutorialTimer = setInterval(tutorialAutoCheck, 1500);
}

function tutorialSkippen() {
  tutorialBeenden(true);
}

function tutorialBeenden(skip) {
  tutorialAktiv = false;
  clearInterval(tutorialTimer);
  tutorialTimer = null;
  tutorialBannerAusblenden();
  tutorialSpotlightEntfernen();

  if (!skip) {
    localStorage.setItem("pocketsim_tutorial_done", "1");
  }
}

// ══════════════════════════════════
// BANNER (persistenter Hinweis)
// ══════════════════════════════════

function tutorialBannerErstellen() {
  let banner = document.getElementById("tut-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "tut-banner";
    document.body.appendChild(banner);
  }
}

function tutorialBannerAusblenden() {
  let banner = document.getElementById("tut-banner");
  if (banner) banner.style.display = "none";
}

function tutorialRendern() {
  if (!tutorialAktiv) return;

  let schritt = TUTORIAL_SCHRITTE[tutorialSchritt];
  if (!schritt) { tutorialBeenden(false); return; }

  let banner = document.getElementById("tut-banner");
  if (!banner) return;

  let istAbschluss = !!schritt.abschluss;
  let gesamtSchritte = TUTORIAL_SCHRITTE.length;
  let fortProzent = Math.round((tutorialSchritt / (gesamtSchritte - 1)) * 100);

  // Fortschritts-Dots
  let dotsHTML = TUTORIAL_SCHRITTE.map(function(s, i) {
    if (i < tutorialSchritt) return "<div class='tut-dot tut-dot-done'></div>";
    if (i === tutorialSchritt) return "<div class='tut-dot tut-dot-aktiv'></div>";
    return "<div class='tut-dot'></div>";
  }).join("");

  banner.innerHTML =
    "<div class='tut-inner'>" +
      "<div class='tut-top'>" +
        "<div class='tut-icon-wrap'>" +
          "<span class='tut-big-icon'>" + schritt.icon + "</span>" +
        "</div>" +
        "<div class='tut-content'>" +
          "<div class='tut-step-label'>Schritt " + (tutorialSchritt + 1) + " von " + gesamtSchritte + "</div>" +
          "<div class='tut-headline'>" + schritt.titel + "</div>" +
          "<p class='tut-body'>" + schritt.text + "</p>" +
          (schritt.pfeil ? "<div class='tut-pfeil-hint'>👆 " + schritt.pfeil + "</div>" : "") +
        "</div>" +
        "<button class='tut-close' onclick='tutorialSkippen()' title='Tutorial beenden'>✕</button>" +
      "</div>" +
      "<div class='tut-footer'>" +
        "<div class='tut-dots'>" + dotsHTML + "</div>" +
        (istAbschluss
          ? "<button class='tut-btn-fertig' onclick='tutorialBeenden(false)'>Loslegen! 🚀</button>"
          : (schritt.check ? "" : "<button class='tut-btn-weiter' onclick='tutorialWeiter()'>Weiter →</button>")
        ) +
      "</div>" +
    "</div>";

  banner.style.display = "block";
  banner.className = "tut-banner-sichtbar";

  // Spotlight auf Ziel-Element
  tutorialSpotlightEntfernen();
  if (schritt.ziel) {
    setTimeout(function() {
      let zielEl = document.querySelector(schritt.ziel);
      if (zielEl) tutorialSpotlightZeigen(zielEl);
    }, 100);
  }

  // Zum richtigen Screen navigieren (wenn nötig)
  if (schritt.aktion && typeof screenZeigen === "function" && aktiverScreen !== schritt.aktion) {
    // Nicht automatisch navigieren — nur Hinweis zeigen
  }
}

// ══════════════════════════════════
// SPOTLIGHT
// ══════════════════════════════════

function tutorialSpotlightZeigen(el) {
  let rect = el.getBoundingClientRect();
  let spot = document.getElementById("tut-spot");
  if (!spot) {
    spot = document.createElement("div");
    spot.id = "tut-spot";
    document.body.appendChild(spot);
  }
  let pad = 5;
  spot.style.cssText =
    "position:fixed;z-index:8999;pointer-events:none;" +
    "border-radius:10px;" +
    "top:" + (rect.top - pad) + "px;" +
    "left:" + (rect.left - pad) + "px;" +
    "width:" + (rect.width + pad * 2) + "px;" +
    "height:" + (rect.height + pad * 2) + "px;" +
    "box-shadow:0 0 0 2px var(--amber),0 0 12px rgba(245,158,11,0.5);" +
    "animation:tutSpotPuls 1.5s infinite;";
  spot.style.display = "block";
}

function tutorialSpotlightEntfernen() {
  let spot = document.getElementById("tut-spot");
  if (spot) spot.style.display = "none";
  let old = document.getElementById("tutorial-spotlight");
  if (old) old.style.display = "none";
}

// ══════════════════════════════════
// NAVIGATION
// ══════════════════════════════════

function tutorialWeiter() {
  if (tutorialSchritt >= TUTORIAL_SCHRITTE.length - 1) {
    tutorialBeenden(false);
    return;
  }
  tutorialSchritt++;
  tutorialRendern();
}

function tutorialAutoCheck() {
  if (!tutorialAktiv) return;
  let schritt = TUTORIAL_SCHRITTE[tutorialSchritt];
  if (!schritt || !schritt.check) return;

  if (schritt.check()) {
    setTimeout(function() {
      if (tutorialAktiv) {
        tutorialSchritt++;
        tutorialRendern();
      }
    }, 600);
  }

  // Spotlight aktualisieren (bei Scroll/Resize)
  if (schritt.ziel) {
    let zielEl = document.querySelector(schritt.ziel);
    if (zielEl) tutorialSpotlightZeigen(zielEl);
  }
}

// ══════════════════════════════════
// INTEGRATION
// ══════════════════════════════════

function tutorialNachGruendungStarten() {
  setTimeout(tutorialStarten, 1200);
}

function tutorialReset() {
  localStorage.removeItem("pocketsim_tutorial_done");
  tutorialSchritt = 0;
}

// Spotlight bei Resize aktualisieren
window.addEventListener("resize", function() {
  if (!tutorialAktiv) return;
  let schritt = TUTORIAL_SCHRITTE[tutorialSchritt];
  if (schritt && schritt.ziel) {
    let el = document.querySelector(schritt.ziel);
    if (el) tutorialSpotlightZeigen(el);
  }
});
