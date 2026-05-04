// ══════════════════════════════════
// SHOP — Mobile-optimiert
// ══════════════════════════════════

const KATEGORIEN = [
  { id: "grundstuecke", label: "Grundstücke", emoji: "🏘️" },
  { id: "gebaeude",     label: "Gebäude",      emoji: "🏭" },
  { id: "maschinen",    label: "Maschinen",     emoji: "⚙️" },
  { id: "rohstoffe",    label: "Rohstoffe",     emoji: "📦" },
  { id: "produktion",   label: "Produktion",    emoji: "🔨" }
];

function bedingungErfuellt(bedingung) {
  if (!bedingung) return true;
  if (bedingung === "hatGrundstueck")  return hatGrundstueck();
  if (bedingung === "hatGebaeude")     return hatGebaeude();
  if (bedingung === "hatFabrik")       return hatGebaeude("leichtbauhalle") || hatGebaeude("schwerlasthalle");
  if (bedingung === "hatKleine Fabrikhalle")  return hatGebaeude("kleine_fabrik") || hatGebaeude("fabrik");
  if (bedingung === "hatGroßfabrik")  return hatGebaeude("grossfabrik");
  if (bedingung === "hatLagerhalle")   return hatGebaeude("lagerhalle");
  if (bedingung === "hatMine")         return hatGebaeude("mine");
  if (bedingung === "hatMaschine")     return installierte_maschinen.length > 0;
  if (bedingung === "hatBaumstaemme")  return (lager.eisenerz || 0) > 0;
  if (bedingung === "hatSchmelzofen")  return hatGebaeude("schwerlasthalle") || hatGebaeude("leichtbauhalle");
  if (typeof istErforscht === "function" && istErforscht(bedingung)) return true;
  return false;
}

function mengenHTML(id) {
  return "<div class='shop-mengen'>" +
    "<button class='mengen-btn' data-id='" + id + "' data-aktion='minus'>−</button>" +
    "<input type='number' id='menge-input-" + id + "' value='1' min='1' />" +
    "<button class='mengen-btn' data-id='" + id + "' data-aktion='plus'>+</button>" +
  "</div>";
}

function shopLinieBadge(linienId) {
  if (!linienId || typeof PRODUKTIONSLINIEN === "undefined") return "";
  let linie = PRODUKTIONSLINIEN[linienId];
  if (!linie) return "";
  return "<span class='shop-linie-badge' style='color:" + linie.farbe +
    "; border-color:" + linie.farbe + "'>" +
    linie.emoji + " " + linie.name +
  "</span>";
}

function shopItemHTML(item) {
  let erfuellt = bedingungErfuellt(item.bedingung);
  let gesperrt = !erfuellt || !!item.zusatzSperre;
  let inaktiv  = gesperrt || item.gekauft;

  let statusHTML = "";
  if (item.gekauft) {
    statusHTML = "<span class='shop-status-badge shop-status-owned'>✓ Im Besitz</span>";
  } else if (item.zusatzSperre) {
    statusHTML = "<span class='shop-status-badge shop-status-locked'>🔬 " + item.zusatzSperre + "</span>";
  } else if (!erfuellt) {
    statusHTML = "<span class='shop-status-badge shop-status-locked'>🔒 Bedingung nicht erfüllt</span>";
  }

  let linienFarbe = "var(--border)";
  if (item.produktionslinie && typeof PRODUKTIONSLINIEN !== "undefined" && PRODUKTIONSLINIEN[item.produktionslinie]) {
    linienFarbe = PRODUKTIONSLINIEN[item.produktionslinie].farbe;
  }

  let bildHTML = item.bild
    ? "<img src='" + item.bild + "' alt='" + item.name + "' class='shop-item-img' />"
    : "<span class='shop-item-emoji'>" + item.emoji + "</span>";

  let btnText = item.gekauft ? "✓ Erworben" :
                item.typ === "rezept" ? "▶ Produzieren" : "Kaufen";
  let btnKlasse = item.gekauft ? "shop-btn-owned" :
                  gesperrt     ? "shop-btn-locked" : "shop-btn-kaufen";

  return (
    "<div class='shop-item" + (inaktiv ? " shop-item-inaktiv" : "") + "' " +
      "data-name='" + item.name + "' data-typ='" + item.typ + "' data-id='" + item.id + "' " +
      "style='border-left:3px solid " + linienFarbe + "'>" +

      "<div class='shop-item-bild'>" + bildHTML + "</div>" +

      "<div class='shop-item-body'>" +
        "<div class='shop-item-kopf'>" +
          "<span class='shop-item-name'>" + item.name + "</span>" +
          shopLinieBadge(item.produktionslinie) +
        "</div>" +
        "<p class='shop-item-beschreibung'>" + item.beschreibung + "</p>" +
        (statusHTML ? "<div class='shop-item-status-zeile'>" + statusHTML + "</div>" : "") +
        "<div class='shop-item-fuss'>" +
          "<span class='shop-item-preis'>" + item.preis + "</span>" +
          (item.mitMenge ? mengenHTML(item.id) : "") +
          "<button class='" + btnKlasse + "'" + (inaktiv ? " disabled" : "") + ">" +
            btnText +
          "</button>" +
        "</div>" +
      "</div>" +
    "</div>"
  );
}

