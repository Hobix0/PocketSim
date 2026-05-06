// ══════════════════════════════════════════════════════
// FABRIKKARTE — 2D Top-Down Factory Visualization
// Canvas-basiert, Pan + Zoom, Maschinen platzieren
// ══════════════════════════════════════════════════════

const FK = {
  // ── State ──
  canvas:    null,
  ctx:       null,
  gebaeude:  null,   // aktuelles Gebäude-Objekt
  gsId:      null,   // Grundstück-ID

  TILE:      48,     // Basis-Pixelgröße pro Tile
  zoom:      1.0,
  panX:      0,
  panY:      0,
  MIN_ZOOM:  0.4,
  MAX_ZOOM:  2.5,

  drag:      { aktiv:false, startX:0, startY:0, panX0:0, panY0:0 },
  pinch:     { aktiv:false, dist0:0, zoom0:0 },

  ausgewählt: null,  // { maschinenIdx, md, m }
  platzierModus: false,
  platzierMaschine: null,  // MD die platziert werden soll
  geisterPos: null,  // { tx, ty } Vorschau beim Platzieren

  animFrame: null,
  animZeit:  0,

  // ── Maschinen-Visual-Config ──
  VISUALS: {
    schmelzofen:     { farbe:"#C44E2A", farbe2:"#8B3520", icon:"🔥", glow:"#ff6b35" },
    steinbrecher:    { farbe:"#6B6B6B", farbe2:"#444444", icon:"⛏️", glow:"#aaa" },
    oelraffinerie:   { farbe:"#4A3520", farbe2:"#2C2010", icon:"🛢️", glow:"#8B6914" },
    formerei:        { farbe:"#1A4A8A", farbe2:"#0D2D5A", icon:"⚙️", glow:"#4488ff" },
    kabelwerk:       { farbe:"#4A1A8A", farbe2:"#2D0D5A", icon:"🔌", glow:"#9944ff" },
    motorenfabrik:   { farbe:"#8A4A1A", farbe2:"#5A2D0D", icon:"🔧", glow:"#ff9944" },
    betonwerk:       { farbe:"#5A5A5A", farbe2:"#3A3A3A", icon:"🧱", glow:"#888" },
    kraftwerk_kohle: { farbe:"#2A2A2A", farbe2:"#111111", icon:"⚡", glow:"#ffee00" },
    labor:           { farbe:"#1A6A3A", farbe2:"#0D3A20", icon:"🔬", glow:"#44ff88" },
    lagerhalle:      { farbe:"#3A5A2A", farbe2:"#1F3215", icon:"📦", glow:"#88cc44" },
    elektronikfabrik:{ farbe:"#1A3A8A", farbe2:"#0D1F5A", icon:"💾", glow:"#4466ff" },
    titanschmiede:   { farbe:"#2A4A6A", farbe2:"#152535", icon:"🔷", glow:"#44aaff" },
    carbonfaserwerk: { farbe:"#1A1A1A", farbe2:"#0D0D0D", icon:"🖤", glow:"#666" },
    montagewerk_2:   { farbe:"#6A3A1A", farbe2:"#3A1F0D", icon:"🏗️", glow:"#cc7733" },
    kernkraftwerk:   { farbe:"#2A5A2A", farbe2:"#152F15", icon:"⚛️", glow:"#00ff88" },
    _default:        { farbe:"#2A3A4A", farbe2:"#151F25", icon:"⚙️", glow:"#4488aa" }
  },

  // ══════════════════════════════
  // INIT
  // ══════════════════════════════

  init(canvasEl, gebaeude, gsId) {
    this.canvas   = canvasEl;
    this.ctx      = canvasEl.getContext("2d");
    this.gebaeude = gebaeude;
    this.gsId     = gsId;
    this.zoom     = 1.0;

    // Karte zentrieren
    this.panX = (this.canvas.width  - gebaeude.tileBreite * this.TILE) / 2;
    this.panY = (this.canvas.height - gebaeude.tileHoehe  * this.TILE) / 2;

    this.setupEvents();
    this.startLoop();
  },

  destroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.canvas = null;
    this.ctx    = null;
  },

  // ══════════════════════════════
  // RENDER LOOP
  // ══════════════════════════════

  startLoop() {
    const self = this;
    function loop(t) {
      self.animZeit = t;
      self.zeichne();
      self.animFrame = requestAnimationFrame(loop);
    }
    this.animFrame = requestAnimationFrame(loop);
  },

  zeichne() {
    if (!this.canvas || !this.ctx) return;
    const c = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const T = this.TILE * this.zoom;

    c.clearRect(0, 0, W, H);

    // ── Hintergrund ──
    c.fillStyle = "#0b0d10";
    c.fillRect(0, 0, W, H);

    // ── Fabrikboden ──
    const geb = this.gebaeude;
    const bW   = geb.tileBreite * T;
    const bH   = geb.tileHoehe  * T;
    const offX = this.panX;
    const offY = this.panY;

    // Boden-Hintergrund
    c.fillStyle = "#141820";
    c.fillRect(offX, offY, bW, bH);

    // Grid
    c.strokeStyle = "rgba(255,255,255,0.05)";
    c.lineWidth   = 1;
    for (let tx = 0; tx <= geb.tileBreite; tx++) {
      c.beginPath();
      c.moveTo(offX + tx*T, offY);
      c.lineTo(offX + tx*T, offY + bH);
      c.stroke();
    }
    for (let ty = 0; ty <= geb.tileHoehe; ty++) {
      c.beginPath();
      c.moveTo(offX,       offY + ty*T);
      c.lineTo(offX + bW,  offY + ty*T);
      c.stroke();
    }

    // Gebäude-Rand
    c.strokeStyle = "rgba(245,158,11,0.35)";
    c.lineWidth   = 2;
    c.strokeRect(offX, offY, bW, bH);

    // ── Maschinen ──
    const maschinen = this.getMaschinen();
    for (let i = 0; i < maschinen.length; i++) {
      let entry = maschinen[i];
      if (!entry.position) continue;  // nicht platziert
      this.zeichneMaschine(entry, i, offX, offY, T);
    }

    // ── Geister-Vorschau beim Platzieren ──
    if (this.platzierModus && this.geisterPos && this.platzierMaschine) {
      this.zeichneGeister(this.geisterPos, this.platzierMaschine, offX, offY, T);
    }

    // ── Leerer-Slots Hinweis ──
    const nichtPlatziert = maschinen.filter(m => !m.position).length;
    if (nichtPlatziert > 0) {
      c.fillStyle = "rgba(245,158,11,0.7)";
      c.font      = "bold 12px 'IBM Plex Sans', sans-serif";
      c.textAlign = "center";
      c.fillText(nichtPlatziert + " Maschine(n) noch nicht platziert →", W/2, H - 16);
    }
  },

  zeichneMaschine(entry, idx, offX, offY, T) {
    const c   = this.ctx;
    const md  = entry.md;
    const m   = entry.m;
    const pos = entry.position;
    const tw  = md.tileGroesse ? md.tileGroesse.w : 2;
    const th  = md.tileGroesse ? md.tileGroesse.h : 2;
    const vis = this.VISUALS[md.id] || this.VISUALS._default;
    const laueft = m && m.laeuft;
    const ausgewaehlt = this.ausgewählt && this.ausgewählt.maschinenIdx === idx;

    const px = offX + pos.tx * T;
    const py = offY + pos.ty * T;
    const pw = tw * T;
    const ph = th * T;
    const t  = this.animZeit / 1000;

    // ── Glow wenn läuft ──
    if (laueft) {
      let glowPuls = Math.sin(t * 2) * 0.3 + 0.7;
      c.shadowColor = vis.glow;
      c.shadowBlur  = 18 * glowPuls;
    } else {
      c.shadowBlur = 0;
    }

    // ── Maschinen-Körper ──
    const r = Math.min(8 * this.zoom, pw * 0.15);
    this.roundRect(c, px + 2, py + 2, pw - 4, ph - 4, r);
    // Gradient von oben nach unten
    const grad = c.createLinearGradient(px, py, px, py + ph);
    grad.addColorStop(0, vis.farbe);
    grad.addColorStop(1, vis.farbe2);
    c.fillStyle = grad;
    c.fill();

    // Border
    c.strokeStyle = ausgewaehlt ? "var(--amber, #f59e0b)" : (laueft ? vis.glow : "rgba(255,255,255,0.15)");
    c.lineWidth   = ausgewaehlt ? 2.5 : (laueft ? 1.5 : 1);
    c.shadowBlur  = 0;
    c.stroke();

    // ── Metall-Textur (Streifen oben) ──
    c.fillStyle = "rgba(255,255,255,0.05)";
    c.fillRect(px + 4, py + 4, pw - 8, Math.min(ph * 0.12, 10 * this.zoom));

    // ── Statusleiste (unten) ──
    let barH = Math.max(4 * this.zoom, 4);
    c.fillStyle = "rgba(0,0,0,0.4)";
    c.fillRect(px + 4, py + ph - barH - 4, pw - 8, barH);
    c.fillStyle = laueft ? vis.glow : "#444";
    // Fortschritts-Balken wenn Rezept läuft
    let fortPct = m && m.aktivesRezept && m.rundenBisAbschluss && m.rundenGesamtDauer
      ? 1 - (m.rundenBisAbschluss / m.rundenGesamtDauer)
      : (laueft ? (Math.sin(t * 0.8) * 0.5 + 0.5) : 0);
    c.fillRect(px + 4, py + ph - barH - 4, (pw - 8) * fortPct, barH);

    // ── Emoji Icon ──
    const emojiFontSize = Math.max(12, Math.min(T * 0.55, 32));
    c.font      = emojiFontSize + "px serif";
    c.textAlign = "center";
    c.shadowBlur = 0;
    c.fillText(vis.icon, px + pw/2, py + ph/2 + emojiFontSize*0.35);

    // ── Name (wenn groß genug) ──
    if (T > 30 && pw > 60 * this.zoom) {
      c.font      = "bold " + Math.max(9, 10 * this.zoom) + "px 'IBM Plex Sans', sans-serif";
      c.fillStyle = "rgba(255,255,255,0.75)";
      c.textAlign = "center";
      c.fillText(md.name, px + pw/2, py + 16 * this.zoom);
    }

    // ── Rauch-Animation (läuft) ──
    if (laueft && tw >= 3) {
      let rauchY = Math.sin(t * 1.5 + idx) * 4;
      c.font      = Math.max(10, 14 * this.zoom) + "px serif";
      c.textAlign = "center";
      c.globalAlpha = 0.5 + Math.sin(t * 3) * 0.3;
      c.fillText("💨", px + pw * 0.75, py - 8 + rauchY);
      c.globalAlpha = 1;
    }

    // ── Ausgewählt-Highlight ──
    if (ausgewaehlt) {
      c.strokeStyle = "#f59e0b";
      c.lineWidth   = 3;
      c.setLineDash([6, 4]);
      this.roundRect(c, px - 1, py - 1, pw + 2, ph + 2, r + 2);
      c.stroke();
      c.setLineDash([]);
    }
  },

  zeichneGeister(pos, md, offX, offY, T) {
    const c  = this.ctx;
    const tw = md.tileGroesse ? md.tileGroesse.w : 2;
    const th = md.tileGroesse ? md.tileGroesse.h : 2;
    const px = offX + pos.tx * T;
    const py = offY + pos.ty * T;
    const pw = tw * T;
    const ph = th * T;

    const kollision = this.hatKollision(pos.tx, pos.ty, tw, th, null);
    c.globalAlpha = 0.6;
    c.fillStyle   = kollision ? "rgba(255,50,50,0.3)" : "rgba(245,158,11,0.2)";
    this.roundRect(c, px+2, py+2, pw-4, ph-4, 6);
    c.fill();
    c.strokeStyle = kollision ? "#ff3333" : "#f59e0b";
    c.lineWidth   = 2;
    c.setLineDash([6,4]);
    c.stroke();
    c.setLineDash([]);
    c.globalAlpha = 1;
  },

  // ══════════════════════════════
  // EVENTS
  // ══════════════════════════════

  setupEvents() {
    const c  = this.canvas;
    const s  = this;

    // Mouse
    c.addEventListener("mousedown",  e => s.onPointerDown(e.clientX, e.clientY));
    c.addEventListener("mousemove",  e => s.onPointerMove(e.clientX, e.clientY));
    c.addEventListener("mouseup",    e => s.onPointerUp(e.clientX, e.clientY));
    c.addEventListener("wheel",      e => { e.preventDefault(); s.onWheel(e); }, { passive: false });
    c.addEventListener("dblclick",   e => s.onDoppelklick(e.clientX, e.clientY));

    // Touch
    c.addEventListener("touchstart", e => { e.preventDefault(); s.onTouchStart(e); }, { passive: false });
    c.addEventListener("touchmove",  e => { e.preventDefault(); s.onTouchMove(e); },  { passive: false });
    c.addEventListener("touchend",   e => { e.preventDefault(); s.onTouchEnd(e); },   { passive: false });
  },

  onPointerDown(cx, cy) {
    const rect  = this.canvas.getBoundingClientRect();
    const x     = cx - rect.left;
    const y     = cy - rect.top;
    this.drag   = { aktiv:true, startX:x, startY:y, panX0:this.panX, panY0:this.panY, moved:false };

    if (this.platzierModus) {
      this.platzierHier(x, y);
      return;
    }
  },

  onPointerMove(cx, cy) {
    const rect = this.canvas.getBoundingClientRect();
    const x    = cx - rect.left;
    const y    = cy - rect.top;

    if (this.platzierModus) {
      let pos = this.screenZuTile(x, y);
      this.geisterPos = pos;
      return;
    }

    if (this.drag.aktiv) {
      let dx = x - this.drag.startX;
      let dy = y - this.drag.startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.drag.moved = true;
      this.panX = this.drag.panX0 + dx;
      this.panY = this.drag.panY0 + dy;
    }
  },

  onPointerUp(cx, cy) {
    const rect = this.canvas.getBoundingClientRect();
    const x    = cx - rect.left;
    const y    = cy - rect.top;

    if (!this.drag.moved && !this.platzierModus) {
      this.klick(x, y);
    }
    this.drag.aktiv = false;
  },

  onWheel(e) {
    const rect   = this.canvas.getBoundingClientRect();
    const mx     = e.clientX - rect.left;
    const my     = e.clientY - rect.top;
    const faktor = e.deltaY < 0 ? 1.12 : 0.88;
    this.zoomAuf(faktor, mx, my);
  },

  onDoppelklick(cx, cy) {
    const rect = this.canvas.getBoundingClientRect();
    const x    = cx - rect.left;
    const y    = cy - rect.top;
    this.maschinenDetailToggle(x, y);
  },

  onTouchStart(e) {
    if (e.touches.length === 1) {
      let t = e.touches[0];
      let rect = this.canvas.getBoundingClientRect();
      this.onPointerDown(t.clientX, t.clientY);
    } else if (e.touches.length === 2) {
      this.drag.aktiv = false;
      let d = this.touchDist(e.touches);
      this.pinch = { aktiv:true, dist0:d, zoom0:this.zoom };
    }
  },

  onTouchMove(e) {
    if (e.touches.length === 1 && !this.pinch.aktiv) {
      this.onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2 && this.pinch.aktiv) {
      let d = this.touchDist(e.touches);
      let newZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, this.pinch.zoom0 * (d / this.pinch.dist0)));
      let mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - this.canvas.getBoundingClientRect().left;
      let my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - this.canvas.getBoundingClientRect().top;
      this.zoom = newZoom;
    }
  },

  onTouchEnd(e) {
    if (e.touches.length < 2) this.pinch.aktiv = false;
    if (e.touches.length === 0) this.onPointerUp(
      e.changedTouches[0].clientX,
      e.changedTouches[0].clientY
    );
  },

  touchDist(touches) {
    let dx = touches[0].clientX - touches[1].clientX;
    let dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx*dx + dy*dy);
  },

  zoomAuf(faktor, mx, my) {
    let neuesZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, this.zoom * faktor));
    let ratioX    = (mx - this.panX) / this.zoom;
    let ratioY    = (my - this.panY) / this.zoom;
    this.zoom     = neuesZoom;
    this.panX     = mx - ratioX * this.zoom;
    this.panY     = my - ratioY * this.zoom;
  },

  klick(x, y) {
    let pos  = this.screenZuTile(x, y);
    let mas  = this.getMaschinen();
    let T    = this.TILE * this.zoom;
    let offX = this.panX;
    let offY = this.panY;

    for (let i = 0; i < mas.length; i++) {
      let entry = mas[i];
      if (!entry.position) continue;
      let tw = entry.md.tileGroesse ? entry.md.tileGroesse.w : 2;
      let th = entry.md.tileGroesse ? entry.md.tileGroesse.h : 2;
      if (pos.tx >= entry.position.tx && pos.tx < entry.position.tx + tw &&
          pos.ty >= entry.position.ty && pos.ty < entry.position.ty + th) {
        if (this.ausgewählt && this.ausgewählt.maschinenIdx === i) {
          this.ausgewählt = null;
          fabrikkarteInfoAusblenden();
        } else {
          this.ausgewählt = { maschinenIdx:i, md:entry.md, m:entry.m };
          fabrikkarteInfoZeigen(entry.md, entry.m, i);
        }
        return;
      }
    }
    this.ausgewählt = null;
    fabrikkarteInfoAusblenden();
  },

  maschinenDetailToggle(x, y) {
    if (this.ausgewählt) {
      fabrikkarteDetailZeigen(this.ausgewählt.md, this.ausgewählt.m);
    }
  },

  // ══════════════════════════════
  // PLATZIER-MODUS
  // ══════════════════════════════

  platzierModusStarten(md) {
    this.platzierModus    = true;
    this.platzierMaschine = md;
    this.geisterPos       = null;
    this.canvas.style.cursor = "crosshair";
    fabrikkarteInfoAusblenden();
  },

  platzierModusBeenden() {
    this.platzierModus    = false;
    this.platzierMaschine = null;
    this.geisterPos       = null;
    this.canvas.style.cursor = "default";
  },

  platzierHier(x, y) {
    let pos = this.screenZuTile(x, y);
    let md  = this.platzierMaschine;
    if (!md) return;
    let tw  = md.tileGroesse ? md.tileGroesse.w : 2;
    let th  = md.tileGroesse ? md.tileGroesse.h : 2;

    // Bounds prüfen
    if (pos.tx < 0 || pos.ty < 0 ||
        pos.tx + tw > this.gebaeude.tileBreite ||
        pos.ty + th > this.gebaeude.tileHoehe) {
      zeigeNotification("❌ Außerhalb der Fabrik!", "red");
      return;
    }
    if (this.hatKollision(pos.tx, pos.ty, tw, th, null)) {
      zeigeNotification("❌ Platz ist belegt!", "red");
      return;
    }

    // Maschinen-Position speichern
    fabrikkartePositionSpeichern(pos.tx, pos.ty, md.id);
    this.platzierModusBeenden();
    zeigeNotification("✅ " + md.name + " platziert!", "green");
  },

  hatKollision(tx, ty, tw, th, ausnahmeIdx) {
    let mas = this.getMaschinen();
    for (let i = 0; i < mas.length; i++) {
      if (i === ausnahmeIdx || !mas[i].position) continue;
      let p   = mas[i].position;
      let w2  = mas[i].md.tileGroesse ? mas[i].md.tileGroesse.w : 2;
      let h2  = mas[i].md.tileGroesse ? mas[i].md.tileGroesse.h : 2;
      if (tx < p.tx + w2 && tx + tw > p.tx &&
          ty < p.ty + h2 && ty + th > p.ty) return true;
    }
    return false;
  },

  // ══════════════════════════════
  // KOORDINATEN
  // ══════════════════════════════

  screenZuTile(sx, sy) {
    let T  = this.TILE * this.zoom;
    let tx = Math.floor((sx - this.panX) / T);
    let ty = Math.floor((sy - this.panY) / T);
    return { tx, ty };
  },

  // ══════════════════════════════
  // DATEN
  // ══════════════════════════════

  getMaschinen() {
    if (typeof MASCHINEN === "undefined" || !this.gebaeude || !this.gsId) return [];
    return installierte_maschinen
      .filter(m => {
        let md = MASCHINEN.find(d => d.id === m.id);
        if (!md) return false;
        let hallenOk = !md.hallenTyp || md.hallenTyp.includes(this.gebaeude.hallenTyp);
        // Nur Maschinen die auf diesem Grundstück + Gebäude installiert sind
        return hallenOk;
      })
      .map(m => {
        let md = MASCHINEN.find(d => d.id === m.id);
        // Position aus m.fabrikPos[gebaeudeId] laden
        let gebaeudeId = this.gebaeude.id;
        let pos = m.fabrikPos && m.fabrikPos[gebaeudeId] ? m.fabrikPos[gebaeudeId] : null;
        return { md, m, position: pos };
      });
  },

  // ══════════════════════════════
  // HILFSFUNKTIONEN
  // ══════════════════════════════

  roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y,     x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x,     y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x,     y,     x + r, y);
    c.closePath();
  },

  zentrieren() {
    if (!this.gebaeude) return;
    this.zoom = Math.min(
      this.canvas.width  / (this.gebaeude.tileBreite * this.TILE) * 0.9,
      this.canvas.height / (this.gebaeude.tileHoehe  * this.TILE) * 0.9
    );
    this.panX = (this.canvas.width  - this.gebaeude.tileBreite * this.TILE * this.zoom) / 2;
    this.panY = (this.canvas.height - this.gebaeude.tileHoehe  * this.TILE * this.zoom) / 2;
  }
};

