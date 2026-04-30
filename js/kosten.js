function kostenBerechnen() {
  let k = 0;

  for (let gsId of gekaufte_grundstuecke) {
    let data = GRUNDSTUECKE.find(function(g) { return g.id === gsId; });
    if (data) k += data.kostenProRunde;
  }

  // Gebäudekosten mit Upgrade-Reduktion:
for (let gsId in gekaufte_gebaeude) {
  for (let gebId of gekaufte_gebaeude[gsId]) {
    let data = GEBAEUDE.find(function(g) { return g.id === gebId; });
    if (!data) continue;
    let red = typeof upgradeKostenReduktion === "function"
      ? upgradeKostenReduktion(gebId) : 0;
    k += Math.round(data.kostenProRunde * (1 - red));

    // Upgrade-Laufkosten addieren
    let uids = gekaufte_hallen_upgrades[gebId] || [];
    for (let uid of uids) {
      let u = (typeof HALLEN_UPGRADES !== "undefined")
        ? HALLEN_UPGRADES.find(function(u) { return u.id === uid; }) : null;
      if (u) k += u.kostenProRunde;
    }
  }
}

  for (let m of installierte_maschinen) {
    k += Math.round(m.kostenProRunde * forschungsBonus.kostenMultiplikator);
  }

  // Lohn mit Ereignis-Modifikator
  let lohnMod = typeof ereignisLohnModifikator === "function"
    ? ereignisLohnModifikator() : 1.0;
  k += Math.round(lohnkostenBerechnen() * forschungsBonus.lohnMultiplikator * lohnMod);

  // Spielmodus-Modifikator
  let spielMod = typeof kostenModifikator === "function" ? kostenModifikator() : 1.0;

  // Ereignis Gesamt-Kostenmultiplikator
  let ereignisMod = typeof ereignisKostenModifikator === "function"
    ? ereignisKostenModifikator() : 1.0;

  k = Math.round(k * spielMod * ereignisMod);
  gesamtkosten = k;
  return k;
}

// NUR EINMAL — kein Duplikat!
function kostenAnzeigenAktualisieren() {
  let k  = kostenBerechnen();
  let el = document.getElementById("stat-kosten-runde");
  if (el) el.textContent = k.toLocaleString("de-DE") + " €";
}