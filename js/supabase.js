// ══════════════════════════════════
// SUPABASE — Cloud Sync
//
// Prinzip (wie Leitstellenspiel & Co):
//   - 1 Account = 1 Spielstand
//   - localStorage = schneller lokaler Cache
//   - Supabase = zentraler Speicher
//   - Beim Start: Cloud vs. lokal → neuerer gewinnt
//   - Während Spielen: alle 5s debounced → Cloud
//   - Beim Schließen: sofort speichern
//
// Debug-Account:
//   - Emails in DEBUG_EMAILS → automatisch Debug-Modus
//   - Oder URL-Parameter ?debug=1 (nur lokal)
// ══════════════════════════════════

const SUPABASE_URL = "https://buythdkjxqxnxhhmqijp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1eXRoZGtqeHF4bnhoaG1xaWpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NDM4NDEsImV4cCI6MjA5MzExOTg0MX0.KdSc6aT-Yt3VupZGpgmXPA7lqCSee6JVZ93oaKYpK-o";

// !! Debug-E-Mails hier eintragen !!
const DEBUG_EMAILS = [
  "luca@pocketsim.dev",  // Deine Test-E-Mail hier
  "test@pocketsim.dev"
];

let supabaseClient  = null;
let aktuellerUser   = null;
let syncAktiv       = false;
let istDebugAccount = false;
let _syncTimer      = null;

// ══════════════════════════════════
// INIT — gibt Promise zurück damit
// main.js warten kann
// ══════════════════════════════════

function supabaseInit() {
  return new Promise(function(resolve) {

    // URL-Parameter Debug-Modus (nur lokal nutzbar)
    if (window.location.search.includes("debug=1")) {
      istDebugAccount = true;
      debugModusAktivieren();
    }

    if (typeof window.supabase === "undefined") {
      console.warn("[Cloud] Supabase Library fehlt");
      resolve();
      return;
    }

    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // Session prüfen
    supabaseClient.auth.getSession().then(function(res) {
      if (res.data && res.data.session) {
        aktuellerUser = res.data.session.user;
        syncAktiv     = true;
        debugPruefen();
        cloudBadgeAktualisieren();
        authAnzeige();

        // Cloud laden und auf Ergebnis warten
        cloudPruefeUndLade().then(function() {
          resolve(); // main.js kann weitermachen
        });
      } else {
        authAnzeige();
        resolve(); // nicht eingeloggt → sofort weiter
      }
    }).catch(function() {
      resolve();
    });

    // Auth-Änderungen nach dem Start
    supabaseClient.auth.onAuthStateChange(function(event, session) {
      if (event === "SIGNED_IN" && session) {
        aktuellerUser = session.user;
        syncAktiv     = true;
        debugPruefen();
        cloudBadgeAktualisieren();
        authAnzeige();
        // Nach Login: Cloud laden (KEIN Intro mehr triggern)
        cloudPruefeUndLade();
        zeigeNotification("☁️ Eingeloggt — " + aktuellerUser.email, "green");
      }
      if (event === "SIGNED_OUT") {
        aktuellerUser   = null;
        syncAktiv       = false;
        istDebugAccount = false;
        debugModusDeaktivieren();
        cloudBadgeAktualisieren();
        authAnzeige();
        zeigeNotification("👋 Ausgeloggt", "red");
      }
    });

    // Beim Schließen sofort speichern
    window.addEventListener("beforeunload", function() {
      if (syncAktiv) cloudSpeichernSofort();
    });
  });
}

// ══════════════════════════════════
// DEBUG-MODUS
// ══════════════════════════════════

function debugPruefen() {
  if (!aktuellerUser) return;
  istDebugAccount = DEBUG_EMAILS.includes(aktuellerUser.email.toLowerCase());
  if (istDebugAccount) debugModusAktivieren();
}

function debugModusAktivieren() {
  // Globale Debug-Variablen setzen
  window.debugUnendlichGeld = false; // wird manuell aktiviert
  window.debugKeineKosten   = false;

  // Debug-Gruppe in Einstellungen sichtbar
  let dbg = document.getElementById("debug-gruppe");
  if (dbg) dbg.style.display = "block";

  // Badge zeigen
  cloudBadgeAktualisieren();
  console.log("[Debug] Debug-Account aktiv:", aktuellerUser ? aktuellerUser.email : "URL-Param");
}

