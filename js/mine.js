// ── Mine ──
// Minen fördern automatisch Rohstoffe ohne Input

function mineFordern(gebaeudeData) {
  if (!gebaeudeData.foerderung) return;

  let benoetigt = gebaeudeData.mitarbeiterProEinheit || 4;
  if (mitarbeiter < benoetigt) return;

  for (let f of gebaeudeData.foerderung) {
    lager[f.material] = (lager[f.material] || 0) + f.menge;
  }
}

function alleMinenFordern() {
  // gekaufte_gebaeude ist ein Objekt { gsId: [gebId, ...] }
  for (let gsId in gekaufte_gebaeude) {
    for (let gebId of gekaufte_gebaeude[gsId]) {
      let data = GEBAEUDE.find(function(g) { return g.id === gebId; });
      if (data && data.typ === "mine") {
        mineFordern(data);
      }
    }
  }
}

// Mine Anzeige für den Gebäude-Screen
function mineAnzeigenHTML(gebaeudeData) {
  let foerderText = gebaeudeData.foerderung ? gebaeudeData.foerderung.map(function(f) {
    let mat = MATERIALIEN.find(function(m) { return m.id === f.material; });
    return "+" + f.menge + " " + (mat ? mat.name : f.material) + "/Runde";
  }).join(", ") : "";

  return (
    "<div class='mine-anzeige'>" +
      "<div class='mine-foerderung'>" +
        "<span class='mine-foerderung-label'>⛏️ FÖRDERUNG</span>" +
        "<span class='mine-foerderung-wert'>" + foerderText + "</span>" +
      "</div>" +
      "<div class='mine-lager'>" +
        (gebaeudeData.foerderung ? gebaeudeData.foerderung.map(function(f) {
          let mat = MATERIALIEN.find(function(m) { return m.id === f.material; });
          return "<div class='mine-material'>" +
            "<span>" + (mat ? mat.emoji + " " + mat.name : f.material) + "</span>" +
            "<span class='mine-menge'>" + (lager[f.material] || 0) + " Stk</span>" +
          "</div>";
        }).join("") : "") +
      "</div>" +
    "</div>"
  );
}