// ══════════════════════════════════════════════════════
// UI — Info-Panel + Steuerung
// ══════════════════════════════════════════════════════

function fabrikkarteOeffnen(gebaeudeId, gsId) {
  let geb = GEBAEUDE ? GEBAEUDE.find(g => g.id === gebaeudeId) : null;
  if (!geb) return;

  let modal = document.getElementById("modal-fabrikkarte");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "modal-fabrikkarte";
    document.body.appendChild(modal);
  }

  modal.innerHTML =
    "<div class='fk-wrapper'>" +
      "<div class='fk-header'>" +
        "<div class='fk-header-left'>" +
          "<span class='fk-geb-emoji'>" + (geb.emoji||"🏭") + "</span>" +
          "<div>" +
            "<div class='fk-geb-name'>" + geb.name + "</div>" +
            "<div class='fk-geb-sub'>" + geb.tileBreite + "×" + geb.tileHoehe + " Tiles · " + (geb.maxMaschinen||0) + " Maschinen max</div>" +
          "</div>" +
        "</div>" +
        "<div class='fk-header-right'>" +
          "<button class='fk-btn-icon' onclick='FK.zentrieren()' title='Zentrieren'>⌖</button>" +
          "<button class='fk-btn-icon' onclick='FK.zoom=Math.min(FK.MAX_ZOOM,FK.zoom*1.2)' title='Zoom+'>+</button>" +
          "<button class='fk-btn-icon' onclick='FK.zoom=Math.max(FK.MIN_ZOOM,FK.zoom*0.8)' title='Zoom−'>−</button>" +
          "<button class='fk-btn-close' onclick='fabrikkarteSchliessen()'>✕</button>" +
        "</div>" +
      "</div>" +
      "<div class='fk-body'>" +
        "<canvas id='fk-canvas' class='fk-canvas'></canvas>" +
        "<div id='fk-sidebar' class='fk-sidebar'>" +
          "<div class='fk-sidebar-titel'>Maschinen</div>" +
          "<div id='fk-maschinenlist'></div>" +
          "<div id='fk-info-panel' class='fk-info-panel' style='display:none'></div>" +
        "</div>" +
      "</div>" +
    "</div>";

  modal.style.display = "flex";

  // Canvas-Größe
  setTimeout(function() {
    let canvas = document.getElementById("fk-canvas");
    let body   = canvas.parentElement;
    canvas.width  = body.clientWidth - 220;
    canvas.height = body.clientHeight;

    FK.init(canvas, geb, gsId);
    FK.zentrieren();
    fabrikarteListeRendern(geb, gsId);
  }, 30);
}

