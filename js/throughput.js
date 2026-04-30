// ══════════════════════════════════
// THROUGHPUT — Produktionsraten & Engpass-Analyse
// Zeigt wie viel jede Maschine pro Runde produziert
// und wo Engpässe entstehen
// ══════════════════════════════════

// ── Produktionsrate einer Maschine berechnen ──
// Gibt zurück: { outputs: [{material, mengeProRunde}], inputs: [{material, mengeProRunde}] }
function maschinenThroughput(maschine) {
  let rezept = REZEPTE.find(function(r) { return r.id === maschine.aktivesRezept; });
  if (!rezept || !maschine.laeuft) return null;

  let upgradeBonus = typeof upgradeProduktionsBonus === "function" && maschine.gebaeudeId
    ? upgradeProduktionsBonus(maschine.gebaeudeId) : 1.0;
  let forschungBonus = (forschungsBonus && forschungsBonus.produktionMultiplikator) || 1.0;

  let gesamtBonus = upgradeBonus * forschungBonus;

  return {
    outputs: rezept.outputs.map(function(o) {
      return { material: o.material, mengeProRunde: Math.round(o.menge * gesamtBonus) };
    }),
    inputs: rezept.inputs.map(function(i) {
      return { material: i.material, mengeProRunde: i.menge };
    })
  };
}

// ── Engpass-Analyse für alle Maschinen eines Gebäudes ──
function engpassAnalyse(gebaeudeId) {
  let meineMaschinen = maschinenVonGebaeude(gebaeudeId);
  let ergebnis = [];

  for (let m of meineMaschinen) {
    let tp = maschinenThroughput(m);
    if (!tp) continue;

    // Prüfen ob genug Input im Lager für nächste Runde
    let inputProbleme = tp.inputs.filter(function(inp) {
      return (lager[inp.material] || 0) < inp.mengeProRunde;
    });

    // Welche Maschine liefert diesen Input?
    let inputQuellen = {};
    for (let inp of tp.inputs) {
      let lieferant = meineMaschinen.find(function(andereM) {
        let andereTP = maschinenThroughput(andereM);
        if (!andereTP) return false;
        return andereTP.outputs.some(function(o) { return o.material === inp.material; });
      });
      if (lieferant) {
        let lieferTP = maschinenThroughput(lieferant);
        let lieferOutput = lieferTP.outputs.find(function(o) { return o.material === inp.material; });
        inputQuellen[inp.material] = {
          lieferant:     lieferant,
          liefertProRunde: lieferOutput ? lieferOutput.mengeProRunde : 0,
          brauchtProRunde: inp.mengeProRunde,
          ausreichend:   lieferOutput ? lieferOutput.mengeProRunde >= inp.mengeProRunde : false
        };
      }
    }

    let status = "ok";
    if (!m.laeuft) status = "gestoppt";
    else if (inputProbleme.length > 0) status = "wartet";
    else if (Object.values(inputQuellen).some(function(q) { return !q.ausreichend; })) status = "engpass";

    ergebnis.push({
      maschine:     m,
      throughput:   tp,
      status:       status,
      inputQuellen: inputQuellen,
      inputProbleme: inputProbleme
    });
  }

  return ergebnis;
}

// ── Throughput-Badge HTML für Maschinen-Tile ──
function throughputBadgeHTML(maschine) {
  let tp = maschinenThroughput(maschine);
  if (!tp) return "";

  // Wichtigstes Output
  let hauptOutput = tp.outputs[0];
  if (!hauptOutput) return "";

  let mat = MATERIALIEN.find(function(m) { return m.id === hauptOutput.material; });
  let emoji = mat ? mat.emoji : "📦";

  let inputOk = tp.inputs.every(function(inp) {
    return (lager[inp.material] || 0) >= inp.mengeProRunde;
  });

  let farbe = inputOk ? "var(--green)" : "var(--accent)";

  return "<div class=\"tile-throughput\" style=\"color:" + farbe + "\">" +
    "+" + hauptOutput.mengeProRunde + emoji +
  "</div>";
}

