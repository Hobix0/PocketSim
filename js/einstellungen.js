let debugUnendlichGeld = false;
let debugKeineKosten   = false;

function einstellungenOeffnen() {
  document.getElementById("info-geld-stand").textContent =
    geld.toLocaleString("de-DE") + " €";
  document.getElementById("info-maschinen-stand").textContent =
    installierte_maschinen.length;
  document.getElementById("info-mitarbeiter-stand").textContent =
    mitarbeiter;

  debugAnzeigenAktualisieren();
  initSaveSlotUI();
  document.getElementById("modal-einstellungen").style.display = "flex";
}

function einstellungenSchliessen() {
  document.getElementById("modal-einstellungen").style.display = "none";
}

function spielstandZuruecksetzen() {
  if (!confirm("Wirklich zurücksetzen? Alle Fortschritte gehen verloren!")) return;
  localStorage.removeItem("pocketsim");
  location.reload();
}

function debugAnzeigenAktualisieren() {
  let btnGeld   = document.getElementById("btn-debug-geld");
  let btnKosten = document.getElementById("btn-debug-kosten");
  let btnSound  = document.getElementById("btn-debug-sound");

  if (btnGeld) {
    btnGeld.textContent = debugUnendlichGeld ? "💰 Unendlich Geld: AN" : "💰 Unendlich Geld: AUS";
    btnGeld.style.background = debugUnendlichGeld ? "var(--green)" : "var(--surface2)";
    btnGeld.style.color      = debugUnendlichGeld ? "#000" : "var(--text2)";
  }

  if (btnKosten) {
    btnKosten.textContent = debugKeineKosten ? "⚡ Laufende Kosten: AUS" : "⚡ Laufende Kosten: AN";
    btnKosten.style.background = debugKeineKosten ? "var(--green)" : "var(--surface2)";
    btnKosten.style.color      = debugKeineKosten ? "#000" : "var(--text2)";
  }

  if (btnSound && typeof soundsAktiv !== "undefined") {
    btnSound.textContent = soundsAktiv ? "🔊 Sounds: AN" : "🔇 Sounds: AUS";
    btnSound.style.background = soundsAktiv ? "var(--green)" : "var(--surface2)";
    btnSound.style.color      = soundsAktiv ? "#000" : "var(--text2)";
  }
}

function debugGeldToggle() {
  debugUnendlichGeld = !debugUnendlichGeld;
  if (debugUnendlichGeld) {
    geld = 999999999;
    geldAnzeigenAktualisieren();
  }
  debugAnzeigenAktualisieren();
}

function debugKostenToggle() {
  debugKeineKosten = !debugKeineKosten;
  debugAnzeigenAktualisieren();
}

function debugAllesFreischalten() {
  geld = 999999999;

  // Grundstück sicherstellen
  if (gekaufte_grundstuecke.length === 0) {
    gekaufte_grundstuecke.push(GRUNDSTUECKE[0].id);
  }
  let gsId = gekaufte_grundstuecke[0];
  if (!gekaufte_gebaeude[gsId]) gekaufte_gebaeude[gsId] = [];

  // Alle Gebäude auf erstem Grundstück
  for (let g of GEBAEUDE) {
    if (!gekaufte_gebaeude[gsId].includes(g.id)) {
      gekaufte_gebaeude[gsId].push(g.id);
    }
  }

  // Alle Maschinen installieren
  installierte_maschinen = [];
  for (let m of MASCHINEN) {
    // Passendes Gebäude für diese Maschine finden
let passendesGeb = GEBAEUDE.find(function(g) {
  return g.typ === "fabrik" &&
         g.hallenTyp === (m.hallenTyp && m.hallenTyp.includes("schwer") ? "schwer" : "leicht");
});
let gebId = passendesGeb ? passendesGeb.id : (GEBAEUDE.find(function(g){ return g.typ === "fabrik"; }) || {}).id;
    installierte_maschinen.push({
      id:                  m.id,
      name:                m.name,
      emoji:               m.emoji,
      kosten:              m.kosten,
      groesse:             m.groesse,
      rezepte:             m.rezepte,
      kostenProRunde:      m.kostenProRunde,
      aktivesRezept:       m.aktivesRezept,
      laeuft:              true,
      gebaeudeId:          gebId,
      sessionProduktionen: 0
    });
  }

  // Lager füllen
  for (let mat of MATERIALIEN) {
    lager[mat.id] = 9999;
  }

  // Forschung alles erforschen
  erforschte_technologien = FORSCHUNG.map(function(f) { return f.id; });
  forschungsBonus = {
    produktionMultiplikator: 1.5,
    kostenMultiplikator:     0.8,
    lohnMultiplikator:       0.75,
    personalReduktion:       1,
    freigeschaltete_maschinen: MASCHINEN.map(function(m) { return m.id; })
  };

  mitarbeiter = 99;

  window.aktivesGrundstueckId = gsId;
let ersteFabrik = GEBAEUDE.find(function(g) { return g.typ === "fabrik"; });
window.aktivesGebaeudeId = ersteFabrik ? ersteFabrik.id : null;

  geldAnzeigenAktualisieren();
  lagerAnzeigenAktualisieren();
  uebersichtGrundstueckeAktualisieren();
  uebersichtAktualisieren();
  personalAnzeigenAktualisieren();
  shopGenerieren();

  if (!produktionLaeuft) {
    produktionStarten();
    produktionLaeuft = true;
  }

  spielstandSpeichern();
  einstellungenSchliessen();
  alert("🛠️ Debug: Alles freigeschaltet!");
}