function fabrikkarteSchliessen() {
  FK.destroy();
  let modal = document.getElementById("modal-fabrikkarte");
  if (modal) modal.style.display = "none";
}

function fabrikarteListeRendern(geb, gsId) {
  let liste = document.getElementById("fk-maschinenlist");
  if (!liste) return;

  let mas = FK.getMaschinen();
  let nichtPlatz = mas.filter(m => !m.position);
  let platziert  = mas.filter(m => m.position);

  let html = "";

  if (nichtPlatz.length > 0) {
    html += "<div class='fk-list-label'>Nicht platziert</div>";
    for (let entry of nichtPlatz) {
      let vis = FK.VISUALS[entry.md.id] || FK.VISUALS._default;
      html +=
        "<div class='fk-mas-item fk-mas-unplaced' onclick='fabrikarteStartPlatzieren(\"" + entry.md.id + "\")'>" +
          "<span class='fk-mas-icon'>" + vis.icon + "</span>" +
          "<div class='fk-mas-info'>" +
            "<span class='fk-mas-name'>" + entry.md.name + "</span>" +
            "<span class='fk-mas-sub'>" + entry.md.tileGroesse.w + "×" + entry.md.tileGroesse.h + " Tiles</span>" +
          "</div>" +
          "<span class='fk-mas-aktion'>Platzieren →</span>" +
        "</div>";
    }
  }

  if (platziert.length > 0) {
    html += "<div class='fk-list-label'>Platziert</div>";
    for (let entry of platziert) {
      let vis    = FK.VISUALS[entry.md.id] || FK.VISUALS._default;
      let status = entry.m && entry.m.laeuft ? "🟢" : "🔴";
      html +=
        "<div class='fk-mas-item' onclick='fabrikarteKlick(\"" + entry.md.id + "\")'>" +
          "<span class='fk-mas-icon'>" + vis.icon + "</span>" +
          "<div class='fk-mas-info'>" +
            "<span class='fk-mas-name'>" + entry.md.name + "</span>" +
            "<span class='fk-mas-sub'>" + status + " " + (entry.m && entry.m.aktivesRezept ? entry.m.aktivesRezept : "kein Rezept") + "</span>" +
          "</div>" +
        "</div>";
    }
  }

  if (mas.length === 0) {
    html = "<div class='fk-leer-hint'>Keine Maschinen in dieser Halle. Kaufe Maschinen im Shop.</div>";
  }

  liste.innerHTML = html;
}

