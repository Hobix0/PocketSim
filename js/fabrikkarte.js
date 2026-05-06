// ══════════════════════════════════════════════════════
// FABRIKKARTE v2 — Factory Floor mit Wareneingang
// Maschinen ankommen → platzieren → verbinden → laufen
// ══════════════════════════════════════════════════════

// ── Globale Verbindungs-Daten ──
let fabrik_verbindungen = []; // [{id, vonMasId, vonPort, nachMasId, nachPort, material}]

const FK = {
  // ── State ──
  canvas: null, ctx: null,
  gebaeude: null, gsId: null,

  TILE: 52, zoom: 1.0, panX: 0, panY: 0,
  MIN_ZOOM: 0.35, MAX_ZOOM: 2.5,

  drag: { aktiv:false, startX:0, startY:0, panX0:0, panY0:0, moved:false },
  pinch: { aktiv:false, dist0:0, zoom0:0 },

  ausgewaehlt: null,     // ausgewählte Maschine { masId, md, m }
  verbindeModus: false,  // Verbindungs-Ziehmodus
  verbindeVon: null,     // { masId, portTyp, portIdx, x, y }
  verbindeMausPos: null, // aktuelle Maus-Position beim Ziehen

  animFrame: null,
  animZeit: 0,
  partikel: [],

  // Port-Größe
  PORT_R: 7,

  // ── Farben pro Material ──
  MAT_FARBEN: {
    eisenerz: "#8B4513", eisenplatte: "#9090A0", kupfererz: "#CC6600",
    kupferplatte: "#CD7F32", stahl: "#607080", kohle: "#333333",
    sand: "#E0C080", kalkstein: "#E8E0D0", glas: "#AADDFF",
    zement: "#B0A890", rohoel: "#1A1A0A", plastik: "#FFCC00",
    gummi: "#303030", zahnrad: "#888890", kupferkabel: "#CC8833",
    stahltraeger: "#5A6878", betonplatte: "#909080",
    schaltkreis: "#00CC66", stahlrohr: "#607080",
    motor_klein: "#446688", elektronikmodul: "#3366CC",
    _default: "#556677"
  },

  // ── Visuals ──
  VISUALS: {
    schmelzofen:      {farbe:"#C44E2A",farbe2:"#8B3520",icon:"🔥",glow:"#ff6b35"},
    steinbrecher:     {farbe:"#6B6B6B",farbe2:"#444",   icon:"⛏️",glow:"#aaa"},
    oelraffinerie:    {farbe:"#4A3520",farbe2:"#2C2010",icon:"🛢️",glow:"#8B6914"},
    formerei:         {farbe:"#1A4A8A",farbe2:"#0D2D5A",icon:"⚙️",glow:"#4488ff"},
    kabelwerk:        {farbe:"#4A1A8A",farbe2:"#2D0D5A",icon:"🔌",glow:"#9944ff"},
    motorenfabrik:    {farbe:"#8A4A1A",farbe2:"#5A2D0D",icon:"🔧",glow:"#ff9944"},
    betonwerk:        {farbe:"#5A5A5A",farbe2:"#3A3A3A",icon:"🧱",glow:"#888"},
    kraftwerk_kohle:  {farbe:"#2A2A2A",farbe2:"#111",   icon:"⚡",glow:"#ffee00"},
    labor:            {farbe:"#1A6A3A",farbe2:"#0D3A20",icon:"🔬",glow:"#44ff88"},
    lagerhalle:       {farbe:"#3A5A2A",farbe2:"#1F3215",icon:"📦",glow:"#88cc44"},
    elektronikfabrik: {farbe:"#1A3A8A",farbe2:"#0D1F5A",icon:"💾",glow:"#4466ff"},
    titanschmiede:    {farbe:"#2A4A6A",farbe2:"#152535",icon:"🔷",glow:"#44aaff"},
    carbonfaserwerk:  {farbe:"#1A1A1A",farbe2:"#0D0D0D",icon:"🖤",glow:"#666"},
    montagewerk_2:    {farbe:"#6A3A1A",farbe2:"#3A1F0D",icon:"🏗️",glow:"#cc7733"},
    kernkraftwerk:    {farbe:"#2A5A2A",farbe2:"#152F15",icon:"⚛️",glow:"#00ff88"},
    _default:         {farbe:"#2A3A4A",farbe2:"#151F25",icon:"⚙️",glow:"#4488aa"}
  },

  // ══════════════════════════════
  // INIT
  // ══════════════════════════════

  init(canvasEl, gebaeude, gsId) {
    this.canvas   = canvasEl;
    this.ctx      = canvasEl.getContext("2d");
    this.gebaeude = gebaeude;
    this.gsId     = gsId;
    this.partikel = [];
    this.verbindungen = fabrik_verbindungen;
    this.zentrieren();
    this.setupEvents();
    this.startLoop();
    console.log("[FK] Init:", gebaeude.name, "Zoom:", this.zoom.toFixed(2));
  },

  destroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.canvas = null; this.ctx = null;
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
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const T = this.TILE * this.zoom, t = this.animZeit / 1000;
    const offX = this.panX, offY = this.panY;
    const geb  = this.gebaeude;

    c.clearRect(0, 0, W, H);

    // ── Außenbereich ──
    c.fillStyle = "#07090c";
    c.fillRect(0, 0, W, H);

    // ── Fabrikboden ──
    const bW = geb.tileBreite * T, bH = geb.tileHoehe * T;
    c.fillStyle = "#0f121a";
    c.fillRect(offX, offY, bW, bH);

    // Boden-Kacheln (abwechselnd leicht unterschiedlich)
    for (let tx = 0; tx < geb.tileBreite; tx++) {
      for (let ty = 0; ty < geb.tileHoehe; ty++) {
        if ((tx + ty) % 2 === 0) {
          c.fillStyle = "rgba(255,255,255,0.018)";
          c.fillRect(offX + tx*T, offY + ty*T, T, T);
        }
      }
    }

    // Grid
    c.strokeStyle = "rgba(255,255,255,0.06)";
    c.lineWidth = 1;
    for (let tx = 0; tx <= geb.tileBreite; tx++) {
      c.beginPath(); c.moveTo(offX+tx*T, offY); c.lineTo(offX+tx*T, offY+bH); c.stroke();
    }
    for (let ty = 0; ty <= geb.tileHoehe; ty++) {
      c.beginPath(); c.moveTo(offX, offY+ty*T); c.lineTo(offX+bW, offY+ty*T); c.stroke();
    }

    // Außenrand
    c.strokeStyle = "rgba(245,158,11,0.4)";
    c.lineWidth = 2;
    c.strokeRect(offX, offY, bW, bH);

    // ── Wareneingang-Zone ──
    this.zeichneWareneingang(offX, offY, T);

    // ── Verbindungen ──
    this.zeichneVerbindungen(offX, offY, T, t);

    // ── Maschinen ──
    const mas = this.getMaschinen();
    for (let i = 0; i < mas.length; i++) {
      if (mas[i].position) this.zeichneMaschine(mas[i], i, offX, offY, T, t);
    }

    // ── Verbindungs-Vorschau ──
    if (this.verbindeModus && this.verbindeVon && this.verbindeMausPos) {
      this.zeichneVerbindungsVorschau(t);
    }

    // ── Partikel ──
    this.updatePartikel(c, t);

    // ── Geister-Vorschau ──
    if (this._geistMaschine && this._geistPos) {
      this.zeichneGeister(this._geistMaschine, this._geistPos, offX, offY, T);
    }
  },

  // ── Wareneingang ──
  zeichneWareneingang(offX, offY, T) {
    const geb = this.gebaeude;
    const bH  = geb.tileHoehe * T;
    const bW  = geb.tileBreite * T;
    const c   = this.ctx;
    const wH  = Math.max(80 * this.zoom, 60); // Höhe Wareneingang-Zone

    // Wareneingang unter der Fabrik
    const wyTop = offY + bH + 10;

    c.fillStyle = "rgba(245,158,11,0.05)";
    c.fillRect(offX, wyTop, bW, wH);
    c.strokeStyle = "rgba(245,158,11,0.3)";
    c.setLineDash([8,6]);
    c.lineWidth = 1.5;
    c.strokeRect(offX, wyTop, bW, wH);
    c.setLineDash([]);

    c.fillStyle = "rgba(245,158,11,0.6)";
    c.font = "bold " + Math.max(10, 11 * this.zoom) + "px 'IBM Plex Sans',sans-serif";
    c.textAlign = "left";
    c.fillText("📦 WARENEINGANG", offX + 8, wyTop + Math.max(14, 16 * this.zoom));

    // Unplatzierte Maschinen hier anzeigen
    const mas = this.getMaschinen();
    const unplatz = mas.filter(m => !m.position);
    let wx = offX + 16;

    for (let entry of unplatz) {
      const tw = Math.max(2, entry.md.tileGroesse ? entry.md.tileGroesse.w : 2);
      const boxW = tw * Math.min(T * 0.7, 70);
      const boxH = wH - 24 * this.zoom;
      const vis  = this.VISUALS[entry.md.id] || this.VISUALS._default;

      // Box
      c.fillStyle = vis.farbe + "99";
      this.roundRect(c, wx, wyTop + 18 * this.zoom, boxW, boxH, 6);
      c.fill();
      c.strokeStyle = "rgba(245,158,11,0.5)";
      c.lineWidth = 1.5;
      c.stroke();

      // Icon + Name
      const iconSz = Math.max(14, Math.min(22 * this.zoom, 28));
      c.font      = iconSz + "px serif";
      c.textAlign = "center";
      c.fillText(vis.icon, wx + boxW/2, wyTop + 18 * this.zoom + boxH * 0.5 + iconSz * 0.3);

      if (boxH > 35) {
        c.font      = "bold " + Math.max(8, 9 * this.zoom) + "px 'IBM Plex Sans',sans-serif";
        c.fillStyle = "rgba(255,255,255,0.7)";
        c.fillText(entry.md.name.substring(0, 10), wx + boxW/2, wyTop + 18 * this.zoom + boxH - 6 * this.zoom);
      }

      entry._wZone = { x: wx, y: wyTop + 18 * this.zoom, w: boxW, h: boxH };
      wx += boxW + 8;
    }
  },

  // ── Verbindungen (Förderband/Röhren) ──
  zeichneVerbindungen(offX, offY, T, t) {
    const mas = this.getMaschinen();
    for (let v of fabrik_verbindungen) {
      const von  = mas.find(m => m.md.id === v.vonMasId);
      const nach = mas.find(m => m.md.id === v.nachMasId);
      if (!von || !von.position || !nach || !nach.position) continue;

      const p1 = this.getPortKoords(von,  v.vonPort,  v.vonPortIdx,  offX, offY, T);
      const p2 = this.getPortKoords(nach, v.nachPort, v.nachPortIdx, offX, offY, T);

      const farbe = this.MAT_FARBEN[v.material] || this.MAT_FARBEN._default;

      // Gebogene Linie (Bézier)
      const cp1x = p1.x + (p2.x - p1.x) * 0.5, cp1y = p1.y;
      const cp2x = p1.x + (p2.x - p1.x) * 0.5, cp2y = p2.y;

      // Schatten-Linie
      this.ctx.strokeStyle = "rgba(0,0,0,0.4)";
      this.ctx.lineWidth   = 5 * this.zoom;
      this.ctx.beginPath();
      this.ctx.moveTo(p1.x, p1.y + 2);
      this.ctx.bezierCurveTo(cp1x, cp1y + 2, cp2x, cp2y + 2, p2.x, p2.y + 2);
      this.ctx.stroke();

      // Rohr
      this.ctx.strokeStyle = farbe;
      this.ctx.lineWidth   = 4 * this.zoom;
      this.ctx.beginPath();
      this.ctx.moveTo(p1.x, p1.y);
      this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
      this.ctx.stroke();

      // Animierte Partikel auf der Linie (wenn Produktion läuft)
      if (von.m && von.m.laeuft) {
        const f = (t * 0.4 + v.vonPortIdx * 0.3) % 1;
        const bx = Math.pow(1-f,3)*p1.x + 3*Math.pow(1-f,2)*f*cp1x + 3*(1-f)*f*f*cp2x + Math.pow(f,3)*p2.x;
        const by = Math.pow(1-f,3)*p1.y + 3*Math.pow(1-f,2)*f*cp1y + 3*(1-f)*f*f*cp2y + Math.pow(f,3)*p2.y;
        this.ctx.fillStyle = "#fff";
        this.ctx.beginPath();
        this.ctx.arc(bx, by, 3 * this.zoom, 0, Math.PI*2);
        this.ctx.fill();
      }

      // Delete-Button
      const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
      this.ctx.fillStyle = "rgba(239,68,68,0.8)";
      this.ctx.beginPath();
      this.ctx.arc(mx, my, 7 * this.zoom, 0, Math.PI*2);
      this.ctx.fill();
      this.ctx.fillStyle = "#fff";
      this.ctx.font = "bold " + Math.max(8, 10*this.zoom) + "px sans-serif";
      this.ctx.textAlign = "center";
      this.ctx.fillText("×", mx, my + 3 * this.zoom);
      v._delBtn = { x: mx, y: my, r: 8 * this.zoom };
    }
  },

  zeichneVerbindungsVorschau(t) {
    const c  = this.ctx;
    const p1 = this.verbindeVon;
    const p2 = this.verbindeMausPos;
    c.strokeStyle = "rgba(245,158,11,0.8)";
    c.lineWidth   = 3 * this.zoom;
    c.setLineDash([8, 5]);
    c.beginPath();
    c.moveTo(p1.x, p1.y);
    const cp1x = p1.x + (p2.x - p1.x) * 0.5, cp1y = p1.y;
    const cp2x = p1.x + (p2.x - p1.x) * 0.5, cp2y = p2.y;
    c.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    c.stroke();
    c.setLineDash([]);
  },

  // ── Maschine zeichnen ──
  zeichneMaschine(entry, idx, offX, offY, T, t) {
    const c   = this.ctx;
    const md  = entry.md, m = entry.m;
    const pos = entry.position;
    const tw  = md.tileGroesse ? md.tileGroesse.w : 2;
    const th  = md.tileGroesse ? md.tileGroesse.h : 2;
    const vis = this.VISUALS[md.id] || this.VISUALS._default;
    const laueft = m && m.laeuft;
    const sel    = this.ausgewaehlt && this.ausgewaehlt.masId === md.id;
    const px = offX + pos.tx * T, py = offY + pos.ty * T;
    const pw = tw * T, ph = th * T;
    const r  = Math.min(10*this.zoom, pw*0.12);

    // Verbunden-Check
    const inputs = this.getInputMaterials(md);
    const outputs = this.getOutputMaterials(md);
    const alleVerbunden = inputs.every((mat, i) =>
      fabrik_verbindungen.some(v => v.nachMasId === md.id && v.nachPortIdx === i)
    );
    const outputVerbunden = outputs.length === 0 || fabrik_verbindungen.some(v => v.vonMasId === md.id);

    // Glow
    if (laueft) {
      c.shadowColor = vis.glow;
      c.shadowBlur  = 16 + Math.sin(t*2)*6;
    } else {
      c.shadowBlur = 0;
    }

    // Körper
    const grad = c.createLinearGradient(px, py, px, py + ph);
    grad.addColorStop(0, vis.farbe);
    grad.addColorStop(1, vis.farbe2);
    this.roundRect(c, px+2, py+2, pw-4, ph-4, r);
    c.fillStyle = grad; c.fill();
    c.strokeStyle = sel ? "#f59e0b" : (laueft ? vis.glow : "rgba(255,255,255,0.12)");
    c.lineWidth = sel ? 3 : (laueft ? 1.5 : 1);
    c.shadowBlur = 0;
    c.stroke();

    // Top-Streifen (Metall-Optik)
    c.fillStyle = "rgba(255,255,255,0.08)";
    c.fillRect(px+4, py+4, pw-8, Math.min(ph*0.1, 8*this.zoom));

    // Emoji + Name
    const esz = Math.max(14, Math.min(T*0.6, 36));
    c.font = esz + "px serif";
    c.textAlign = "center";
    c.fillText(vis.icon, px+pw/2, py+ph/2 + esz*0.35);

    if (T > 28 && pw > 55) {
      c.font      = "bold " + Math.max(8, 9*this.zoom) + "px 'IBM Plex Sans',sans-serif";
      c.fillStyle = "rgba(255,255,255,0.7)";
      c.fillText(md.name.substring(0,12), px+pw/2, py + 15*this.zoom);
    }

    // Rauch
    if (laueft && tw >= 2) {
      const rr = Math.sin(t*2.2 + idx)*5;
      c.font = Math.max(10, 12*this.zoom) + "px serif";
      c.globalAlpha = 0.4 + Math.sin(t*3)*0.25;
      c.fillText("💨", px+pw*0.7, py - 6 + rr);
      c.globalAlpha = 1;
    }

    // Status-LED
    c.fillStyle = laueft ? vis.glow : (!alleVerbunden ? "#f59e0b" : "#555");
    c.beginPath();
    c.arc(px+pw-10*this.zoom, py+10*this.zoom, 4*this.zoom, 0, Math.PI*2);
    c.fill();

    // Auswahl-Rahmen
    if (sel) {
      c.strokeStyle = "#f59e0b";
      c.lineWidth   = 2.5;
      c.setLineDash([6,4]);
      this.roundRect(c, px-2, py-2, pw+4, ph+4, r+2);
      c.stroke();
      c.setLineDash([]);
    }

    // Verbindungs-Ports zeichnen (Im- und Exports)
    this.zeichnePorts(md, m, px, py, pw, ph, T, inputs, outputs);
  },

  zeichnePorts(md, m, px, py, pw, ph, T, inputs, outputs) {
    const c = this.ctx;
    const r = this.PORT_R * this.zoom;

    // Input-Ports links (je ein Port pro Input-Material)
    inputs.forEach((mat, i) => {
      const porty = py + ph * ((i+1) / (inputs.length+1));
      const verbunden = fabrik_verbindungen.some(v => v.nachMasId === md.id && v.nachPortIdx === i);
      const farbe = this.MAT_FARBEN[mat] || this.MAT_FARBEN._default;

      c.fillStyle = verbunden ? farbe : "rgba(239,68,68,0.6)";
      c.strokeStyle = verbunden ? "#fff" : "#ff5555";
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(px, porty, r, 0, Math.PI*2);
      c.fill(); c.stroke();

      // Port-Beschriftung (Material-Emoji)
      if (T > 30) {
        const matObj = typeof MATERIALIEN !== "undefined" ? MATERIALIEN.find(m2 => m2.id === mat) : null;
        if (matObj) {
          c.font = Math.max(8, 10*this.zoom) + "px serif";
          c.textAlign = "right";
          c.fillText(matObj.emoji || "📦", px - r - 2, porty + 4*this.zoom);
        }
      }
    });

    // Output-Port rechts
    outputs.forEach((mat, i) => {
      const porty = py + ph * ((i+1) / (outputs.length+1));
      const verbunden = fabrik_verbindungen.some(v => v.vonMasId === md.id && v.vonPortIdx === i);
      const farbe = this.MAT_FARBEN[mat] || this.MAT_FARBEN._default;

      c.fillStyle = verbunden ? farbe : "rgba(100,100,100,0.6)";
      c.strokeStyle = verbunden ? "#fff" : "#888";
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(px+pw, porty, r, 0, Math.PI*2);
      c.fill(); c.stroke();

      if (T > 30) {
        const matObj = typeof MATERIALIEN !== "undefined" ? MATERIALIEN.find(m2 => m2.id === mat) : null;
        if (matObj) {
          c.font = Math.max(8, 10*this.zoom) + "px serif";
          c.textAlign = "left";
          c.fillText(matObj.emoji || "📦", px + pw + r + 2, porty + 4*this.zoom);
        }
      }
    });
  },

  zeichneGeister(md, pos, offX, offY, T) {
    const c  = this.ctx;
    const tw = md.tileGroesse ? md.tileGroesse.w : 2;
    const th = md.tileGroesse ? md.tileGroesse.h : 2;
    const px = offX + pos.tx * T, py = offY + pos.ty * T;
    const pw = tw * T, ph = th * T;
    const ok = !this.hatKollision(pos.tx, pos.ty, tw, th, md.id);
    c.globalAlpha = 0.55;
    c.fillStyle   = ok ? "rgba(245,158,11,0.25)" : "rgba(255,50,50,0.25)";
    this.roundRect(c, px+2, py+2, pw-4, ph-4, 6);
    c.fill();
    c.strokeStyle = ok ? "#f59e0b" : "#ff3333";
    c.lineWidth   = 2;
    c.setLineDash([6,4]); c.stroke(); c.setLineDash([]);
    c.globalAlpha = 1;
  },

  // ── Partikel ──
  updatePartikel(c, t) {
    this.partikel = this.partikel.filter(p => p.leben > 0);
    for (let p of this.partikel) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.leben -= 0.02;
      c.globalAlpha = p.leben;
      c.fillStyle   = p.farbe;
      c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI*2); c.fill();
    }
    c.globalAlpha = 1;
  },

  spawnPartikel(x, y, farbe) {
    for (let i = 0; i < 6; i++) {
      this.partikel.push({
        x, y, vx: (Math.random()-0.5)*3, vy: Math.random()*-3,
        r: Math.random()*3+1, farbe, leben: 1
      });
    }
  },

  // ══════════════════════════════
  // EVENTS
  // ══════════════════════════════

  setupEvents() {
    const c = this.canvas, s = this;
    c.addEventListener("mousedown",  e => s.onDown(e.clientX, e.clientY, e));
    c.addEventListener("mousemove",  e => s.onMove(e.clientX, e.clientY));
    c.addEventListener("mouseup",    e => s.onUp(e.clientX, e.clientY));
    c.addEventListener("wheel",      e => { e.preventDefault(); s.onWheel(e); }, { passive:false });
    c.addEventListener("touchstart", e => { e.preventDefault(); s.onTouchStart(e); }, { passive:false });
    c.addEventListener("touchmove",  e => { e.preventDefault(); s.onTouchMove(e); },  { passive:false });
    c.addEventListener("touchend",   e => { e.preventDefault(); s.onTouchEnd(e); },   { passive:false });
  },

  getCanvasPos(cx, cy) {
    const r = this.canvas.getBoundingClientRect();
    return { x: cx - r.left, y: cy - r.top };
  },

  onDown(cx, cy, e) {
    const {x, y} = this.getCanvasPos(cx, cy);
    this.drag = { aktiv:true, startX:x, startY:y, panX0:this.panX, panY0:this.panY, moved:false };

    // Verbindungs-Modus: Port-Klick erkennen
    if (this.verbindeModus) {
      let port = this.findPortAt(x, y);
      if (port) {
        if (!this.verbindeVon) {
          this.verbindeVon   = port;
          this.verbindeMausPos = { x, y };
        } else {
          this.verbindungAbschliessen(port);
        }
        return;
      }
    }

    // Verbindungs-Löschen
    for (let v of fabrik_verbindungen) {
      if (!v._delBtn) continue;
      const d = Math.sqrt((x - v._delBtn.x)**2 + (y - v._delBtn.y)**2);
      if (d < v._delBtn.r * 1.5) {
        fabrik_verbindungen = fabrik_verbindungen.filter(vv => vv !== v);
        this.verbindungen = fabrik_verbindungen;
        spielstandSpeichern();
        fabrikkarteInfoAusblenden();
        return;
      }
    }

    // Wareneingang: Maschinen-Drag starten
    const mas = this.getMaschinen();
    for (let entry of mas.filter(m => !m.position)) {
      if (!entry._wZone) continue;
      const z = entry._wZone;
      if (x >= z.x && x <= z.x+z.w && y >= z.y && y <= z.y+z.h) {
        this._geistMaschine = entry.md;
        this._geistPos = this.screenZuTile(x, y);
        this.drag.aktiv = false; // kein Pan beim Platzieren
        return;
      }
    }
  },

  onMove(cx, cy) {
    const {x, y} = this.getCanvasPos(cx, cy);

    if (this.verbindeModus && this.verbindeVon) {
      this.verbindeMausPos = { x, y };
      return;
    }

    if (this._geistMaschine) {
      this._geistPos = this.screenZuTile(x, y);
      return;
    }

    if (this.drag.aktiv) {
      const dx = x - this.drag.startX, dy = y - this.drag.startY;
      if (Math.abs(dx)+Math.abs(dy) > 3) this.drag.moved = true;
      this.panX = this.drag.panX0 + dx;
      this.panY = this.drag.panY0 + dy;
    }
  },

  onUp(cx, cy) {
    const {x, y} = this.getCanvasPos(cx, cy);

    if (this._geistMaschine) {
      const pos = this.screenZuTile(x, y);
      this.platzierHier(pos, this._geistMaschine);
      this._geistMaschine = null;
      this._geistPos = null;
      return;
    }

    if (!this.drag.moved && !this.verbindeModus) {
      this.klick(x, y);
    }
    this.drag.aktiv = false;
  },

  onWheel(e) {
    const {x, y} = this.getCanvasPos(e.clientX, e.clientY);
    this.zoomAuf(e.deltaY < 0 ? 1.12 : 0.88, x, y);
  },

  onTouchStart(e) {
    if (e.touches.length === 1) {
      this.onDown(e.touches[0].clientX, e.touches[0].clientY, e);
    } else if (e.touches.length === 2) {
      this.drag.aktiv = false;
      this.pinch = { aktiv:true, dist0:this.touchDist(e.touches), zoom0:this.zoom };
    }
  },

  onTouchMove(e) {
    if (e.touches.length === 1 && !this.pinch.aktiv) {
      this.onMove(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2 && this.pinch.aktiv) {
      const d = this.touchDist(e.touches);
      this.zoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, this.pinch.zoom0 * (d / this.pinch.dist0)));
    }
  },

  onTouchEnd(e) {
    if (e.touches.length < 2) this.pinch.aktiv = false;
    if (e.changedTouches.length > 0) this.onUp(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
  },

  touchDist(t) {
    return Math.sqrt((t[0].clientX-t[1].clientX)**2 + (t[0].clientY-t[1].clientY)**2);
  },

  zoomAuf(f, mx, my) {
    const nz = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, this.zoom * f));
    this.panX = mx - (mx - this.panX) * (nz/this.zoom);
    this.panY = my - (my - this.panY) * (nz/this.zoom);
    this.zoom = nz;
  },

  klick(x, y) {
    const mas = this.getMaschinen();
    const T   = this.TILE * this.zoom;
    const pos = this.screenZuTile(x, y);

    for (let i = 0; i < mas.length; i++) {
      const entry = mas[i];
      if (!entry.position) continue;
      const tw = entry.md.tileGroesse ? entry.md.tileGroesse.w : 2;
      const th = entry.md.tileGroesse ? entry.md.tileGroesse.h : 2;
      if (pos.tx >= entry.position.tx && pos.tx < entry.position.tx+tw &&
          pos.ty >= entry.position.ty && pos.ty < entry.position.ty+th) {
        this.ausgewaehlt = { masId: entry.md.id, md: entry.md, m: entry.m };
        fabrikkarteInfoZeigen(entry.md, entry.m);
        return;
      }
    }
    this.ausgewaehlt = null;
    fabrikkarteInfoAusblenden();
  },

  // ══════════════════════════════
  // VERBINDUNGEN
  // ══════════════════════════════

  findPortAt(x, y) {
    const mas = this.getMaschinen();
    const T   = this.TILE * this.zoom;
    const r   = this.PORT_R * this.zoom * 1.8;
    const offX = this.panX, offY = this.panY;

    for (let entry of mas) {
      if (!entry.position) continue;
      const tw = entry.md.tileGroesse ? entry.md.tileGroesse.w : 2;
      const th = entry.md.tileGroesse ? entry.md.tileGroesse.h : 2;
      const px = offX + entry.position.tx * T;
      const py = offY + entry.position.ty * T;
      const pw = tw*T, ph = th*T;
      const inputs  = this.getInputMaterials(entry.md);
      const outputs = this.getOutputMaterials(entry.md);

      for (let i = 0; i < inputs.length; i++) {
        const py2 = py + ph*((i+1)/(inputs.length+1));
        if (Math.sqrt((x-px)**2 + (y-py2)**2) < r) {
          return { masId:entry.md.id, portTyp:"input", portIdx:i, material:inputs[i], x:px, y:py2 };
        }
      }
      for (let i = 0; i < outputs.length; i++) {
        const py2 = py + ph*((i+1)/(outputs.length+1));
        if (Math.sqrt((x-(px+pw))**2 + (y-py2)**2) < r) {
          return { masId:entry.md.id, portTyp:"output", portIdx:i, material:outputs[i], x:px+pw, y:py2 };
        }
      }
    }
    return null;
  },

  verbindungAbschliessen(portB) {
    const portA = this.verbindeVon;
    if (!portA || portA.masId === portB.masId) { this.verbindeModus = false; this.verbindeVon = null; return; }

    const von  = portA.portTyp === "output" ? portA : portB;
    const nach = portA.portTyp === "input"  ? portA : portB;
    if (von.portTyp !== "output" || nach.portTyp !== "input") {
      zeigeNotification("❌ Output → Input verbinden!", "red");
      this.verbindeVon = null; return;
    }

    // Bereits verbunden?
    const exists = fabrik_verbindungen.some(v =>
      v.vonMasId === von.masId && v.vonPortIdx === von.portIdx &&
      v.nachMasId === nach.masId && v.nachPortIdx === nach.portIdx
    );
    if (exists) { zeigeNotification("Bereits verbunden.", "red"); this.verbindeVon = null; return; }

    fabrik_verbindungen.push({
      id:        Date.now() + Math.random(),
      vonMasId:  von.masId,  vonPort: "output", vonPortIdx:  von.portIdx,
      nachMasId: nach.masId, nachPort:"input",  nachPortIdx: nach.portIdx,
      material:  von.material || nach.material || "unknown"
    });

    this.spawnPartikel(nach.x, nach.y, this.MAT_FARBEN[nach.material] || "#fff");
    zeigeNotification("🔗 Verbindung erstellt!", "green");
    spielstandSpeichern();
    fabrikarteListeRendern(this.gebaeude, this.gsId);

    this.verbindeVon = null;
    this.verbindeModus = false;
    fabrikkarteInfoAusblenden();
  },

  // ══════════════════════════════
  // PLATZIEREN
  // ══════════════════════════════

  platzierHier(pos, md) {
    const tw = md.tileGroesse ? md.tileGroesse.w : 2;
    const th = md.tileGroesse ? md.tileGroesse.h : 2;
    const geb = this.gebaeude;

    if (pos.tx < 0 || pos.ty < 0 || pos.tx+tw > geb.tileBreite || pos.ty+th > geb.tileHoehe) {
      zeigeNotification("❌ Außerhalb der Fabrik!", "red"); return;
    }
    if (this.hatKollision(pos.tx, pos.ty, tw, th, md.id)) {
      zeigeNotification("❌ Platz belegt!", "red"); return;
    }

    // Position speichern
    for (let m of installierte_maschinen) {
      if (m.id === md.id) {
        m.fabrikPos = m.fabrikPos || {};
        m.fabrikPos[geb.id] = { tx: pos.tx, ty: pos.ty };
        m.platziert = true;
        break;
      }
    }
    this.spawnPartikel(
      this.panX + (pos.tx + tw/2) * this.TILE * this.zoom,
      this.panY + (pos.ty + th/2) * this.TILE * this.zoom,
      "#f59e0b"
    );
    spielstandSpeichern();
    fabrikarteListeRendern(this.gebaeude, this.gsId);
    zeigeNotification("✅ " + md.name + " platziert!", "green");
  },

  hatKollision(tx, ty, tw, th, ausnahmeMasId) {
    for (let entry of this.getMaschinen()) {
      if (!entry.position || entry.md.id === ausnahmeMasId) continue;
      const pw = entry.md.tileGroesse ? entry.md.tileGroesse.w : 2;
      const ph = entry.md.tileGroesse ? entry.md.tileGroesse.h : 2;
      const p  = entry.position;
      if (tx < p.tx+pw && tx+tw > p.tx && ty < p.ty+ph && ty+th > p.ty) return true;
    }
    return false;
  },

  // ══════════════════════════════
  // HILFSFUNKTIONEN
  // ══════════════════════════════

  screenZuTile(sx, sy) {
    const T = this.TILE * this.zoom;
    return { tx: Math.floor((sx-this.panX)/T), ty: Math.floor((sy-this.panY)/T) };
  },

  getPortKoords(entry, portTyp, portIdx, offX, offY, T) {
    const tw  = entry.md.tileGroesse ? entry.md.tileGroesse.w : 2;
    const th  = entry.md.tileGroesse ? entry.md.tileGroesse.h : 2;
    const px  = offX + entry.position.tx * T;
    const py  = offY + entry.position.ty * T;
    const pw  = tw*T, ph = th*T;
    const arr = portTyp === "input" ? this.getInputMaterials(entry.md) : this.getOutputMaterials(entry.md);
    const idx = Math.min(portIdx, arr.length-1);
    const porty = py + ph*((idx+1)/(arr.length+1));
    return { x: px + (portTyp==="output" ? pw : 0), y: porty };
  },

  getInputMaterials(md) {
    if (typeof REZEPTE === "undefined") return [];
    const rez = REZEPTE.find(r => r.id === (typeof installierte_maschinen !== "undefined"
      ? (installierte_maschinen.find(m => m.id === md.id) || {}).aktivesRezept : null));
    if (rez) return rez.inputs.map(i => i.material);
    // Alle Rezepte dieser Maschine — nimm das erste
    const erstesRez = REZEPTE.find(r => r.maschine === md.id);
    return erstesRez ? erstesRez.inputs.map(i => i.material) : [];
  },

  getOutputMaterials(md) {
    if (typeof REZEPTE === "undefined") return [];
    const erstesRez = REZEPTE.find(r => r.maschine === md.id);
    return erstesRez ? erstesRez.outputs.map(o => o.material) : [];
  },

  getMaschinen() {
    if (typeof MASCHINEN === "undefined" || !this.gebaeude) return [];
    return installierte_maschinen
      .filter(m => {
        const md = MASCHINEN.find(d => d.id === m.id);
        return md && (!md.hallenTyp || md.hallenTyp.includes(this.gebaeude.hallenTyp));
      })
      .map(m => {
        const md = MASCHINEN.find(d => d.id === m.id);
        const pos = m.fabrikPos && m.fabrikPos[this.gebaeude.id] ? m.fabrikPos[this.gebaeude.id] : null;
        return { md, m, position: pos };
      });
  },

  roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x+r,y); c.lineTo(x+w-r,y); c.quadraticCurveTo(x+w,y,x+w,y+r);
    c.lineTo(x+w,y+h-r); c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    c.lineTo(x+r,y+h); c.quadraticCurveTo(x,y+h,x,y+h-r);
    c.lineTo(x,y+r); c.quadraticCurveTo(x,y,x+r,y);
    c.closePath();
  },

  zentrieren() {
    if (!this.gebaeude) return;
    const WARENEINGANG_EXTRA = 100;
    this.zoom = Math.min(
      this.canvas.width  / (this.gebaeude.tileBreite * this.TILE) * 0.85,
      (this.canvas.height - WARENEINGANG_EXTRA) / (this.gebaeude.tileHoehe * this.TILE) * 0.85
    );
    this.panX = (this.canvas.width  - this.gebaeude.tileBreite * this.TILE * this.zoom) / 2;
    this.panY = 20;
  }
};

