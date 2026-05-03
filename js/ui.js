let letzterGeldWert = 0;

function geldAnzeigenAktualisieren() {
  let el = document.getElementById("geld-anzeige");
  el.textContent = "💰 " + geld.toLocaleString("de-DE") + " €";

  // Animation je nach Richtung
  el.classList.remove("geld-hoch", "geld-runter");
  if (geld > letzterGeldWert) {
    el.classList.add("geld-hoch");
  } else if (geld < letzterGeldWert) {
    el.classList.add("geld-runter");
  }

  // Klasse nach Animation entfernen
  setTimeout(function() {
    el.classList.remove("geld-hoch", "geld-runter");
  }, 500);

  letzterGeldWert = geld;
}

function lagerAnzeigenAktualisieren() {
  let reihe = document.getElementById("lager-reihe");
  if (!reihe) return;

  // ── Statistiken berechnen ──
  let gesamtMenge = 0;
  let gesamtWert  = 0;
  let aktiveTypen = 0;
  let sichtbareMats = MATERIALIEN.filter(function(m) {
    return typeof materialIstSichtbar !== "function" || materialIstSichtbar(m);
  });

  for (let mat of sichtbareMats) {
    let menge = lager[mat.id] || 0;
    let preis = (marktpreise && marktpreise[mat.id]) || mat.verkaufpreis || 0;
    gesamtMenge += menge;
    gesamtWert  += menge * preis;
    if (menge > 0) aktiveTypen++;
  }

  // ── KPI Header ──
  let html =
    "<div class='lager-kpi-grid'>" +
      "<div class='kpi-card'>" +
        "<span class='kpi-label'>Gesamt im Lager</span>" +
        "<span class='kpi-value'>" + gesamtMenge.toLocaleString("de-DE") + "</span>" +
      "</div>" +
      "<div class='kpi-card'>" +
        "<span class='kpi-label'>Lagerwert</span>" +
        "<span class='kpi-value accent'>" + gesamtWert.toLocaleString("de-DE") + " €</span>" +
      "</div>" +
      "<div class='kpi-card'>" +
        "<span class='kpi-label'>Produkte mit Bestand</span>" +
        "<span class='kpi-value'>" + aktiveTypen + " <span style=\'font-size:11px;color:var(--text3)\'>/ " + sichtbareMats.length + "</span></span>" +
      "</div>" +
    "</div>";

  // ── Nach Produktionslinie gruppieren ──
  let gruppen = {};
  let reihenfolge = [];

  for (let mat of sichtbareMats) {
    let linie = mat.produktionslinie || "sonstige";
    if (!gruppen[linie]) { gruppen[linie] = []; reihenfolge.push(linie); }
    gruppen[linie].push(mat);
  }

  // Linien-Config
  let linienConfig = {
    holz:       { name: "Holzverarbeitung",  emoji: "🪵", farbe: "#a3622a" },
    metall:     { name: "Metallverarbeitung", emoji: "⚙️",  farbe: "#7a8fa6" },
    werkzeug:   { name: "Bergisches Werkzeug",emoji: "🔧", farbe: "#f59e0b" },
    industrie:  { name: "Industrie",          emoji: "🏭", farbe: "#06b6d4" },
    zulieferer: { name: "Auto-Zulieferer",    emoji: "🚗", farbe: "#8b5cf6" },
    rohstoffe:  { name: "Rohstoffe",          emoji: "⛏️",  farbe: "#6b7280" },
    sonstige:   { name: "Sonstige",           emoji: "📦", farbe: "#4b5563" }
  };

  for (let linienId of reihenfolge) {
    let cfg   = linienConfig[linienId] || linienConfig.sonstige;
    let mats  = gruppen[linienId];

    // Rohstoffe (nicht verkaufbar) als kompakte Liste
    let alleRohstoffe = mats.every(function(m) { return !m.verkaufbar; });

    html +=
      "<div class='lager-gruppe'>" +
        "<div class='lager-gruppe-header' style='color:" + cfg.farbe + ";border-color:" + cfg.farbe + "'>" +
          cfg.emoji + " " + cfg.name +
          "<span style='float:right;font-family:var(--font-mono);font-size:10px;color:var(--text3)'>" +
            mats.filter(function(m) { return (lager[m.id]||0) > 0; }).length + "/" + mats.length +
          "</span>" +
        "</div>" +
        "<div class='" + (alleRohstoffe ? "lager-rohstoff-grid" : "lager-karten-grid") + "'>";

    for (let mat of mats) {
      let menge  = lager[mat.id] || 0;
      let leer   = menge === 0;
      let preis  = (marktpreise && marktpreise[mat.id]) || mat.verkaufpreis || 0;
      let wert   = menge * preis;

      if (alleRohstoffe) {
        // Kompaktes Rohstoff-Item
        html +=
          "<div class='lager-rohstoff-item" + (leer ? " leer" : "") + "'>" +
            "<span class='lroi-emoji'>" + mat.emoji + "</span>" +
            "<span class='lroi-name'>" + mat.name + "</span>" +
            "<span class='lroi-menge" + (menge > 0 ? " hat-bestand" : "") + "'>" + menge.toLocaleString("de-DE") + "</span>" +
          "</div>";
      } else {
        // Vollständige Produkt-Karte (wie Markt)
        html +=
          "<div class='lager-produkt-karte" + (leer ? " lager-karte-leer" : "") + "'>" +

            // Top
            "<div class='lpk-top'>" +
              "<span class='lpk-emoji'>" + mat.emoji + "</span>" +
              "<div class='lpk-info'>" +
                "<span class='lpk-name'>" + mat.name + "</span>" +
                "<span class='lpk-tier'>T" + (mat.tier || "?") + "</span>" +
              "</div>" +
            "</div>" +

            // Bestand groß
            "<div class='lpk-bestand'>" +
              "<span class='lpk-menge" + (menge > 0 ? " hat-bestand" : "") + "'>" + menge.toLocaleString("de-DE") + "</span>" +
              "<span class='lpk-einheit'>Stk</span>" +
            "</div>" +

            // Wert
            (menge > 0
              ? "<div class='lpk-wert'>≈ " + wert.toLocaleString("de-DE") + " €</div>"
              : "<div class='lpk-wert lpk-wert-leer'>Kein Bestand</div>") +

            // Verkauf
            (mat.verkaufbar && menge > 0
              ? "<div class='lpk-aktionen'>" +
                  "<div class='mengen-steuer'>" +
                    "<button class='mengen-btn' data-id='" + mat.id + "' data-aktion='minus' data-typ='lager'>−</button>" +
                    "<input type='number' id='lager-menge-" + mat.id + "' value='" + Math.min(menge, 10) + "' min='1' max='" + menge + "' />" +
                    "<button class='mengen-btn' data-id='" + mat.id + "' data-aktion='plus' data-max='" + menge + "' data-typ='lager'>+</button>" +
                  "</div>" +
                  "<button class='lpk-btn-sell' data-id='" + mat.id + "'>" +
                    preis + " € <span style=\'font-size:9px\'>/ Stk</span>" +
                  "</button>" +
                "</div>"
              : "") +

          "</div>";
      }
    }

    html += "</div></div>";
  }

  reihe.innerHTML = html;

  // Events
  reihe.querySelectorAll(".lpk-btn-sell").forEach(function(btn) {
    btn.addEventListener("click", function() { materialVerkaufen(btn.dataset.id); });
  });

  reihe.querySelectorAll(".mengen-btn[data-typ='lager']").forEach(function(btn) {
    btn.addEventListener("click", function() {
      let id  = btn.dataset.id;
      let max = parseInt(btn.dataset.max || lager[id] || 1);
      let inp = document.getElementById("lager-menge-" + id);
      if (!inp) return;
      if (btn.dataset.aktion === "plus") inp.value = Math.min(max, parseInt(inp.value||1) + 1);
      else inp.value = Math.max(1, parseInt(inp.value||1) - 1);
    });
  });
}


