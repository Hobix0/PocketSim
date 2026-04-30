function grundstueckKaufen(grundstueckId) {
  let id   = grundstueckId || GRUNDSTUECKE[0].id;
  let data = GRUNDSTUECKE.find(function(g) { return g.id === id; });
  if (!data) return;

  if (gekaufte_grundstuecke.includes(id)) {
    alert("Dieses Grundstück hast du bereits!");
    return;
  }

  if (geld < data.kosten) {
    alert("Nicht genug Geld! Benötigt: " + data.kosten.toLocaleString("de-DE") + " €");
    return;
  }

  geld -= data.kosten;
  gekaufte_grundstuecke.push(id);
  if (!gekaufte_gebaeude[id]) gekaufte_gebaeude[id] = [];

  geldAnzeigenAktualisieren();
  uebersichtGrundstueckeAktualisieren();
  shopGenerieren();
  spielstandSpeichern();
  if (typeof soundKaufen === "function") soundKaufen();
}

function uebersichtGrundstueckeAktualisieren() {
  let bereich = document.getElementById("grundstueck-bereich");
  bereich.innerHTML = "";

  if (gekaufte_grundstuecke.length === 0) {
    bereich.innerHTML = "<p class='screen-hinweis'>Noch kein Grundstück gekauft.</p>";
    return;
  }

  for (let gsId of gekaufte_grundstuecke) {
    let data = GRUNDSTUECKE.find(function(g) { return g.id === gsId; });
    if (!data) continue;

    let bildHTML = data.bild
      ? "<img src='" + data.bild + "' alt='" + data.name + "' class='objekt-karte-img' />"
      : "<span style='font-size:28px'>" + data.emoji + "</span>";

    let gebAnzahl = gebaeudeVonGrundstueck(gsId).length;
    let auslastungFarbe = gebAnzahl >= data.maxGebaeude ? "var(--red)" :
                          gebAnzahl > 0 ? "var(--accent)" : "var(--text3)";

    bereich.innerHTML +=
      "<div class='objekt-karte klickbar' data-gs-id='" + gsId + "'>" +
        "<div class='objekt-karte-bild'>" + bildHTML + "</div>" +
        "<div class='objekt-karte-body'>" +
          "<div class='objekt-karte-header'>" + data.name + "</div>" +
          "<div class='objekt-karte-stats'>" +
            "<span>📍 " + data.standort + "</span>" +
            "<span>📐 " + data.groesse.l + "×" + data.groesse.b + "m</span>" +
            "<span style='color:" + auslastungFarbe + "'>🏭 " + gebAnzahl + "/" + data.maxGebaeude + " Gebäude</span>" +
          "</div>" +
        "</div>" +
        "<div class='objekt-karte-arrow'>›</div>" +
      "</div>";
  }

  // Event-Listener für Grundstück-Karten hinzufügen
  bereich.querySelectorAll(".objekt-karte[data-gs-id]").forEach(function(karte) {
    karte.addEventListener("click", function() {
      grundstueckAnklicken(karte.getAttribute("data-gs-id"));
    });
  });
}

function grundstueckAnklicken(grundstueckId) {
  window.aktivesGrundstueckId = grundstueckId;
  let data = GRUNDSTUECKE.find(function(g) { return g.id === grundstueckId; });
  drillDown("gebaeude", data ? data.name : "Grundstück");
  uebersichtGebaeudeAktualisieren(grundstueckId);
}