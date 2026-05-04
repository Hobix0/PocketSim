// ══════════════════════════════════
// EINSTELLUNGEN
// Debug-Panel: nur via Konsole
// ══════════════════════════════════

let debugUnendlichGeld  = false;
let debugKeineKosten    = false;
let debugPanelSichtbar  = false;  // Standard: AUS

function einstellungenOeffnen() {
  let geldEl      = document.getElementById("info-geld-stand");
  let maschinenEl = document.getElementById("info-maschinen-stand");
  let mitarbEl    = document.getElementById("info-mitarbeiter-stand");
  let rundeEl     = document.getElementById("info-runde-stand");

  if (geldEl)      geldEl.textContent      = geld.toLocaleString("de-DE") + " €";
  if (maschinenEl) maschinenEl.textContent = installierte_maschinen.length;
  if (mitarbEl)    mitarbEl.textContent    = mitarbeiter;
  if (rundeEl)     rundeEl.textContent     = spielRundeGesamt || 0;

  debugAnzeigenAktualisieren();
  debugPanelVisibility();
  cloudSyncInfoAktualisieren();
  document.getElementById("modal-einstellungen").style.display = "flex";
}

function einstellungenSchliessen() {
  document.getElementById("modal-einstellungen").style.display = "none";
}

// ── Debug Panel Sichtbarkeit ──
function debugPanelVisibility() {
  let panel = document.getElementById("debug-gruppe");
  if (!panel) return;
  panel.style.display = debugPanelSichtbar ? "block" : "none";
}

// Konsolen-API: pocketsim.debug()
window.pocketsim = {
  debug: function() {
    debugPanelSichtbar = !debugPanelSichtbar;
    debugPanelVisibility();
    // Debug-Materialien-Dropdown befüllen
    if (debugPanelSichtbar) debugMaterialDropdownBefuellen();
    console.log("[PocketSim] Debug-Panel " + (debugPanelSichtbar ? "aktiviert ✅" : "deaktiviert"));
    if (debugPanelSichtbar) {
      console.log("[PocketSim] Einstellungen öffnen um Debug-Tools zu nutzen");
      einstellungenOeffnen();
    }
  },
  addGeld: function(betrag) {
    geld += betrag;
    geldAnzeigenAktualisieren();
    console.log("[PocketSim] Geld: " + geld.toLocaleString("de-DE") + " €");
  },
  setMaterial: function(id, menge) {
    if (typeof lager !== "undefined") {
      lager[id] = menge;
      lagerAnzeigenAktualisieren();
      console.log("[PocketSim] Lager[" + id + "] = " + menge);
    }
  },
  info: function() {
    console.log("[PocketSim] Befehle:");
    console.log("  pocketsim.debug()           — Debug-Panel ein/aus");
    console.log("  pocketsim.addGeld(50000)    — Geld hinzufügen");
    console.log("  pocketsim.setMaterial('eisenplatte', 100) — Material setzen");
  }
};

console.log("[PocketSim] Debug: pocketsim.debug() | pocketsim.info()");

// ── Debug UI Aktualisierung ──
function debugAnzeigenAktualisieren() {
  let btnGeld   = document.getElementById("btn-debug-geld");
  let btnKosten = document.getElementById("btn-debug-kosten");
  let btnSound  = document.getElementById("btn-debug-sound");

  if (btnGeld) {
    btnGeld.textContent       = debugUnendlichGeld ? "💰 Unendlich Geld: AN" : "💰 Unendlich Geld: AUS";
    btnGeld.style.background  = debugUnendlichGeld ? "var(--green)" : "var(--surface2)";
    btnGeld.style.color       = debugUnendlichGeld ? "#000" : "var(--text2)";
  }
  if (btnKosten) {
    btnKosten.textContent      = debugKeineKosten ? "⚡ Kosten: AUS" : "⚡ Kosten: AN";
    btnKosten.style.background = debugKeineKosten ? "var(--green)" : "var(--surface2)";
    btnKosten.style.color      = debugKeineKosten ? "#000" : "var(--text2)";
  }
  if (btnSound && typeof soundsAktiv !== "undefined") {
    btnSound.textContent      = soundsAktiv ? "🔊 Sounds: AN" : "🔇 Sounds: AUS";
    btnSound.style.background = soundsAktiv ? "var(--green)" : "var(--surface2)";
    btnSound.style.color      = soundsAktiv ? "#000" : "var(--text2)";
  }
}

