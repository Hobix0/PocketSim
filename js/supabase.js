// ══════════════════════════════════
// SUPABASE — Cloud Sync
// ══════════════════════════════════

const SUPABASE_URL = "https://buythdkjxqxnxhhmqijp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1eXRoZGtqeHF4bnhoaG1xaWpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NDM4NDEsImV4cCI6MjA5MzExOTg0MX0.KdSc6aT-Yt3VupZGpgmXPA7lqCSee6JVZ93oaKYpK-o";

let supabaseClient = null;
let aktuellerUser  = null;
let syncAktiv      = false;

function supabaseInit() {
  console.log("[Cloud] supabaseInit() gestartet", {
    supabaseGlobal: typeof window.supabase !== "undefined" ? window.supabase : null,
    supabaseUrl: SUPABASE_URL
  });

  if (typeof window.supabase === "undefined") {
    console.warn("[Cloud] Supabase Library fehlt");
    return;
  }
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log("[Cloud] supabaseClient erstellt", supabaseClient);

  supabaseClient.auth.getSession().then(function(res) {
    console.log("[Cloud] getSession result", res);
    if (res.data && res.data.session) {
      aktuellerUser = res.data.session.user;
      syncAktiv     = true;
      authAnzeige();
      cloudBadgeAktualisieren();
    }
  }).catch(function(err) {
    console.error("[Cloud] getSession fehlgeschlagen", err);
  });

  supabaseClient.auth.onAuthStateChange(function(event, session) {
    console.log("[Cloud] onAuthStateChange", event, session);
    if (event === "SIGNED_IN" && session) {
      aktuellerUser = session.user;
      syncAktiv     = true;
      authAnzeige();
      cloudBadgeAktualisieren();
      cloudLaden();
      zeigeNotification("☁️ Eingeloggt!", "green");
    }
    if (event === "SIGNED_OUT") {
      aktuellerUser = null;
      syncAktiv     = false;
      authAnzeige();
      cloudBadgeAktualisieren();
    }
  });
}

// ── Login/Logout anzeigen ──
function authAnzeige() {
  let anmeldung = document.getElementById("auth-anmeldung");
  let profil    = document.getElementById("auth-profil-bereich");
  let email     = document.getElementById("auth-profil-email");

  if (anmeldung) anmeldung.style.display = aktuellerUser ? "none"  : "flex";
  if (profil)    profil.style.display    = aktuellerUser ? "flex"  : "none";
  if (email && aktuellerUser) email.textContent = aktuellerUser.email;
}

// ── Modal ──
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

// ── Auth ──
function authEinloggen() {
  let email = (document.getElementById("auth-email") || {}).value || "";
  let pw    = (document.getElementById("auth-pw")    || {}).value || "";
  if (!email.trim() || !pw) { authInfo("E-Mail und Passwort eingeben", "red"); return; }
  if (!supabaseClient) {
    console.error("[Cloud] authEinloggen() fehlgeschlagen: supabaseClient ist null");
    authInfo("Keine Verbindung", "red");
    return;
  }
  authInfo("Einloggen...", "grau");
  supabaseClient.auth.signInWithPassword({ email: email.trim(), password: pw })
    .then(function(r) { if (r.error) authInfo(r.error.message, "red"); })
    .catch(function(err) { console.error("[Cloud] signInWithPassword error", err); authInfo("Login fehlgeschlagen", "red"); });
}

function authRegistrieren() {
  let email = (document.getElementById("auth-email") || {}).value || "";
  let pw    = (document.getElementById("auth-pw")    || {}).value || "";
  if (!email.trim() || !pw) { authInfo("E-Mail und Passwort eingeben", "red"); return; }
  if (pw.length < 6)        { authInfo("Passwort mind. 6 Zeichen",     "red"); return; }
  if (!supabaseClient) {
    console.error("[Cloud] authRegistrieren() fehlgeschlagen: supabaseClient ist null");
    authInfo("Keine Verbindung", "red");
    return;
  }
  authInfo("Registrierung...", "grau");
  supabaseClient.auth.signUp({ email: email.trim(), password: pw })
    .then(function(r) {
      if (r.error) authInfo(r.error.message, "red");
      else         authInfo("✅ Bestätigungsmail gesendet! E-Mail prüfen.", "green");
    })
    .catch(function(err) { console.error("[Cloud] signUp error", err); authInfo("Registrierung fehlgeschlagen", "red"); });
}

function authGoogle() {
  if (!supabaseClient) return;
  supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options:  { redirectTo: window.location.href }
  });
}

function authAusloggen() {
  if (supabaseClient) supabaseClient.auth.signOut();
  loginModalSchliessen();
}

function authInfo(text, typ) {
  let el = document.getElementById("auth-info");
  if (!el) return;
  el.textContent = text;
  el.style.color = typ === "green" ? "var(--green)" : typ === "red" ? "var(--red)" : "var(--text3)";
}

// ── Cloud ──
function cloudSpeichern() {
  if (!syncAktiv || !aktuellerUser || !supabaseClient) return;
  supabaseClient.from("spielstaende").upsert({
    user_id: aktuellerUser.id, slot: 1,
    daten: spielstandDatenErstellen(),
    aktualisiert_am: new Date().toISOString()
  }, { onConflict: "user_id,slot" }).then(function(r) {
    if (!r.error) localStorage.setItem("pocketsim_ts", Date.now().toString());
  });
}

function cloudLaden() {
  if (!syncAktiv || !aktuellerUser || !supabaseClient) return;
  supabaseClient.from("spielstaende")
    .select("daten,aktualisiert_am")
    .eq("user_id", aktuellerUser.id).eq("slot", 1).single()
    .then(function(r) {
      if (r.error || !r.data) return;
      if (new Date(r.data.aktualisiert_am).getTime() > parseInt(localStorage.getItem("pocketsim_ts") || "0")) {
        spielstandLadenAusSlot(r.data.daten);
        uebersichtAktualisieren();
        geldAnzeigenAktualisieren();
        zeigeNotification("☁️ Spielstand aus Cloud geladen!", "green");
      }
    });
}

let _syncTimer = null;
function cloudSyncDebounced() {
  if (!syncAktiv) return;
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(cloudSpeichern, 4000);
}

function cloudBadgeAktualisieren() {
  let b = document.getElementById("cloud-badge");
  if (!b) return;
  b.textContent = aktuellerUser ? "☁️✅" : "☁️";
  b.style.color = aktuellerUser ? "var(--green)" : "var(--text3)";
}


// Wrapper für HTML onclick (kein &quot; nötig)
function cloudSpeichernUndBestaetigen() {
  cloudSpeichern();
  zeigeNotification("☁️ Gespeichert!", "green");
}