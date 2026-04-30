// ══════════════════════════════════
// WIRTSCHAFT
// Variablen: marktpreise, preisTrend, autoVerkauf
// sind in state.js deklariert!
// ══════════════════════════════════

function marktpreiseInitialisieren() {
  let bonus = typeof verkaufsBonus === "function" ? verkaufsBonus() : 1.0;
  for (let mat of MATERIALIEN) {
    if (!mat.verkaufbar) continue;
    if (!marktpreise[mat.id]) marktpreise[mat.id] = Math.round(mat.verkaufpreis * bonus);
    if (!preisTrend[mat.id])  preisTrend[mat.id]  = "gleich";
    if (autoVerkauf[mat.id] === undefined) autoVerkauf[mat.id] = false;
  }
}

function marktpreiseAktualisieren() {
  for (let mat of MATERIALIEN) {
    if (!mat.verkaufbar) continue;

    let basis    = mat.verkaufpreis;
    let aktuell  = marktpreise[mat.id] || basis;
    let aenderung = (Math.random() * 0.30) - 0.15;

    // Mean reversion
    let abweichung = (aktuell - basis) / basis;
    aenderung -= abweichung * 0.3;

    let neuerPreis = Math.round(aktuell * (1 + aenderung));
    neuerPreis = Math.max(Math.round(basis * 0.6), neuerPreis);
    neuerPreis = Math.min(Math.round(basis * 1.5), neuerPreis);

    if (neuerPreis > aktuell + basis * 0.03) {
      preisTrend[mat.id] = "hoch";
    } else if (neuerPreis < aktuell - basis * 0.03) {
      preisTrend[mat.id] = "runter";
    } else {
      preisTrend[mat.id] = "gleich";
    }

    marktpreise[mat.id] = neuerPreis;
  }
}

function autoVerkaufDurchfuehren() {
  let einnahmen = 0;

  for (let mat of MATERIALIEN) {
    if (!mat.verkaufbar) continue;
    if (!autoVerkauf[mat.id]) continue;
    if (!lager[mat.id] || lager[mat.id] <= 0) continue;

    let menge  = lager[mat.id];
    let preis  = marktpreise[mat.id] || mat.verkaufpreis;
    einnahmen += menge * preis;
    lager[mat.id] = 0;
  }

  if (einnahmen > 0) {
    geld += einnahmen;
    zeigeNotification("💰 Auto-Verkauf: +" + einnahmen.toLocaleString("de-DE") + " €", "green");
  }

  return einnahmen;
}

function marktVerkaufen(materialId) {
  let mat = MATERIALIEN.find(function(m) { return m.id === materialId; });
  if (!mat || !mat.verkaufbar) return;

  let input = document.getElementById("markt-menge-" + materialId);
  let menge = input ? parseInt(input.value) || 1 : 1;
  menge = Math.min(menge, lager[materialId] || 0);
  if (menge <= 0) return;

  let preis = marktpreise[materialId] || mat.verkaufpreis;

  // Spielmodus + Ereignis Verkaufsbonus
  let bonus = (typeof verkaufsBonus === "function" ? verkaufsBonus() : 1.0) *
              (typeof ereignisVerkaufsModifikator === "function" ? ereignisVerkaufsModifikator() : 1.0);
  preis = Math.round(preis * bonus);

  let einnahmen = menge * preis;
  geld              += einnahmen;
  lager[materialId] -= menge;

  geldAnzeigenAktualisieren();
  spielstandSpeichern();
  marktScreenAktualisieren();

  if (typeof soundVerkaufen === "function") soundVerkaufen();
  if (typeof auftraegeScreenAktualisieren === "function") auftraegeScreenAktualisieren();
}

function autoVerkaufToggle(materialId) {
  autoVerkauf[materialId] = !autoVerkauf[materialId];
  marktScreenAktualisieren();
  spielstandSpeichern();
}

