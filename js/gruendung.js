// ══════════════════════════════════
// GRÜNDUNG — Unternehmensstart
// Wird einmalig gezeigt wenn kein
// Unternehmen im Spielstand vorhanden
// ══════════════════════════════════

// Gründungs-State
let gruendungSchritt = 1;
let gruendungDaten = {
  name:       "",
  slogan:     "",
  fokus:      null,
  mitarbeiter: "",
  farbe:      "#f59e0b"
};

const FOKUS_OPTIONEN = [
  {
    id:       "bergbau",
    name:     "Rohstoffkonzern",
    icon:     "⛏",
    farbe:    "#BA7517",
    bg:       "#FAEEDA",
    bonus:    "+25 % Abbaurate · Mehr Vorkommen auf Planeten",
    start:    "Kleines Bergwerk + 2 Förderbänder + 50.000 €",
    startGeld: 50000,
    beschreibung: "Du glaubst: wer die Rohstoffe hat, gewinnt. Kontrolle über die Quellen ist Macht."
  },
  {
    id:       "fertigung",
    name:     "Fertigungswerk",
    icon:     "🏭",
    farbe:    "#0F6E56",
    bg:       "#E1F5EE",
    bonus:    "Maschinen +15 % schneller · Weniger Materialverlust",
    start:    "Kleine Fabrikhalle + 1 Maschine + 45.000 €",
    startGeld: 45000,
    beschreibung: "Du bist Macher. Roh­stoff rein, Produkt raus — und zwar besser als alle anderen."
  },
  {
    id:       "handel",
    name:     "Handelshaus",
    icon:     "📦",
    farbe:    "#185FA5",
    bg:       "#E6F1FB",
    bonus:    "Verkaufspreise +20 % · LKWs günstiger",
    start:    "Lagerhaus + 1 LKW + 60.000 €",
    startGeld: 60000,
    beschreibung: "Kaufen, veredeln, verkaufen. Der Markt ist dein Spielfeld — du kennst die Preise besser als alle."
  },
  {
    id:       "forschung",
    name:     "Technologiekonzern",
    icon:     "🔬",
    farbe:    "#534AB7",
    bg:       "#EEEDFE",
    bonus:    "Forschung +30 % schneller · Exklusive Früh-Technologien",
    start:    "Labor + 3 Forscher + 40.000 €",
    startGeld: 40000,
    beschreibung: "Die Zukunft gehört denen, die sie erfinden. Während andere produzieren, forscht du schon weiter."
  }
];

const FARB_OPTIONEN = [
  "#f59e0b", "#185FA5", "#0F6E56", "#534AB7",
  "#993C1D", "#A32D2D", "#5F5E5A", "#1D9E75"
];

// ── Gründungsscreen zeigen ──
function gruendungZeigen() {
  let screen = document.getElementById("gruendung-screen");
  if (screen) {
    screen.style.display = "flex";
    document.body.classList.add("login-aktiv");
    gruendungSchrittRendern();
  }
}

function gruendungVerstecken() {
  let screen = document.getElementById("gruendung-screen");
  if (screen) screen.style.display = "none";
  document.body.classList.remove("login-aktiv");
}

