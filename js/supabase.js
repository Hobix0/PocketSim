// ══════════════════════════════════
// SUPABASE — Cloud Sync
// Spielstand zwischen Geräten synchronisieren
// ══════════════════════════════════

// !! DEINE SUPABASE DATEN HIER EINTRAGEN !!
const SUPABASE_URL  = "https://supabase.com/dashboard/project/buythdkjxqxnxhhmqijp";
const SUPABASE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1eXRoZGtqeHF4bnhoaG1xaWpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NDM4NDEsImV4cCI6MjA5MzExOTg0MX0.KdSc6aT-Yt3VupZGpgmXPA7lqCSee6JVZ93oaKYpK-o";

let supabaseClient = null;
let aktuellerUser  = null;
let syncAktiv      = false;
 
// ── Init ──
function supabaseInit() {
  // Supabase Library muss als Script-Tag geladen sein (in index.html)
  if (typeof window.supabase === "undefined") {
    console.warn("[Cloud] Supabase Library nicht gefunden");
    return;
  }
 
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
 
  // Eingeloggten User prüfen
  supabaseClient.auth.getSession().then(function(result) {
    if (result.data && result.data.session) {
      aktuellerUser = result.data.session.user;
      syncAktiv     = true;
      cloudBadgeAktualisieren();
    }
    // Modal-Inhalt aktualisieren falls offen
    loginModalInhaltAktualisieren();
  });
 
  // Login/Logout beobachten
  supabaseClient.auth.onAuthStateChange(function(event, session) {
    if (event === "SIGNED_IN" && session) {
      aktuellerUser = session.user;
      syncAktiv     = true;
      cloudBadgeAktualisieren();
      loginModalInhaltAktualisieren();
      cloudLaden();
      zeigeNotification("☁️ Eingeloggt — Spielstand wird geladen...", "green");
    }
    if (event === "SIGNED_OUT") {
      aktuellerUser = null;
      syncAktiv     = false;
      cloudBadgeAktualisieren();
      loginModalInhaltAktualisieren();
      zeigeNotification("👋 Ausgeloggt", "red");
    }
  });
}
 
// ══════════════════════════════════
// AUTH
// ══════════════════════════════════
 
function authRegistrieren() {
  let email = document.getElementById("auth-email").value.trim();
  let pw    = document.getElementById("auth-pw").value;
 
  if (!email || !pw) { authInfo("E-Mail und Passwort eingeben", "red");    return; }
  if (pw.length < 6) { authInfo("Passwort mind. 6 Zeichen",    "red");    return; }
  if (!supabaseClient) { authInfo("Verbindung nicht möglich",  "red");    return; }
 
  authInfo("Registrierung läuft...", "grau");
 
  supabaseClient.auth.signUp({ email: email, password: pw }).then(function(result) {
    if (result.error) {
      authInfo(result.error.message, "red");
    } else {
      authInfo("✅ Bestätigungsmail gesendet! Bitte E-Mail prüfen.", "green");
    }
  });
}
 
function authEinloggen() {
  let email = document.getElementById("auth-email").value.trim();
  let pw    = document.getElementById("auth-pw").value;
 
  if (!email || !pw) { authInfo("E-Mail und Passwort eingeben", "red"); return; }
  if (!supabaseClient) { authInfo("Verbindung nicht möglich",   "red"); return; }
 
  authInfo("Einloggen...", "grau");
 
  supabaseClient.auth.signInWithPassword({ email: email, password: pw }).then(function(result) {
    if (result.error) authInfo(result.error.message, "red");
  });
}
 
function authGoogle() {
  if (!supabaseClient) { zeigeNotification("❌ Verbindung nicht möglich", "red"); return; }
  supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.href }
  });
}
 
