// ══════════════════════════════════
// SHOP — Redesign
// Horizontale Item-Karten mit
// Produktionslinien-Farbkodierung
// ══════════════════════════════════

const KATEGORIEN = [
  { id: "grundstuecke", label: "Grundstücke", emoji: "" },
  { id: "gebaeude",     label: "Gebäude",      emoji: "" },
  { id: "maschinen",    label: "Maschinen",     emoji: "" },
  { id: "rohstoffe",    label: "Rohstoffe",     emoji: "" },
  { id: "produktion",   label: "Produktion",    emoji: ""  }
];

// ── Bedingungen ──
function bedingungErfuellt(bedingung) {
  if (!bedingung) return true;
  if (bedingung === "hatGrundstueck")  return hatGrundstueck();
  if (bedingung === "hatGebaeude")     return hatGebaeude();
  if (bedingung === "hatFabrik")       return hatGebaeude("leichtbauhalle") || hatGebaeude("schwerlasthalle");  // ← fix
  if (bedingung === "hatLeichthalle")  return hatGebaeude("leichtbauhalle");   // ← fix
  if (bedingung === "hatSchwerhalle")  return hatGebaeude("schwerlasthalle");  // ← fix
  if (bedingung === "hatLagerhalle")   return hatGebaeude("lagerhalle");
  if (bedingung === "hatMine")         return hatGebaeude("mine");
  if (bedingung === "hatMaschine")     return installierte_maschinen.length > 0;
  if (bedingung === "hatBaumstaemme")  return (lager.baumstaemme || 0) > 0;
  if (bedingung === "hatSchmelzofen")  return hatGebaeude("schwerlasthalle") || hatGebaeude("leichtbauhalle");  // ← fix
  if (typeof istErforscht === "function" && istErforscht(bedingung)) return true;
  return false;
}
// ── Mengensteuer ──
function mengenHTML(id) {
  return "<div class='shop-mengen'>" +
    "<button class='mengen-btn' data-id='" + id + "' data-aktion='minus'>−</button>" +
    "<input type='number' id='menge-input-" + id + "' value='1' min='1' />" +
    "<button class='mengen-btn' data-id='" + id + "' data-aktion='plus'>+</button>" +
  "</div>";
}

// ── Linie Badge ──
function shopLinieBadge(linienId) {
  if (!linienId || typeof PRODUKTIONSLINIEN === "undefined") return "";
  let linie = PRODUKTIONSLINIEN[linienId];
  if (!linie) return "";
  return "<span class='shop-linie-badge' style='color:" + linie.farbe +
    "; border-color:" + linie.farbe + "; background:" + linie.dunkel + "'>" +
    linie.emoji + " " + linie.name +
  "</span>";
}

function initTooltips() {
  let tooltip = document.getElementById("tooltip");

  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "tooltip";
    tooltip.className = "tooltip";
    document.body.appendChild(tooltip);
  }

  document.querySelectorAll(".shop-card").forEach(card => {

    card.addEventListener("mouseenter", e => {
      let html = decodeURIComponent(card.dataset.tooltip || "");
      tooltip.innerHTML = html;
      tooltip.style.display = "block";
    });

    card.addEventListener("mousemove", e => {
      tooltip.style.left = e.pageX + 15 + "px";
      tooltip.style.top  = e.pageY + 15 + "px";
    });

    card.addEventListener("mouseleave", () => {
      tooltip.style.display = "none";
    });

  });
}

// ── Einzelne Item-Karte ──
function shopItemHTML(item) {
  let status =
    item.gekauft ? "owned" :
    item.zusatzSperre || !bedingungErfuellt(item.bedingung) ? "locked" :
    "available";

  let linie = item.produktionslinie && PRODUKTIONSLINIEN[item.produktionslinie];
  let farbe = linie ? linie.farbe : "var(--border)";

  return `
    <div class="shop-card ${status}" 
         data-id="${item.id}" 
         data-typ="${item.typ}"
         data-tooltip='${encodeURIComponent(getTooltipHTML(item))}'>

      <div class="card-header" style="border-left:4px solid ${farbe}">
        <span class="card-emoji">${item.emoji}</span>
        <span class="card-title">${item.name}</span>
      </div>

      <div class="card-body">
        ${item.bild ? `<img src="${item.bild}" class="card-img">` : ""}
        <p>${item.beschreibung}</p>
      </div>

      <div class="card-footer">
        <span class="price">${item.preis}</span>
        ${item.mitMenge ? mengenHTML(item.id) : ""}
        <button class="kaufen-btn" ${status !== "available" ? "disabled" : ""}>
          ${item.typ === "rezept" ? "Produzieren" : "Kaufen"}
        </button>
      </div>

    </div>
  `;
}