function initSaveSlotUI() {
  let container = document.getElementById("save-slots-container");
  if (!container) return;
  container.innerHTML = "<p>Lade Slots…</p>";

  fetch("/save-slots")
    .then(function(response) {
      if (!response.ok) throw new Error("Fehler beim Lesen der Slots");
      return response.json();
    })
    .then(function(data) {
      container.innerHTML = "";
      data.slots.forEach(function(slotInfo) {
        let row = document.createElement("div");
        row.className = "save-slot-row";

        let title = document.createElement("div");
        title.className = "save-slot-row-header";
        title.innerHTML = "<span>Slot " + slotInfo.slot + "</span>" + (slotInfo.exists ? "<span class='save-slot-status'>" + (slotInfo.name || "Gespeichert") + "</span>" : "<span class='save-slot-status'>(leer)</span>");

        let meta = document.createElement("div");
        meta.className = "save-slot-meta";
        meta.textContent = slotInfo.exists ? (slotInfo.date ? "Zuletzt gespeichert: " + slotInfo.date : "Bereits gespeichert") : "Kein Speicherstand vorhanden.";

        let controls = document.createElement("div");
        controls.className = "save-slot-controls";

        let nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.placeholder = "Slot-Name";
        nameInput.value = slotInfo.name && slotInfo.exists ? slotInfo.name : "";

        let saveBtn = document.createElement("button");
        saveBtn.textContent = "Speichern";
        saveBtn.addEventListener("click", function() {
          saveSlot(slotInfo.slot, nameInput.value || "Slot " + slotInfo.slot);
        });

        let loadBtn = document.createElement("button");
        loadBtn.textContent = "Laden";
        loadBtn.disabled = !slotInfo.exists;
        loadBtn.addEventListener("click", function() {
          if (!slotInfo.exists) return;
          if (!confirm("Slot " + slotInfo.slot + " laden? Der aktuelle Fortschritt wird überschrieben.")) return;
          loadSlot(slotInfo.slot);
        });

        controls.appendChild(nameInput);
        controls.appendChild(saveBtn);
        controls.appendChild(loadBtn);
        row.appendChild(title);
        row.appendChild(meta);
        row.appendChild(controls);
        container.appendChild(row);
      });
    })
    .catch(function(error) {
      container.innerHTML = "<p>Fehler beim Laden der Speicherplätze.</p>";
      console.error(error);
    });
}

function saveSlot(slot, name) {
  let data = spielstandDatenErstellen();
  data.name = name;
  data.date = new Date().toLocaleString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

  fetch("/save-slot?slot=" + slot, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  })
    .then(function(response) {
      if (!response.ok) throw new Error("Speichern fehlgeschlagen");
      return response.json();
    })
    .then(function() {
      if (typeof zeigeNotification === "function") {
        zeigeNotification("Spielstand gespeichert in Slot " + slot, "green");
      } else {
        alert("Spielstand gespeichert in Slot " + slot);
      }
      initSaveSlotUI();
    })
    .catch(function(error) {
      console.error(error);
      alert("Fehler beim Speichern des Slots.");
    });
}

function loadSlot(slot) {
  fetch("/load-slot?slot=" + slot)
    .then(function(response) {
      if (!response.ok) throw new Error("Laden fehlgeschlagen");
      return response.json();
    })
    .then(function(data) {
      spielstandLadenAusSlot(data);
      aktiverSpielModus = true;
      spielstandSpeichern();
      if (typeof zeigeNotification === "function") {
        zeigeNotification("Spielstand aus Slot " + slot + " geladen", "green");
      } else {
        alert("Spielstand aus Slot " + slot + " geladen");
      }
      document.getElementById("modal-einstellungen").style.display = "none";
      location.reload();
    })
    .catch(function(error) {
      console.error(error);
      alert("Fehler beim Laden des Slots.");
    });
}
