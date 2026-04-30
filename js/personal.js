// Berechnet wie viele Mitarbeiter insgesamt benötigt werden
// Jede Maschine braucht 1 Mitarbeiter (aus maschinen.json: mitarbeiterProEinheit)
function mitarbeiterBenoetigt() {
  let benoetigt = 0;
  for (let i = 0; i < installierte_maschinen.length; i++) {
    let maschineData = MASCHINEN.find(function(m) {
      return m.id === installierte_maschinen[i].id;
    });
    let basis = maschineData ? maschineData.mitarbeiterProEinheit || 1 : 1;
    // Forschungsbonus anwenden
    let reduktion = forschungsBonus.personalReduktion || 0;
    benoetigt += Math.max(1, basis - reduktion);
  }
  return benoetigt;
}
// Gibt zurück ob genug Personal für alle Maschinen vorhanden ist
function hatGenugPersonal() {
  return mitarbeiter >= mitarbeiterBenoetigt();
}

// Berechnet die Lohnkosten pro Runde
// 50 € pro Mitarbeiter pro Runde
function lohnkostenBerechnen() {
  return mitarbeiter * 30;
}

function mitarbeiterEinstellen() {
  mitarbeiter = mitarbeiter + 1;
  personalAnzeigenAktualisieren();
  spielstandSpeichern();
}

function mitarbeiterEntlassen() {
  if (mitarbeiter <= 0) {
    alert("Du hast keine Mitarbeiter!");
    return;
  }
  mitarbeiter = mitarbeiter - 1;
  personalAnzeigenAktualisieren();
  spielstandSpeichern();
}

// Aktualisiert alle Anzeigen im Personal-Tab
function personalAnzeigenAktualisieren() {
  let benoetigt = mitarbeiterBenoetigt();
  let lohn = lohnkostenBerechnen();

  document.getElementById("anzeige-mitarbeiter").textContent = mitarbeiter;
  document.getElementById("anzeige-benoetigt").textContent = benoetigt;
  document.getElementById("anzeige-lohnkosten").textContent = lohn.toLocaleString("de-DE") + " €";

  // Statusanzeige: grün wenn genug Personal, rot wenn zu wenig
  let status = document.getElementById("personal-status");
  if (installierte_maschinen.length === 0) {
    status.innerHTML = "<p class='status-neutral'>Keine Maschinen installiert.</p>";
  } else if (hatGenugPersonal()) {
    status.innerHTML = "<p class='status-ok'>✅ Genug Personal — Produktion läuft.</p>";
  } else {
    status.innerHTML = "<p class='status-warnung'>⚠️ Zu wenig Personal — Produktion gestoppt! (" + mitarbeiter + " / " + benoetigt + ")</p>";
  }
}