// ── Produktionslinien ──
// Definiert die visuellen Linien und deren Farben

const PRODUKTIONSLINIEN = {
  metall: {
    id: "metall", name: "Metallverarbeitung", emoji: "⚙️",
    farbe: "#7a8fa6", dunkel: "rgba(122,143,166,0.12)"
  },
  baustoffe: {
    id: "baustoffe", name: "Baustoffe", emoji: "🧱",
    farbe: "#888780", dunkel: "rgba(136,135,128,0.12)"
  },
  chemie: {
    id: "chemie", name: "Chemie", emoji: "🛢️",
    farbe: "#534AB7", dunkel: "rgba(83,74,183,0.12)"
  },
  mechanik: {
    id: "mechanik", name: "Maschinenbau", emoji: "🔧",
    farbe: "#BA7517", dunkel: "rgba(186,117,23,0.12)"
  },
  elektronik: {
    id: "elektronik", name: "Elektronik", emoji: "💾",
    farbe: "#185FA5", dunkel: "rgba(24,95,165,0.12)"
  },
  energie: {
    id: "energie", name: "Energie", emoji: "⚡",
    farbe: "#5F5E5A", dunkel: "rgba(95,94,90,0.12)"
  },
  forschung: {
    id: "forschung", name: "Forschung", emoji: "🔬",
    farbe: "#0F6E56", dunkel: "rgba(15,110,86,0.12)"
  },
  logistik: {
    id: "logistik", name: "Logistik", emoji: "📦",
    farbe: "#185FA5", dunkel: "rgba(24,95,165,0.12)"
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