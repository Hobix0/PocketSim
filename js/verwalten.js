// ── Verwalten Modal ──
// Zentrales Modal für Maschinen, Gebäude und Grundstücke

// Öffnet das Modal mit dynamischem Inhalt
function verwaltenOeffnen(typ, id) {
  let body = document.getElementById("modal-verwalten-body");
  let titel = document.getElementById("modal-verwalten-titel");

  // Je nach Typ den richtigen Inhalt generieren
  if (typ === "maschine") {
    let index = parseInt(id);
    let maschine = installierte_maschinen[index];
    if (!maschine) return;

    titel.textContent = maschine.emoji + " " + maschine.name + " #" + (index + 1);
    body.innerHTML = maschineVerwaltenHTML(maschine, index);

  } else if (typ === "gebaeude") {
    let data = GEBAEUDE.find(function(g) { return g.id === id; });
    if (!data) return;

    titel.textContent = data.emoji + " " + data.name;
    body.innerHTML = gebaeudeVerwaltenHTML(data);

  } else if (typ === "grundstueck") {
    let data = GRUNDSTUECKE.find(function(g) { return g.id === id; });
    if (!data) return;

    titel.textContent = data.emoji + " " + data.name;
    body.innerHTML = grundstueckVerwaltenHTML(data);
  }

  document.getElementById("modal-verwalten").style.display = "flex";

  // Event Listeners für den neuen Inhalt setzen
  verwaltenEventListeners(typ, id);
}

function verwaltenSchliessen() {
  document.getElementById("modal-verwalten").style.display = "none";
}

// ── Maschine Verwalten ──
function maschineVerwaltenHTML(maschine, index) {
  // Stats Sektion
  let html =
    "<div class='modal-sektion'>" +
      "<div class='modal-sektion-titel'>Stats</div>" +
      "<div class='modal-info-zeile'><span>Status</span><span>" +
        (maschine.laeuft ? "✅ Läuft" : "⏹ Gestoppt") +
      "</span></div>" +
      "<div class='modal-info-zeile'><span>Grundfläche</span><span>" +
        (maschine.groesse.l * maschine.groesse.b) + " m²" +
      "</span></div>" +
      "<div class='modal-info-zeile'><span>Kosten / Runde</span><span>" +
        maschine.kostenProRunde + " €" +
      "</span></div>" +
    "</div>";

  // Rezept Auswahl Sektion
  html += "<div class='modal-sektion'><div class='modal-sektion-titel'>Aktives Rezept</div>";

  for (let rId of maschine.rezepte) {
    let rezept = REZEPTE.find(function(r) { return r.id === rId; });
    if (!rezept) continue;

    let istAktiv = rId === maschine.aktivesRezept;

    // Input/Output Text generieren
    let inputText = rezept.inputs.map(function(inp) {
      let mat = MATERIALIEN.find(function(m) { return m.id === inp.material; });
      return inp.menge + "× " + (mat ? mat.name : inp.material);
    }).join(", ");

    let outputText = rezept.outputs.map(function(out) {
      let mat = MATERIALIEN.find(function(m) { return m.id === out.material; });
      return out.menge + "× " + (mat ? mat.name : out.material);
    }).join(", ");

    html +=
      "<div class='rezept-option" + (istAktiv ? " aktiv" : "") + "' " +
        "data-rezept='" + rId + "' data-maschine-index='" + index + "'>" +
        "<div class='rezept-option-info'>" +
          "<div class='rezept-option-name'>" + rezept.emoji + " " + rezept.name + "</div>" +
          "<div class='rezept-option-detail'>" + inputText + " → " + outputText + "</div>" +
        "</div>" +
        (istAktiv ? "<span class='rezept-option-badge'>Aktiv</span>" : "") +
      "</div>";
  }

  html += "</div>";

  // Aktionen Sektion
  html +=
    "<div class='modal-sektion'>" +
      "<div class='modal-sektion-titel'>Aktionen</div>" +
      "<div class='modal-btn-reihe'>" +
        "<button id='btn-maschine-toggle' data-index='" + index + "'>" +
          (maschine.laeuft ? "⏹ Stoppen" : "▶ Starten") +
        "</button>" +
        "<button class='btn-modal-gefahr' id='btn-maschine-verkaufen' data-index='" + index + "'>" +
          "🗑️ Verkaufen (" + Math.floor(maschine.kosten * 0.5).toLocaleString("de-DE") + " €)" +
        "</button>" +
      "</div>" +
    "</div>";

  return html;
}