function fabrikarteStartPlatzieren(masId) {
  let md = MASCHINEN ? MASCHINEN.find(m => m.id === masId) : null;
  if (!md) return;
  FK.platzierModusStarten(md);

  let info = document.getElementById("fk-info-panel");
  if (info) {
    info.style.display = "block";
    info.innerHTML =
      "<div class='fk-platzier-hinweis'>" +
        "<div class='fk-ph-icon'>" + (FK.VISUALS[masId]||FK.VISUALS._default).icon + "</div>" +
        "<div>" +
          "<div class='fk-ph-name'>" + md.name + " platzieren</div>" +
          "<div class='fk-ph-text'>Klicke auf einen freien Bereich in der Fabrik um die Maschine dort zu platzieren.</div>" +
        "</div>" +
        "<button onclick='FK.platzierModusBeenden();this.closest(\".fk-info-panel\").style.display=\"none\"' class='fk-btn-abbr'>Abbrechen</button>" +
      "</div>";
  }
}

function fabrikkartePositionSpeichern(tx, ty, masId) {
  // Position in installierte_maschinen speichern
  for (let m of installierte_maschinen) {
    if (m.id === masId && !m.fabrikPos) {
      m.fabrikPos = {};
    }
    if (m.id === masId) {
      m.fabrikPos = m.fabrikPos || {};
      m.fabrikPos[FK.gebaeude.id] = { tx, ty };
      break;
    }
  }
  spielstandSpeichern();
  fabrikarteListeRendern(FK.gebaeude, FK.gsId);

  // Info-Panel schließen
  let info = document.getElementById("fk-info-panel");
  if (info) info.style.display = "none";
}