function debugModusDeaktivieren() {
  let dbg = document.getElementById("debug-gruppe");
  if (dbg) dbg.style.display = "none";
}

// ══════════════════════════════════
// CLOUD SYNC
// ══════════════════════════════════

function cloudPruefeUndLade() {
  return new Promise(function(resolve) {
    if (!syncAktiv || !aktuellerUser || !supabaseClient) {
      resolve();
      return;
    }

    supabaseClient
      .from("spielstand")
      .select("daten, gespeichert_am, runde, geld")
      .eq("user_id", aktuellerUser.id)
      .single()
      .then(function(res) {
        if (res.error || !res.data) {
          // Kein Cloud-Stand → aktuellen Stand hochladen
          cloudSpeichernSofort();
          resolve();
          return;
        }

        let cloudTs = new Date(res.data.gespeichert_am).getTime();
        let lokalTs = parseInt(localStorage.getItem("pocketsim_ts") || "0");

        if (cloudTs > lokalTs) {
          // Cloud neuer → laden (kein Intro triggern!)
          spielstandLadenAusSlot(res.data.daten);
          localStorage.setItem("pocketsim_ts", cloudTs.toString());
          // UI aktualisieren
          if (typeof geldAnzeigenAktualisieren === "function") geldAnzeigenAktualisieren();
          if (typeof lagerAnzeigenAktualisieren === "function") lagerAnzeigenAktualisieren();
          if (typeof uebersichtAktualisieren    === "function") uebersichtAktualisieren();
          if (typeof shopGenerieren             === "function") shopGenerieren();
          if (installierte_maschinen.length > 0 && !produktionLaeuft) {
            produktionStarten();
            produktionLaeuft = true;
          }
          zeigeNotification("☁️ Spielstand aus Cloud geladen (Runde " + res.data.runde + ")", "green");
        } else {
          // Lokal neuer → hochladen
          cloudSpeichernSofort();
        }

        cloudBadgeAktualisieren();
        resolve();
      })
      .catch(function() {
        resolve();
      });
  });
}

// Debounced — wird von spielstandSpeichern() aufgerufen
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
    user_id:        aktuellerUser.id,
    daten:          daten,
    gespeichert_am: jetzt,
    runde:          spielRundeGesamt || 0,
    geld:           geld || 0
  }, { onConflict: "user_id" }).then(function(res) {
    if (!res.error) {
      localStorage.setItem("pocketsim_ts", Date.now().toString());
    }
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
    .then(function(r) { if (r.error) authInfo(r.error.message, "red"); });
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
      else         authInfo("✅ Bestätigungsmail gesendet — E-Mail prüfen!", "green");
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
  let emailEl   = document.getElementById("auth-profil-email");
  let debugEl   = document.getElementById("auth-debug-badge");

  if (anmeldung) anmeldung.style.display = aktuellerUser ? "none" : "flex";
  if (profil)    profil.style.display    = aktuellerUser ? "flex" : "none";
  if (emailEl && aktuellerUser) emailEl.textContent = aktuellerUser.email;

  // Debug-Badge im Modal
  if (debugEl) debugEl.style.display = istDebugAccount ? "block" : "none";
}

function cloudBadgeAktualisieren() {
  let badge = document.getElementById("cloud-badge");
  if (!badge) return;
  if (!aktuellerUser) {
    badge.textContent = "☁️";
    badge.style.color = "var(--text3)";
    badge.title       = "Cloud-Sync — Einloggen";
  } else if (istDebugAccount) {
    badge.textContent = "🛠️";
    badge.style.color = "var(--accent)";
    badge.title       = "Debug-Account: " + aktuellerUser.email;
  } else {
    badge.textContent = "☁️✅";
    badge.style.color = "var(--green)";
    badge.title       = aktuellerUser.email + " — Sync aktiv";
  }
}

function cloudSpeichernUndBestaetigen() {
  cloudSpeichernSofort();
  zeigeNotification("☁️ Spielstand gespeichert!", "green");
}