// ══════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════

function fabrikkarteOeffnen(gebaeudeId, gsId) {
  const geb = typeof GEBAEUDE !== "undefined" ? GEBAEUDE.find(g => g.id === gebaeudeId) : null;
  if (!geb) return;

  let modal = document.getElementById("modal-fabrikkarte");
  if (!modal) { modal = document.createElement("div"); modal.id = "modal-fabrikkarte"; document.body.appendChild(modal); }

  modal.innerHTML =
    "<div class='fk-wrapper'>" +
      "<div class='fk-header'>" +
        "<div class='fk-header-left'>" +
          "<span class='fk-geb-emoji'>" + (geb.emoji||"🏭") + "</span>" +
          "<div><div class='fk-geb-name'>" + geb.name + "</div>" +
          "<div class='fk-geb-sub'>" + geb.tileBreite + "×" + geb.tileHoehe + " Tiles · max " + (geb.maxMaschinen||0) + " Maschinen</div></div>" +
        "</div>" +
        "<div class='fk-header-right'>" +
          "<button class='fk-btn-icon' onclick='FK.zentrieren()' title='Zentrieren'>⌖</button>" +
          "<button class='fk-btn-icon fk-btn-verbinde' id='btn-verbinde-modus' onclick='fabrikkarteVerbindeModus()' title='Verbinden'>🔗</button>" +
          "<button class='fk-btn-icon' onclick='FK.zoomAuf(1.2, FK.canvas.width/2, FK.canvas.height/2)'>+</button>" +
          "<button class='fk-btn-icon' onclick='FK.zoomAuf(0.8, FK.canvas.width/2, FK.canvas.height/2)'>−</button>" +
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

  setTimeout(function() {
    const canvas = document.getElementById("fk-canvas");
    const body   = canvas.parentElement;
    canvas.width  = body.clientWidth - 210;
    canvas.height = body.clientHeight;
    FK.init(canvas, geb, gsId);
    fabrikarteListeRendern(geb, gsId);
  }, 30);
}

