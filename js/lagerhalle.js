// ─────────────────────────────────────────────
// 🔧 BASIS: Lagerhalle Daten
// ─────────────────────────────────────────────

function getLagerhalleData(gebaeudeId) {
  return GEBAEUDE.find(g => g.id === gebaeudeId && g.typ === "lager") || null;
}


// ─────────────────────────────────────────────
// 🏗️ GEBÄUDE ÜBERSICHT (MAIN UI)
// ─────────────────────────────────────────────

function uebersichtGebaeudeAktualisieren(gsId) {
  gsId = gsId || window.aktivesGrundstueckId;

  const bereich = document.getElementById("gebaeude-bereich");
  if (!bereich) return;

  const gsData = GRUNDSTUECKE.find(g => g.id === gsId);
  const gekaufte = gebaeudeVonGrundstueck(gsId);
  const gebaeudeListe = gekaufte.map(id => GEBAEUDE.find(g => g.id === id)).filter(g => g);

  if (gebaeudeListe.length === 0) {
    bereich.innerHTML = "<p>Keine Gebäude vorhanden.</p>";
    return;
  }

  // Gruppieren
  let gruppen = {};
  let reihenfolge = [];

  for (let g of gebaeudeListe) {
    let key = (g.typ === "fabrik") ? (g.produktionslinie || "sonstige") : g.typ;

    if (!gruppen[key]) {
      gruppen[key] = [];
      reihenfolge.push(key);
    }
    gruppen[key].push(g);
  }

  let html = "";

  for (let key of reihenfolge) {

    let linie = (typeof PRODUKTIONSLINIEN !== "undefined")
      ? PRODUKTIONSLINIEN[key]
      : null;

    let farbe = linie ? linie.farbe : "#666";

    let headerText = "";

    if (linie) {
      headerText = linie.emoji + " " + linie.name;
    } else if (key === "lager") {
      headerText = "📦 Lager";
      farbe = "#3b82f6";
    } else if (key === "mine") {
      headerText = "⛏️ Mine";
      farbe = "#8b5cf6";
    } else if (key === "labor") {
      headerText = "🔬 Labor";
      farbe = "#10b981";
    }

    html += `
      <div class="gebaeude-gruppe-header" style="color:${farbe}; border-color:${farbe}">
        ${headerText}
      </div>
    `;

    for (let data of gruppen[key]) {
      let bildHTML = data.bild
        ? `<img src="${data.bild}" class="objekt-karte-img">`
        : `<span style="font-size:28px">${data.emoji}</span>`;

      html += `
        <div class="objekt-karte klickbar"
             style="border-left:3px solid ${farbe}"
             data-geb-id="${data.id}">

          <div class="objekt-karte-bild">${bildHTML}</div>

          <div class="objekt-karte-body">
            <div class="objekt-karte-header">${data.name}</div>
            <div class="objekt-karte-stats">${gebaeudeStatsHTML(data)}</div>
          </div>

          <button class="btn-verwalten" data-verwalten-geb="${data.id}">
            ⚙️
          </button>

          <div class="objekt-karte-arrow">›</div>
        </div>
      `;
    }
  }

  // freie Plätze
  if (gsData) {
    let frei = gsData.maxGebaeude - gebaeudeListe.length;

    if (frei > 0) {
      html += `
        <div class="gebaeude-freie-plaetze">
          🏗️ ${frei} freie Bauplätze
          <button data-shop-btn>Shop</button>
        </div>
      `;
    }
  }

  bereich.innerHTML = html;

  // Event-Listener für Gebäude-Karten
  bereich.querySelectorAll(".objekt-karte[data-geb-id]").forEach(function(karte) {
    karte.addEventListener("click", function(e) {
      // Nicht triggern wenn auf Verwalten-Button geklickt
      if (e.target.closest(".btn-verwalten")) return;
      gebaeudeAnklicken(karte.getAttribute("data-geb-id"));
    });
  });

  // Event-Listener für Verwalten-Buttons
  bereich.querySelectorAll(".btn-verwalten[data-verwalten-geb]").forEach(function(btn) {
    btn.addEventListener("click", function(e) {
      e.stopPropagation();
      verwaltenOeffnen("gebaeude", btn.getAttribute("data-verwalten-geb"));
    });
  });

  // Event-Listener für Shop-Button
  bereich.querySelectorAll("[data-shop-btn]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      screenZeigen("shop");
    });
  });
}