// ── Gebäude Verwalten ──
function gebaeudeVerwaltenHTML(data) {
  // Nur Maschinen DIESES Gebäudes zählen
  let meineMaschinen = maschinenVonGebaeude(data.id);
  let belegte = meineMaschinen.reduce(function(sum, m) {
    return sum + m.groesse.l * m.groesse.b;
  }, 0);
  let gesamt  = data.groesse.l * data.groesse.b;
  let frei    = gesamt - belegte;
  let prozent = Math.round((belegte / gesamt) * 100);

  return (
    "<div class='modal-sektion'>" +
      "<div class='modal-sektion-titel'>Stats</div>" +
      "<div class='modal-info-zeile'><span>Typ</span><span>" +
        (data.hallenTyp === "schwer" ? "⚙️ Schwerhalle" :
         data.hallenTyp === "leicht" ? "🏗️ Leichthalle" : data.typ) +
      "</span></div>" +
      "<div class='modal-info-zeile'><span>Größe</span><span>" +
        data.groesse.l + " × " + data.groesse.b + " m" +
      "</span></div>" +
      "<div class='modal-info-zeile'><span>Gesamtfläche</span><span>" +
        gesamt + " m²" +
      "</span></div>" +
      "<div class='modal-info-zeile'><span>Freie Fläche</span><span>" +
        frei + " m²" +
      "</span></div>" +
      "<div class='modal-info-zeile'><span>Auslastung</span><span>" +
        prozent + "%" +
      "</span></div>" +
      "<div class='modal-info-zeile'><span>Kosten / Runde</span><span>" +
        data.kostenProRunde + " €" +
      "</span></div>" +
      "<div class='modal-info-zeile'><span>Maschinen</span><span>" +
        meineMaschinen.length +
      "</span></div>" +
    "</div>" +
    "<div class='modal-sektion'>" +
      "<div class='modal-sektion-titel'>Aktionen</div>" +
      "<p style='font-size:12px; color:var(--text3); margin-bottom:8px'>" +
        "Erweiterungen kommen bald!" +
      "</p>" +
    "</div>"
  );
}

// ── Grundstück Verwalten ──
function grundstueckVerwaltenHTML(data) {
  // Korrekte Gebäudeanzahl aus gekaufte_gebaeude holen
  let gebaeudeAnzahl = gebaeudeVonGrundstueck(data.id).length;

  return (
    "<div class='modal-sektion'>" +
      "<div class='modal-sektion-titel'>Stats</div>" +
      "<div class='modal-info-zeile'><span>Standort</span><span>" +
        data.standort +
      "</span></div>" +
      "<div class='modal-info-zeile'><span>Größe</span><span>" +
        data.groesse.l + " × " + data.groesse.b + " m" +
      "</span></div>" +
      "<div class='modal-info-zeile'><span>Max. Gebäude</span><span>" +
        data.maxGebaeude +
      "</span></div>" +
      "<div class='modal-info-zeile'><span>Gebäude vorhanden</span><span>" +
        gebaeudeAnzahl + " / " + data.maxGebaeude +
      "</span></div>" +
      "<div class='modal-info-zeile'><span>Kosten / Runde</span><span>" +
        data.kostenProRunde + " €" +
      "</span></div>" +
    "</div>" +
    "<div class='modal-sektion'>" +
      "<div class='modal-sektion-titel'>Aktionen</div>" +
      "<p style='font-size:12px; color:var(--text3); margin-bottom:8px'>" +
        "Grundstück upgraden kommt bald!" +
      "</p>" +
    "</div>"
  );
}

// ── Event Listeners für Modal-Inhalt ──
function verwaltenEventListeners(typ, id) {

  // Modal schließen
  document.getElementById("btn-verwalten-schliessen").addEventListener("click", verwaltenSchliessen);

  // Klick außerhalb schließt Modal
  document.getElementById("modal-verwalten").addEventListener("click", function(e) {
    if (e.target === this) verwaltenSchliessen();
  });

  if (typ === "maschine") {
    // Rezept wechseln
    document.querySelectorAll(".rezept-option").forEach(function(option) {
      option.addEventListener("click", function() {
        let rezeptId = option.getAttribute("data-rezept");
        let maschineIndex = parseInt(option.getAttribute("data-maschine-index"));
        let maschine = installierte_maschinen[maschineIndex];

        maschine.aktivesRezept = rezeptId;
        spielstandSpeichern();
        uebersichtAktualisieren();

        // Modal mit aktualisierten Daten neu öffnen
        verwaltenOeffnen("maschine", maschineIndex.toString());
      });
    });

    // Start/Stopp Toggle
    let btnToggle = document.getElementById("btn-maschine-toggle");
    if (btnToggle) {
      btnToggle.addEventListener("click", function() {
        let index = parseInt(btnToggle.getAttribute("data-index"));
        installierte_maschinen[index].laeuft = !installierte_maschinen[index].laeuft;
        spielstandSpeichern();
        uebersichtAktualisieren();
        verwaltenOeffnen("maschine", index.toString());
      });
    }

    // Maschine verkaufen (50% Rückerstattung)
    let btnVerkaufen = document.getElementById("btn-maschine-verkaufen");
    if (btnVerkaufen) {
      btnVerkaufen.addEventListener("click", function() {
        let index = parseInt(btnVerkaufen.getAttribute("data-index"));
        let maschine = installierte_maschinen[index];
        let rueckerstattung = Math.floor(maschine.kosten * 0.5);

        let bestaetigung = confirm(
          maschine.name + " verkaufen?" +
          "\nDu erhältst: " + rueckerstattung.toLocaleString("de-DE") + " €"
        );
        if (!bestaetigung) return;

        geld = geld + rueckerstattung;
        installierte_maschinen.splice(index, 1);

        geldAnzeigenAktualisieren();
        uebersichtAktualisieren();
        spielstandSpeichern();
        verwaltenSchliessen();
      });
    }
  }
}