function authAusloggen() {
  if (!supabaseClient) return;
  supabaseClient.auth.signOut();
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
// CLOUD SYNC
// ══════════════════════════════════
 
function cloudSpeichern() {
  if (!syncAktiv || !aktuellerUser || !supabaseClient) return;
 
  let daten = spielstandDatenErstellen();
 
  supabaseClient.from("spielstaende").upsert({
    user_id:         aktuellerUser.id,
    slot:            1,
    daten:           daten,
    aktualisiert_am: new Date().toISOString()
  }, { onConflict: "user_id,slot" }).then(function(result) {
    if (!result.error) {
      localStorage.setItem("pocketsim_ts", Date.now().toString());
    }
  });
}
 
function cloudLaden() {
  if (!syncAktiv || !aktuellerUser || !supabaseClient) return;
 
  supabaseClient
    .from("spielstaende")
    .select("daten, aktualisiert_am")
    .eq("user_id", aktuellerUser.id)
    .eq("slot", 1)
    .single()
    .then(function(result) {
      if (result.error || !result.data) return;
      let cloudTs = new Date(result.data.aktualisiert_am).getTime();
      let lokalTs = parseInt(localStorage.getItem("pocketsim_ts") || "0");
      if (cloudTs > lokalTs) {
        spielstandLadenAusSlot(result.data.daten);
        uebersichtAktualisieren();
        geldAnzeigenAktualisieren();
        zeigeNotification("☁️ Cloud-Spielstand geladen!", "green");
      }
    });
}
 
let cloudSyncTimer = null;
function cloudSyncDebounced() {
  if (!syncAktiv) return;
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(cloudSpeichern, 4000);
}
 
// ══════════════════════════════════
// UI
// ══════════════════════════════════
 
function loginModalOeffnen() {
  let modal = document.getElementById("modal-login");
  if (!modal) return;
  modal.style.display = "flex";
  loginModalInhaltAktualisieren();
}
 
function loginModalSchliessen() {
  let modal = document.getElementById("modal-login");
  if (modal) modal.style.display = "none";
}
 
function loginModalInhaltAktualisieren() {
  let bereich = document.getElementById("login-inhalt");
  if (!bereich) return;
 
  if (aktuellerUser) {
    bereich.innerHTML =
      "<div class='auth-profil'>" +
        "<div class='auth-profil-icon'>👤</div>" +
        "<div>" +
          "<div class='auth-profil-email'>" + aktuellerUser.email + "</div>" +
          "<div class='auth-profil-status'>☁️ Cloud-Sync aktiv</div>" +
        "</div>" +
      "</div>" +
      "<button class='auth-btn-primary' onclick='cloudSpeichern(); zeigeNotification(\"☁️ Gespeichert!\",\"green\")'>" +
        "☁️ Jetzt synchronisieren" +
      "</button>" +
      "<button class='auth-btn-sekundaer' onclick='authAusloggen()'>" +
        "Ausloggen" +
      "</button>";
  } else {
    bereich.innerHTML =
      "<p class='auth-hinweis'>Spielstand zwischen PC und Handy synchronisieren.</p>" +
      "<input type='email' id='auth-email' placeholder='E-Mail' class='auth-input' />" +
      "<input type='password' id='auth-pw' placeholder='Passwort (mind. 6 Zeichen)' class='auth-input' />" +
      "<div id='auth-info' style='min-height:16px;font-size:12px;text-align:center;padding:2px 0'></div>" +
      "<button class='auth-btn-primary' onclick='authEinloggen()'>Einloggen</button>" +
      "<button class='auth-btn-sekundaer' onclick='authRegistrieren()'>Neu registrieren</button>" +
      "<div class='auth-trenner'><span>oder</span></div>" +
      "<button class='auth-btn-google' onclick='authGoogle()'>🔑 Mit Google einloggen</button>";
  }
}
 
function cloudBadgeAktualisieren() {
  let badge = document.getElementById("cloud-badge");
  if (!badge) return;
  badge.textContent = aktuellerUser ? "☁️✅" : "☁️";
  badge.style.color = aktuellerUser ? "var(--green)" : "var(--text3)";
  badge.title = aktuellerUser
    ? "Eingeloggt: " + aktuellerUser.email
    : "Cloud-Sync — Einloggen";
}
 