function fabrikkarteSchliessen() {
  FK.destroy();
  const modal = document.getElementById("modal-fabrikkarte");
  if (modal) modal.style.display = "none";
}

function fabrikkarteVerbindeModus() {
  FK.verbindeModus = !FK.verbindeModus;
  FK.verbindeVon   = null;
  FK.ausgewaehlt   = null;
  const btn = document.getElementById("btn-verbinde-modus");
  if (btn) {
    btn.style.background = FK.verbindeModus ? "var(--amber) !important" : "";
    btn.style.color      = FK.verbindeModus ? "#000" : "";
    btn.title = FK.verbindeModus ? "Verbinde-Modus aktiv — Klick Output → Input" : "Verbinden";
  }
  if (FK.verbindeModus) {
    zeigeNotification("🔗 Verbinde-Modus: Klicke einen Output-Port, dann einen Input-Port", "green");
  }
  fabrikkarteInfoAusblenden();
}

function fabrikarteListeRendern(geb, gsId) {
  const liste = document.getElementById("fk-maschinenlist");
  if (!liste) return;
  const mas = FK.getMaschinen();
  const unplatz = mas.filter(m => !m.position);
  const platziert = mas.filter(m => m.position);
  let html = "";

  if (unplatz.length > 0) {
    html += "<div class='fk-list-label'>⚠ Wareneingang (" + unplatz.length + ")</div>";
    html += "<div class='fk-wareneingang-hint'>Ziehe Maschinen aus dem Wareneingang auf die Fabrikfläche.</div>";
    for (let e of unplatz) {
      const vis = FK.VISUALS[e.md.id] || FK.VISUALS._default;
      html += "<div class='fk-mas-item fk-mas-unplaced'>" +
        "<span class='fk-mas-icon'>" + vis.icon + "</span>" +
        "<div class='fk-mas-info'><span class='fk-mas-name'>" + e.md.name + "</span>" +
        "<span class='fk-mas-sub'>" + (e.md.tileGroesse||{w:2,h:2}).w + "×" + (e.md.tileGroesse||{w:2,h:2}).h + " Tiles</span></div>" +
        "<span class='fk-mas-aktion'>Ziehen</span></div>";
    }
  }

  if (platziert.length > 0) {
    html += "<div class='fk-list-label'>✅ Platziert (" + platziert.length + ")</div>";
    for (let e of platziert) {
      const vis = FK.VISUALS[e.md.id] || FK.VISUALS._default;
      const inputs = FK.getInputMaterials(e.md);
      const verbunden = inputs.every((mat, i) => fabrik_verbindungen.some(v => v.nachMasId === e.md.id && v.nachPortIdx === i));
      const status = e.m && e.m.laeuft ? "🟢" : (verbunden ? "🟡" : "🔴");
      html += "<div class='fk-mas-item' onclick='FK.ausgewaehlt={masId:\"" + e.md.id + "\",md:FK.getMaschinen().find(m=>m.md.id===\"" + e.md.id + "\").md,m:FK.getMaschinen().find(m=>m.md.id===\"" + e.md.id + "\").m};fabrikkarteInfoZeigen(FK.ausgewaehlt.md,FK.ausgewaehlt.m)'>" +
        "<span class='fk-mas-icon'>" + vis.icon + "</span>" +
        "<div class='fk-mas-info'><span class='fk-mas-name'>" + e.md.name + "</span>" +
        "<span class='fk-mas-sub'>" + status + " " + (verbunden ? "Verbunden" : "Nicht verbunden") + "</span></div></div>";
    }
  }

  if (mas.length === 0) {
    html = "<div class='fk-leer-hint'>Keine Maschinen. Kaufe Maschinen im Shop — sie erscheinen im Wareneingang.</div>";
  }

  liste.innerHTML = html;
}

