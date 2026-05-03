// ══════════════════════════════════
// MAIN
// ══════════════════════════════════

let gebaeude = new building();

// Navigation
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
// SPIELSTART — wird von supabase.js
// nach erfolgreichem Login aufgerufen
// ══════════════════════════════════

async function spielStarten() {
  // Login-Screen verstecken, Spiel zeigen
  loginScreenVerstecken();

  // Daten laden
  await alleDatenLaden();

  marktpreiseInitialisieren();
  spielstandLaden();
  auftraegeAuffuellen();

  // UI
  geldAnzeigenAktualisieren();
  lagerAnzeigenAktualisieren();
  statistikAktualisieren();
  shopGenerieren();
  personalAnzeigenAktualisieren();
  uebersichtGrundstueckeAktualisieren();
  rundenStatusAktualisieren();
  cloudBadgeAktualisieren();

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

  // ── Gründungs-Check ──
  // Wenn noch kein Unternehmen gegründet: Gründungsscreen zeigen
  if (!unternehmen || !unternehmen.name) {
    console.log("[PocketSim] Kein Unternehmen gefunden → Gründungsscreen");
    if (typeof gruendungZeigen === "function") {
      setTimeout(gruendungZeigen, 200);
    }
    return; // Spiel noch nicht starten
  }

  // Unternehmen vorhanden → Header aktualisieren
  if (typeof unternehmenHeaderAktualisieren === "function") {
    unternehmenHeaderAktualisieren();
  }

  if (typeof epocheInit === "function") epocheInit();

  // Intro NUR bei echtem Neustart ohne Unternehmen (legacy)
  // if (!aktiverSpielModus) { setTimeout(introModalZeigen, 400); }
}

// Start — supabase übernimmt die Kontrolle
supabaseInit();