function alleItemsSammeln() {
  let items = [];

  for (let gs of GRUNDSTUECKE) {
    items.push({
      id: gs.id, name: gs.name, emoji: gs.emoji, bild: gs.bild || null,
      beschreibung: gs.beschreibung + (gs.groesse ? " — " + (gs.groesse.l || gs.groesse) + (gs.groesse.b ? "×" + gs.groesse.b + "m" : "") : ""),
      preis: "💰 " + gs.kosten.toLocaleString("de-DE") + " €",
      kategorie: gs.kategorie, bedingung: gs.bedingung, typ: "grundstueck",
      gekauft: gekaufte_grundstuecke.includes(gs.id),
      zusatzSperre: null, produktionslinie: null, mitMenge: false
    });
  }

  for (let g of GEBAEUDE) {
    let gebForschung = g.benoetigtForschung || null;
    let gebFreigesch = !gebForschung ||
      (forschungsBonus.freigeschaltete_maschinen &&
       forschungsBonus.freigeschaltete_maschinen.includes(g.id));
    let gebZusatzSperre = null;
    if (gebForschung && !gebFreigesch) {
      let fData = (typeof FORSCHUNG !== "undefined")
        ? FORSCHUNG.find(function(f) { return f.id === gebForschung; }) : null;
      gebZusatzSperre = "Benötigt: " + (fData ? fData.emoji + " " + fData.name : gebForschung);
    }
    items.push({
      id: g.id, name: g.name, emoji: g.emoji, bild: g.bild || null,
      beschreibung: g.beschreibung,
      preis: "💰 " + g.kosten.toLocaleString("de-DE") + " €",
      kategorie: g.kategorie, bedingung: g.bedingung, typ: "gebaeude",
      gekauft: hatGebaeude(g.id),
      zusatzSperre: gebZusatzSperre, produktionslinie: g.produktionslinie || null, mitMenge: false
    });
  }

  for (let m of MASCHINEN) {
    let fBenoetigt = m.benoetigtForschung || null;
    let freigesch = !fBenoetigt ||
      (forschungsBonus.freigeschaltete_maschinen &&
       forschungsBonus.freigeschaltete_maschinen.includes(m.id));
    let zusatzSperre = null;
    if (fBenoetigt && !freigesch) {
      let fData = (typeof FORSCHUNG !== "undefined")
        ? FORSCHUNG.find(function(f) { return f.id === fBenoetigt; }) : null;
      zusatzSperre = "Benötigt: " + (fData ? fData.name : fBenoetigt);
    }
    items.push({
      id: m.id, name: m.name, emoji: m.emoji, bild: m.bild || null,
      beschreibung: m.beschreibung,
      preis: "💰 " + m.kosten.toLocaleString("de-DE") + " €",
      kategorie: m.kategorie, bedingung: m.bedingung, typ: "maschine",
      gekauft: false, zusatzSperre: zusatzSperre,
      produktionslinie: m.produktionslinie || null, mitMenge: false
    });
  }

  for (let mat of MATERIALIEN) {
    if (!mat.imShop) continue;
    items.push({
      id: mat.id, name: mat.name, emoji: mat.emoji, bild: mat.bild || null,
      beschreibung: mat.beschreibung,
      preis: "💰 " + mat.kaufpreis.toLocaleString("de-DE") + " € / Stk",
      kategorie: mat.kategorie, bedingung: mat.bedingung, typ: "material",
      gekauft: false, zusatzSperre: null,
      produktionslinie: mat.produktionslinie || null, mitMenge: true
    });
  }

  for (let r of REZEPTE) {
    if (!r.manuell) continue;
    let inputText = r.inputs.map(function(inp) {
      let mat = MATERIALIEN.find(function(m) { return m.id === inp.material; });
      return inp.menge + "× " + (mat ? mat.name : inp.material);
    }).join(", ");
    items.push({
      id: r.id, name: r.name, emoji: r.emoji, bild: null,
      beschreibung: r.beschreibung,
      preis: "🪵 " + inputText,
      kategorie: r.kategorie, bedingung: r.bedingung, typ: "rezept",
      gekauft: false, zusatzSperre: null,
      produktionslinie: r.produktionslinie || null, mitMenge: true
    });
  }

  return items;
}

