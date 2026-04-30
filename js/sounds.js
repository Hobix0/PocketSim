// ── Web Audio API Sounds ──
// Keine Audiodateien nötig — alles wird synthetisiert

let audioContext = null;
let soundsAktiv = true;

// AudioContext erst beim ersten Klick erstellen (Browser-Anforderung)
function audioInit() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
}

// Basis-Ton erzeugen
function tonSpielen(frequenz, dauer, typ, lautstaerke) {
  if (!soundsAktiv) return;
  audioInit();

  let oszillator = audioContext.createOscillator();
  let gainNode = audioContext.createGain();

  oszillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oszillator.type = typ || "sine";
  oszillator.frequency.setValueAtTime(frequenz, audioContext.currentTime);

  gainNode.gain.setValueAtTime(lautstaerke || 0.1, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + dauer);

  oszillator.start(audioContext.currentTime);
  oszillator.stop(audioContext.currentTime + dauer);
}

// ── Spiel-Sounds ──

function soundKaufen() {
  // Zwei aufsteigende Töne
  tonSpielen(440, 0.1, "sine", 0.08);
  setTimeout(function() { tonSpielen(660, 0.15, "sine", 0.08); }, 100);
}

function soundVerkaufen() {
  // Münzen-Sound
  
  tonSpielen(880, 0.05, "sine", 0.06);
  setTimeout(function() { tonSpielen(1100, 0.05, "sine", 0.06); }, 60);
  setTimeout(function() { tonSpielen(1320, 0.1,  "sine", 0.06); }, 120);
}

function soundProduzieren() {
  // Maschinen-Sound
  tonSpielen(220, 0.1, "square", 0.04);
  setTimeout(function() { tonSpielen(180, 0.1, "square", 0.04); }, 100);
}

function soundForschungStart() {
  // Labor-Sound
  tonSpielen(330, 0.2, "sine", 0.06);
  setTimeout(function() { tonSpielen(440, 0.2, "sine", 0.06); }, 200);
  setTimeout(function() { tonSpielen(550, 0.3, "sine", 0.06); }, 400);
}

function soundForschungFertig() {
  // Erfolgs-Sound
  tonSpielen(440, 0.1, "sine", 0.08);
  setTimeout(function() { tonSpielen(550, 0.1, "sine", 0.08); }, 100);
  setTimeout(function() { tonSpielen(660, 0.1, "sine", 0.08); }, 200);
  setTimeout(function() { tonSpielen(880, 0.3, "sine", 0.1);  }, 300);
}

function soundFehler() {
  // Fehler-Sound
  tonSpielen(200, 0.2, "square", 0.05);
  setTimeout(function() { tonSpielen(150, 0.3, "square", 0.05); }, 200);
}

function soundsToggle() {
  soundsAktiv = !soundsAktiv;
  debugAnzeigenAktualisieren();
}