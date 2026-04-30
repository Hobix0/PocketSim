// ══════════════════════════════════
// HALLEN-UPGRADES
// Lüftung, Erweiterung, Sicherheit etc.
// ══════════════════════════════════

let HALLEN_UPGRADES = [];

// State: { gebaeudeId: [upgradeId, ...] }
// In state.js deklarieren!

async function hallenUpgradesLaden() {
  try {
    let r = await fetch("data/hallen_upgrades.json");
    HALLEN_UPGRADES = await r.json();
  } catch(e) {
    HALLEN_UPGRADES = [];
  }
}

// ── Hilfsfunktionen ──

function hatHallenUpgrade(gebaeudeId, upgradeId) {
  if (!gekaufte_hallen_upgrades[gebaeudeId]) return false;
  return gekaufte_hallen_upgrades[gebaeudeId].includes(upgradeId);
}

function upgradesBedingungErfuellt(upgrade, gebaeudeId) {
  if (!upgrade.bedingung) return true;
  return hatHallenUpgrade(gebaeudeId, upgrade.bedingung);
}

function upgradesPasstZuHalle(upgrade, gebData) {
  if (!upgrade.hallenTyp) return true;
  return upgrade.hallenTyp.includes(gebData.hallenTyp);
}

// ── Produktionsbonus aus Upgrades ──
function upgradeProduktionsBonus(gebaeudeId) {
  let bonus = 1.0;
  if (!gekaufte_hallen_upgrades[gebaeudeId]) return bonus;
  for (let uid of gekaufte_hallen_upgrades[gebaeudeId]) {
    let u = HALLEN_UPGRADES.find(function(u) { return u.id === uid; });
    if (u && u.effekt.typ === "produktionBonus") {
      bonus += u.effekt.wert;
    }
  }
  return bonus;
}

// ── Kostenreduktion aus Upgrades ──
function upgradeKostenReduktion(gebaeudeId) {
  let reduktion = 0;
  if (!gekaufte_hallen_upgrades[gebaeudeId]) return reduktion;
  for (let uid of gekaufte_hallen_upgrades[gebaeudeId]) {
    let u = HALLEN_UPGRADES.find(function(u) { return u.id === uid; });
    if (u && u.effekt.typ === "kostenReduktion") {
      reduktion += u.effekt.wert;
    }
  }
  return reduktion;
}

// ── Ausfall-Schutz ──
function upgradeAusfallSchutz(gebaeudeId) {
  let schutz = 0;
  if (!gekaufte_hallen_upgrades[gebaeudeId]) return schutz;
  for (let uid of gekaufte_hallen_upgrades[gebaeudeId]) {
    let u = HALLEN_UPGRADES.find(function(u) { return u.id === uid; });
    if (u && u.effekt.typ === "ausfallSchutz") {
      schutz += u.effekt.reduktion;
    }
  }
  return Math.min(0.9, schutz);
}

// ── Effektive Tile-Größe (mit Erweiterungen) ──
function effektiveTileGroesse(gebaeudeId) {
  let gebData = GEBAEUDE.find(function(g) { return g.id === gebaeudeId; });
  if (!gebData) return { w: 10, h: 10 };

  let w = gebData.tileBreite || 10;
  let h = gebData.tileHoehe  || 10;

  if (!gekaufte_hallen_upgrades[gebaeudeId]) return { w: w, h: h };

  for (let uid of gekaufte_hallen_upgrades[gebaeudeId]) {
    let u = HALLEN_UPGRADES.find(function(u) { return u.id === uid; });
    if (u && u.effekt.typ === "tileErweiterung") {
      w += u.effekt.breite || 0;
      h += u.effekt.hoehe  || 0;
    }
  }
  return { w: w, h: h };
}