// ── Shop Generieren ──
function shopGenerieren() {
  let alleItems = alleItemsSammeln();
  let aktivFilter = document.querySelector(".shop-filter-btn.aktiv");
  let aktiveKat   = aktivFilter ? aktivFilter.dataset.filter : "alle";

  // Filter-Buttons
  let filterHTML = "<button class='shop-filter-btn" + (aktiveKat === "alle" ? " aktiv" : "") + "' data-filter='alle'>Alle</button>";
  let genutzteKats = new Set(alleItems.map(function(i) { return i.kategorie; }));

  for (let kat of KATEGORIEN) {
    if (!genutzteKats.has(kat.id)) continue;
    let anzahl = alleItems.filter(function(i) { return i.kategorie === kat.id; }).length;
    filterHTML +=
      "<button class='shop-filter-btn" + (aktiveKat === kat.id ? " aktiv" : "") + "' data-filter='" + kat.id + "'>" +
        kat.emoji + " " + kat.label +
        "<span class='shop-filter-count'>" + anzahl + "</span>" +
      "</button>";
  }

  document.getElementById("shop-filter").innerHTML = filterHTML;

  // Items
  let gefilterteItems = aktiveKat === "alle"
    ? alleItems
    : alleItems.filter(function(i) { return i.kategorie === aktiveKat; });

  // Maschinen nach Produktionslinie gruppieren
  let shopHTML = "";
  if (aktiveKat === "maschinen" || aktiveKat === "alle") {
    let maschinenItems = gefilterteItems.filter(function(i) { return i.kategorie === "maschinen"; });
    let andereItems    = gefilterteItems.filter(function(i) { return i.kategorie !== "maschinen"; });

    // Andere Items zuerst
    if (andereItems.length > 0) {
      shopHTML += "<div class='shop-items-liste'>";
      for (let item of andereItems) shopHTML += shopItemHTML(item);
      shopHTML += "</div>";
    }

    // Maschinen gruppiert
    if (maschinenItems.length > 0) {
      let gruppen = {};
      let reihenfolge = [];
      for (let item of maschinenItems) {
        let linie = item.produktionslinie || "sonstige";
        if (!gruppen[linie]) { gruppen[linie] = []; reihenfolge.push(linie); }
        gruppen[linie].push(item);
      }

      for (let linienId of reihenfolge) {
        let linie = (typeof PRODUKTIONSLINIEN !== "undefined") ? PRODUKTIONSLINIEN[linienId] : null;
        if (linie) {
          shopHTML += "<div class='shop-sublinie-header' style='border-color:" + linie.farbe + ";color:" + linie.farbe + "'>" +
            linie.emoji + " " + linie.name + "</div>";
        }
        shopHTML += "<div class='shop-items-liste'>";
        for (let item of gruppen[linienId]) shopHTML += shopItemHTML(item);
        shopHTML += "</div>";
      }
    }
  } else {
    shopHTML += "<div class='shop-items-liste'>";
    for (let item of gefilterteItems) shopHTML += shopItemHTML(item);
    shopHTML += "</div>";
  }

  if (gefilterteItems.length === 0) {
    shopHTML = "<p class='screen-hinweis'>Keine Artikel in dieser Kategorie.</p>";
  }

  document.getElementById("shop-inhalt").innerHTML = shopHTML;

  shopFilterEventListeners();
  shopEventListeners();
}

function shopFilterEventListeners() {
  document.querySelectorAll(".shop-filter-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      document.querySelectorAll(".shop-filter-btn").forEach(function(b) {
        b.classList.remove("aktiv");
      });
      btn.classList.add("aktiv");
      shopGenerieren();
    });
  });
}

function shopEventListeners() {
  // Kaufen
  document.querySelectorAll("#shop-inhalt .shop-btn-kaufen").forEach(function(btn) {
    btn.addEventListener("click", function() {
      let item = btn.closest(".shop-item");
      if (!item) return;
      let typ  = item.dataset.typ;
      let id   = item.dataset.id;
      let menge = 1;
      let mengeInput = document.getElementById("menge-input-" + id);
      if (mengeInput) menge = parseInt(mengeInput.value) || 1;

      if (typ === "gebaeude")    { zielAuswahlOeffnen("gebaeude", id); return; }
      if (typ === "maschine")    { zielAuswahlOeffnen("maschine", id); return; }
      if (typ === "grundstueck") { grundstueckKaufen(id); }
      if (typ === "material")    { materialKaufen(id, menge); }
      if (typ === "rezept")      { manuellProduzieren(id, menge); }

      spielstandSpeichern();
      shopGenerieren();
    });
  });

  // Mengen-Buttons
  document.querySelectorAll("#shop-inhalt .mengen-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      let id     = btn.dataset.id;
      let aktion = btn.dataset.aktion;
      let input  = document.getElementById("menge-input-" + id);
      if (!input) return;
      if (aktion === "plus") input.value = parseInt(input.value) + 1;
      else if (parseInt(input.value) > 1) input.value = parseInt(input.value) - 1;
    });
  });
}