// ── Schritt rendern ──
function gruendungSchrittRendern() {
  let inhalt = document.getElementById("gruendung-inhalt");
  if (!inhalt) return;

  let fortHTML = [1,2,3,4].map(function(i) {
    let kl = i < gruendungSchritt ? "gd-dot-done" : i === gruendungSchritt ? "gd-dot-aktiv" : "gd-dot-open";
    return "<div class='gd-dot " + kl + "'>" + (i < gruendungSchritt ? "✓" : i) + "</div>";
  }).join("<div class='gd-line'></div>");

  let fortschritt = "<div class='gd-progress'>" + fortHTML + "</div>";

  let body = "";

  if (gruendungSchritt === 1) {
    body =
      "<div class='gd-story'>" +
        "<div class='gd-story-pre'>Jahr 2024</div>" +
        "<h2 class='gd-story-titel'>Du hast heute gekündigt.</h2>" +
        "<p class='gd-story-text'>Nach Jahren in der Industrie weißt du: Die großen Konzerne machen alles falsch. Du kannst es besser. 50.000 € auf dem Konto, ein leeres Grundstück am Stadtrand — und eine Idee.</p>" +
        "<p class='gd-story-text' style='margin-top:10px'>Was baust du?</p>" +
      "</div>" +
      "<button class='gd-btn-weiter' onclick='gruendungWeiter()'>Los geht's →</button>";

  } else if (gruendungSchritt === 2) {
    body =
      "<div class='gd-form-group'>" +
        "<label class='gd-label'>Wie heißt dein Unternehmen?</label>" +
        "<input id='gd-name-input' class='gd-input' type='text' placeholder='z.B. Nova Industries' maxlength='32' value='" + (gruendungDaten.name || "") + "' />" +
      "</div>" +
      "<div class='gd-form-group'>" +
        "<label class='gd-label'>Slogan <span style='font-weight:400;color:var(--color-text-tertiary)'>(optional)</span></label>" +
        "<input id='gd-slogan-input' class='gd-input' type='text' placeholder='z.B. Wir bauen die Zukunft' maxlength='48' value='" + (gruendungDaten.slogan || "") + "' />" +
      "</div>" +
      "<div class='gd-form-group'>" +
        "<label class='gd-label'>Unternehmensfarbe</label>" +
        "<div class='gd-farben'>" +
          FARB_OPTIONEN.map(function(f) {
            return "<div class='gd-farbe-dot" + (gruendungDaten.farbe === f ? " aktiv" : "") + "' style='background:" + f + "' onclick='gruendungFarbeWaehlen(\"" + f + "\")'></div>";
          }).join("") +
        "</div>" +
      "</div>" +
      "<button class='gd-btn-weiter' onclick='gruendungSchritt2Weiter()'>Weiter →</button>";

  } else if (gruendungSchritt === 3) {
    let fokusHTML = FOKUS_OPTIONEN.map(function(f) {
      let sel = gruendungDaten.fokus === f.id;
      return "<div class='gd-fokus-karte" + (sel ? " aktiv" : "") + "' " +
        "style='" + (sel ? "border-color:" + f.farbe + ";background:" + f.bg : "") + "'" +
        " onclick='gruendungFokusWaehlen(\"" + f.id + "\")'>" +
          "<div class='gdf-header'>" +
            "<span class='gdf-icon'>" + f.icon + "</span>" +
            "<div>" +
              "<div class='gdf-name' style='color:" + (sel ? f.farbe : "") + "'>" + f.name + "</div>" +
              "<div class='gdf-bonus'>" + f.bonus + "</div>" +
            "</div>" +
          "</div>" +
          "<div class='gdf-desc'>" + f.beschreibung + "</div>" +
          "<div class='gdf-start'>▶ " + f.start + "</div>" +
        "</div>";
    }).join("");

    body =
      "<p class='gd-sub'>Diese Wahl prägt deinen ganzen Spielverlauf.</p>" +
      "<div class='gd-fokus-grid'>" + fokusHTML + "</div>" +
      "<button class='gd-btn-weiter" + (!gruendungDaten.fokus ? " disabled" : "") + "' " +
        "onclick='gruendungWeiter()' " +
        (!gruendungDaten.fokus ? "disabled" : "") + ">Weiter →</button>";

  } else if (gruendungSchritt === 4) {
    let fokus   = FOKUS_OPTIONEN.find(function(f) { return f.id === gruendungDaten.fokus; });
    let nameAnz = gruendungDaten.name || "Dein Unternehmen";
    let farbe   = gruendungDaten.farbe;

    body =
      "<div class='gd-summary'>" +
        "<div class='gd-summary-logo' style='color:" + farbe + "'>" +
          (gruendungDaten.name || "Neues Unternehmen") +
        "</div>" +
        (gruendungDaten.slogan ? "<div class='gd-summary-slogan'>" + gruendungDaten.slogan + "</div>" : "") +
        "<div class='gd-summary-rows'>" +
          "<div class='gd-sum-row'><span>Fokus</span><span>" + (fokus ? fokus.icon + " " + fokus.name : "—") + "</span></div>" +
          "<div class='gd-sum-row'><span>Startkapital</span><span style='color:" + farbe + ";font-weight:500'>" + (fokus ? fokus.startGeld.toLocaleString("de-DE") : 50000) + " €</span></div>" +
          "<div class='gd-sum-row'><span>Epoche</span><span>I — Industriezeitalter</span></div>" +
          "<div class='gd-sum-row'><span>Planet</span><span>Aethon — Heimatplanet</span></div>" +
        "</div>" +
      "</div>" +
      "<p class='gd-sub' style='margin-bottom:14px'>Kein Reset nach dem Start. Deine Entscheidungen bleiben.</p>" +
      "<button class='gd-btn-start' onclick='gruendungAbschliessen()'>🏭 Unternehmen gründen</button>" +
      "<button class='gd-btn-zurueck' onclick='gruendungZurueck()'>← Zurück</button>";
  }

  inhalt.innerHTML =
    "<div class='gd-header'>" +
      "<div class='gd-title-row'>" +
        "<span class='gd-schritt-label'>Schritt " + gruendungSchritt + " / 4</span>" +
        "<h1 class='gd-titel'>" + [
          "Willkommen bei PocketSim",
          "Dein Unternehmen",
          "Wähle deinen Fokus",
          "Alles bereit"
        ][gruendungSchritt - 1] + "</h1>" +
      "</div>" +
      fortschritt +
    "</div>" +
    body;
}

// ── Navigation ──
function gruendungWeiter() {
  if (gruendungSchritt === 3 && !gruendungDaten.fokus) return;
  if (gruendungSchritt < 4) {
    gruendungSchritt++;
    gruendungSchrittRendern();
  }
}

function gruendungZurueck() {
  if (gruendungSchritt > 1) {
    gruendungSchritt--;
    gruendungSchrittRendern();
  }
}