function marktScreenAktualisieren() {
  let bereich = document.getElementById("markt-bereich");
  if (!bereich) return;

  let gruppen = {};
  let reihe   = [];

  for (let mat of MATERIALIEN) {
    if (!mat.verkaufbar) continue;
    let linie = mat.produktionslinie || "sonstige";
    if (!gruppen[linie]) { gruppen[linie] = []; reihe.push(linie); }
    gruppen[linie].push(mat);
  }

  let html =
    "<div class='markt-hinweis'>" +
      "<span>📈</span>" +
      "<p>Preise schwanken jede Runde ±15%. Verkaufe bei hohen Preisen. Auto-Verkauf verkauft automatisch jeden Zyklus.</p>" +
    "</div>";

  for (let linienId of reihe) {
    let linie  = (typeof PRODUKTIONSLINIEN !== "undefined") ? PRODUKTIONSLINIEN[linienId] : null;
    let farbe  = linie ? linie.farbe : "var(--border2)";

    html +=
      "<div class='markt-gruppe-header' style='color:" + farbe + "; border-color:" + farbe + "'>" +
        (linie ? linie.emoji + " " + linie.name : "📦 Sonstige") +
      "</div><div class='markt-liste'>";

    for (let mat of gruppen[linienId]) {
      let basisPreis = mat.verkaufpreis;
      let aktPreis   = marktpreise[mat.id] || basisPreis;
      let trend      = preisTrend[mat.id]  || "gleich";
      let bestand    = lager[mat.id] || 0;
      let autoAktiv  = autoVerkauf[mat.id] || false;

      let abweichung  = Math.round(((aktPreis - basisPreis) / basisPreis) * 100);
      let preisKlasse = abweichung > 10 ? "markt-preis-hoch" :
                        abweichung < -10 ? "markt-preis-tief" : "markt-preis-normal";
      let trendIcon  = trend === "hoch"   ? "↑" : trend === "runter" ? "↓" : "→";
      let trendFarbe = trend === "hoch"   ? "var(--green)" :
                       trend === "runter" ? "var(--red)" : "var(--text3)";

      html +=
        "<div class='markt-item'>" +
          "<div class='markt-item-kopf'>" +
            "<div class='markt-item-links'>" +
              "<span class='markt-item-emoji'>" + mat.emoji + "</span>" +
              "<div>" +
                "<div class='markt-item-name'>" + mat.name + "</div>" +
                "<div class='markt-item-bestand'>Bestand: " + bestand + " Stk</div>" +
              "</div>" +
            "</div>" +
            "<div class='markt-item-rechts'>" +
              "<span class='markt-preis-aktuell " + preisKlasse + "'>" + aktPreis + " €</span>" +
              "<span class='markt-trend' style='color:" + trendFarbe + "'>" + trendIcon + "</span>" +
            "</div>" +
          "</div>" +

          "<div class='markt-preis-balken'>" +
            "<div class='markt-preis-balken-fill' " +
              "style='left:" + (abweichung >= 0 ? "50%" : (50 + abweichung/3) + "%") + ";" +
              "width:" + Math.min(50, Math.abs(abweichung/3)) + "%; " +
              "background:" + (abweichung >= 0 ? "var(--green)" : "var(--red)") + "'>" +
            "</div>" +
            "<div class='markt-preis-mitte'></div>" +
          "</div>" +

          "<div class='markt-preis-meta'>" +
            "<span>Basis: " + basisPreis + " €</span>" +
            "<span style='color:" + (abweichung >= 0 ? "var(--green)" : "var(--red)") + "'>" +
              (abweichung >= 0 ? "+" : "") + abweichung + "%" +
            "</span>" +
          "</div>" +

          "<div class='markt-aktionen'>" +
            (bestand > 0 ?
              "<div class='markt-verkauf-zeile'>" +
                "<div class='mengen-steuer'>" +
                  "<button class='mengen-btn' data-id='" + mat.id + "' data-aktion='minus'>−</button>" +
                  "<input type='number' id='markt-menge-" + mat.id + "' value='" + Math.min(bestand, 10) + "' min='1' max='" + bestand + "' />" +
                  "<button class='mengen-btn' data-id='" + mat.id + "' data-aktion='plus' data-max='" + bestand + "'>+</button>" +
                "</div>" +
                "<button class='markt-btn-sell' data-mat-id='" + mat.id + "'>" +
                  "Verkaufen" +
                "</button>" +
              "</div>"
            : "<span class='markt-leer'>Kein Bestand</span>") +

            "<button class='markt-btn-auto" + (autoAktiv ? " aktiv" : "") + "' " +
              "data-auto-mat-id='" + mat.id + "'>" +
              (autoAktiv ? "🤖 Auto: AN" : "🤖 Auto: AUS") +
            "</button>" +
          "</div>" +
        "</div>";
    }

    html += "</div>";
  }

  bereich.innerHTML = html;

  // Event-Listener für Verkaufen-Buttons
  bereich.querySelectorAll(".markt-btn-sell[data-mat-id]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      marktVerkaufen(btn.getAttribute("data-mat-id"));
    });
  });

  // Event-Listener für Auto-Verkauf-Buttons
  bereich.querySelectorAll(".markt-btn-auto[data-auto-mat-id]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      autoVerkaufToggle(btn.getAttribute("data-auto-mat-id"));
    });
  });

  bereich.querySelectorAll(".mengen-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      let id     = btn.getAttribute("data-id");
      let aktion = btn.getAttribute("data-aktion");
      let max    = parseInt(btn.getAttribute("data-max")) || 9999;
      let input  = document.getElementById("markt-menge-" + id);
      if (!input) return;
      let val = parseInt(input.value) || 1;
      if (aktion === "plus")  input.value = Math.min(max, val + 1);
      if (aktion === "minus") input.value = Math.max(1,   val - 1);
    });
  });
}