// ── PERSONAL ──

function statistikAktualisieren() {
  let einnahmenProRunde = 0;
  let produktionInfo    = [];

  for (let m of installierte_maschinen) {
    if (!m.laeuft) continue;
    let rezept = REZEPTE.find(function(r) { return r.id === m.aktivesRezept; });
    if (!rezept) continue;
    for (let out of rezept.outputs) {
      let mat = MATERIALIEN.find(function(mat) { return mat.id === out.material; });
      if (mat && mat.verkaufbar) {
        einnahmenProRunde += out.menge * mat.verkaufpreis;
        produktionInfo.push(out.menge + "× " + mat.name);
      }
    }
  }

  let el1 = document.getElementById("stat-bretter-runde");
  let el2 = document.getElementById("stat-einnahmen-runde");
  let el3 = document.getElementById("stat-maschinen");
  if (el1) el1.textContent = produktionInfo.length > 0 ? produktionInfo.join(", ") : "0";
  if (el2) el2.textContent = einnahmenProRunde.toLocaleString("de-DE") + " €";
  if (el3) el3.textContent = installierte_maschinen.length;

  kostenAnzeigenAktualisieren();
  if (typeof stadtratBannerAktualisieren === "function") stadtratBannerAktualisieren();
}

function uebersichtAktualisieren() {
  let gebaeudeId = window.aktivesGebaeudeId || null;
  let gebaeudeData = gebaeudeId
    ? GEBAEUDE.find(function(g) { return g.id === gebaeudeId; })
    : GEBAEUDE.find(function(g) { return g.typ === "fabrik"; });

  if (!gebaeudeData) return;

  let gesamt = gebaeudeData.groesse.l * gebaeudeData.groesse.b;

  // Nur Maschinen dieser Linie
  let meineMaschinen = installierte_maschinen.filter(function(m) {
    let md = MASCHINEN.find(function(md) { return md.id === m.id; });
    return !gebaeudeData.produktionslinie || (md && md.produktionslinie === gebaeudeData.produktionslinie);
  });

  let belegte = meineMaschinen.reduce(function(sum, m) {
    return sum + m.groesse.l * m.groesse.b;
  }, 0);
  let frei = gesamt - belegte;
  let anzahl = meineMaschinen.length;

  let infoFlaeche = document.getElementById("info-flaeche");
  let infoMaschinen = document.getElementById("info-maschinen-anzahl");
  if (infoFlaeche) infoFlaeche.textContent = "📐 " + frei + " / " + gesamt + " m² frei";
  if (infoMaschinen) infoMaschinen.textContent = "⚙️ " + anzahl + (anzahl === 1 ? " Maschine" : " Maschinen");

  // Linie Badge im Screen-Titel
  let linie = gebaeudeData.produktionslinie ? PRODUKTIONSLINIEN[gebaeudeData.produktionslinie] : null;
  let screenTitel = document.querySelector("#screen-maschinen .screen-titel");
  if (screenTitel && linie) {
    screenTitel.innerHTML = gebaeudeData.emoji + " " + gebaeudeData.name +
      " <span class='linie-badge' style='color:" + linie.farbe + "; border-color:" + linie.farbe + "; background:" + linie.dunkel + "'>" +
        linie.emoji + " " + linie.name +
      "</span>";
  }

  // Maschinenkarten — nur für diese Linie
  let globalIndex = [];
  for (let i = 0; i < installierte_maschinen.length; i++) {
    let m = installierte_maschinen[i];
    let md = MASCHINEN.find(function(md) { return md.id === m.id; });
    if (!gebaeudeData.produktionslinie || (md && md.produktionslinie === gebaeudeData.produktionslinie)) {
      globalIndex.push(i);
    }
  }

  let liste = "";
  for (let i = 0; i < globalIndex.length; i++) {
    let idx = globalIndex[i];
    let m = installierte_maschinen[idx];
    let aktuellesRezept = REZEPTE.find(function(r) { return r.id === m.aktivesRezept; });
    let rezeptName = aktuellesRezept ? aktuellesRezept.name : m.aktivesRezept;

    let rezeptDetail = "";
    if (aktuellesRezept) {
      let inputs = aktuellesRezept.inputs.map(function(inp) {
        let mat = MATERIALIEN.find(function(mat) { return mat.id === inp.material; });
        return inp.menge + "× " + (mat ? mat.name : inp.material);
      }).join(", ");
      let outputs = aktuellesRezept.outputs.map(function(out) {
        let mat = MATERIALIEN.find(function(mat) { return mat.id === out.material; });
        return out.menge + "× " + (mat ? mat.name : out.material);
      }).join(", ");
      rezeptDetail = inputs + " → " + outputs;
    }

    let md = MASCHINEN.find(function(md) { return md.id === m.id; });
    let maschineLinienFarbe = linienFarbe(md ? md.produktionslinie : null);
    let sessionCount = m.sessionProduktionen || 0;
    let effizienz = hatGenugPersonal() ? 100 :
      Math.min(100, Math.round((mitarbeiter / Math.max(1, mitarbeiterBenoetigt())) * 100));

    let statusFarbe = m.laeuft ? "var(--green)" : "var(--red)";
    let statusText  = m.laeuft ? "LÄUFT" : "GESTOPPT";

    liste +=
      "<div class='maschinen-karte-v2" + (m.laeuft ? "" : " gestoppt") + "' " +
        "style='border-top: 3px solid " + maschineLinienFarbe + "'>" +

        "<div class='mkv2-header'>" +
          "<div class='mkv2-header-links'>" +
            "<div class='mkv2-led' style='background:" + statusFarbe + "'></div>" +
            "<span class='mkv2-name'>" + m.emoji + " " + m.name + " #" + (i+1) + "</span>" +
          "</div>" +
          "<span class='mkv2-status-badge' style='color:" + statusFarbe + "; border-color:" + statusFarbe + "'>" +
            statusText +
          "</span>" +
        "</div>" +

        (md && md.bild ? "<img src='" + md.bild + "' class='mkv2-bild' alt='" + m.name + "' />" : "") +

        "<div class='mkv2-rezept'>" +
          "<span class='mkv2-rezept-label'>⚙️ REZEPT</span>" +
          "<span class='mkv2-rezept-name'>" + rezeptName + "</span>" +
          "<span class='mkv2-rezept-detail'>" + rezeptDetail + "</span>" +
        "</div>" +

        "<div class='mkv2-stats'>" +
          "<div class='mkv2-stat'><span class='mkv2-stat-wert'>" + (m.groesse.l * m.groesse.b) + " m²</span><span class='mkv2-stat-label'>Fläche</span></div>" +
          "<div class='mkv2-stat'><span class='mkv2-stat-wert'>" + m.kostenProRunde + " €</span><span class='mkv2-stat-label'>€/Runde</span></div>" +
          "<div class='mkv2-stat'><span class='mkv2-stat-wert'>" + effizienz + "%</span><span class='mkv2-stat-label'>Effizienz</span></div>" +
          "<div class='mkv2-stat'><span class='mkv2-stat-wert'>" + sessionCount + "</span><span class='mkv2-stat-label'>Prod.</span></div>" +
        "</div>" +

        "<div class='mkv2-effizienz-container'>" +
          "<div class='mkv2-effizienz-fill' style='width:" + effizienz + "%; background:" +
            (effizienz >= 100 ? "var(--green)" : effizienz >= 50 ? "var(--accent)" : "var(--red)") + "'></div>" +
        "</div>" +

        "<div class='mkv2-footer'>" +
          "<button class='mkv2-btn-verwalten' data-maschine-idx='" + idx + "'>" +
            "⚙️ Verwalten" +
          "</button>" +
          "<button class='mkv2-btn-toggle' data-toggle-idx='" + idx + "' " +
            "style='background:" + (m.laeuft ? "rgba(239,68,68,0.15)" : "rgba(16,185,129,0.15)") + "; " +
            "color:" + statusFarbe + "; border-color:" + statusFarbe + "'>" +
            (m.laeuft ? "⏹ Stopp" : "▶ Start") +
          "</button>" +
        "</div>" +
      "</div>";
  }

  let maschListe = document.getElementById("info-maschinen-liste");
  if (maschListe) {
    maschListe.innerHTML = liste || "<p class='screen-hinweis' id='hinweis-maschinen'>Noch keine Maschinen installiert.</p>";

    // Event-Listener für Verwalten-Buttons
    maschListe.querySelectorAll(".mkv2-btn-verwalten[data-maschine-idx]").forEach(function(btn) {
      btn.addEventListener("click", function() {
        verwaltenOeffnen("maschine", btn.getAttribute("data-maschine-idx"));
      });
    });

    // Event-Listener für Toggle-Buttons
    maschListe.querySelectorAll(".mkv2-btn-toggle[data-toggle-idx]").forEach(function(btn) {
      btn.addEventListener("click", function() {
        maschineToggle(parseInt(btn.getAttribute("data-toggle-idx")));
      });
    });
  }

  statistikAktualisieren();
}

function maschineToggle(index) {
  installierte_maschinen[index].laeuft = !installierte_maschinen[index].laeuft;
  uebersichtAktualisieren();
  spielstandSpeichern();
}