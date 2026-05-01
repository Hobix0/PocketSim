// ══════════════════════════════════
// SUPABASE — Cloud Sync
// Prinzip: localStorage = primär, Cloud = Backup/Sync
// 1 Spielstand pro Account, kein Slot-System
// ══════════════════════════════════

// !! DEINE WERTE HIER EINTRAGEN !!
const SUPABASE_URL = "https://DEINE-ID.supabase.co";
const SUPABASE_KEY = "DEIN-ANON-KEY";

let supabaseClient = null;
let aktuellerUser  = null;
let syncAktiv      = false;
let _syncTimer     = null;

// ══════════════════════════════════
// INIT
// ══════════════════════════════════

function supabaseInit() {
  if (typeof window.supabase === "undefined") {
    console.warn("[Cloud] Supabase Library nicht geladen");
    return;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // Bereits eingeloggt?
  supabaseClient.auth.getSession().then(function(res) {
    if (res.data && res.data.session) {
      aktuellerUser = res.data.session.user;
      syncAktiv     = true;
      cloudBadgeAktualisieren();
      authAnzeige();
      // Beim Start: Cloud prüfen ob neuer als lokal
      cloudPruefeUndLade();
    } else {
      authAnzeige();
    }
  });

  // Login/Logout beobachten
  supabaseClient.auth.onAuthStateChange(function(event, session) {
    if (event === "SIGNED_IN" && session) {
      aktuellerUser = session.user;
      syncAktiv     = true;
      cloudBadgeAktualisieren();
      authAnzeige();
      cloudPruefeUndLade();
      zeigeNotification("☁️ Eingeloggt!", "green");
    }
    if (event === "SIGNED_OUT") {
      aktuellerUser = null;
      syncAktiv     = false;
      cloudBadgeAktualisieren();
      authAnzeige();
      zeigeNotification("👋 Ausgeloggt", "red");
    }
  });

  // Beim Schließen sofort speichern
  window.addEventListener("beforeunload", function() {
    if (syncAktiv) cloudSpeichernSofort();
  });
}

// ══════════════════════════════════
// SPEICHERN
// ══════════════════════════════════

// Wird von spielstandSpeichern() aufgerufen — debounced
function cloudSyncDebounced() {
  if (!syncAktiv) return;
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(cloudSpeichernSofort, 5000);
}

function cloudSpeichernSofort() {
  if (!syncAktiv || !aktuellerUser || !supabaseClient) return;

  let daten = spielstandDatenErstellen();
  let jetzt = new Date().toISOString();

  supabaseClient.from("spielstand").upsert({
    user_id:         aktuellerUser.id,
    daten:           daten,
    gespeichert_am:  jetzt,
    runde:           spielRundeGesamt || 0,
    geld:            geld || 0
  }, { onConflict: "user_id" }).then(function(res) {
    if (res.error) {
      console.error("[Cloud] Speichern fehlgeschlagen:", res.error.message);
    } else {
      localStorage.setItem("pocketsim_cloud_ts", Date.now().toString());
      cloudBadgeAktualisieren();
    }
  });
}

// ══════════════════════════════════
// LADEN
// ══════════════════════════════════

function cloudPruefeUndLade() {
  if (!syncAktiv || !aktuellerUser || !supabaseClient) return;

  supabaseClient
    .from("spielstand")
    .select("daten, gespeichert_am, runde, geld")
    .eq("user_id", aktuellerUser.id)
    .single()
    .then(function(res) {
      if (res.error || !res.data) {
        // Kein Cloud-Stand → aktuellen lokal hochladen
        console.log("[Cloud] Kein Cloud-Stand — lade lokalen Stand hoch");
        cloudSpeichernSofort();
        return;
      }

      let cloudTs = new Date(res.data.gespeichert_am).getTime();
      let lokalTs = parseInt(localStorage.getItem("pocketsim_cloud_ts") || "0");

      if (cloudTs > lokalTs) {
        // Cloud ist neuer → laden
        console.log("[Cloud] Cloud-Stand ist neuer (R" + res.data.runde + ") → lade");
        spielstandLadenAusSlot(res.data.daten);
        localStorage.setItem("pocketsim_cloud_ts", cloudTs.toString());
        if (typeof uebersichtAktualisieren === "function") uebersichtAktualisieren();
        if (typeof geldAnzeigenAktualisieren === "function") geldAnzeigenAktualisieren();
        zeigeNotification("☁️ Spielstand aus Cloud geladen (Runde " + res.data.runde + ")", "green");
      } else {
        // Lokal ist neuer → hochladen
        console.log("[Cloud] Lokaler Stand ist neuer → lade hoch");
        cloudSpeichernSofort();
      }

      cloudBadgeAktualisieren();
    });
}

// ══════════════════════════════════
// AUTH
// ══════════════════════════════════

function authEinloggen() {
  let email = (document.getElementById("auth-email") || {}).value || "";
  let pw    = (document.getElementById("auth-pw")    || {}).value || "";

  if (!email.trim() || !pw) { authInfo("E-Mail und Passwort eingeben", "red"); return; }
  if (!supabaseClient)      { authInfo("Keine Verbindung",              "red"); return; }

  authInfo("Einloggen...", "grau");
  supabaseClient.auth.signInWithPassword({ email: email.trim(), password: pw })
    .then(function(r) {
      if (r.error) authInfo(r.error.message, "red");
    });
}

function authRegistrieren() {
  let email = (document.getElementById("auth-email") || {}).value || "";
  let pw    = (document.getElementById("auth-pw")    || {}).value || "";

  if (!email.trim() || !pw) { authInfo("E-Mail und Passwort eingeben", "red"); return; }
  if (pw.length < 6)        { authInfo("Passwort mind. 6 Zeichen",     "red"); return; }
  if (!supabaseClient)      { authInfo("Keine Verbindung",              "red"); return; }

  authInfo("Registrierung läuft...", "grau");
  supabaseClient.auth.signUp({ email: email.trim(), password: pw })
    .then(function(r) {
      if (r.error) authInfo(r.error.message, "red");
      else         authInfo("✅ Bestätigungsmail gesendet! Bitte E-Mail bestätigen.", "green");
    });
}

function authGoogle() {
  if (!supabaseClient) return;
  supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options:  { redirectTo: window.location.href }
  });
}

