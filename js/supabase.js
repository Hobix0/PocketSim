// ══════════════════════════════════
// SUPABASE — Login + Cloud Sync
// ══════════════════════════════════

const SUPABASE_URL = "https://buythdkjxqxnxhhmqijp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1eXRoZGtqeHF4bnhoaG1xaWpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NDM4NDEsImV4cCI6MjA5MzExOTg0MX0.KdSc6aT-Yt3VupZGpgmXPA7lqCSee6JVZ93oaKYpK-o";

const DEBUG_EMAILS = [
  "deine-test@email.de"
];

let supabaseClient  = null;
let aktuellerUser   = null;
let syncAktiv       = false;
let istDebugAccount = false;
let _syncTimer      = null;

// ══════════════════════════════════
// INIT — Zeigt Login oder startet Spiel
// ══════════════════════════════════

async function supabaseInit() {
  if (typeof window.supabase === "undefined") {
    console.warn("[Cloud] Supabase fehlt — starte ohne Login");
    loginScreenVerstecken();
    return;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // Gespeicherte Session prüfen (Cache)
  const { data } = await supabaseClient.auth.getSession();

  if (data.session) {
    // Bereits eingeloggt → direkt Spiel starten
    aktuellerUser = data.session.user;
    syncAktiv     = true;
    debugPruefen();
    ladebildschirmZeigen("Spielstand wird geladen...");
    await cloudPruefeUndLade();
    if (!_spielGestartet) { _spielGestartet = true; spielStarten(); }
  } else {
    // Nicht eingeloggt → Login-Screen zeigen
    loginScreenZeigen();
  }

  let _spielGestartet = false;  // Guard gegen doppeltes Starten

  // Auth-Änderungen beobachten
  supabaseClient.auth.onAuthStateChange(function(event, session) {
    if (event === "SIGNED_IN" && session) {
      aktuellerUser = session.user;
      syncAktiv     = true;
      debugPruefen();
      cloudBadgeAktualisieren();
      loginInfo("", "");

      // OAuth-Redirect: Spiel noch nicht gestartet → laden und starten
      let gameWrapper = document.getElementById("game-wrapper");
      let loginScreen = document.getElementById("login-screen");
      let spielLaeuft = gameWrapper && gameWrapper.style.display !== "none";

      if (!spielLaeuft) {
        console.log("[Cloud] OAuth SIGNED_IN → Spiel wird gestartet");
        ladebildschirmZeigen("Spielstand wird geladen...");
        cloudPruefeUndLade().then(function() {
          if (!_spielGestartet) { _spielGestartet = true; spielStarten(); }
        });
      }
    }
    if (event === "SIGNED_OUT") {
      aktuellerUser   = null;
      syncAktiv       = false;
      istDebugAccount = false;
      debugModusDeaktivieren();
      cloudBadgeAktualisieren();
      // Zurück zum Login-Screen
      spielBeenden();
      loginScreenZeigen();
    }
  });

  // Beim Schließen / Tab-Wechsel / App minimieren sofort speichern
  window.addEventListener("beforeunload", function() {
    if (syncAktiv) cloudSpeichernSofort();
  });

  document.addEventListener("visibilitychange", function() {
    if (document.visibilityState === "hidden" && syncAktiv) {
      console.log("[Cloud] Seite versteckt → sofort speichern");
      cloudSpeichernSofort();
    }
  });

  // Auf Mobile: pagehide ist zuverlässiger als beforeunload
  window.addEventListener("pagehide", function() {
    if (syncAktiv) cloudSpeichernSofort();
  });

  // iOS-Backup: alle 30 Sekunden speichern
  setInterval(function() {
    if (syncAktiv && typeof spielRundeGesamt !== "undefined" && spielRundeGesamt > 0) {
      cloudSpeichernSofort();
    }
  }, 30000);
}

// ══════════════════════════════════
// LOGIN SCREEN
// ══════════════════════════════════

function loginScreenZeigen() {
  let screen = document.getElementById("login-screen");
  let game   = document.getElementById("game-wrapper");
  if (screen) screen.style.display = "flex";
  if (game)   game.style.display   = "none";
  // Formular leeren
  let emailEl = document.getElementById("login-email");
  let pwEl    = document.getElementById("login-pw");
  if (emailEl) emailEl.value = "";
  if (pwEl)    pwEl.value    = "";
  loginInfo("", "");
}

function loginScreenVerstecken() {
  let screen = document.getElementById("login-screen");
  let game   = document.getElementById("game-wrapper");
  if (screen) screen.style.display = "none";
  if (game)   game.style.display   = "block";
}

function ladebildschirmZeigen(text) {
  let screen = document.getElementById("login-screen");
  let game   = document.getElementById("game-wrapper");
  if (screen) {
    screen.style.display = "flex";
    // Formular ausblenden, Lade-Animation zeigen
    let form = document.getElementById("login-form-bereich");
    let lade = document.getElementById("login-lade-bereich");
    if (form) form.style.display = "none";
    if (lade) {
      lade.style.display = "flex";
      let ladeText = document.getElementById("login-lade-text");
      if (ladeText) ladeText.textContent = text || "Lädt...";
    }
  }
  if (game) game.style.display = "none";
}

function spielBeenden() {
  // Produktion stoppen wenn nötig
  // (vereinfacht — bei Logout einfach neu laden)
  window.location.reload();
}

// ══════════════════════════════════
// AUTH AKTIONEN
// ══════════════════════════════════

async function loginEinloggen() {
  let email = (document.getElementById("login-email") || {}).value || "";
  let pw    = (document.getElementById("login-pw")    || {}).value || "";

  if (!email.trim() || !pw) { loginInfo("E-Mail und Passwort eingeben", "red"); return; }
  if (!supabaseClient)      { loginInfo("Keine Verbindung",              "red"); return; }

  loginInfo("Einloggen...", "grau");
  loginButtonsDeaktivieren(true);

  let { error } = await supabaseClient.auth.signInWithPassword({
    email: email.trim(),
    password: pw
  });

  if (error) {
    loginInfo(fehlerUebersetzen(error.message), "red");
    loginButtonsDeaktivieren(false);
    return;
  }

  // Eingeloggt → Spiel laden
  ladebildschirmZeigen("Spielstand wird geladen...");
  await cloudPruefeUndLade();
  spielStarten();
}

async function loginRegistrieren() {
  let email = (document.getElementById("login-email") || {}).value || "";
  let pw    = (document.getElementById("login-pw")    || {}).value || "";
  let pw2   = (document.getElementById("login-pw2")   || {}).value || "";

  if (!email.trim() || !pw) { loginInfo("E-Mail und Passwort eingeben", "red"); return; }
  if (pw.length < 6)        { loginInfo("Passwort mind. 6 Zeichen",     "red"); return; }
  if (pw !== pw2)           { loginInfo("Passwörter stimmen nicht überein", "red"); return; }
  if (!supabaseClient)      { loginInfo("Keine Verbindung",              "red"); return; }

  loginInfo("Registrierung läuft...", "grau");
  loginButtonsDeaktivieren(true);

  let { error } = await supabaseClient.auth.signUp({
    email: email.trim(),
    password: pw
  });

  if (error) {
    loginInfo(fehlerUebersetzen(error.message), "red");
    loginButtonsDeaktivieren(false);
  } else {
    loginInfo("✅ Bestätigungsmail gesendet! Bitte E-Mail bestätigen, dann einloggen.", "green");
    loginButtonsDeaktivieren(false);
  }
}

async function loginGoogle() {
  if (!supabaseClient) return;
  loginInfo("Weiterleitung zu Google...", "grau");
  await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options:  { redirectTo: window.location.href }
  });
}