// ── Throughput-Screen für Statistik ──
function throughputScreenHTML(gebaeudeId) {
  let analyse = engpassAnalyse(gebaeudeId);
  if (analyse.length === 0) {
    return "<p class=\"screen-hinweis\">Keine Maschinen installiert.</p>";
  }

  let gebData = GEBAEUDE.find(function(g) { return g.id === gebaeudeId; });
  let isSchwer = gebData && gebData.hallenTyp === "schwer";
  let lFarbe   = isSchwer ? "#6366f1" : "#f59e0b";

  let html = "<div class=\"throughput-liste\">";

  for (let item of analyse) {
    let m  = item.maschine;
    let tp = item.throughput;

    let statusFarbe = {
      "ok":       "var(--green)",
      "wartet":   "var(--accent)",
      "engpass":  "var(--red)",
      "gestoppt": "var(--text3)"
    }[item.status] || "var(--text3)";

    let statusText = {
      "ok":       "✅ Läuft",
      "wartet":   "⏳ Wartet auf Material",
      "engpass":  "🔴 Engpass",
      "gestoppt": "⏹ Gestoppt"
    }[item.status] || item.status;

    html += "<div class=\"throughput-karte\" style=\"border-left-color:" + lFarbe + "\">" +

      "<div class=\"throughput-header\">" +
        "<span style=\"font-size:22px\">" + m.emoji + "</span>" +
        "<div style=\"flex:1\">" +
          "<div class=\"throughput-name\">" + m.name + "</div>" +
          "<div class=\"throughput-rezept\">" + (REZEPTE.find(function(r){return r.id===m.aktivesRezept;})||{name:"?"}).name + "</div>" +
        "</div>" +
        "<span class=\"throughput-status\" style=\"color:" + statusFarbe + "\">" + statusText + "</span>" +
      "</div>";

    if (tp) {
      // Output-Raten
      html += "<div class=\"throughput-raten\">";
      for (let out of tp.outputs) {
        let mat = MATERIALIEN.find(function(mat) { return mat.id === out.material; });
        let linie = mat ? PRODUKTIONSLINIEN[mat.produktionslinie] : null;
        let linFarbe = linie ? linie.farbe : "var(--green)";
        html +=
          "<div class=\"throughput-rate out\" style=\"border-color:" + linFarbe + ";color:" + linFarbe + "\">" +
            "+" + out.mengeProRunde + " " + (mat ? mat.emoji + " " + mat.name : out.material) + "/Runde" +
          "</div>";
      }

      // Input-Raten
      for (let inp of tp.inputs) {
        let mat    = MATERIALIEN.find(function(mat) { return mat.id === inp.material; });
        let vorrat = lager[inp.material] || 0;
        let reicht = vorrat >= inp.mengeProRunde;
        let quelle = item.inputQuellen[inp.material];
        let inpFarbe = reicht ? "var(--text3)" : "var(--red)";

        html +=
          "<div class=\"throughput-rate inp\" style=\"color:" + inpFarbe + "\">" +
            "-" + inp.mengeProRunde + " " + (mat ? mat.emoji + " " + mat.name : inp.material) + "/Runde" +
            " <span style=\"font-size:10px;opacity:0.7\">(Lager: " + vorrat + ")</span>" +
            (quelle && !quelle.ausreichend ?
              " <span style=\"color:var(--red);font-size:10px\">⚠️ Lieferant zu langsam!</span>" : "") +
          "</div>";
      }
      html += "</div>";

      // Empfehlung bei Engpass
      if (item.status === "engpass") {
        let engpassMat = tp.inputs.find(function(inp) {
          let q = item.inputQuellen[inp.material];
          return q && !q.ausreichend;
        });
        if (engpassMat) {
          let mat = MATERIALIEN.find(function(m) { return m.id === engpassMat.material; });
          html +=
            "<div class=\"throughput-tipp\">" +
              "💡 Tipp: Mehr " + (mat ? mat.emoji + " " + mat.name : engpassMat.material) +
              " produzieren — oder eine zweite " + m.name + " kaufen" +
            "</div>";
        }
      }
    }

    html += "</div>";
  }

  html += "</div>";
  return html;
}