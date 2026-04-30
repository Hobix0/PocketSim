// ── Produktionslinien ──
// Definiert die visuellen Linien und deren Farben

const PRODUKTIONSLINIEN = {
  holz: {
    id:    "holz",
    name:  "Holzverarbeitung",
    emoji: "🪵",
    farbe: "#f59e0b",   // amber
    dunkel: "rgba(245,158,11,0.1)"
  },
  metall: {
    id:    "metall",
    name:  "Metallverarbeitung",
    emoji: "⚙️",
    farbe: "#6366f1",   // indigo
    dunkel: "rgba(99,102,241,0.1)"
  },
  fahrzeug: { 
    name: "Fahrzeugbau", 
    farbe: "#8b5cf6", 
    emoji: "🚗",
    dunkel: "rgba(139,92,246,0.1)"
  }
};

// Gibt die Farbe einer Produktionslinie zurück
function linienFarbe(linienId) {
  if (!linienId || !PRODUKTIONSLINIEN[linienId]) return "var(--border)";
  return PRODUKTIONSLINIEN[linienId].farbe;
}

function linienDunkel(linienId) {
  if (!linienId || !PRODUKTIONSLINIEN[linienId]) return "transparent";
  return PRODUKTIONSLINIEN[linienId].dunkel;
}

// Gibt den HTML-Badge für eine Linie zurück
function linienBadgeHTML(linienId) {
  if (!linienId || !PRODUKTIONSLINIEN[linienId]) return "";
  let linie = PRODUKTIONSLINIEN[linienId];
  return "<span class='linie-badge' style='color:" + linie.farbe + "; border-color:" + linie.farbe + "; background:" + linie.dunkel + "'>" +
    linie.emoji + " " + linie.name +
  "</span>";
}