function shopSidebar() {
  return `
    <div class="shop-sidebar">
      ${KATEGORIEN.map((k, i) => `
        <button class="sidebar-btn ${i === 0 ? "aktiv" : ""}" data-filter="${k.id}">
          ${k.emoji} ${k.label}
        </button>
      `).join("")}
    </div>
  `;
}

function renderKategorie(items) {
  return `
    <div class="shop-grid">
      ${items.map(shopItemHTML).join("")}
    </div>
  `;
}

// ── Alle Items sammeln ──
function alleItemsSammeln() {
  let items = [];

  // Grundstücke
  for (let gs of GRUNDSTUECKE) {
    items.push({
      id:               gs.id,
      name:             gs.name,
      emoji:            gs.emoji,
      bild:             gs.bild || null,
      beschreibung:     gs.beschreibung + " " + gs.groesse.l + "×" + gs.groesse.b + "m, max. " + gs.maxGebaeude + " Gebäude.",
      preis:            "💰 " + gs.kosten.toLocaleString("de-DE") + " €",
      kategorie:        gs.kategorie,
      bedingung:        gs.bedingung,
      typ:              "grundstueck",
      gekauft:          gekaufte_grundstuecke.includes(gs.id),
      zusatzSperre:     null,
      produktionslinie: null,
      mitMenge:         false
    });
  }

  // Gebäude
  for (let g of GEBAEUDE) {
    items.push({
      id:               g.id,
      name:             g.name,
      emoji:            g.emoji,
      bild:             g.bild || null,
      beschreibung:     g.beschreibung,
      preis:            "💰 " + g.kosten.toLocaleString("de-DE") + " €",
      kategorie:        g.kategorie,
      bedingung:        g.bedingung,
      typ:              "gebaeude",
      gekauft:          hatGebaeude(g.id),
      zusatzSperre:     null,
      produktionslinie: g.produktionslinie || null,
      mitMenge:         false
    });
  }

  // Maschinen
  for (let m of MASCHINEN) {
    let forschungBenoetigt = m.benoetigtForschung || null;
    let freigeschaltet = !forschungBenoetigt ||
      (forschungsBonus.freigeschaltete_maschinen &&
       forschungsBonus.freigeschaltete_maschinen.includes(m.id));

    let zusatzSperre = null;
    if (forschungBenoetigt && !freigeschaltet) {
      let fData = (typeof FORSCHUNG !== "undefined")
        ? FORSCHUNG.find(function(f) { return f.id === forschungBenoetigt; })
        : null;
      zusatzSperre = "Benötigt: " + (fData ? fData.name : forschungBenoetigt);
    }

    items.push({
      id:               m.id,
      name:             m.name,
      emoji:            m.emoji,
      bild:             m.bild || null,
      beschreibung:     m.beschreibung,
      preis:            "💰 " + m.kosten.toLocaleString("de-DE") + " €",
      kategorie:        m.kategorie,
      bedingung:        m.bedingung,
      typ:              "maschine",
      gekauft:          false,
      zusatzSperre:     zusatzSperre,
      produktionslinie: m.produktionslinie || null,
      mitMenge:         false
    });
  }

  // Rohstoffe
  for (let mat of MATERIALIEN) {
    if (!mat.imShop) continue;
    items.push({
      id:               mat.id,
      name:             mat.name,
      emoji:            mat.emoji,
      bild:             mat.bild || null,
      beschreibung:     mat.beschreibung,
      preis:            "💰 " + mat.kaufpreis.toLocaleString("de-DE") + " € / Stk",
      kategorie:        mat.kategorie,
      bedingung:        mat.bedingung,
      typ:              "material",
      gekauft:          false,
      zusatzSperre:     null,
      produktionslinie: mat.produktionslinie || null,
      mitMenge:         true
    });
  }

  // Produktion (manuelle Rezepte)
  for (let r of REZEPTE) {
    if (!r.manuell) continue;
    let inputText = r.inputs.map(function(inp) {
      let mat = MATERIALIEN.find(function(m) { return m.id === inp.material; });
      return inp.menge + "× " + (mat ? mat.name : inp.material);
    }).join(", ");

    items.push({
      id:               r.id,
      name:             r.name,
      emoji:            r.emoji,
      bild:             null,
      beschreibung:     r.beschreibung,
      preis:            "🪵 " + inputText,
      kategorie:        r.kategorie,
      bedingung:        r.bedingung,
      typ:              "rezept",
      gekauft:          false,
      zusatzSperre:     null,
      produktionslinie: r.produktionslinie || null,
      mitMenge:         true
    });
  }

  return items;
}

