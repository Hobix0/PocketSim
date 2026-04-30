function mineScreenAktualisieren(gebaeudeId) {
  let bereich = document.getElementById("mine-bereich");
  if (!bereich) return;

  let data = GEBAEUDE.find(function(g) { return g.id === gebaeudeId; });
  if (!data) return;

  let linie = PRODUKTIONSLINIEN[data.produktionslinie] || null;
  let farbe = linie ? linie.farbe : "var(--accent)";

  let screenTitel = document.querySelector("#screen-mine .screen-titel");
  if (screenTitel) {
    screenTitel.innerHTML = data.emoji + " " + data.name;
  }

  let foerderungsHTML = "";
  if (data.foerderung) {
    for (let f of data.foerderung) {
      let mat = MATERIALIEN.find(function(m) { return m.id === f.material; });
      let bestand = lager[f.material] || 0;
      foerderungsHTML +=
        "<div class='mine-foerder-karte' style='border-color:" + farbe + "'>" +
          "<div class='mine-foerder-emoji'>" + (mat ? mat.emoji : "📦") + "</div>" +
          "<div class='mine-foerder-info'>" +
            "<div class='mine-foerder-name'>" + (mat ? mat.name : f.material) + "</div>" +
            "<div class='mine-foerder-rate' style='color:" + farbe + "'>+" + f.menge + " / Runde</div>" +
          "</div>" +
          "<div class='mine-foerder-bestand'>" +
            "<div class='mine-foerder-zahl'>" + bestand + "</div>" +
            "<div class='mine-foerder-label'>im Lager</div>" +
          "</div>" +
        "</div>";
    }
  }

  let benoetigt = data.mitarbeiterProEinheit || 4;
  let statusFarbe = mitarbeiter >= benoetigt ? "var(--green)" : "var(--red)";
  let statusText  = mitarbeiter >= benoetigt ? "✅ In Betrieb" : "⚠️ Zu wenig Personal";

  bereich.innerHTML =
    "<div class='mine-container'>" +

      // Status Banner
      "<div class='mine-status-banner' style='border-color:" + statusFarbe + "; background:' >" +
        "<div style='display:flex; justify-content:space-between; align-items:center'>" +
          "<span class='mine-status-text' style='color:" + statusFarbe + "'>" + statusText + "</span>" +
          "<span class='mine-personal'>" + mitarbeiter + "/" + benoetigt + " 👷</span>" +
        "</div>" +
      "</div>" +

      // Förderung
      "<div class='mine-section-titel'>⛏️ AKTUELLE FÖRDERUNG</div>" +
      foerderungsHTML +

      // Info Stats
      "<div class='mine-section-titel'>📊 MINENINFO</div>" +
      "<div class='mine-info-grid'>" +
        "<div class='mine-info-karte'>" +
          "<span class='mine-info-wert'>" + (data.groesse.l * data.groesse.b) + " m²</span>" +
          "<span class='mine-info-label'>Fläche</span>" +
        "</div>" +
        "<div class='mine-info-karte'>" +
          "<span class='mine-info-wert'>" + data.kostenProRunde + " €</span>" +
          "<span class='mine-info-label'>Kosten/Runde</span>" +
        "</div>" +
        "<div class='mine-info-karte'>" +
          "<span class='mine-info-wert'>" + data.groesse.h + " m</span>" +
          "<span class='mine-info-label'>Tiefe</span>" +
        "</div>" +
        "<div class='mine-info-karte'>" +
          "<span class='mine-info-wert'>∞</span>" +
          "<span class='mine-info-label'>Vorräte</span>" +
        "</div>" +
      "</div>" +

    "</div>";
}