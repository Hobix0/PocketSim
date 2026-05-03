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

  // ── KPI Header ──
  let gesamtBonus = aktive_auftraege.reduce(function(sum, a) { return sum + (a.bonus || 0); }, 0);
  let dringend    = aktive_auftraege.filter(function(a) {
    let v = AUFTRAEGE_VORLAGEN.find(function(v) { return v.id === a.vorlageId; });
    return v && v.typ === "dringend";
  }).length;

  let html =
    "<div class='auftraege-kpi-grid'>" +
      "<div class='kpi-card'>" +
        "<span class='kpi-label'>Aktive Aufträge</span>" +
        "<span class='kpi-value'>" + aktive_auftraege.length + "<span style='font-size:13px;color:var(--text3)'>/" + MAX_AUFTRAEGE + "</span></span>" +
      "</div>" +
      "<div class='kpi-card'>" +
        "<span class='kpi-label'>Abgeschlossen</span>" +
        "<span class='kpi-value positive'>" + abgeschlossene_auftraege + "</span>" +
      "</div>" +
      "<div class='kpi-card'>" +
        "<span class='kpi-label'>Verfallen</span>" +
        "<span class='kpi-value" + (verfallene_auftraege > 0 ? " negative" : "") + "'>" + verfallene_auftraege + "</span>" +
      "</div>" +
      "<div class='kpi-card'>" +
        "<span class='kpi-label'>Möglicher Bonus</span>" +
        "<span class='kpi-value accent'>+" + gesamtBonus.toLocaleString("de-DE") + " €</span>" +
      "</div>" +
    "</div>";

  if (aktive_auftraege.length === 0) {
    html +=
      "<div class='auftrag-leer-hint'>" +
        "<div style='font-size:40px;margin-bottom:10px'>📋</div>" +
        "<div style='font-family:var(--font-head);font-size:14px;font-weight:700;color:var(--text2);margin-bottom:6px'>Keine aktiven Aufträge</div>" +
        "<div style='font-size:12px;color:var(--text3)'>Starte die Produktion — neue Aufträge erscheinen automatisch.</div>" +
      "</div>";
    bereich.innerHTML = html;
    return;
  }

  // ── Aufträge sortiert (dringend zuerst) ──
  let sortiert = [...aktive_auftraege].sort(function(a, b) {
    let va = AUFTRAEGE_VORLAGEN.find(function(v) { return v.id === a.vorlageId; });
    let vb = AUFTRAEGE_VORLAGEN.find(function(v) { return v.id === b.vorlageId; });
    let prioA = va && va.typ === "dringend" ? 0 : va && va.typ === "gross" ? 1 : 2;
    let prioB = vb && vb.typ === "dringend" ? 0 : vb && vb.typ === "gross" ? 1 : 2;
    if (prioA !== prioB) return prioA - prioB;
    return a.rundenVerbleibend - b.rundenVerbleibend;
  });

  html += "<div class='auftraege-liste'>";

  for (let auftrag of sortiert) {
    let vorlage = AUFTRAEGE_VORLAGEN.find(function(v) { return v.id === auftrag.vorlageId; });
    if (!vorlage) continue;

    let mat          = MATERIALIEN.find(function(m) { return m.id === vorlage.material; });
    let bestand      = lager[vorlage.material] || 0;
    let kannLiefern  = bestand >= vorlage.menge;
    let fortProzent  = Math.min(100, Math.round((bestand / vorlage.menge) * 100));
    let deadlineProz = Math.min(100, Math.round(((vorlage.deadline - auftrag.rundenVerbleibend) / vorlage.deadline) * 100));

    // Farben
    let deadlineFarbe = auftrag.rundenVerbleibend <= 2 ? "var(--red)" :
                        auftrag.rundenVerbleibend <= 4 ? "var(--amber)" : "var(--green)";
    let fortFarbe     = kannLiefern ? "var(--green)" : fortProzent >= 50 ? "var(--amber)" : "var(--text3)";
    let deadlineBalkenFarbe = auftrag.rundenVerbleibend <= 2 ? "var(--red)" :
                              auftrag.rundenVerbleibend <= 4 ? "var(--amber)" : "var(--cyan)";

    // Typ
    let typConfig = {
      dringend: { farbe: "var(--red)",    bg: "rgba(239,68,68,0.1)",    text: "⚡ DRINGEND",     border: "rgba(239,68,68,0.4)" },
      gross:    { farbe: "var(--purple)", bg: "rgba(139,92,246,0.1)",   text: "⭐ GROSSAUFTRAG", border: "rgba(139,92,246,0.4)" },
      normal:   { farbe: "var(--text3)",  bg: "var(--surface2)",         text: "📋 Normal",       border: "var(--border)" }
    };
    let typ = typConfig[vorlage.typ] || typConfig.normal;

    html +=
      "<div class='auftrag-card-neu' style='border-left-color:" + typ.border + "'>" +

        // ── Header ──
        "<div class='aufn-header'>" +
          "<div class='aufn-emoji'>" + vorlage.emoji + "</div>" +
          "<div class='aufn-title-block'>" +
            "<div class='aufn-name'>" + vorlage.name + "</div>" +
            "<span class='aufn-typ-badge' style='color:" + typ.farbe + ";background:" + typ.bg + ";border-color:" + typ.farbe + "'>" + typ.text + "</span>" +
          "</div>" +
          "<div class='aufn-deadline' style='color:" + deadlineFarbe + "'>" +
            "<span class='aufn-deadline-zahl'>" + auftrag.rundenVerbleibend + "</span>" +
            "<span class='aufn-deadline-label'>Runden</span>" +
          "</div>" +
        "</div>" +

        // ── Deadline Balken ──
        "<div class='aufn-deadline-track'>" +
          "<div style='height:100%;border-radius:2px;transition:width 0.5s;background:" + deadlineBalkenFarbe + ";width:" + deadlineProz + "%'></div>" +
        "</div>" +

        // ── Material ──
        "<div class='aufn-material-row'>" +
          "<span class='aufn-mat-emoji'>" + (mat ? mat.emoji : "📦") + "</span>" +
          "<div class='aufn-mat-info'>" +
            "<span class='aufn-mat-name'>" + (mat ? mat.name : vorlage.material) + "</span>" +
            "<div class='aufn-fort-track'>" +
              "<div style='height:100%;border-radius:2px;transition:width 0.5s;background:" + fortFarbe + ";width:" + fortProzent + "%'></div>" +
            "</div>" +
            "<span class='aufn-mat-stand' style='color:" + fortFarbe + "'>" +
              bestand + " <span style='color:var(--text3);font-size:10px'>/ " + vorlage.menge + " Stk</span>" +
            "</span>" +
          "</div>" +
          "<div class='aufn-bonus'>" +
            "<span class='aufn-bonus-zahl'>+" + auftrag.bonus.toLocaleString("de-DE") + " €</span>" +
            "<span class='aufn-bonus-label'>Bonus</span>" +
          "</div>" +
        "</div>" +

        // ── Beschreibung ──
        "<p class='aufn-beschreibung'>" + vorlage.beschreibung + "</p>" +

        // ── Button ──
        "<button class='" + (kannLiefern ? "aufn-btn-bereit" : "aufn-btn-warten") + "' " +
          (kannLiefern ? "data-auftrag-id='" + auftrag.id + "'" : "disabled") + ">" +
          (kannLiefern
            ? "✅ Liefern — +" + auftrag.bonus.toLocaleString("de-DE") + " €"
            : "⏳ Noch " + (vorlage.menge - bestand) + " " + (mat ? mat.name : "") + " fehlen") +
        "</button>" +

      "</div>";
  }

  html += "</div>";
  bereich.innerHTML = html;

  // Events
  bereich.querySelectorAll("[data-auftrag-id]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      auftragErfuellen(btn.dataset.auftragId);
    });
  });
}

}