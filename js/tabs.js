// ── Navigation & Screen Management ──

let aktiverScreen = "uebersicht";
let screenVerlauf = [];

function screenZeigen(screenName) {
  // Ignore Mehr-Button and invalid screens
  if (!screenName || screenName === "mehr") return;

  // Mehr-Menü schließen wenn offen
  navMehrSchliessen();
  document.querySelectorAll(".screen").forEach(function(s) {
    s.classList.remove("aktiv");
  });

  let screen = document.getElementById("screen-" + screenName);
  if (screen) screen.classList.add("aktiv");

  aktiverScreen = screenName;

  // Screen-spezifische Aktualisierungen beim Öffnen
  if (screenName === "statistik" && typeof statistikScreenAktualisieren === "function") {
    statistikScreenAktualisieren();
  }
  if (screenName === "lager" && typeof lagerAnzeigenAktualisieren === "function") {
    lagerAnzeigenAktualisieren();
  }
  if (screenName === "shop" && typeof shopGenerieren === "function") {
    shopGenerieren();
  }
  if (screenName === "markt" && typeof marktScreenAktualisieren === "function") {
    marktScreenAktualisieren();
  }
  if (screenName === "auftraege" && typeof auftraegeScreenAktualisieren === "function") {
    auftraegeScreenAktualisieren();
  }
  if (screenName === "personal" && typeof personalAnzeigenAktualisieren === "function") {
    personalAnzeigenAktualisieren();
  }
  /*if (screenName === "lkw" && typeof lkwScreenAktualisieren === "function") {
    lkwScreenAktualisieren();
  }
  if (screenName === "labor" && typeof laborAnzeigenAktualisieren === "function") {
    laborAnzeigenAktualisieren();
  }*/
  if (screenName === "uebersicht" && typeof uebersichtKPIsAktualisieren === "function") {
    uebersichtKPIsAktualisieren();
  }
}

function drillDown(screenName, pfad) {
  screenVerlauf.push(aktiverScreen);
  screenZeigen(screenName);

  document.getElementById("breadcrumb").style.display = "flex";
  document.getElementById("breadcrumb-pfad").textContent = pfad;

  // Alle Nav-Buttons deaktivieren während Drill-Down
  document.querySelectorAll(".nav-btn, .sidebar-btn").forEach(function(btn) {
    btn.classList.remove("aktiv");
  });
}

function halleTabWechseln(tab, btn) {
  // Tab-Buttons
  document.querySelectorAll(".halle-tab").forEach(function(b) {
    b.classList.remove("aktiv");
  });
  btn.classList.add("aktiv");

  // Tab-Inhalte
  document.getElementById("halle-tab-maschinen").style.display =
    tab === "maschinen" ? "block" : "none";
  document.getElementById("halle-tab-upgrades").style.display =
    tab === "upgrades" ? "block" : "none";

  // Upgrade-Screen bei Bedarf aktualisieren
  if (tab === "upgrades" && window.aktivesGebaeudeId &&
      typeof hallenUpgradeScreenAktualisieren === "function") {
    hallenUpgradeScreenAktualisieren(window.aktivesGebaeudeId);
  }
}

function zurueck() {
  if (screenVerlauf.length === 0) return;

  let letzterScreen = screenVerlauf.pop();
  screenZeigen(letzterScreen);

  if (screenVerlauf.length === 0) {
    // Ganz oben angekommen — Breadcrumb verstecken
    document.getElementById("breadcrumb").style.display = "none";

    // Passenden Nav-Button wieder aktivieren
    document.querySelectorAll("[data-screen='" + letzterScreen + "']").forEach(function(btn) {
      btn.classList.add("aktiv");
    });

  } else {
    // Noch tiefer im Drill-Down — Breadcrumb aktualisieren
    let pfade = {
      "uebersicht": "",
      "gebaeude":   "Grundstück",
      "maschinen":  "Grundstück › Gebäude",
      "mine":       "Grundstück › Mine",
      "labor":      "Grundstück › Forschungslabor",
      "lager-gebaeude": "Grundstück › Lagerhalle"
    };
    let pfad = pfade[letzterScreen] || "";
    if (pfad) {
      document.getElementById("breadcrumb-pfad").textContent = pfad;
    }
  }
}


// ══════════════════════════════════
// MEHR-MENÜ (Mobile Bottom Nav)
// ══════════════════════════════════

function navMehrToggle() {
  let drawer  = document.getElementById("nav-mehr-drawer");
  let overlay = document.getElementById("nav-mehr-overlay");
  let offen   = drawer && drawer.classList.contains("offen");
  if (offen) {
    navMehrSchliessen();
  } else {
    if (drawer)  drawer.classList.add("offen");
    if (overlay) overlay.classList.add("sichtbar");
    document.getElementById("nav-mehr-btn") && document.getElementById("nav-mehr-btn").classList.add("aktiv");
    // NMD-Buttons: aktiven Screen markieren
    document.querySelectorAll(".nmd-btn").forEach(function(btn) {
      btn.classList.toggle("aktiv", btn.getAttribute("data-screen") === aktiverScreen);
    });
  }
}

function navMehrSchliessen() {
  let drawer  = document.getElementById("nav-mehr-drawer");
  let overlay = document.getElementById("nav-mehr-overlay");
  if (drawer)  drawer.classList.remove("offen");
  if (overlay) overlay.classList.remove("sichtbar");
  let mehrBtn = document.getElementById("nav-mehr-btn");
  if (mehrBtn) mehrBtn.classList.remove("aktiv");
}

// NMD-Button Click Handler (nach DOM-Ready)
document.addEventListener("DOMContentLoaded", function() {
  document.querySelectorAll(".nmd-btn[data-screen]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      let screen = btn.getAttribute("data-screen");
      navMehrSchliessen();
      screenZeigen(screen);
      // Bottom nav aktiv state
      document.querySelectorAll(".nav-btn").forEach(function(b) {
        b.classList.toggle("aktiv", b.getAttribute("data-screen") === screen);
      });
    });
  });
});