// ─────────────────────────────────────────────
// 📊 STATS
// ─────────────────────────────────────────────

function gebaeudeStatsHTML(data) {

  if (data.typ === "fabrik") {
    let maschinen = maschinenVonGebaeude(data.id);
    let belegte = maschinen.reduce((s, m) => s + (m.groesse.l * m.groesse.b), 0);
    let gesamt = data.groesse.l * data.groesse.b;
    let aktive = maschinen.filter(m => m.laeuft).length;
    let prozent = Math.round((belegte / gesamt) * 100);

    return `
      <span>📐 ${gesamt - belegte}/${gesamt} frei</span>
      <span>⚙️ ${aktive}/${maschinen.length} aktiv</span>
      <span>📊 ${prozent}%</span>
    `;
  }

  if (data.typ === "lager") {
    let gefuellt = Object.values(lager || {}).filter(v => v > 0).length;

    return `
      <span>📦 ${data.kapazitaetProMaterial || 1000} Kapazität</span>
      <span>🗂️ ${gefuellt} Materialien</span>
    `;
  }

  if (data.typ === "mine") {
    return `<span>⛏️ Produktion aktiv</span>`;
  }

  if (data.typ === "labor") {
    return `<span>🔬 Forschung</span>`;
  }

  return "";
}


// ─────────────────────────────────────────────
// 🖱️ CLICK HANDLER
// ─────────────────────────────────────────────

function gebaeudeAnklicken(id) {
  let data = GEBAEUDE.find(g => g.id === id);
  if (!data) return;

  let gs = GRUNDSTUECKE.find(g => g.id === window.aktivesGrundstueckId);
  let pfad = gs ? gs.name : "Grundstück";

  if (data.typ === "fabrik" || data.typ === "lager" || data.typ === "kraftwerk" || data.typ === "labor") {
    // 2D Fabrikkarte öffnen
    let gsId = (gekaufte_grundstuecke && gekaufte_grundstuecke[0]) || null;
    if (typeof fabrikkarteOeffnen === "function") {
      fabrikkarteOeffnen(id, gsId);
      return; // Modal übernimmt — kein drillDown nötig
    }
    // Fallback
    window.aktivesGebaeudeId = id;
    drillDown("maschinen", pfad + " › " + data.name);
    if (typeof hallenplanGenerieren === "function") {
      document.getElementById("hallenplan-bereich").innerHTML = hallenplanGenerieren(id);
    }
    if (typeof hallenUpgradeScreenAktualisieren === "function") {
      hallenUpgradeScreenAktualisieren(id);
    }

    uebersichtAktualisieren();
  }

  if (data.typ === "lager") {
    drillDown("lager-gebaeude", pfad + " › " + data.name);
    lagerGebaeudeScreenAktualisieren(id);
  }

  if (data.typ === "mine") {
    window.aktivesMineId = id;
    drillDown("mine", pfad + " › " + data.name);
    mineScreenAktualisieren?.(id);
  }

  if (data.typ === "labor") {
    drillDown("labor", pfad + " › " + data.name);
    laborAnzeigenAktualisieren?.();
  }

  if (data.typ === "logistik" || data.typ === "kraftwerk") {
    // Logistik (Garage) und Kraftwerk → LKW/Info Screen oder Verwalten
    if (data.typ === "logistik") {
      // Zur Logistik-Navigation
      if (typeof screenZeigen === "function") screenZeigen("lkw");
      // Nav-Button aktivieren
      document.querySelectorAll(".sidebar-btn, .nav-btn").forEach(function(b) {
        b.classList.toggle("aktiv", b.getAttribute("data-screen") === "lkw");
      });
    } else {
      // Kraftwerk: Verwalten-Modal öffnen
      verwaltenOeffnen("gebaeude", data.id);
    }
  }
}