function loginFormWechseln(modus) {
  // modus: "login" oder "register"
  let pw2Container = document.getElementById("login-pw2-container");
  let titelEl      = document.getElementById("login-titel");
  let loginBtn     = document.getElementById("login-btn-ein");
  let regBtn       = document.getElementById("login-btn-reg");
  let wechselEl    = document.getElementById("login-wechsel");

  if (modus === "register") {
    if (pw2Container) pw2Container.style.display = "block";
    if (titelEl)      titelEl.textContent         = "Konto erstellen";
    if (loginBtn)     loginBtn.style.display       = "none";
    if (regBtn)       regBtn.style.display         = "block";
    if (wechselEl)    wechselEl.innerHTML =
      "Bereits registriert? <a href='#' onclick='loginFormWechseln(\"login\")'>Einloggen</a>";
  } else {
    if (pw2Container) pw2Container.style.display = "none";
    if (titelEl)      titelEl.textContent         = "Willkommen zurück";
    if (loginBtn)     loginBtn.style.display       = "block";
    if (regBtn)       regBtn.style.display         = "none";
    if (wechselEl)    wechselEl.innerHTML =
      "Noch kein Konto? <a href='#' onclick='loginFormWechseln(\"register\")'>Registrieren</a>";
  }
  loginInfo("", "");
}

// Enter-Taste im Formular
function loginKeyDown(event) {
  if (event.key === "Enter") loginEinloggen();
}

// ── Hilfsfunktionen ──
function loginInfo(text, typ) {
  let el = document.getElementById("login-info");
  if (!el) return;
  el.textContent = text;
  el.style.color =
    typ === "green" ? "var(--green)" :
    typ === "red"   ? "var(--red)"   : "var(--text3)";
}

function loginButtonsDeaktivieren(aktiv) {
  ["login-btn-ein", "login-btn-reg", "login-btn-google"].forEach(function(id) {
    let el = document.getElementById(id);
    if (el) el.disabled = aktiv;
  });
}

function fehlerUebersetzen(msg) {
  if (msg.includes("Invalid login credentials")) return "❌ E-Mail oder Passwort falsch";
  if (msg.includes("Email not confirmed"))        return "📧 E-Mail noch nicht bestätigt";
  if (msg.includes("User already registered"))    return "⚠️ E-Mail bereits registriert";
  if (msg.includes("Password should be"))         return "❌ Passwort zu schwach";
  if (msg.includes("Unable to validate"))         return "❌ Ungültige E-Mail";
  return "❌ " + msg;
}