function fabrikkarteInfoZeigen(md, m) {
  const info = document.getElementById("fk-info-panel");
  if (!info) return;
  const vis    = FK.VISUALS[md.id] || FK.VISUALS._default;
  const laueft = m && m.laeuft;
  const inputs = FK.getInputMaterials(md);
  const alleV  = inputs.every((mat, i) => fabrik_verbindungen.some(v => v.nachMasId === md.id && v.nachPortIdx === i));
  const rez    = typeof REZEPTE !== "undefined" ? REZEPTE.find(r => r.id === (m && m.aktivesRezept)) : null;

  info.style.display = "block";
  info.innerHTML =
    "<div class='fk-info-header'><span style='font-size:22px'>" + vis.icon + "</span>" +
    "<div><div class='fk-info-name'>" + md.name + "</div>" +
    "<div class='fk-info-status' style='color:" + (laueft ? "var(--green)" : !alleV ? "var(--amber)" : "var(--red)") + "'>" +
      (laueft ? "● Läuft" : !alleV ? "⚠ Verbindung fehlt" : "● Gestoppt") + "</div></div></div>" +
    (rez ? "<div class='fk-info-rezept'>📋 " + rez.name + "</div>" : "") +
    "<div class='fk-info-btns'>" +
      "<button class='fk-btn-primary' onclick='fabrikMaschineToggle(\"" + md.id + "\")'>" + (laueft ? "⏸ Stoppen" : "▶ Starten") + "</button>" +
      "<button class='fk-btn-sec' onclick='fabrikkarteVerbindeModus()'>🔗 Verbinden</button>" +
      "<button class='fk-btn-sec' onclick='fabrikMaschineVerschieben(\"" + md.id + "\")'>↔ Verschieben</button>" +
    "</div>";
}

