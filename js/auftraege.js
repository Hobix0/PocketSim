// ══════════════════════════════════
// AUFTRÄGE
// aktive_auftraege, abgeschlossene_auftraege,
// verfallene_auftraege → in state.js deklariert!
// ══════════════════════════════════

const MAX_AUFTRAEGE = 3;

function auftragBedingungErfuellt(bedingung) {
  if (!bedingung) return true;
  if (bedingung === "hatHobelmaschine")   return installierte_maschinen.some(function(m) { return m.id === "hobelmaschine"; });
  if (bedingung === "hatFurniermaschine") return installierte_maschinen.some(function(m) { return m.id === "furniermaschine"; });
  if (bedingung === "hatGiesserei")       return installierte_maschinen.some(function(m) { return m.id === "giesserei"; });
  if (bedingung === "hatSchmiedepresse")  return installierte_maschinen.some(function(m) { return m.id === "schmiedepresse"; });
  if (bedingung === "hatLackiererei")     return installierte_maschinen.some(function(m) { return m.id === "lackiererei"; });
  if (bedingung === "hatSchmelzofen")    return installierte_maschinen.some(function(m) { return m.id === "schmelzofen"; });
  return true;
}

function auftraegeAuffuellen() {
  if (aktive_auftraege.length >= MAX_AUFTRAEGE) return;
  if (!AUFTRAEGE_VORLAGEN || AUFTRAEGE_VORLAGEN.length === 0) return;

  let verfuegbare = AUFTRAEGE_VORLAGEN.filter(function(v) {
    return auftragBedingungErfuellt(v.bedingung) &&
           !aktive_auftraege.some(function(a) { return a.vorlageId === v.id; });
  });

  while (aktive_auftraege.length < MAX_AUFTRAEGE && verfuegbare.length > 0) {
    let idx     = Math.floor(Math.random() * verfuegbare.length);
    let vorlage = verfuegbare[idx];

    aktive_auftraege.push({
      id:                "a_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
      vorlageId:         vorlage.id,
      rundenVerbleibend: vorlage.deadline,
      geliefert:         0,
      bonus:             vorlage.basisBonus + Math.round((Math.random() - 0.5) * vorlage.basisBonus * 0.2)
    });

    verfuegbare.splice(idx, 1);
  }
}

function auftraegeRundeAktualisieren() {
  let verfallen = [];

  for (let auftrag of aktive_auftraege) {
    auftrag.rundenVerbleibend--;
    if (auftrag.rundenVerbleibend <= 0) verfallen.push(auftrag);
  }

  for (let v of verfallen) {
    aktive_auftraege = aktive_auftraege.filter(function(a) { return a.id !== v.id; });
    verfallene_auftraege++;

    let vorlage = AUFTRAEGE_VORLAGEN.find(function(vl) { return vl.id === v.vorlageId; });
    if (vorlage && vorlage.typ === "dringend") {
      geld = Math.max(0, geld - 500);
      zeigeNotification("⚠️ Auftrag verfallen: " + (vorlage ? vorlage.name : "") + " (-500 €)", "red");
    } else {
      zeigeNotification("❌ Auftrag verfallen: " + (vorlage ? vorlage.name : ""), "red");
    }
  }

  auftraegeAuffuellen();

  if (document.getElementById("auftraege-bereich")) {
    auftraegeScreenAktualisieren();
  }
}

function auftragErfuellen(auftragId) {
  let auftrag = aktive_auftraege.find(function(a) { return a.id === auftragId; });
  if (!auftrag) return;

  let vorlage = AUFTRAEGE_VORLAGEN.find(function(v) { return v.id === auftrag.vorlageId; });
  if (!vorlage) return;

  let bestand = lager[vorlage.material] || 0;
  if (bestand < vorlage.menge) {
    zeigeNotification("❌ Nicht genug Material! Benötigt: " + vorlage.menge, "red");
    return;
  }

  lager[vorlage.material] -= vorlage.menge;
  geld += auftrag.bonus;
  abgeschlossene_auftraege++;

  aktive_auftraege = aktive_auftraege.filter(function(a) { return a.id !== auftragId; });

  geldAnzeigenAktualisieren();
  lagerAnzeigenAktualisieren();
  spielstandSpeichern();

  auftraegeAuffuellen();
  auftraegeScreenAktualisieren();

  zeigeNotification("✅ Auftrag erfüllt! +" + auftrag.bonus.toLocaleString("de-DE") + " €", "green");
  if (typeof soundVerkaufen === "function") soundVerkaufen();
}

function zeigeNotification(text, farbe) {
  let el = document.getElementById("betrieb-status");
  if (!el) return;
  el.style.display    = "block";
  el.style.background = farbe === "green" ? "var(--green)" : "var(--red)";
  el.style.color      = farbe === "green" ? "#000" : "#fff";
  el.textContent      = text;
  setTimeout(function() {
    el.style.display    = "none";
    el.style.background = "var(--red)";
    el.style.color      = "#fff";
  }, 5000);
}

