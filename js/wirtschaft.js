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

  // Tier-Filter: nur sichtbare Materialien
  let verkaufbareMats = MATERIALIEN.filter(function(m) {
    return m.verkaufbar && (typeof materialIstSichtbar !== "function" || materialIstSichtbar(m));
  });

  // Statistik berechnen
  let gesamtWert    = 0;
  let matMitBestand = 0;
  for (let mat of verkaufbareMats) {
    let b = lager[mat.id] || 0;
    let p = marktpreise[mat.id] || mat.verkaufpreis;
    gesamtWert += b * p;
    if (b > 0) matMitBestand++;
  }

  // ── KPI Header ──
  let html =
    "<div class='markt-kpi-grid'>" +
      "<div class='kpi-card'>" +
        "<span class='kpi-label'>Lagerwert</span>" +
        "<span class='kpi-value accent'>" + gesamtWert.toLocaleString("de-DE") + " €</span>" +
      "</div>" +
      "<div class='kpi-card'>" +
        "<span class='kpi-label'>Mit Bestand</span>" +
        "<span class='kpi-value'>" + matMitBestand + " <span style='font-size:11px;color:var(--text3)'>Produkte</span></span>" +
      "</div>" +
    "</div>";

  // ── Gruppen ──
  let gruppen = {};
  let reihe   = [];
  for (let mat of verkaufbareMats) {
    let linie = mat.produktionslinie || "sonstige";
    if (!gruppen[linie]) { gruppen[linie] = []; reihe.push(linie); }
    gruppen[linie].push(mat);
  }

  for (let linienId of reihe) {
    let linie = (typeof PRODUKTIONSLINIEN !== "undefined") ? PRODUKTIONSLINIEN[linienId] : null;
    let farbe = linie ? linie.farbe : "var(--border2)";
    let linienName = linie ? linie.emoji + " " + linie.name : "📦 Sonstige";

    html +=
      "<div class='markt-gruppe'>" +
        "<div class='markt-gruppe-header' style='color:" + farbe + ";border-color:" + farbe + "'>" +
          linienName +
        "</div>" +
        "<div class='markt-grid'>";

    for (let mat of gruppen[linienId]) {
      let basisPreis = mat.verkaufpreis;
      let aktPreis   = marktpreise[mat.id] || basisPreis;
      let trend      = preisTrend[mat.id]  || "gleich";
      let bestand    = lager[mat.id] || 0;
      let autoAktiv  = autoVerkauf[mat.id] || false;

      let abweichung  = Math.round(((aktPreis - basisPreis) / basisPreis) * 100);
      let preisKlasse = abweichung > 10 ? "markt-preis-hoch" : abweichung < -10 ? "markt-preis-tief" : "markt-preis-normal";
      let trendIcon   = trend === "hoch" ? "↑" : trend === "runter" ? "↓" : "→";
      let trendFarbe  = trend === "hoch" ? "var(--green)" : trend === "runter" ? "var(--red)" : "var(--text3)";
      let balkenLinks = abweichung >= 0 ? "50%" : (50 + Math.max(-50, abweichung / 3)) + "%";
      let balkenBreite = Math.min(50, Math.abs(abweichung / 3)) + "%";
      let balkenFarbe  = abweichung >= 0 ? "var(--green)" : "var(--red)";

      html +=
        "<div class='markt-karte" + (bestand === 0 ? " markt-karte-leer" : "") + "'>" +

          // ── Top: Name + Preis ──
          "<div class='mk-top'>" +
            "<div class='mk-ident'>" +
              "<span class='mk-emoji'>" + mat.emoji + "</span>" +
              "<span class='mk-name'>" + mat.name + "</span>" +
            "</div>" +
            "<div class='mk-preis-block'>" +
              "<span class='mk-preis " + preisKlasse + "'>" + aktPreis + " €</span>" +
              "<span class='mk-trend' style='color:" + trendFarbe + "'>" + trendIcon + "</span>" +
            "</div>" +
          "</div>" +

          // ── Preis Balken ──
          "<div class='mk-balken-track'>" +
            "<div class='mk-balken-fill' style='left:" + balkenLinks + ";width:" + balkenBreite + ";background:" + balkenFarbe + "'></div>" +
            "<div class='mk-balken-mitte'></div>" +
          "</div>" +
          "<div class='mk-basis-zeile'>" +
            "<span>Basis " + basisPreis + " €</span>" +
            "<span style='color:" + (abweichung >= 0 ? "var(--green)" : "var(--red)") + ";font-weight:700'>" +
              (abweichung >= 0 ? "+" : "") + abweichung + "%" +
            "</span>" +
          "</div>" +

          // ── Bestand ──
          "<div class='mk-bestand-zeile'>" +
            "<span class='mk-bestand-label'>Lager</span>" +
            "<span class='mk-bestand-zahl" + (bestand > 0 ? " hat-bestand" : "") + "'>" + bestand + " Stk</span>" +
          "</div>" +

          // ── Aktionen ──
          "<div class='mk-aktionen'>" +
            (bestand > 0 ?
              "<div class='mk-verkauf-zeile'>" +
                "<div class='mengen-steuer'>" +
                  "<button class='mengen-btn' data-id='" + mat.id + "' data-aktion='minus' data-typ='markt'>−</button>" +
                  "<input type='number' id='markt-menge-" + mat.id + "' value='" + Math.min(bestand, 10) + "' min='1' max='" + bestand + "' />" +
                  "<button class='mengen-btn' data-id='" + mat.id + "' data-aktion='plus' data-max='" + bestand + "' data-typ='markt'>+</button>" +
                "</div>" +
                "<button class='mk-btn-sell' data-mat-id='" + mat.id + "'>Verkaufen</button>" +
              "</div>"
            : "<span class='mk-leer-hint'>Kein Bestand</span>") +
            "<button class='mk-btn-auto" + (autoAktiv ? " aktiv" : "") + "' data-auto-mat-id='" + mat.id + "'>" +
              (autoAktiv ? "🤖 Auto: AN" : "🤖 AUS") +
            "</button>" +
          "</div>" +

        "</div>";
    }

    html += "</div></div>";
  }

  bereich.innerHTML = html;

  // Events
  bereich.querySelectorAll("[data-mat-id]").forEach(function(btn) {
    btn.addEventListener("click", function() { materialVerkaufen(btn.dataset.matId); });
  });
  bereich.querySelectorAll("[data-auto-mat-id]").forEach(function(btn) {
    btn.addEventListener("click", function() { autoVerkaufToggle(btn.dataset.autoMatId); });
  });
  bereich.querySelectorAll(".mengen-btn[data-typ='markt']").forEach(function(btn) {
    btn.addEventListener("click", function() {
      let id = btn.dataset.id;
      let input = document.getElementById("markt-menge-" + id);
      let max = parseInt(btn.dataset.max || lager[id] || 1);
      if (!input) return;
      if (btn.dataset.aktion === "plus") input.value = Math.min(max, parseInt(input.value || 1) + 1);
      else input.value = Math.max(1, parseInt(input.value || 1) - 1);
    });
  });
}