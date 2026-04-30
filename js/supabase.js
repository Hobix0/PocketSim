// ══════════════════════════════════
// SUPABASE — Cloud Sync
// Spielstand zwischen Geräten synchronisieren
// ══════════════════════════════════

// !! DEINE SUPABASE DATEN HIER EINTRAGEN !!
const SUPABASE_URL  = "https://supabase.com/dashboard/project/buythdkjxqxnxhhmqijp";
const SUPABASE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1eXRoZGtqeHF4bnhoaG1xaWpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NDM4NDEsImV4cCI6MjA5MzExOTg0MX0.KdSc6aT-Yt3VupZGpgmXPA7lqCSee6JVZ93oaKYpK-o";

// Supabase Client initialisieren
let supabaseClient = null;
let aktuellerUser  = null;
let syncAktiv      = false;

async function supabaseInit() {
  try {
    // Supabase über CDN laden
    const { createClient } = await import(
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
    );
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Aktuellen User prüfen
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      aktuellerUser = session.user;
      console.log("[Supabase] Eingeloggt als:", aktuellerUser.email);
      syncAktiv = true;
      loginStatusAktualisieren();
    }

    // Auth-Änderungen beobachten (Login/Logout)
    supabaseClient.auth.onAuthStateChange(function(event, session) {
      if (event === "SIGNED_IN") {
        aktuellerUser = session.user;
        syncAktiv     = true;
        loginStatusAktualisieren();
        cloudSpielstandLaden();
        zeigeNotification("☁️ Eingeloggt! Spielstand wird geladen...", "green");
      }
      if (event === "SIGNED_OUT") {
        aktuellerUser = null;
        syncAktiv     = false;
        loginStatusAktualisieren();
        zeigeNotification("👋 Ausgeloggt", "red");
      }
    });

  } catch(err) {
    console.warn("[Supabase] Initialisierung fehlgeschlagen:", err);
    syncAktiv = false;
  }
}

// ══════════════════════════════════
// AUTH — Login / Logout
// ══════════════════════════════════

async function mitEmailRegistrieren(email, passwort) {
  if (!supabaseClient) return;
  let { error } = await supabaseClient.auth.signUp({
    email:    email,
    password: passwort
  });
  if (error) {
    zeigeNotification("❌ " + error.message, "red");
  } else {
    zeigeNotification("✅ Bestätigungsmail gesendet! E-Mail prüfen.", "green");
  }
}

async function mitEmailEinloggen(email, passwort) {
  if (!supabaseClient) return;
  let { error } = await supabaseClient.auth.signInWithPassword({
    email:    email,
    password: passwort
  });
  if (error) {
    zeigeNotification("❌ " + error.message, "red");
  }
}

async function mitGoogleEinloggen() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.href
    }
  });
}

async function ausloggen() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
}

// ══════════════════════════════════
// CLOUD SYNC — Speichern & Laden
// ══════════════════════════════════

async function cloudSpielstandSpeichern(slot) {
  if (!syncAktiv || !aktuellerUser || !supabaseClient) return;

  slot = slot || 1;

  let daten = spielstandDatenErstellen(); // aus state.js

  let { error } = await supabaseClient
    .from("spielstaende")
    .upsert({
      user_id:          aktuellerUser.id,
      slot:             slot,
      daten:            daten,
      aktualisiert_am:  new Date().toISOString()
    }, {
      onConflict: "user_id,slot"
    });

  if (error) {
    console.error("[Supabase] Speichern fehlgeschlagen:", error);
  } else {
    console.log("[Supabase] Spielstand gespeichert (Slot " + slot + ")");
    cloudSyncBadgeAktualisieren(true);
  }
}

async function cloudSpielstandLaden(slot) {
  if (!syncAktiv || !aktuellerUser || !supabaseClient) return;

  slot = slot || 1;

  let { data, error } = await supabaseClient
    .from("spielstaende")
    .select("daten, aktualisiert_am")
    .eq("user_id", aktuellerUser.id)
    .eq("slot", slot)
    .single();

  if (error || !data) {
    console.log("[Supabase] Kein Cloud-Spielstand gefunden — starte neu");
    return;
  }

  // Cloud vs. lokal vergleichen — neuerer Stand gewinnt
  let cloudZeit = new Date(data.aktualisiert_am).getTime();
  let lokalZeit = parseInt(localStorage.getItem("pocketsim_timestamp") || "0");

  if (cloudZeit > lokalZeit) {
    console.log("[Supabase] Cloud-Stand ist neuer — lade Cloud");
    spielstandLadenAusStand(data.daten);
    zeigeNotification("☁️ Spielstand aus Cloud geladen!", "green");
  } else {
    console.log("[Supabase] Lokaler Stand ist neuer — behalte lokal");
  }

  cloudSyncBadgeAktualisieren(true);
}