function auftraegeScreenAktualisieren() {
  let bereich = document.getElementById("auftraege-bereich");
  if (!bereich) return;

  let html =
    "<div class='auftraege-stats'>" +
      "<div class='auftraege-stat'>" +
        "<span class='auftraege-stat-wert'>" + aktive_auftraege.length + "/" + MAX_AUFTRAEGE + "</span>" +
        "<span class='auftraege-stat-label'>Aktive Aufträge</span>" +
      "</div>" +
      "<div class='auftraege-stat'>" +
        "<span class='auftraege-stat-wert' style='color:var(--green)'>" + abgeschlossene_auftraege + "</span>" +
        "<span class='auftraege-stat-label'>Abgeschlossen</span>" +
      "</div>" +
      "<div class='auftraege-stat'>" +
        "<span class='auftraege-stat-wert' style='color:var(--red)'>" + verfallene_auftraege + "</span>" +
        "<span class='auftraege-stat-label'>Verfallen</span>" +
      "</div>" +
    "</div>";

  if (aktive_auftraege.length === 0) {
    html += "<p class='screen-hinweis'>Keine aktiven Aufträge. Starte die Produktion um Aufträge zu erhalten!</p>";
    bereich.innerHTML = html;
    return;
  }

  for (let auftrag of aktive_auftraege) {
    let vorlage = AUFTRAEGE_VORLAGEN.find(function(v) { return v.id === auftrag.vorlageId; });
    if (!vorlage) continue;

    let mat           = MATERIALIEN.find(function(m) { return m.id === vorlage.material; });
    let bestand       = lager[vorlage.material] || 0;
    let kannErfuellen = bestand >= vorlage.menge;

    let deadlineFarbe = auftrag.rundenVerbleibend <= 2 ? "var(--red)" :
                        auftrag.rundenVerbleibend <= 4 ? "var(--accent)" : "var(--green)";

    let typFarbe = vorlage.typ === "dringend" ? "var(--red)" :
                   vorlage.typ === "gross"    ? "#8b5cf6"   : "var(--text3)";
    let typText  = vorlage.typ === "dringend" ? "🚨 DRINGEND" :
                   vorlage.typ === "gross"    ? "⭐ GROSSAUFTRAG" : "📋 Normal";

    let materialProzent = Math.min(100, Math.round((bestand / vorlage.menge) * 100));
    let materialFarbe   = materialProzent >= 100 ? "var(--green)" :
                          materialProzent >= 50  ? "var(--accent)" : "var(--red)";
    let deadlineProzent = Math.round((auftrag.rundenVerbleibend / vorlage.deadline) * 100);

    html +=
      "<div class='auftrag-karte" +
        (vorlage.typ === "dringend" ? " auftrag-dringend" : "") +
        (vorlage.typ === "gross"    ? " auftrag-gross"    : "") + "'>" +

        "<div class='auftrag-header'>" +
          "<div class='auftrag-header-links'>" +
            "<span class='auftrag-emoji'>" + vorlage.emoji + "</span>" +
            "<div>" +
              "<div class='auftrag-name'>" + vorlage.name + "</div>" +
              "<span class='auftrag-typ-badge' style='color:" + typFarbe + "; border-color:" + typFarbe + "'>" + typText + "</span>" +
            "</div>" +
          "</div>" +
          "<div class='auftrag-deadline' style='color:" + deadlineFarbe + "'>" +
            "<span class='auftrag-deadline-zahl'>" + auftrag.rundenVerbleibend + "</span>" +
            "<span class='auftrag-deadline-label'>Runden</span>" +
          "</div>" +
        "</div>" +

        "<p class='auftrag-beschreibung'>" + vorlage.beschreibung + "</p>" +

        "<div class='auftrag-material'>" +
          "<div class='auftrag-material-info'>" +
            "<span class='auftrag-material-emoji'>" + (mat ? mat.emoji : "📦") + "</span>" +
            "<div>" +
              "<div class='auftrag-material-name'>" + (mat ? mat.name : vorlage.material) + "</div>" +
              "<div class='auftrag-material-menge'>" +
                "<span style='color:" + materialFarbe + "'>" + bestand + "</span>" +
                " / " + vorlage.menge + " Stk" +
              "</div>" +
            "</div>" +
          "</div>" +
          "<div class='auftrag-bonus'>" +
            "<span class='auftrag-bonus-zahl'>+" + auftrag.bonus.toLocaleString("de-DE") + " €</span>" +
            "<span class='auftrag-bonus-label'>Bonus</span>" +
          "</div>" +
        "</div>" +

        "<div class='auftrag-fortschritt'>" +
          "<div class='auftrag-fortschritt-fill' style='width:" + materialProzent + "%; background:" + materialFarbe + "'></div>" +
        "</div>" +
        "<div class='auftrag-deadline-balken'>" +
          "<div class='auftrag-deadline-fill' style='width:" + deadlineProzent + "%; background:" + deadlineFarbe + "'></div>" +
        "</div>" +
        "<div class='auftrag-balken-labels'>" +
          "<span>Zeit verbleibend</span>" +
          "<span style='color:" + deadlineFarbe + "'>" + auftrag.rundenVerbleibend + " / " + vorlage.deadline + " Runden</span>" +
        "</div>" +

        "<button class='auftrag-btn " + (kannErfuellen ? "auftrag-btn-bereit" : "auftrag-btn-warten") + "' " +
          (kannErfuellen ? "data-auftrag-id='" + auftrag.id + "'" : "disabled") + ">" +
          (kannErfuellen
            ? "✅ Jetzt liefern — +" + auftrag.bonus.toLocaleString("de-DE") + " €"
            : "⏳ Warte auf Produktion (" + (vorlage.menge - bestand) + " fehlen)") +
        "</button>" +

      "</div>";
  }

  bereich.innerHTML = html;

  // Event-Listener für Auftrag-Buttons hinzufügen
  bereich.querySelectorAll(".auftrag-btn[data-auftrag-id]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      let id = btn.getAttribute("data-auftrag-id");
      if (typeof lkwAuswahl === "function") lkwAuswahl(id);
      else auftragErfuellen(id);
    });
  });
}