// ── Shop generieren ──
function shopGenerieren() {
  let alleItems = alleItemsSammeln();

  let aktiveKategorie =
    document.querySelector(".shop-sidebar .aktiv")?.dataset.filter
    || "grundstuecke";

  let html = `
    <div class="shop-layout">
      ${shopSidebar()}
      <div class="shop-content">
        ${renderKategorie(
          alleItems.filter(i => i.kategorie === aktiveKategorie)
        )}
      </div>
    </div>
  `;

  document.getElementById("shop-inhalt").innerHTML = html;

  shopSidebarEvents(alleItems);
  shopEventListeners();
  initTooltips(); // ⬅️ WICHTIG
}

function shopSidebarEvents(alleItems) {
  document.querySelectorAll(".shop-sidebar button").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".shop-sidebar button")
        .forEach(b => b.classList.remove("aktiv"));

      btn.classList.add("aktiv");

      let kat = btn.dataset.filter;

      document.querySelector(".shop-content").innerHTML =
        renderKategorie(alleItems.filter(i => i.kategorie === kat));

      shopEventListeners();
      initTooltips(alleItems); // 🔥 WICHTIG
    });
  });
}

function shopEventListeners() {
  document.querySelectorAll(".shop-card button").forEach(btn => {
    btn.addEventListener("click", function() {

      let card = btn.closest(".shop-card");
      let typ  = card.dataset.typ;
      let id   = card.dataset.id;

      let menge = 1;
      let mengeInput = document.getElementById("menge-input-" + id);
      if (mengeInput) menge = parseInt(mengeInput.value) || 1;

      if (typ === "gebaeude") return zielAuswahlOeffnen("gebaeude", id);
      if (typ === "maschine") return zielAuswahlOeffnen("maschine", id);

      if (typ === "grundstueck") grundstueckKaufen(id);
      if (typ === "material")    materialKaufen(id, menge);
      if (typ === "rezept")      manuellProduzieren(id, menge);

      spielstandSpeichern();
      shopGenerieren();
    });
  });
}

function getTooltipHTML(item) {
  let linie = item.produktionslinie && PRODUKTIONSLINIEN[item.produktionslinie];

  return `
    ${item.bild ? `<img src="${item.bild}" class="tooltip-img">` : ""}

    <div class="tooltip-title">
      ${item.emoji} ${item.name}
    </div>

    <div class="tooltip-line">
      ${item.beschreibung}
    </div>

    ${linie ? `
      <div class="tooltip-line">
        ${linie.emoji} ${linie.name}
      </div>
    ` : ""}

    <div class="tooltip-line">
      💰 ${item.preis}
    </div>

    ${item.zusatzSperre ? `
      <div class="tooltip-locked">
        🔬 ${item.zusatzSperre}
      </div>
    ` : ""}
  `;
}

// ── Event Listeners ──
function shopEventListeners() {

  // Kaufen / Produzieren
  document.querySelectorAll("#shop-inhalt .kaufen-btn")
    .forEach(btn => {

      btn.addEventListener("click", () => {

        let item = btn.closest(".shop-card");
        if (!item) return;

        let typ   = item.getAttribute("data-typ");
        let id    = item.getAttribute("data-id");
        let menge = 1;

        let mengeInput = document.getElementById("menge-input-" + id);
        if (mengeInput) menge = parseInt(mengeInput.value) || 1;

        if (typ === "gebaeude") {
          zielAuswahlOeffnen("gebaeude", id);
          return;
        }

        if (typ === "maschine") {
          zielAuswahlOeffnen("maschine", id);
          return;
        }

        if (typ === "grundstueck") {
          grundstueckKaufen(id);
        } 
        else if (typ === "material") {
          materialKaufen(id, menge);
        } 
        else if (typ === "rezept") {
          manuellProduzieren(id, menge);
        }

        spielstandSpeichern();
        shopGenerieren();
      });

    });

  // Mengen Buttons
  document.querySelectorAll("#shop-inhalt .mengen-btn")
    .forEach(btn => {

      btn.addEventListener("click", () => {

        let id     = btn.dataset.id;
        let aktion = btn.dataset.aktion;
        let input  = document.getElementById("menge-input-" + id);
        if (!input) return;

        if (aktion === "plus") {
          input.value = parseInt(input.value) + 1;
        } 
        else if (parseInt(input.value) > 1) {
          input.value = parseInt(input.value) - 1;
        }

      });

    });

}

function shopFilterEventListeners() {
  document.querySelectorAll(".shop-filter-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      document.querySelectorAll(".shop-filter-btn").forEach(function(b) {
        b.classList.remove("aktiv");
      });
      btn.classList.add("aktiv");

      let filter = btn.getAttribute("data-filter");
      document.getElementById("shop-suche").value = "";

      document.querySelectorAll(".shop-kategorie").forEach(function(kat) {
        if (filter === "alle") {
          kat.classList.remove("versteckt");
        } else {
          kat.classList.toggle("versteckt", kat.getAttribute("data-kategorie") !== filter);
        }
      });

      document.querySelectorAll(".shop-item").forEach(function(item) {
        item.style.display = "flex";
      });
    });
  });
}