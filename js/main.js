// ══════════════════════════════════
// MAIN — Spielstart
// ══════════════════════════════════

let gebaeude = new building();

// ── Navigation ──
document.querySelectorAll(".nav-btn, .sidebar-btn[data-screen]").forEach(function(btn) {
  btn.addEventListener("click", function() {
    screenVerlauf = [];
    document.getElementById("breadcrumb").style.display = "none";
    document.querySelectorAll(".nav-btn, .sidebar-btn").forEach(function(b) {
      b.classList.remove("aktiv");
    });
    let screen = btn.getAttribute("data-screen");
    document.querySelectorAll("[data-screen='" + screen + "']").forEach(function(b) {
      b.classList.add("aktiv");
    });
    screenZeigen(screen);
  });
});

document.getElementById("btn-zurueck").addEventListener("click", zurueck);
document.getElementById("btn-einstellungen").addEventListener("click", einstellungenOeffnen);
document.getElementById("btn-modal-schliessen").addEventListener("click", einstellungenSchliessen);
document.getElementById("btn-reset").addEventListener("click", spielstandZuruecksetzen);

document.getElementById("modal-einstellungen").addEventListener("click", function(e) {
  if (e.target === this) einstellungenSchliessen();
});

document.getElementById("btn-einstellen").addEventListener("click", mitarbeiterEinstellen);
document.getElementById("btn-entlassen").addEventListener("click", mitarbeiterEntlassen);

document.getElementById("shop-suche").addEventListener("input", function() {
  let suche = this.value.toLowerCase();
  document.querySelectorAll(".shop-item").forEach(function(item) {
    let name = (item.getAttribute("data-name") || "").toLowerCase();
    item.style.display = name.includes(suche) ? "flex" : "none";
  });
  document.querySelectorAll(".shop-kategorie").forEach(function(kat) {
    let sichtbar = Array.from(kat.querySelectorAll(".shop-item")).some(function(i) {
      return i.style.display !== "none";
    });
    kat.classList.toggle("versteckt", !sichtbar);
  });
});

// ══════════════════════════════════
// SPIELSTART
// Reihenfolge ist entscheidend:
// 1. Daten laden
// 2. Lokalen Spielstand laden
// 3. Cloud-Sync abwarten (falls eingeloggt)
// 4. DANN Intro prüfen
// ══════════════════════════════════

async function spielStarten() {
  await alleDatenLaden();

  marktpreiseInitialisieren();
  spielstandLaden();          // Lokaler Stand
  auftraegeAuffuellen();

  // UI initialisieren
  geldAnzeigenAktualisieren();
  lagerAnzeigenAktualisieren();
  statistikAktualisieren();
  shopGenerieren();
  personalAnzeigenAktualisieren();
  uebersichtGrundstueckeAktualisieren();
  rundenStatusAktualisieren();

  if (hatGrundstueck()) {
    let erstesGs = erstesGrundstueck();
    if (erstesGs) window.aktivesGrundstueckId = erstesGs.id;
  }

  if (hatGebaeude()) {
    let ersteFabrik = GEBAEUDE.find(function(g) {
      return g.typ === "fabrik" && hatGebaeude(g.id);
    });
    if (ersteFabrik) window.aktivesGebaeudeId = ersteFabrik.id;
  }

  if (installierte_maschinen.length > 0) {
    uebersichtAktualisieren();
    produktionStarten();
  }

  if (hatGebaeude("labor")) laborAnzeigenAktualisieren();
  marktScreenAktualisieren();
  auftraegeScreenAktualisieren();

  // Cloud-Sync initialisieren — wartet auf Ergebnis bevor Intro entschieden wird
  if (typeof supabaseInit === "function") {
    await supabaseInit();
  }

  // Intro NUR zeigen wenn wirklich kein Spielstand vorhanden
  // (kein lokaler UND kein Cloud-Stand)
  if (!aktiverSpielModus) {
    setTimeout(introModalZeigen, 300);
  }
}

spielStarten();
