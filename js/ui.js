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
  if (typeof uebersichtKPIsAktualisieren === "function") uebersichtKPIsAktualisieren();
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


// ══════════════════════════════════════════════════════
// ÜBERSICHT — COCKPIT DASHBOARD
// ══════════════════════════════════════════════════════

function uebersichtKPIsAktualisieren() {
  let bereich = document.getElementById("uebersicht-kpis");
  if (!bereich) return;

  // ── KPI Berechnungen ──
  let einnahmenProRunde = 0;
  let kostenProRunde    = 0;
  let laufende  = 0;
  let gestoppte = 0;
  let engpaesse = [];

  // Grundstück + Gebäude Laufkosten
  if (typeof GRUNDSTUECKE !== "undefined") {
    for (let gs of GRUNDSTUECKE) {
      if (gekaufte_grundstuecke && gekaufte_grundstuecke.includes(gs.id)) {
        kostenProRunde += gs.kostenProRunde || 0;
      }
    }
  }
  if (typeof GEBAEUDE !== "undefined") {
    for (let [id, count] of Object.entries(gekaufte_gebaeude || {})) {
      let g = GEBAEUDE.find(function(g) { return g.id === id; });
      if (g) kostenProRunde += (g.kostenProRunde || 0) * (count || 1);
    }
  }

  // Maschinen
  for (let m of installierte_maschinen) {
    let md  = MASCHINEN ? MASCHINEN.find(function(md) { return md.id === m.id; }) : null;
    let rez = REZEPTE   ? REZEPTE.find(function(r)  { return r.id  === m.aktivesRezept; }) : null;
    kostenProRunde += md ? (md.kostenProRunde || 0) : 0;

    if (m.laeuft && rez) {
      laufende++;
      // Einnahmen schätzen
      for (let out of (rez.outputs || [])) {
        let mat = MATERIALIEN ? MATERIALIEN.find(function(ma) { return ma.id === out.material; }) : null;
        if (mat && mat.verkaufpreis) {
          einnahmenProRunde += (out.menge * mat.verkaufpreis) / Math.max(rez.dauer, 1);
        }
      }
      // Engpass: läuft aber Lager läuft aus?
      for (let inp of (rez.inputs || [])) {
        let bestand = lager[inp.material] || 0;
        let mat = MATERIALIEN ? MATERIALIEN.find(function(ma) { return ma.id === inp.material; }) : null;
        if (bestand < inp.menge * 2) {
          engpaesse.push({
            maschine: md ? md.name : m.id,
            material: mat ? mat.name : inp.material,
            emoji:    mat ? mat.emoji : "⚠️",
            bestand:  bestand,
            benoetigt: inp.menge
          });
        }
      }
    } else if (!m.laeuft) {
      gestoppte++;
      // Gestoppte Maschine ohne Rezept = Engpass
      if (!m.aktivesRezept || m.aktivesRezept === "null") {
        engpaesse.push({
          maschine: md ? md.name : m.id,
          material: "Kein Rezept gewählt",
          emoji: "⚙️",
          bestand: 0,
          benoetigt: 0,
          keinRezept: true
        });
      }
    }
  }

  let gewinnProRunde = einnahmenProRunde - kostenProRunde;
  let lagerwert = 0;
  for (let mat of (MATERIALIEN || [])) {
    lagerwert += (lager[mat.id] || 0) * ((marktpreise && marktpreise[mat.id]) || mat.verkaufpreis || 0);
  }

  // ── Firmen-Header ──
  let firmaName   = (typeof unternehmen !== "undefined" && unternehmen && unternehmen.name) || "PocketSim";
  let firmaSlogan = (typeof unternehmen !== "undefined" && unternehmen && unternehmen.slogan) || "Produktionsimperium";
  let firmaFarbe  = (typeof unternehmen !== "undefined" && unternehmen && unternehmen.farbe) || "var(--amber)";
  let firmaFokus  = typeof unternehmen !== "undefined" && unternehmen && unternehmen.fokus
    ? { bergbau:"⛏ Bergbau", fertigung:"🏭 Fertigung", handel:"📦 Handel", forschung:"🔬 Forschung" }[unternehmen.fokus]
    : "";
  let epocheNum   = (typeof aktuelleEpoche !== "undefined" && aktuelleEpoche) || 1;

  // ── Auftrags-Vorschau ──
  let aktiveAuftraege = aktive_auftraege || [];
  let dringendste = aktiveAuftraege
    .slice()
    .sort(function(a, b) { return (a.rundenVerbleibend||99) - (b.rundenVerbleibend||99); })
    .slice(0, 3);

  let html = "";

  // ── 1. FIRMEN-BANNER ──
  html +=
    "<div class='cockpit-firma-banner' style='border-left-color:" + firmaFarbe + "'>" +
      "<div class='cfb-left'>" +
        "<div class='cfb-name' style='color:" + firmaFarbe + "'>" + firmaName + "</div>" +
        (firmaSlogan ? "<div class='cfb-slogan'>" + firmaSlogan + "</div>" : "") +
      "</div>" +
      "<div class='cfb-right'>" +
        "<div class='cfb-epoche'>Epoche " + epocheNum + "</div>" +
        (firmaFokus ? "<div class='cfb-fokus'>" + firmaFokus + "</div>" : "") +
      "</div>" +
    "</div>";

  // ── 2. KPI-KARTEN ──
  let kpiKlasse = gewinnProRunde >= 0 ? "positive" : "negative";
  html +=
    "<div class='cockpit-kpis'>" +
      "<div class='kpi-card'>" +
        "<span class='kpi-label'>Guthaben</span>" +
        "<span class='kpi-value accent'>" + geld.toLocaleString("de-DE") + " €</span>" +
      "</div>" +
      "<div class='kpi-card'>" +
        "<span class='kpi-label'>Gewinn / Runde</span>" +
        "<span class='kpi-value " + kpiKlasse + "'>" +
          (gewinnProRunde >= 0 ? "+" : "") + Math.round(gewinnProRunde).toLocaleString("de-DE") + " €</span>" +
      "</div>" +
      "<div class='kpi-card'>" +
        "<span class='kpi-label'>Maschinen</span>" +
        "<span class='kpi-value'>" +
          "<span style='color:var(--green)'>" + laufende + " aktiv</span>" +
          (gestoppte > 0 ? " <span style='color:var(--red);font-size:12px'>· " + gestoppte + " gestoppt</span>" : "") +
        "</span>" +
      "</div>" +
      "<div class='kpi-card'>" +
        "<span class='kpi-label'>Lagerwert</span>" +
        "<span class='kpi-value'>" + lagerwert.toLocaleString("de-DE") + " €</span>" +
      "</div>" +
    "</div>";

  // ── 3. ENGPASS-WARNUNG ──
  if (engpaesse.length > 0) {
    html += "<div class='cockpit-engpaesse'>";
    html += "<div class='cockpit-section-title'>⚠️ Engpässe</div>";
    for (let e of engpaesse.slice(0, 4)) {
      html +=
        "<div class='cockpit-engpass-item'>" +
          "<span class='cei-emoji'>" + e.emoji + "</span>" +
          "<div class='cei-info'>" +
            "<span class='cei-maschine'>" + e.maschine + "</span>" +
            (e.keinRezept
              ? "<span class='cei-problem'>Kein Rezept gewählt — Maschine steht still</span>"
              : "<span class='cei-problem'>" + e.material + " fast leer (" + e.bestand + " / " + (e.benoetigt * 3) + " Mindest)</span>") +
          "</div>" +
          "<button class='cei-btn' onclick=\"tabWechseln('shop')\">Kaufen →</button>" +
        "</div>";
    }
    html += "</div>";
  }

  // ── 4. MASCHINEN STATUS ──
  if (installierte_maschinen.length > 0) {
    html += "<div class='cockpit-section'>";
    html += "<div class='cockpit-section-title'>⚙️ Maschinen</div>";
    html += "<div class='cockpit-maschinen'>";
    for (let m of installierte_maschinen) {
      let md  = MASCHINEN ? MASCHINEN.find(function(md) { return md.id === m.id; }) : null;
      let rez = REZEPTE   ? REZEPTE.find(function(r)   { return r.id  === m.aktivesRezept; }) : null;
      let name = md ? md.name : m.id;
      let emoji = md ? md.emoji : "⚙️";
      let rezName = rez ? rez.name : "Kein Rezept";
      let istLaufend = m.laeuft;

      // Output Material für Anzeige
      let outMat = rez && rez.outputs && rez.outputs[0]
        ? (MATERIALIEN ? MATERIALIEN.find(function(ma) { return ma.id === rez.outputs[0].material; }) : null)
        : null;

      html +=
        "<div class='cockpit-maschine-karte " + (istLaufend ? "laeuft" : "gestoppt") + "'>" +
          "<div class='cmk-header'>" +
            "<span class='cmk-emoji'>" + emoji + "</span>" +
            "<div class='cmk-info'>" +
              "<span class='cmk-name'>" + name + "</span>" +
              "<span class='cmk-rezept'>" + rezName + "</span>" +
            "</div>" +
            "<div class='cmk-status-dot " + (istLaufend ? "dot-an" : "dot-aus") + "'></div>" +
          "</div>" +
          (outMat && istLaufend
            ? "<div class='cmk-output'>" + outMat.emoji + " produziert " + outMat.name + "</div>"
            : "") +
        "</div>";
    }
    html += "</div></div>";
  } else {
    html +=
      "<div class='cockpit-leer-hint'>" +
        "<div style='font-size:32px;margin-bottom:8px'>🏭</div>" +
        "<div style='font-family:var(--font-head);font-size:14px;font-weight:700'>Noch keine Maschinen</div>" +
        "<div style='font-size:12px;color:var(--text3);margin-top:4px'>Kaufe dein erstes Grundstück und eine Fabrikhalle im Shop.</div>" +
        "<button style='margin-top:12px' onclick='\"tabWechseln(quote)\"'.replace('quote',\"'shop'\")>→ Zum Shop</button>" +
      "</div>";
  }

  // ── 5. AKTIVE AUFTRÄGE ──
  if (dringendste.length > 0) {
    html += "<div class='cockpit-section'>";
    html += "<div class='cockpit-section-title'>📋 Aufträge <span style='font-family:var(--font-mono);font-size:11px;color:var(--text3);margin-left:6px'>" + aktiveAuftraege.length + " aktiv</span></div>";
    html += "<div class='cockpit-auftraege'>";
    for (let a of dringendste) {
      let vorlage = AUFTRAEGE_VORLAGEN ? AUFTRAEGE_VORLAGEN.find(function(v) { return v.id === a.vorlageId; }) : null;
      if (!vorlage) continue;
      let mat = MATERIALIEN ? MATERIALIEN.find(function(m) { return m.id === vorlage.material; }) : null;
      let bestand = lager[vorlage.material] || 0;
      let pct = Math.min(100, Math.round((bestand / vorlage.menge) * 100));
      let dringend = a.rundenVerbleibend <= 3;
      let fertig   = bestand >= vorlage.menge;
      let fillFarbe = fertig ? "var(--green)" : dringend ? "var(--red)" : "var(--amber)";

      html +=
        "<div class='cockpit-auftrag-row " + (dringend ? "dringend" : "") + "'>" +
          "<div class='car-left'>" +
            "<div class='car-name'>" + vorlage.name + "</div>" +
            "<div class='car-material'>" + (mat ? mat.emoji : "📦") + " " + bestand + " / " + vorlage.menge + " " + (mat ? mat.name : "") + "</div>" +
            "<div class='car-bar'><div style='width:" + pct + "%;height:100%;border-radius:2px;background:" + fillFarbe + ";transition:width .5s'></div></div>" +
          "</div>" +
          "<div class='car-right'>" +
            "<span class='car-bonus'>+" + (a.bonus||0).toLocaleString("de-DE") + " €</span>" +
            "<span class='car-deadline " + (dringend ? "rot" : "") + "'>" + a.rundenVerbleibend + " R</span>" +
          "</div>" +
        "</div>";
    }
    if (aktiveAuftraege.length > 3) {
      html += '<button style="width:100%;margin-top:4px" onclick="tabWechseln(\'auftraege\')">Alle ' + aktiveAuftraege.length + " Aufträge →</button>";
    }
    html += "</div></div>";
  }

  bereich.innerHTML = html;
}