function fabrikkarteInfoZeigen(md, m, idx) {
  let info = document.getElementById("fk-info-panel");
  if (!info) return;
  let vis = FK.VISUALS[md.id] || FK.VISUALS._default;
  let laueft = m && m.laeuft;
  let rez = m && m.aktivesRezept && typeof REZEPTE !== "undefined"
    ? REZEPTE.find(r => r.id === m.aktivesRezept) : null;

  info.style.display = "block";
  info.innerHTML =
    "<div class='fk-info-header'>" +
      "<span style='font-size:24px'>" + vis.icon + "</span>" +
      "<div>" +
        "<div class='fk-info-name'>" + md.name + "</div>" +
        "<div class='fk-info-status' style='color:" + (laueft ? "var(--green)" : "var(--red)") + "'>" +
          (laueft ? "● Läuft" : "● Gestoppt") +
        "</div>" +
      "</div>" +
    "</div>" +
    (rez ? "<div class='fk-info-rezept'>📋 " + rez.name + "</div>" : "") +
    "<div class='fk-info-btns'>" +
      "<button onclick='fabrikMaschineToggle(" + idx + ")' class='fk-btn-primary'>" +
        (laueft ? "⏸ Stoppen" : "▶ Starten") +
      "</button>" +
      "<button onclick='fabrikMaschineVerschieben(" + idx + ")' class='fk-btn-sec'>↔ Verschieben</button>" +
    "</div>";
}