// ── Alle Spielstände eines Users abrufen ──
async function cloudAlleSpielstaendeLaden() {
  if (!syncAktiv || !aktuellerUser || !supabaseClient) return [];

  let { data, error } = await supabaseClient
    .from("spielstaende")
    .select("slot, daten, aktualisiert_am")
    .eq("user_id", aktuellerUser.id)
    .order("slot");

  if (error) return [];
  return data || [];
}

// ══════════════════════════════════
// UI — Login Modal & Status
// ══════════════════════════════════

function loginModalOeffnen() {
  let modal = document.getElementById("modal-login");
  if (modal) modal.style.display = "flex";
  loginStatusAktualisieren();
}

function loginModalSchliessen() {
  let modal = document.getElementById("modal-login");
  if (modal) modal.style.display = "none";
}

function loginStatusAktualisieren() {
  let bereich = document.getElementById("login-status-bereich");
  if (!bereich) return;

  if (aktuellerUser) {
    bereich.innerHTML =
      "<div class='login-eingeloggt'>" +
        "<div class='login-avatar'>👤</div>" +
        "<div class='login-info'>" +
          "<div class='login-email'>" + aktuellerUser.email + "</div>" +
          "<div class='login-sub'>☁️ Cloud-Sync aktiv</div>" +
        "</div>" +
        "<button class='login-logout-btn' onclick='ausloggen()'>Ausloggen</button>" +
      "</div>" +
      "<button class='login-sync-btn' onclick='cloudSpielstandSpeichern(1)'>" +
        "☁️ Jetzt synchronisieren" +
      "</button>";
  } else {
    bereich.innerHTML =
      "<div class='login-form'>" +
        "<input type='email' id='login-email' placeholder='E-Mail' />" +
        "<input type='password' id='login-pw' placeholder='Passwort' />" +
        "<button class='login-btn-primary' onclick='loginFormAbsenden()'>Einloggen</button>" +
        "<button class='login-btn-secondary' onclick='registrierenFormAbsenden()'>Neu registrieren</button>" +
        "<div class='login-trenner'><span>oder</span></div>" +
        "<button class='login-btn-google' onclick='mitGoogleEinloggen()'>🔑 Mit Google einloggen</button>" +
      "</div>" +
      "<p class='login-hinweis'>☁️ Dein Spielstand wird zwischen PC und Handy synchronisiert.</p>";
  }
}

function loginFormAbsenden() {
  let email  = document.getElementById("login-email").value.trim();
  let pw     = document.getElementById("login-pw").value;
  if (!email || !pw) {
    zeigeNotification("❌ E-Mail und Passwort eingeben", "red");
    return;
  }
  mitEmailEinloggen(email, pw);
}

function registrierenFormAbsenden() {
  let email = document.getElementById("login-email").value.trim();
  let pw    = document.getElementById("login-pw").value;
  if (!email || !pw) {
    zeigeNotification("❌ E-Mail und Passwort eingeben", "red");
    return;
  }
  if (pw.length < 6) {
    zeigeNotification("❌ Passwort muss mind. 6 Zeichen haben", "red");
    return;
  }
  mitEmailRegistrieren(email, pw);
}

// ── Cloud-Sync Badge im Header ──
function cloudSyncBadgeAktualisieren(ok) {
  let badge = document.getElementById("cloud-sync-badge");
  if (!badge) return;

  if (!aktuellerUser) {
    badge.textContent = "☁️";
    badge.title       = "Cloud-Sync: Nicht eingeloggt";
    badge.style.color = "var(--text3)";
  } else if (ok) {
    badge.textContent = "☁️✅";
    badge.title       = "Cloud-Sync: Synchronisiert";
    badge.style.color = "var(--green)";
  } else {
    badge.textContent = "☁️⏳";
    badge.title       = "Cloud-Sync: Speichert...";
    badge.style.color = "var(--accent)";
  }
}