// ── Upgrade kaufen ──
function hallenUpgradeKaufen(gebaeudeId, upgradeId) {
  let upgrade = HALLEN_UPGRADES.find(function(u) { return u.id === upgradeId; });
  if (!upgrade) return;

  let gebData = GEBAEUDE.find(function(g) { return g.id === gebaeudeId; });
  if (!gebData) return;

  // Bereits gekauft?
  if (hatHallenUpgrade(gebaeudeId, upgradeId)) {
    zeigeNotification("❌ Upgrade bereits installiert!", "red");
    return;
  }

  // Bedingung?
  if (!upgradesBedingungErfuellt(upgrade, gebaeudeId)) {
    let vorbedingung = HALLEN_UPGRADES.find(function(u) { return u.id === upgrade.bedingung; });
    zeigeNotification(
      "🔒 Benötigt: " + (vorbedingung ? vorbedingung.name : upgrade.bedingung),
      "red"
    );
    return;
  }

  // Hallentyp?
  if (!upgradesPasstZuHalle(upgrade, gebData)) {
    zeigeNotification("❌ Dieses Upgrade passt nicht zu dieser Halle!", "red");
    return;
  }

  // Geld?
  if (geld < upgrade.kosten) {
    zeigeNotification(
      "❌ Nicht genug Geld! Benötigt: " + upgrade.kosten.toLocaleString("de-DE") + " €",
      "red"
    );
    return;
  }

  geld -= upgrade.kosten;

  if (!gekaufte_hallen_upgrades[gebaeudeId]) {
    gekaufte_hallen_upgrades[gebaeudeId] = [];
  }
  gekaufte_hallen_upgrades[gebaeudeId].push(upgradeId);

  // Sonderfall: HallenTyp-Upgrade
  if (upgrade.effekt.typ === "hallenTypUpgrade") {
    gebData.hallenTyp = upgrade.effekt.zu;
    zeigeNotification(
      "🏗️ " + gebData.name + " wurde zur Schwerhalle aufgerüstet!",
      "green"
    );
  }

  geldAnzeigenAktualisieren();
  spielstandSpeichern();

  // Hallenplan neu rendern
  if (typeof hallenplanAktualisieren === "function") {
    hallenplanAktualisieren(gebaeudeId);
  }

  // Upgrade-Screen neu laden
  hallenUpgradeScreenAktualisieren(gebaeudeId);

  zeigeNotification(
    "✅ " + upgrade.emoji + " " + upgrade.name + " installiert! +" +
    (upgrade.effekt.wert ? Math.round(upgrade.effekt.wert * 100) + "%" : "") +
    (upgrade.effekt.hoehe ? " +" + upgrade.effekt.hoehe + " Tile-Reihen" : ""),
    "green"
  );

  if (typeof soundKaufen === "function") soundKaufen();
}