function fabrikkarteInfoAusblenden() {
  let info = document.getElementById("fk-info-panel");
  if (info) info.style.display = "none";
}

function fabrikkarteDetailZeigen(md, m) {
  // Öffnet das normale Maschinendetail-Modal
  if (typeof verwaltenOeffnen === "function") verwaltenOeffnen("maschine", md.id);
}

function fabrikMaschineToggle(idx) {
  let mas = FK.getMaschinen();
  if (!mas[idx]) return;
  let m = mas[idx].m;
  if (m.laeuft) {
    if (typeof maschineStoppen === "function") maschineStoppen(m);
  } else {
    if (typeof maschineStarten === "function") maschineStarten(m);
  }
  setTimeout(() => fabrikkarteInfoZeigen(mas[idx].md, mas[idx].m, idx), 100);
}

function fabrikMaschineVerschieben(idx) {
  let mas = FK.getMaschinen();
  if (!mas[idx]) return;
  // Position löschen → Platzier-Modus
  let m  = mas[idx].m;
  let gId = FK.gebaeude.id;
  if (m.fabrikPos) delete m.fabrikPos[gId];
  fabrikarteStartPlatzieren(mas[idx].md.id);
  fabrikarteListeRendern(FK.gebaeude, FK.gsId);
}

function fabrikarteKlick(masId) {
  let mas = FK.getMaschinen();
  let idx = mas.findIndex(m => m.md.id === masId);
  if (idx < 0) return;
  FK.ausgewählt = { maschinenIdx:idx, md:mas[idx].md, m:mas[idx].m };
  fabrikkarteInfoZeigen(mas[idx].md, mas[idx].m, idx);
}
