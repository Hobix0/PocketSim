class building {
  gebaudeKaufen(gebaeudeId) {
    let gebaeudeData = GEBAEUDE.find(function(g) { return g.id === gebaeudeId; });
    if (!gebaeudeData) return;

    let gsId = window.aktivesGrundstueckId || gekaufte_grundstuecke[0];
    if (!gsId) {
      alert("Kein Grundstück ausgewählt!");
      return;
    }

    let gsData = GRUNDSTUECKE.find(function(g) { return g.id === gsId; });
    let vorhandene = gebaeudeVonGrundstueck(gsId);

    if (vorhandene.includes(gebaeudeId)) {
      alert("Dieses Gebäude gibt es auf " + (gsData ? gsData.name : "diesem Grundstück") + " bereits!");
      return;
    }

    if (vorhandene.length >= (gsData ? gsData.maxGebaeude : 3)) {
      alert("Kein Platz mehr auf " + (gsData ? gsData.name : "diesem Grundstück") + "!");
      return;
    }

    if (geld < gebaeudeData.kosten) {
      alert("Nicht genug Geld! Benötigt: " + gebaeudeData.kosten.toLocaleString("de-DE") + " €");
      return;
    }

    geld -= gebaeudeData.kosten;
    if (!gekaufte_gebaeude[gsId]) gekaufte_gebaeude[gsId] = [];
    gekaufte_gebaeude[gsId].push(gebaeudeId);

    geldAnzeigenAktualisieren();
    uebersichtGebaeudeAktualisieren(gsId);
    shopGenerieren();
    spielstandSpeichernSofort();
    if (typeof soundKaufen === "function") soundKaufen();
  }

  // Prüft ob Maschine in diese Halle passt (Typ + Platz)
  maschinePasstRein(gebaeudeData, maschine) {
    // Hallentyp prüfen
    if (!this.hallenTypKompatibel(gebaeudeData, maschine)) return false;

    // Platzkontrolle über Tile-Grid
    let daten = hallenplanDaten(gebaeudeData.id);
    if (!daten) return false;

    let tw = maschine.tileGroesse ? maschine.tileGroesse.w : 2;
    let th = maschine.tileGroesse ? maschine.tileGroesse.h : 2;

    // Freien Platz suchen
    for (let y = 0; y <= daten.tileHoehe - th; y++) {
      for (let x = 0; x <= daten.tileBreite - tw; x++) {
        let frei = true;
        for (let dy = 0; dy < th && frei; dy++) {
          for (let dx = 0; dx < tw && frei; dx++) {
            if (daten.grid[y + dy][x + dx] !== null) frei = false;
          }
        }
        if (frei) return true;
      }
    }
    return false;
  }

  hallenTypKompatibel(gebaeudeData, maschineData) {
    if (!gebaeudeData.hallenTyp) return true;
    if (!maschineData.hallenTyp) return true;
    return maschineData.hallenTyp.includes(gebaeudeData.hallenTyp);
  }

  // Gibt Kompatibilitätsinfo zurück (für Zielauswahl)
  hallenKompatibilitaetsInfo(gebaeudeId, maschineId) {
    let gData = GEBAEUDE.find(function(g) { return g.id === gebaeudeId; });
    let mData = MASCHINEN.find(function(m) { return m.id === maschineId; });
    if (!gData || !mData) return { ok: false, grund: "Unbekannt" };

    if (!this.hallenTypKompatibel(gData, mData)) {
      let benoetigter = mData.hallenTyp ? mData.hallenTyp.join(" oder ") : "?";
      return {
        ok:    false,
        grund: "Falscher Hallentyp! Maschine braucht: " + benoetigter + ", Halle ist: " + gData.hallenTyp
      };
    }

    // Platzcheck
    let daten = hallenplanDaten(gebaeudeId);
    let tw = mData.tileGroesse ? mData.tileGroesse.w : 2;
    let th = mData.tileGroesse ? mData.tileGroesse.h : 2;
    let hatPlatz = false;

    if (daten) {
      for (let y = 0; y <= daten.tileHoehe - th && !hatPlatz; y++) {
        for (let x = 0; x <= daten.tileBreite - tw && !hatPlatz; x++) {
          let frei = true;
          for (let dy = 0; dy < th && frei; dy++) {
            for (let dx = 0; dx < tw && frei; dx++) {
              if (daten.grid[y + dy][x + dx] !== null) frei = false;
            }
          }
          if (frei) hatPlatz = true;
        }
      }
    }

    if (!hatPlatz) {
      return { ok: false, grund: "Kein Platz! Braucht " + tw + "×" + th + " Tiles." };
    }

    return { ok: true, grund: "" };
  }
}