// ── Upgrade Screen HTML ──
function hallenUpgradeScreenAktualisieren(gebaeudeId) {
  let bereich = document.getElementById("hallen-upgrade-bereich");
  if (!bereich) return;

  let gebData  = GEBAEUDE.find(function(g) { return g.id === gebaeudeId; });
  if (!gebData) return;

  let isSchwer = gebData.hallenTyp === "schwer";
  let lFarbe   = isSchwer ? "#6366f1" : "#f59e0b";

  // Aktive Upgrades zusammenfassen
  let aktiveUids = gekaufte_hallen_upgrades[gebaeudeId] || [];
  let tileGroesse = effektiveTileGroesse(gebaeudeId);
  let prodBonus   = upgradeProduktionsBonus(gebaeudeId);
  let kostenRed   = upgradeKostenReduktion(gebaeudeId);
  let ausfallSch  = upgradeAusfallSchutz(gebaeudeId);

  // ── Status Übersicht ──
  let html =
    "<div class='upgrade-status-grid'>" +
      upgradeStatusKarte("📐 Hallenfläche",
        tileGroesse.w + "×" + tileGroesse.h + " Tiles",
        (tileGroesse.w * tileGroesse.h) + " gesamt", lFarbe) +
      upgradeStatusKarte("⚡ Prod.-Bonus",
        "+" + Math.round((prodBonus - 1) * 100) + "%",
        "durch Upgrades", "var(--green)") +
      upgradeStatusKarte("💸 Kostenred.",
        "-" + Math.round(kostenRed * 100) + "%",
        "pro Runde", "var(--accent)") +
      upgradeStatusKarte("🛡️ Ausfallschutz",
        Math.round(ausfallSch * 100) + "%",
        "weniger Ausfälle", "var(--green)") +
    "</div>";

  // ── Upgrades nach Kategorie ──
  let kategorien = {
    "lueftung":    { name: "Belüftung",      emoji: "💨" },
    "erweiterung": { name: "Erweiterung",    emoji: "📐" },
    "beleuchtung": { name: "Beleuchtung",    emoji: "💡" },
    "sicherheit":  { name: "Sicherheit",     emoji: "🛡️" },
    "isolation":   { name: "Dämmung",        emoji: "🧱" },
    "verstaerkung":{ name: "Verstärkung",    emoji: "⚓" }
  };

  let verfuegbareUpgrades = HALLEN_UPGRADES.filter(function(u) {
    return upgradesPasstZuHalle(u, gebData);
  });

  for (let [katId, kat] of Object.entries(kategorien)) {
    let katUpgrades = verfuegbareUpgrades.filter(function(u) {
      return u.kategorie === katId;
    });
    if (katUpgrades.length === 0) continue;

    html +=
      "<div class='upgrade-kat-header'>" +
        kat.emoji + " " + kat.name +
      "</div>";

    for (let u of katUpgrades) {
      let gekauft    = hatHallenUpgrade(gebaeudeId, u.id);
      let verfuegbar = upgradesBedingungErfuellt(u, gebaeudeId);
      let gesperrt   = !verfuegbar && !gekauft;

      let effektText = "";
      if (u.effekt.typ === "produktionBonus")   effektText = "⚡ +" + Math.round(u.effekt.wert * 100) + "% Produktion";
      if (u.effekt.typ === "tileErweiterung")   effektText = "📐 +" + (u.effekt.breite || 0) + " Breite, +" + (u.effekt.hoehe || 0) + " Höhe";
      if (u.effekt.typ === "ausfallSchutz")     effektText = "🛡️ -" + Math.round(u.effekt.reduktion * 100) + "% Ausfall";
      if (u.effekt.typ === "kostenReduktion")   effektText = "💸 -" + Math.round(u.effekt.wert * 100) + "% Kosten";
      if (u.effekt.typ === "hallenTypUpgrade")  effektText = "🏗️ Halle → Schwerhalle";

      let vorbedText = "";
      if (gesperrt && u.bedingung) {
        let vb = HALLEN_UPGRADES.find(function(vu) { return vu.id === u.bedingung; });
        vorbedText = "🔒 Benötigt: " + (vb ? vb.name : u.bedingung);
      }

      html +=
        "<div class='upgrade-karte" +
          (gekauft ? " upgrade-gekauft" : "") +
          (gesperrt ? " upgrade-gesperrt" : "") + "'>" +

          "<div class='upgrade-karte-kopf'>" +
            "<span class='upgrade-emoji'>" + u.emoji + "</span>" +
            "<div class='upgrade-info'>" +
              "<div class='upgrade-name'>" + u.name + "</div>" +
              "<div class='upgrade-beschreibung'>" + u.beschreibung + "</div>" +
            "</div>" +
            (gekauft ?
              "<span class='upgrade-badge-ok'>✓ Installiert</span>" :
              "<div class='upgrade-preis-block'>" +
                "<div class='upgrade-preis'>💰 " + u.kosten.toLocaleString("de-DE") + " €</div>" +
                "<div class='upgrade-laufkosten'>+" + u.kostenProRunde + " €/Runde</div>" +
              "</div>"
            ) +
          "</div>" +

          "<div class='upgrade-effekt'>" + effektText + "</div>" +

          (vorbedText ?
            "<div class='upgrade-vorbedingung'>" + vorbedText + "</div>" : "") +

          (!gekauft && !gesperrt ?
            "<button class='upgrade-btn-kaufen' " +
              "onclick='hallenUpgradeKaufen(\"" + gebaeudeId + "\",\"" + u.id + "\")'>" +
              u.emoji + " " + u.name + " installieren" +
            "</button>" :
            gekauft ? "" :
            "<button class='upgrade-btn-gesperrt' disabled>" +
              "🔒 Noch nicht verfügbar" +
            "</button>"
          ) +

        "</div>";
    }
  }

  bereich.innerHTML = html;
}

function upgradeStatusKarte(label, wert, sub, farbe) {
  return (
    "<div class='upgrade-status-karte'>" +
      "<div class='upgrade-status-wert' style='color:" + farbe + "'>" + wert + "</div>" +
      "<div class='upgrade-status-label'>" + label + "</div>" +
      "<div class='upgrade-status-sub'>" + sub + "</div>" +
    "</div>"
  );
}