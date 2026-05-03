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

  let gesamtMenge = 0;
  let gesamtWert  = 0;
  let typenMitBestand = 0;

  for (let k in lager) {
    let m = gesamtMenge;
    gesamtMenge += lager[k] || 0;
    if ((lager[k] || 0) > 0) typenMitBestand++;
  }

  for (let mat of MATERIALIEN) {
    let menge = lager[mat.id] || 0;
    let preis = (marktpreise && marktpreise[mat.id]) ? marktpreise[mat.id] : (mat.verkaufpreis || 0);
    gesamtWert += menge * preis;
  }

  let html =
    "<div class='lager-info-bar'>" +
      "<div class='lager-info-item'>" +
        "<span class='lager-info-label'>📦 Gesamt</span>" +
        "<span class='lager-info-wert'>" + gesamtMenge.toLocaleString("de-DE") + "</span>" +
      "</div>" +
      "<div class='lager-info-item'>" +
        "<span class='lager-info-label'>💰 Lagerwert</span>" +
        "<span class='lager-info-wert'>" + gesamtWert.toLocaleString("de-DE") + " €</span>" +
      "</div>" +
    "</div>" +
    "<div id='lager-items-grid'>";

  for (let mat of MATERIALIEN) {
    // Tier-Filter: nicht freigeschaltete Materialien verstecken
    if (typeof materialIstSichtbar === "function" && !materialIstSichtbar(mat)) continue;

    let menge  = lager[mat.id] || 0;
    let leer   = menge === 0;

    let verkaufHTML = "";
    if (mat.verkaufbar && menge > 0) {
      verkaufHTML =
        "<div class='lager-verkauf'>" +
          "<div class='shop-mengen' style='transform:scale(0.9)'>" +
            "<button class='mengen-btn' data-id='" + mat.id + "' data-aktion='minus'>−</button>" +
            "<input type='number' id='verkauf-menge-" + mat.id + "' value='1' min='1' max='" + menge + "' />" +
            "<button class='mengen-btn' data-id='" + mat.id + "' data-aktion='plus'>+</button>" +
          "</div>" +
          "<button class='btn-verkaufen-lager' data-id='" + mat.id + "'>💰 " +
            (marktpreise && marktpreise[mat.id] ? marktpreise[mat.id] : mat.verkaufpreis) + " €" +
          "</button>" +
        "</div>";
    }

    html +=
      "<div class='lager-item" + (leer ? " leer" : "") + "'>" +
        "<div class='lager-item-header'>" +
          "<span class='lager-item-label'>" + mat.emoji + " " + mat.name + "</span>" +
          "<span class='lager-item-wert" + (menge > 0 ? " hat-bestand" : "") + "'>" + menge + "</span>" +
        "</div>" +
        verkaufHTML +
      "</div>";
  }

  html += "</div>";
  reihe.innerHTML = html;

  reihe.querySelectorAll(".btn-verkaufen-lager").forEach(function(btn) {
    btn.addEventListener("click", function() { materialVerkaufen(btn.dataset.id); });
  });

  reihe.querySelectorAll(".mengen-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      let id     = btn.dataset.id;
      let aktion = btn.dataset.aktion;
      let input  = document.getElementById("verkauf-menge-" + id);
      let maxMenge = lager[id] || 0;
      if (!input) return;
      if (aktion === "plus")  input.value = Math.min(maxMenge, parseInt(input.value || 1) + 1);
      else                    input.value = Math.max(1, parseInt(input.value || 1) - 1);
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


// ── ÜBERSICHT DASHBOARD ──
function uebersichtKPIsAktualisieren() {
  let kpiBereich = document.getElementById("uebersicht-kpis");
  if (!kpiBereich) return;

  // Berechne KPIs
  let einnahmen = 0, kosten = 0;
  let laufende = 0, gestoppte = 0;

  for (let m of installierte_maschinen) {
    kosten += (m.kostenProRunde || 0);
    if (m.laeuft) {
      laufende++;
      let rez = REZEPTE.find(function(r) { return r.id === m.aktivesRezept; });
      if (rez) {
        for (let out of rez.outputs) {
          let mat = MATERIALIEN.find(function(m) { return m.id === out.material; });
          if (mat && mat.verkaufpreis) einnahmen += out.menge * mat.verkaufpreis;
        }
      }
    } else {
      gestoppte++;
    }
  }

  // Lagerwert
  let lagerwert = 0;
  for (let mat of MATERIALIEN) {
    let menge = lager[mat.id] || 0;
    let preis = (marktpreise && marktpreise[mat.id]) || mat.verkaufpreis || 0;
    lagerwert += menge * preis;
  }

  let gewinn = einnahmen - kosten;

  kpiBereich.innerHTML =
    "<div class='dashboard-kpis'>" +
      "<div class='kpi-card'>" +
        "<span class='kpi-label'>Guthaben</span>" +
        "<span class='kpi-value accent'>" + geld.toLocaleString("de-DE") + " €</span>" +
      "</div>" +
      "<div class='kpi-card'>" +
        "<span class='kpi-label'>Gewinn / Runde</span>" +
        "<span class='kpi-value " + (gewinn >= 0 ? "positive" : "negative") + "'>" +
          (gewinn >= 0 ? "+" : "") + gewinn.toLocaleString("de-DE") + " €</span>" +
      "</div>" +
      "<div class='kpi-card'>" +
        "<span class='kpi-label'>Maschinen aktiv</span>" +
        "<span class='kpi-value'>" + laufende + "<span style='font-size:12px;color:var(--text3)'>/" + (laufende+gestoppte) + "</span></span>" +
      "</div>" +
      "<div class='kpi-card'>" +
        "<span class='kpi-label'>Lagerwert</span>" +
        "<span class='kpi-value'>" + lagerwert.toLocaleString("de-DE") + " €</span>" +
      "</div>" +
    "</div>" +

    // Maschinen-Status Schnellübersicht
    (installierte_maschinen.length > 0 ?
      "<div class='dashboard-maschinen-quick'>" +
        "<div class='screen-titel' style='margin-top:14px'>Maschinen</div>" +
        installierte_maschinen.map(function(m) {
          let md  = MASCHINEN.find(function(md) { return md.id === m.id; });
          let rez = REZEPTE.find(function(r) { return r.id === m.aktivesRezept; });
          let name = md ? md.name : m.id;
          let emo  = md ? md.emoji : "⚙️";
          let prodText = rez ? rez.name : "Kein Rezept";
          let statusFarbe = m.laeuft ? "var(--green)" : "var(--red)";
          let statusText  = m.laeuft ? "Läuft" : "Gestoppt";
          return "<div class='dash-maschine-row'>" +
            "<span class='dmr-emoji'>" + emo + "</span>" +
            "<div class='dmr-info'>" +
              "<span class='dmr-name'>" + name + "</span>" +
              "<span class='dmr-rezept'>" + prodText + "</span>" +
            "</div>" +
            "<span class='dmr-status' style='color:" + statusFarbe + "'>" + statusText + "</span>" +
          "</div>";
        }).join("") +
      "</div>"
    : "<div class='screen-hinweis'>Noch keine Maschinen. Kaufe deine erste Maschine im Shop.</div>");
}
