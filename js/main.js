// Neue Building-Instanz (vermutlich dein Spiel-/System-Kern)
let gebaeude = new building();


// ─────────────────────────────────────────────
// 🧭 NAVIGATION / SCREEN WECHSEL
// ─────────────────────────────────────────────

// Klick auf Navigation oder Sidebar -> Screen wechseln
document.querySelectorAll(".nav-btn, .sidebar-btn[data-screen]").forEach(function(btn) {
  btn.addEventListener("click", function() {

    // Verlauf zurücksetzen (keine "Zurück"-Historie mehr)
    screenVerlauf = [];
    document.getElementById("breadcrumb").style.display = "none";

    // Alle Buttons deaktivieren (UI Reset)
    document.querySelectorAll(".nav-btn, .sidebar-btn").forEach(function(b) {
      b.classList.remove("aktiv");
    });

    // Ziel-Screen aus Button holen
    let screen = btn.getAttribute("data-screen");

    // Alle Buttons des gleichen Screens aktiv markieren
    document.querySelectorAll("[data-screen='" + screen + "']").forEach(function(b) {
      b.classList.add("aktiv");
    });

    // Screen tatsächlich anzeigen
    screenZeigen(screen);
  });
});


// ─────────────────────────────────────────────
// 🔙 TOP BAR / SYSTEM BUTTONS
// ─────────────────────────────────────────────

// Zurück-Button (Navigation zurück im Verlauf)
document.getElementById("btn-zurueck").addEventListener("click", zurueck);

// Einstellungen öffnen
document.getElementById("btn-einstellungen").addEventListener("click", einstellungenOeffnen);

// Einstellungen schließen (Modal Button)
document.getElementById("btn-modal-schliessen").addEventListener("click", einstellungenSchliessen);

// Spiel komplett zurücksetzen
document.getElementById("btn-reset").addEventListener("click", spielstandZuruecksetzen);


// Klick außerhalb des Settings-Modals -> schließt es
document.getElementById("modal-einstellungen").addEventListener("click", function(e) {
  if (e.target === this) einstellungenSchliessen();
});


// Mitarbeiter Management
document.getElementById("btn-einstellen").addEventListener("click", mitarbeiterEinstellen);
document.getElementById("btn-entlassen").addEventListener("click", mitarbeiterEntlassen);


// ─────────────────────────────────────────────
// 🔎 SHOP SUCHFUNKTION
// ─────────────────────────────────────────────

// Live-Suche im Shop
document.getElementById("shop-suche").addEventListener("input", function() {

  let suche = this.value.toLowerCase();

  // Items filtern
  document.querySelectorAll(".shop-item").forEach(function(item) {
    let name = (item.getAttribute("data-name") || "").toLowerCase();
    item.style.display = name.includes(suche) ? "flex" : "none";
  });

  // Kategorien verstecken, wenn keine Items sichtbar sind
  document.querySelectorAll(".shop-kategorie").forEach(function(kat) {
    let sichtbar = Array.from(kat.querySelectorAll(".shop-item")).some(function(i) {
      return i.style.display !== "none";
    });

    kat.classList.toggle("versteckt", !sichtbar);
  });
});


// ─────────────────────────────────────────────
// 🚀 SPIEL START (MAIN INITIALISATION)
// ─────────────────────────────────────────────

async function spielStarten() {

  // 1. Alle Daten laden (JSON, API, etc.)
  await alleDatenLaden();

  // 2. Grundsysteme initialisieren
  marktpreiseInitialisieren();
  spielstandLaden();
  auftraegeAuffuellen();

  // 3. UI initial rendern
  geldAnzeigenAktualisieren();
  lagerAnzeigenAktualisieren();
  statistikAktualisieren();
  shopGenerieren();
  personalAnzeigenAktualisieren();
  uebersichtGrundstueckeAktualisieren();
  rundenStatusAktualisieren();

  // ─────────────────────────────────────────────
  // 🏗️ Aktives Grundstück setzen
  // ─────────────────────────────────────────────
  if (hatGrundstueck()) {
    let erstesGs = erstesGrundstueck();
    if (erstesGs) window.aktivesGrundstueckId = erstesGs.id;
  }

  // ─────────────────────────────────────────────
  // 🏭 Aktives Gebäude setzen
  // ─────────────────────────────────────────────
  if (hatGebaeude()) {
    let ersteFabrik = GEBAEUDE.find(function(g) {
      return g.typ === "fabrik" && hatGebaeude(g.id);
    });

    if (ersteFabrik) window.aktivesGebaeudeId = ersteFabrik.id;
  }

  // ─────────────────────────────────────────────
  // ⚙️ Produktionsstart
  // ─────────────────────────────────────────────
  if (installierte_maschinen.length > 0) {
    uebersichtAktualisieren();
    produktionStarten();
  }

  // ─────────────────────────────────────────────
  // 🔬 Labor UI initialisieren
  // ─────────────────────────────────────────────
  if (hatGebaeude("labor")) {
    laborAnzeigenAktualisieren();
  }

  // ─────────────────────────────────────────────
  // 📊 Markt & Aufträge UI
  // ─────────────────────────────────────────────
  marktScreenAktualisieren();
  auftraegeScreenAktualisieren();

  // ─────────────────────────────────────────────
  // 🎬 Intro (nur beim ersten Start)
  // ─────────────────────────────────────────────
  if (!aktiverSpielModus) {
    setTimeout(introModalZeigen, 300);
  }
}


// Spielstart ausführen
spielStarten();