// ══════════════════════════════════
// CLOUD SYNC
// ══════════════════════════════════

async function cloudPruefeUndLade() {
  if (!syncAktiv || !aktuellerUser || !supabaseClient) return;

  let { data, error } = await supabaseClient
    .from("spielstand")
    .select("daten, gespeichert_am, runde, geld")
    .eq("user_id", aktuellerUser.id)
    .single();

  if (error || !data) {
    // Neuer Account (kein Spielstand) → frischen Start erzwingen
    console.log("[Cloud] Kein Spielstand gefunden → Gründungsscreen");
    localStorage.removeItem("pocketsim");
    localStorage.removeItem("pocketsim_ts");
    localStorage.removeItem("pocketsim_tutorial_done");
    // Leeren Spielstand in Cloud anlegen
    cloudSpeichernSofort();
    return;
  }

  let cloudTs = new Date(data.gespeichert_am).getTime();
  let lokalTs = parseInt(localStorage.getItem("pocketsim_ts") || "0");

  if (cloudTs > lokalTs) {
    spielstandLadenAusSlot(data.daten);
    localStorage.setItem("pocketsim_ts", cloudTs.toString());
  } else {
    cloudSpeichernSofort();
  }
}

function cloudSyncDebounced() {
  if (!syncAktiv) return;
  clearTimeout(_syncTimer);
  // 2 Sekunden nach letzter Änderung speichern
  _syncTimer = setTimeout(cloudSpeichernSofort, 2000);
}

// Sofort speichern — für wichtige Aktionen
function cloudSpeichernWichtig() {
  if (!syncAktiv) return;
  clearTimeout(_syncTimer);
  cloudSpeichernSofort();
}

function cloudSpeichernSofort() {
  if (!syncAktiv || !aktuellerUser || !supabaseClient) return;

  let jetzt = new Date().toISOString();

  supabaseClient.from("spielstand").upsert({
    user_id:        aktuellerUser.id,
    daten:          spielstandDatenErstellen(),
    gespeichert_am: jetzt,
    runde:          spielRundeGesamt || 0,
    geld:           geld || 0
  }, { onConflict: "user_id" }).then(function(res) {
    if (res.error) {
      console.error("[Cloud] Speichern fehlgeschlagen:", res.error.message);
      cloudStatusZeigen("❌ Sync fehlgeschlagen", "red");
    } else {
      let ts = Date.now();
      localStorage.setItem("pocketsim_ts", ts.toString());
      console.log("[Cloud] ✅ Gespeichert:", new Date(ts).toLocaleTimeString("de-DE"));
      cloudStatusZeigen("☁️✅ Gespeichert", "green");
    }
  });
}

function cloudStatusZeigen(text, typ) {
  let badge = document.getElementById("cloud-badge");
  if (!badge) return;
  let farbe = typ === "green" ? "var(--green)" : "var(--red)";
  badge.textContent = text === "☁️✅ Gespeichert" ? "☁️✅" : "☁️❌";
  badge.style.color = farbe;
  // Nach 3s zurück zum normalen Badge
  clearTimeout(badge._statusTimer);
  badge._statusTimer = setTimeout(cloudBadgeAktualisieren, 3000);
}

// ══════════════════════════════════
// DEBUG
// ══════════════════════════════════

function debugPruefen() {
  if (!aktuellerUser) return;
  if (window.location.search.includes("debug=1") ||
      DEBUG_EMAILS.includes(aktuellerUser.email.toLowerCase())) {
    istDebugAccount = true;
    let dbg = document.getElementById("debug-gruppe");
    if (dbg) dbg.style.display = "block";
  }
}

function debugModusDeaktivieren() {
  istDebugAccount = false;
  let dbg = document.getElementById("debug-gruppe");
  if (dbg) dbg.style.display = "none";
}

// ══════════════════════════════════
// HEADER BADGE + AUSLOGGEN
// ══════════════════════════════════

function cloudBadgeAktualisieren() {
  let badge = document.getElementById("cloud-badge");
  if (!badge) return;
  if (istDebugAccount) {
    badge.textContent = "🛠️";
    badge.title       = "Debug: " + (aktuellerUser ? aktuellerUser.email : "");
    badge.style.color = "var(--accent)";
  } else if (aktuellerUser) {
    badge.textContent = "👤";
    badge.title       = aktuellerUser.email;
    badge.style.color = "var(--green)";
  }
}

function ausloggen() {
  if (!supabaseClient) return;
  supabaseClient.auth.signOut();
}

// ══════════════════════════════════
// LOGIN MODAL
// ══════════════════════════════════

function loginModalOeffnen() {
  let modal = document.getElementById("modal-login");
  if (modal) {
    modal.style.display = "flex";
    // Fokus auf E-Mail Feld setzen
    let emailField = document.getElementById("auth-email");
    if (emailField) emailField.focus();
  }
}

function loginModalSchliessen() {
  let modal = document.getElementById("modal-login");
  if (modal) {
    modal.style.display = "none";
  }
}