// ─────────────────────────────────────────────
// 📦 LAGER UI
// ─────────────────────────────────────────────

function lagerGebaeudeScreenAktualisieren(gebaeudeId) {

  const bereich = document.getElementById("lager-gebaeude-bereich");
  if (!bereich) return;

  const data = getLagerhalleData(gebaeudeId);
  const kapazitaet = data?.kapazitaetProMaterial || 1000;

  const gruppen = gruppiereMaterialien();

  let html = buildLagerSummary(kapazitaet) +
             buildMaterialGruppen(gruppen, kapazitaet);

  bereich.innerHTML = html;

  bindLagerEvents(gebaeudeId);
}


// ─────────────────────────────────────────────
// 📊 LAGER SUMMARY
// ─────────────────────────────────────────────

function buildLagerSummary(kapazitaet) {
  let gesamt = 0;

  for (let k in lager) gesamt += lager[k] || 0;

  return `
    <div class="lager-summary">
      <div>${gesamt}</div>
      <div>${kapazitaet}</div>
      <div>${MATERIALIEN.length}</div>
    </div>
  `;
}


// ─────────────────────────────────────────────
// 📦 MATERIAL GRUPPEN
// ─────────────────────────────────────────────

function gruppiereMaterialien() {
  let g = {};

  for (let m of MATERIALIEN) {
    let key = m.produktionslinie || "sonstige";
    if (!g[key]) g[key] = [];
    g[key].push(m);
  }

  return g;
}

function buildMaterialGruppen(gruppen, kapazitaet) {
  let html = "";

  for (let key in gruppen) {
    html += `<h3>${key}</h3><div class="lager-liste">`;

    for (let mat of gruppen[key]) {
      let b = lager[mat.id] || 0;
      let p = Math.min(100, Math.round((b / kapazitaet) * 100));

      html += `
        <div>
          ${mat.emoji} ${mat.name}
          <div style="width:${p}%"></div>

          ${mat.verkaufbar ? `
            ${mengenHTMLLager(mat.id)}
            <button class="btn-verkauf-lager" data-mat-id="${mat.id}">
              Verkauf
            </button>
          ` : ""}
        </div>
      `;
    }

    html += `</div>`;
  }

  return html;
}


// ─────────────────────────────────────────────
// 🎛️ EVENTS
// ─────────────────────────────────────────────

function bindLagerEvents(bereich) {
  // Mengen-Buttons
  bereich.querySelectorAll("[data-aktion]").forEach(btn => {
    btn.addEventListener("click", () => changeMenge(
      btn.dataset.id,
      btn.dataset.aktion === "plus" ? 1 : -1
    ));
  });

  // Menge Plus/Minus Buttons (aus mengenHTMLLager)
  bereich.querySelectorAll(".menge-btn-minus[data-menge-id]").forEach(btn => {
    btn.addEventListener("click", () => changeMenge(btn.getAttribute("data-menge-id"), -1));
  });

  bereich.querySelectorAll(".menge-btn-plus[data-menge-id]").forEach(btn => {
    btn.addEventListener("click", () => changeMenge(btn.getAttribute("data-menge-id"), 1));
  });

  // Verkauf-Buttons
  bereich.querySelectorAll(".btn-verkauf-lager[data-mat-id]").forEach(btn => {
    btn.addEventListener("click", () => materialVerkaufen(btn.getAttribute("data-mat-id")));
  });
}


// ─────────────────────────────────────────────
// ➕ MENÜ
// ─────────────────────────────────────────────

function mengenHTMLLager(id) {
  return `
    <div>
      <button class="menge-btn-minus" data-menge-id="${id}">−</button>
      <input id="menge-${id}" value="1" type="number"/>
      <button class="menge-btn-plus" data-menge-id="${id}">+</button>
    </div>
  `;
}


// ─────────────────────────────────────────────
// 🔧 HELPER
// ─────────────────────────────────────────────

function changeMenge(id, diff) {
  const el = document.getElementById("menge-" + id);
  if (!el) return;

  let v = parseInt(el.value || "1");
  el.value = Math.max(1, v + diff);
}