// ── Debug: Geld hinzufügen/entfernen ──
function debugGeldAktion() {
  let input  = document.getElementById("debug-geld-input");
  let select = document.getElementById("debug-geld-aktion");
  if (!input || !select) return;
  let betrag = parseInt(input.value) || 0;
  if (betrag <= 0) return;
  if (select.value === "add") {
    geld += betrag;
  } else {
    geld = Math.max(0, geld - betrag);
  }
  geldAnzeigenAktualisieren();
  let einst = document.getElementById("info-geld-stand");
  if (einst) einst.textContent = geld.toLocaleString("de-DE") + " €";
  if (typeof zeigeNotification === "function") {
    zeigeNotification((select.value === "add" ? "+" : "-") + betrag.toLocaleString("de-DE") + " € (Debug)", select.value === "add" ? "green" : "red");
  }
}

// ── Debug: Material setzen ──
function debugMaterialDropdownBefuellen() {
  let select = document.getElementById("debug-mat-select");
  if (!select || !window.MATERIALIEN) return;
  if (select.options.length > 1) return; // schon befüllt
  for (let mat of MATERIALIEN) {
    let opt = document.createElement("option");
    opt.value       = mat.id;
    opt.textContent = mat.emoji + " " + mat.name;
    select.appendChild(opt);
  }
}

function debugMaterialAktion() {
  let select = document.getElementById("debug-mat-select");
  let menge  = document.getElementById("debug-mat-menge");
  let aktion = document.getElementById("debug-mat-aktion");
  if (!select || !menge || !aktion) return;
  let id = select.value;
  let m  = parseInt(menge.value) || 0;
  if (!id || m <= 0) return;

  let vorher = lager[id] || 0;
  if (aktion.value === "set") {
    lager[id] = m;
  } else if (aktion.value === "add") {
    lager[id] = vorher + m;
  } else {
    lager[id] = Math.max(0, vorher - m);
  }
  lagerAnzeigenAktualisieren();
  let mat = MATERIALIEN.find(function(ma) { return ma.id === id; });
  if (typeof zeigeNotification === "function") {
    zeigeNotification("🛠️ " + (mat ? mat.name : id) + " → " + lager[id] + " Stk", "green");
  }
}

// ── Debug Toggles ──
function debugGeldToggle() {
  debugUnendlichGeld = !debugUnendlichGeld;
  if (debugUnendlichGeld) { geld = 999999999; geldAnzeigenAktualisieren(); }
  debugAnzeigenAktualisieren();
}

function debugKostenToggle() {
  debugKeineKosten = !debugKeineKosten;
  debugAnzeigenAktualisieren();
}

function debugAllesFreischalten() {
  geld = 999999999;
  if (typeof freigeschaltete_tiers !== "undefined") freigeschaltete_tiers = [1,2,3,4,5];
  if (typeof epocheMeilensteine    !== "undefined") epocheMeilensteine    = [];
  for (let mat of (MATERIALIEN || [])) lager[mat.id] = 9999;
  if (GRUNDSTUECKE && gekaufte_grundstuecke.length === 0) {
    gekaufte_grundstuecke.push(GRUNDSTUECKE[0].id);
  }
  geldAnzeigenAktualisieren();
  lagerAnzeigenAktualisieren();
  shopGenerieren();
  einstellungenSchliessen();
  if (typeof zeigeNotification === "function") zeigeNotification("🛠️ Alles freigeschaltet!", "green");
}

// ── Cloud Sync Info ──
function cloudSyncInfoAktualisieren() {
  let container = document.getElementById("save-slots-container");
  if (!container) return;
  if (typeof aktuellerUser !== "undefined" && aktuellerUser) {
    let ts = parseInt(localStorage.getItem("pocketsim_ts") || "0");
    let zeitText = ts ? new Date(ts).toLocaleString("de-DE") : "—";
    container.innerHTML =
      "<div class='cloud-sync-info'>" +
        "<div class='cloud-sync-status'>☁️✅ Cloud-Sync aktiv</div>" +
        "<div class='cloud-sync-email'>" + aktuellerUser.email + "</div>" +
        "<div class='cloud-sync-zeit'>Zuletzt: " + zeitText + "</div>" +
        "<button onclick='cloudSpeichernUndBestaetigen()' style='margin-top:10px;width:100%'>☁️ Jetzt synchronisieren</button>" +
        "<button onclick='ausloggen()' style='margin-top:8px;width:100%;background:rgba(239,68,68,0.1);color:var(--red);border:1px solid rgba(239,68,68,0.3)'>Ausloggen</button>" +
      "</div>";
  } else {
    container.innerHTML =
      "<div class='cloud-sync-info'>" +
        "<div class='cloud-sync-status'>☁️ Nicht eingeloggt</div>" +
        "<div style='font-size:12px;color:var(--text3);margin-top:4px'>Spielstand wird nur lokal gespeichert.</div>" +
      "</div>";
  }
}

function cloudSpeichernUndBestaetigen() {
  if (typeof cloudSpeichernSofort === "function") cloudSpeichernSofort();
  if (typeof zeigeNotification    === "function") zeigeNotification("☁️ Spielstand gespeichert!", "green");
}