function fabrikkarteInfoAusblenden() {
  const info = document.getElementById("fk-info-panel");
  if (info) info.style.display = "none";
}

function fabrikMaschineToggle(masId) {
  const m = installierte_maschinen.find(m => m.id === masId);
  if (!m) return;
  const inputs   = FK.getInputMaterials(MASCHINEN.find(d => d.id === masId));
  const alleV    = inputs.every((mat, i) => fabrik_verbindungen.some(v => v.nachMasId === masId && v.nachPortIdx === i));
  if (!alleV && !m.laeuft) {
    zeigeNotification("⚠ Erst alle Inputs verbinden!", "red"); return;
  }
  if (m.laeuft) { if (typeof maschineStoppen === "function") maschineStoppen(m); }
  else          { if (typeof maschineStarten  === "function") maschineStarten(m); }
  setTimeout(() => {
    const md = MASCHINEN.find(d => d.id === masId);
    if (md) fabrikkarteInfoZeigen(md, m);
  }, 100);
}

function fabrikMaschineVerschieben(masId) {
  const m = installierte_maschinen.find(m => m.id === masId);
  if (!m || !m.fabrikPos) return;
  delete m.fabrikPos[FK.gebaeude.id];
  m.platziert = false;
  fabrikarteListeRendern(FK.gebaeude, FK.gsId);
  fabrikkarteInfoAusblenden();
  zeigeNotification("↔ Maschine in den Wareneingang verschoben", "green");
}