function authAusloggen() {
  if (!supabaseClient) return;
  supabaseClient.auth.signOut();
  loginModalSchliessen();
}

function authInfo(text, typ) {
  let el = document.getElementById("auth-info");
  if (!el) return;
  el.textContent = text;
  el.style.color =
    typ === "green" ? "var(--green)" :
    typ === "red"   ? "var(--red)"   : "var(--text3)";
}

// ══════════════════════════════════
// UI
// ══════════════════════════════════

function loginModalOeffnen() {
  let modal = document.getElementById("modal-login");
  if (modal) {
    modal.style.display = "flex";
    authAnzeige();
  }
}

function loginModalSchliessen() {
  let modal = document.getElementById("modal-login");
  if (modal) modal.style.display = "none";
}

function authAnzeige() {
  let anmeldung = document.getElementById("auth-anmeldung");
  let profil    = document.getElementById("auth-profil-bereich");
  let email     = document.getElementById("auth-profil-email");

  if (anmeldung) anmeldung.style.display = aktuellerUser ? "none" : "flex";
  if (profil)    profil.style.display    = aktuellerUser ? "flex" : "none";
  if (email && aktuellerUser) email.textContent = aktuellerUser.email;
}

function cloudBadgeAktualisieren() {
  let badge = document.getElementById("cloud-badge");
  if (!badge) return;
  if (!aktuellerUser) {
    badge.textContent = "☁️";
    badge.style.color = "var(--text3)";
    badge.title       = "Cloud-Sync — Einloggen";
  } else {
    badge.textContent = "☁️✅";
    badge.style.color = "var(--green)";
    badge.title       = aktuellerUser.email + " — Cloud-Sync aktiv";
  }
}

function cloudSpeichernUndBestaetigen() {
  cloudSpeichernSofort();
  zeigeNotification("☁️ Spielstand gespeichert!", "green");
}
