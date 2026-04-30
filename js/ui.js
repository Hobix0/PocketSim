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
  reihe.innerHTML = "";

  // ── Gesamt-Info ──
  let gesamtMenge = 0;
  for (let k in lager) gesamtMenge += lager[k] || 0;

  let infoHTML =
    "<div class='lager-info-bar'>" +
      "<div class='lager-info-item'>" +
        "<span class='lager-info-label'>📦 Gesamt</span>" +
        "<span class='lager-info-wert'>" + gesamtMenge + "</span>" +
      "</div>" +
      "<div class='lager-info-item'>" +
        "<span class='lager-info-label'>🗂️ Materialtypen</span>" +
        "<span class='lager-info-wert'>" + MATERIALIEN.length + "</span>" +
      "</div>" +
    "</div>";

  reihe.innerHTML = infoHTML;

  // ── Material-Items ──
  for (let i = 0; i < MATERIALIEN.length; i++) {
    let m = MATERIALIEN[i];
    let menge = lager[m.id] || 0;

    let verkaufHTML = "";
    if (m.verkaufbar && menge > 0) {
      verkaufHTML =
        "<div class='lager-verkauf'>" +
          "<div class='mengen-steuer'>" +
            "<button class='mengen-btn' data-id='" + m.id + "' data-aktion='minus'>−</button>" +
            "<input type='number' id='verkauf-menge-" + m.id + "' value='1' min='1' max='" + menge + "' />" +
            "<button class='mengen-btn' data-id='" + m.id + "' data-aktion='plus'>+</button>" +
          "</div>" +
          "<button class='btn-verkaufen-lager' data-id='" + m.id + "'>" +
            "💰 Verkaufen (" + m.verkaufpreis + " €/Stk)" +
          "</button>" +
        "</div>";
    }

    reihe.innerHTML +=
      "<div class='lager-item'>" +
        "<div class='lager-item-header'>" +
          "<span class='lager-item-label'>" + m.emoji + " " + m.name + "</span>" +
          "<span class='lager-item-wert'>" + menge + "</span>" +
        "</div>" +
        verkaufHTML +
      "</div>";
  }

  reihe.querySelectorAll(".btn-verkaufen-lager").forEach(function(btn) {
    btn.addEventListener("click", function() {
      materialVerkaufen(btn.getAttribute("data-id"));
    });
  });

  reihe.querySelectorAll(".mengen-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      let id = btn.getAttribute("data-id");
      let aktion = btn.getAttribute("data-aktion");
      let input = document.getElementById("verkauf-menge-" + id);
      let m = MATERIALIEN.find(function(mat) { return mat.id === id; });
      if (!input || !m) return;
      
      let menge = lager[id] || 0;
      if (aktion === "plus") {
        input.value = Math.min(menge, parseInt(input.value || 1) + 1);
      } else {
        input.value = Math.max(1, parseInt(input.value || 1) - 1);
      }
    });
  });
}

function statistikAktualisieren() {
  let anzahl = installierte_maschinen.length;
  let einnahmenProRunde = 0;
  let produktionInfo = [];

  for (let i = 0; i < installierte_maschinen.length; i++) {
    let maschine = installierte_maschinen[i];
    if (!maschine.laeuft) continue;

    let rezept = REZEPTE.find(function(r) { return r.id === maschine.aktivesRezept; });
    if (!rezept) continue;

    for (let j = 0; j < rezept.outputs.length; j++) {
      let output = rezept.outputs[j];
      let material = MATERIALIEN.find(function(m) { return m.id === output.material; });
      if (material && material.verkaufbar) {
        einnahmenProRunde += output.menge * material.verkaufpreis;
        produktionInfo.push(output.menge + "× " + material.name);
      }
    }
  }

  document.getElementById("stat-bretter-runde").textContent =
    produktionInfo.length > 0 ? produktionInfo.join(", ") : "0";
  document.getElementById("stat-einnahmen-runde").textContent =
    einnahmenProRunde.toLocaleString("de-DE") + " €";
  document.getElementById("stat-maschinen").textContent = anzahl;

  kostenAnzeigenAktualisieren();
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