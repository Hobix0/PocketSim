// ── Navigation & Screen Management ──

let aktiverScreen = "uebersicht";
let screenVerlauf = [];

function screenZeigen(screenName) {
  document.querySelectorAll(".screen").forEach(function(s) {
    s.classList.remove("aktiv");
  });

  let screen = document.getElementById("screen-" + screenName);
  if (screen) screen.classList.add("aktiv");

  aktiverScreen = screenName;

  // Statistik beim Öffnen aktualisieren
  if (screenName === "statistik" && typeof statistikScreenAktualisieren === "function") {
    statistikScreenAktualisieren();
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