function gruendungSchritt2Weiter() {
  let nameInput = document.getElementById("gd-name-input");
  let sloganInput = document.getElementById("gd-slogan-input");
  gruendungDaten.name   = (nameInput   ? nameInput.value.trim()   : "") || "Nova Industries";
  gruendungDaten.slogan = (sloganInput ? sloganInput.value.trim() : "");
  gruendungWeiter();
}

function gruendungFokusPruefen() {
  let btn = document.querySelector(".gd-btn-weiter");
  if (btn) {
    btn.disabled = !gruendungDaten.fokus;
    btn.classList.toggle("disabled", !gruendungDaten.fokus);
  }
}

function gruendungFokusWaehlen(id) {
  gruendungDaten.fokus = id;
  gruendungSchrittRendern(); // neu rendern mit Selektion
}

function gruendungFarbeWaehlen(farbe) {
  gruendungDaten.farbe = farbe;
  gruendungSchrittRendern();
}

// ── Abschließen → Spiel starten ──
function gruendungAbschliessen() {
  let fokus = FOKUS_OPTIONEN.find(function(f) { return f.id === gruendungDaten.fokus; });

  // Unternehmen in globalem State speichern
  unternehmen = {
    name:       gruendungDaten.name   || "Nova Industries",
    slogan:     gruendungDaten.slogan || "",
    fokus:      gruendungDaten.fokus  || "fertigung",
    farbe:      gruendungDaten.farbe  || "#f59e0b",
    gegruendet: new Date().toISOString(),
    epoche:     1
  };

  // Startkapital je nach Fokus
  geld = fokus ? fokus.startGeld : 50000;

  // Fokus-Boni in State schreiben
  unternehmenFokusAnwenden(fokus);

  // Header anpassen
  unternehmenHeaderAktualisieren();

  // Gründungsscreen weg, Spiel los
  gruendungVerstecken();

  // Direkt speichern
  spielstandSpeichernSofort();

  // Spiel initialisieren
  spielNachGruendungStarten();

  // Tutorial starten (nach kurzer Verzögerung)
  if (typeof tutorialNachGruendungStarten === "function") {
    tutorialNachGruendungStarten();
  }
}

function unternehmenFokusAnwenden(fokus) {
  if (!fokus) return;
  // Fokus-Boni werden in produktion.js / wirtschaft.js abgefragt
  // via unternehmen.fokus
  console.log("[Gründung] Fokus gesetzt:", fokus.name);
}

function unternehmenHeaderAktualisieren() {
  // Titel-Chip mit Unternehmensname
  let h1 = document.querySelector("#header h1");
  if (h1 && unternehmen && unternehmen.name) {
    h1.innerHTML = "<span style='color:" + unternehmen.farbe + "'>" +
      unternehmen.name + "</span>";
  }
  let sub = document.querySelector("#header .subtitle");
  if (sub && unternehmen && unternehmen.slogan) {
    sub.textContent = unternehmen.slogan;
  }
}

function spielNachGruendungStarten() {
  // Production starten, UI aufbauen
  geldAnzeigenAktualisieren();
  lagerAnzeigenAktualisieren();
  statistikAktualisieren();
  shopGenerieren();
  personalAnzeigenAktualisieren();
  uebersichtGrundstueckeAktualisieren();
  rundenStatusAktualisieren();
  cloudBadgeAktualisieren();
  if (typeof epocheInit === "function") epocheInit();

  // Kleines Willkommen nach Gründung
  setTimeout(function() {
    gruendungsGlueckwunschZeigen();
  }, 300);
}

function gruendungsGlueckwunschZeigen() {
  let fokus = FOKUS_OPTIONEN.find(function(f) { return f.id === unternehmen.fokus; });
  let modal = document.getElementById("modal-stadtrat");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "modal-stadtrat";
    document.body.appendChild(modal);
  }

  modal.innerHTML =
    "<div class='sr-fanfare-overlay'>" +
      "<div class='sr-fanfare-box'>" +
        "<div class='sr-fanfare-konfetti'>🎉</div>" +
        "<div style='font-size:32px;margin-bottom:8px'>" + (fokus ? fokus.icon : "🏭") + "</div>" +
        "<div class='sr-fanfare-akt'>Epoche I — Industriezeitalter</div>" +
        "<h2 class='sr-fanfare-titel'>" + unternehmen.name + "</h2>" +
        "<p class='sr-fanfare-text'>Gegründet. Das erste leere Grundstück wartet. Der erste Auftrag wartet. Die Galaxis wartet — aber erst einmal: eine Fabrik bauen.</p>" +
        "<div class='sr-fanfare-reward'>" +
          "<span class='sr-fanfare-reward-zahl'>" + geld.toLocaleString("de-DE") + " €</span>" +
          "<span class='sr-fanfare-reward-label'>Startkapital</span>" +
        "</div>" +
        "<button class='sr-fanfare-weiter' onclick='document.getElementById(\"modal-stadtrat\").style.display=\"none\"'>Erste Fabrik bauen →</button>" +
      "</div>" +
    "</div>";

  modal.style.display = "flex";
}
