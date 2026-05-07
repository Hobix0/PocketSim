
// ══════════════════════════════════════════════════════
// SPEZIAL NODES — Lager & Export
// Feste Positionen am Rand der Fabrik
// ══════════════════════════════════════════════════════

const SPECIAL_NODE_LAGER  = { id:"__lager__",  name:"Lager",  emoji:"📦", farbe:"#1A4A2A", farbe2:"#0D2515", glow:"#44CC66" };
const SPECIAL_NODE_EXPORT = { id:"__export__", name:"Export", emoji:"🚚", farbe:"#1A2A4A", farbe2:"#0D1525", glow:"#4466CC" };

// ══════════════════════════════════════════════════════
// FABRIKKARTE v3 — Sauber, funktional, schön
// Klick-to-Place statt Drag, stabiles Layout
// ══════════════════════════════════════════════════════

let fabrik_verbindungen = [];

const FK = {
  canvas: null, ctx: null, gebaeude: null, gsId: null,
  TILE: 50, zoom: 1.0, panX: 20, panY: 20,
  MIN_ZOOM: 0.3, MAX_ZOOM: 2.5,
  drag: { aktiv:false, sx:0, sy:0, px0:0, py0:0, moved:false },
  pinch: { aktiv:false, d0:0, z0:0 },
  ausgewaehlt: null,
  platzierMaschine: null,  // MD die per Click platziert wird
  verbindeModus: false,
  verbindeVon: null,
  mausPos: { x:0, y:0 },
  animFrame: null, t: 0,

  VISUALS: {
    schmelzofen:      { f:"#7A3018", f2:"#4A1C0A", ico:"🔥",  glow:"#E8501A" },
    steinbrecher:     { f:"#4A4A4A", f2:"#2A2A2A", ico:"⛏️",  glow:"#888" },
    oelraffinerie:    { f:"#3A2810", f2:"#1E1408", ico:"🛢️",  glow:"#A07820" },
    formerei:         { f:"#143870", f2:"#0A1E40", ico:"⚙️",  glow:"#3878CC" },
    kabelwerk:        { f:"#381470", f2:"#1E0A40", ico:"🔌",  glow:"#8840DD" },
    motorenfabrik:    { f:"#703814", f2:"#401E0A", ico:"🔧",  glow:"#DD8030" },
    betonwerk:        { f:"#404040", f2:"#282828", ico:"🧱",  glow:"#808080" },
    kraftwerk_kohle:  { f:"#1A1A1A", f2:"#0A0A0A", ico:"⚡",  glow:"#FFDD00" },
    labor:            { f:"#145030", f2:"#0A2818", ico:"🔬",  glow:"#30CC70" },
    lagerhalle:       { f:"#284018", f2:"#14200A", ico:"📦",  glow:"#70B030" },
    elektronikfabrik: { f:"#14286A", f2:"#0A1440", ico:"💾",  glow:"#3358CC" },
    titanschmiede:    { f:"#1A3850", f2:"#0A1C28", ico:"🔷",  glow:"#3090CC" },
    carbonfaserwerk:  { f:"#121212", f2:"#080808", ico:"🖤",  glow:"#444" },
    montagewerk_2:    { f:"#502814", f2:"#28140A", ico:"🏗️",  glow:"#B06030" },
    kernkraftwerk:    { f:"#184818", f2:"#0C240C", ico:"⚛️",  glow:"#00DD70" },
    _default:         { f:"#1E2C3A", f2:"#101820", ico:"⚙️",  glow:"#3878AA" }
  },

  MAT_FARBEN: {
    eisenerz:"#8B4513",eisenplatte:"#9098A8",kupfererz:"#CC5500",
    kupferplatte:"#CD7F32",stahl:"#607888",kohle:"#2A2A2A",
    sand:"#D4B870",kalkstein:"#D8D0C0",glas:"#88CCEE",zement:"#A09880",
    rohoel:"#1A120A",plastik:"#DDCC00",gummi:"#282828",zahnrad:"#787888",
    kupferkabel:"#CC8833",stahltraeger:"#506070",betonplatte:"#808878",
    schaltkreis:"#00BB55",stahlrohr:"#506070",motor_klein:"#3A5870",
    elektronikmodul:"#2255BB",_def:"#446688"
  },

  // ═══════════ INIT ═══════════

  init(canvas, geb, gsId) {
    this.canvas = canvas; this.ctx = canvas.getContext("2d");
    this.gebaeude = geb; this.gsId = gsId;
    this.verbindungen = fabrik_verbindungen;
    this.fit(); this.events(); this.loop();
  },

  destroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.canvas = null;
  },

  fit() {
    if (!this.gebaeude||!this.canvas) return;
    const W=this.canvas.width, H=this.canvas.height;
    const pad=32;
    const maxZ=Math.min((W-pad*2)/(this.gebaeude.tileBreite*this.TILE),(H-pad*2)/(this.gebaeude.tileHoehe*this.TILE));
    this.zoom=Math.max(0.3,Math.min(maxZ,1.5));
    const bW=this.gebaeude.tileBreite*this.TILE*this.zoom;
    const bH=this.gebaeude.tileHoehe*this.TILE*this.zoom;
    this.panX=Math.round((W-bW)/2);
    this.panY=Math.round((H-bH)/2);
  },

  // ═══════════ LOOP ═══════════

  loop() {
    const self = this;
    function frame(ts) {
      self.t = ts / 1000;
      self.draw();
      self.animFrame = requestAnimationFrame(frame);
    }
    this.animFrame = requestAnimationFrame(frame);
  },

  draw() {
    if (!this.canvas) return;
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const T = this.TILE * this.zoom, geb = this.gebaeude;
    const ox = this.panX, oy = this.panY;
    const bW = geb.tileBreite * T, bH = geb.tileHoehe * T;

    // Hintergrund
    c.fillStyle = "#080B10"; c.fillRect(0,0,W,H);

    // Fabrikboden
    const floorGrad = c.createLinearGradient(ox,oy,ox,oy+bH);
    floorGrad.addColorStop(0, "#131820"); floorGrad.addColorStop(1, "#0E1318");
    c.fillStyle = floorGrad; c.fillRect(ox,oy,bW,bH);

    // Schachbrett-Tiles
    for (let tx=0; tx<geb.tileBreite; tx++) {
      for (let ty=0; ty<geb.tileHoehe; ty++) {
        if ((tx+ty)%2===0) {
          c.fillStyle="rgba(255,255,255,0.02)";
          c.fillRect(ox+tx*T, oy+ty*T, T, T);
        }
      }
    }

    // Grid-Linien
    c.strokeStyle="rgba(255,255,255,0.07)"; c.lineWidth=0.5;
    for (let tx=0;tx<=geb.tileBreite;tx++) {
      c.beginPath(); c.moveTo(ox+tx*T,oy); c.lineTo(ox+tx*T,oy+bH); c.stroke();
    }
    for (let ty=0;ty<=geb.tileHoehe;ty++) {
      c.beginPath(); c.moveTo(ox,oy+ty*T); c.lineTo(ox+bW,oy+ty*T); c.stroke();
    }

    // Außenrand
    c.strokeStyle="rgba(245,158,11,0.5)"; c.lineWidth=1.5;
    c.strokeRect(ox-1,oy-1,bW+2,bH+2);

    // Verbindungen
    this.drawConnections(ox,oy,T);

    // Maschinen
    for (let entry of this.getMachines()) {
      if (entry.pos) this.drawMachine(entry, ox, oy, T);
    }

    // Spezial Nodes
    this.drawSpecialNodes(ox, oy, bW, bH, T);

    // Verbindungs-Vorschau
    if (this.verbindeModus && this.verbindeVon) this.drawConnPreview();

    // Platzier-Geist
    if (this.platzierMaschine) {
      const tp = this.screenToTile(this.mausPos.x, this.mausPos.y);
      this.drawGhost(this.platzierMaschine, tp, ox, oy, T);
    }

    // Wareneingang-Label
    const mas = this.getMachines();
    const unp = mas.filter(m=>!m.pos);
    if (unp.length > 0) {
      c.fillStyle = "rgba(245,158,11,0.75)";
      c.font = `bold ${Math.max(10,11*this.zoom)}px 'IBM Plex Sans',sans-serif`;
      c.textAlign = "left";
      c.fillText(`📦 ${unp.length} Maschine${unp.length>1?"n":""} im Wareneingang — in Sidebar auswählen`, ox, oy-8);
    }
  },

  // ═══════════ VERBINDUNGEN ═══════════

  drawConnections(ox,oy,T) {
    for (let v of fabrik_verbindungen) {
      const mas = this.getMachines();
      const isVonSpecial  = v.vonInstId  && (v.vonInstId  === "__lager__" || v.vonInstId  === "__export__");
      const isNachSpecial = v.nachInstId && (v.nachInstId === "__lager__" || v.nachInstId === "__export__");
      const von  = isVonSpecial  ? null : (v.vonInstId  ? mas.find(m=>m.key===v.vonInstId)  : mas.find(m=>m.md.id===v.vonMasId));
      const nach = isNachSpecial ? null : (v.nachInstId ? mas.find(m=>m.key===v.nachInstId) : mas.find(m=>m.md.id===v.nachMasId));

      // Koordinaten für Special Nodes
      const sn = this._specialNodes||[];
      const vonSN  = isVonSpecial  ? sn.find(n=>n.spec.id===v.vonInstId)  : null;
      const nachSN = isNachSpecial ? sn.find(n=>n.spec.id===v.nachInstId) : null;
      if (!von&&!vonSN)  continue;
      if (!nach&&!nachSN) continue;
      if (von&&!von.pos)  continue;
      if (nach&&!nach.pos) continue;

      const p1 = vonSN  ? vonSN._outPort  : this.portCoords(von,  "output", v.vonPortIdx,  ox,oy,T);
      const p2 = nachSN ? nachSN._inPort  : this.portCoords(nach, "input",  v.nachPortIdx, ox,oy,T);
      if (!p1||!p2) continue;
      const farbe = this.MAT_FARBEN[v.material]||this.MAT_FARBEN._def;
      const cpx  = (p1.x+p2.x)/2;

      const c = this.ctx;
      // Schatten
      c.strokeStyle="rgba(0,0,0,0.5)"; c.lineWidth=6*this.zoom;
      c.beginPath(); c.moveTo(p1.x,p1.y+2);
      c.bezierCurveTo(cpx,p1.y+2,cpx,p2.y+2,p2.x,p2.y+2); c.stroke();
      // Rohr
      c.strokeStyle=farbe; c.lineWidth=4*this.zoom;
      c.beginPath(); c.moveTo(p1.x,p1.y);
      c.bezierCurveTo(cpx,p1.y,cpx,p2.y,p2.x,p2.y); c.stroke();
      // Highlight
      c.strokeStyle="rgba(255,255,255,0.2)"; c.lineWidth=1.5*this.zoom;
      c.beginPath(); c.moveTo(p1.x,p1.y-1);
      c.bezierCurveTo(cpx,p1.y-1,cpx,p2.y-1,p2.x,p2.y-1); c.stroke();
      // Fluss-Partikel
      if (von.m&&von.m.laeuft) {
        const f = (this.t*0.35 + fabrik_verbindungen.indexOf(v)*0.2) % 1;
        const bx = (1-f)**3*p1.x+3*(1-f)**2*f*cpx+3*(1-f)*f**2*cpx+f**3*p2.x;
        const by = (1-f)**3*p1.y+3*(1-f)**2*f*p1.y+3*(1-f)*f**2*p2.y+f**3*p2.y;
        c.fillStyle="#fff"; c.beginPath(); c.arc(bx,by,3*this.zoom,0,Math.PI*2); c.fill();
      }
      // Del-Button
      const mx=(p1.x+p2.x)/2, my=(p1.y+p2.y)/2;
      c.fillStyle="rgba(200,40,40,0.85)"; c.beginPath(); c.arc(mx,my,7*this.zoom,0,Math.PI*2); c.fill();
      c.fillStyle="#fff"; c.font=`bold ${Math.max(8,9*this.zoom)}px sans-serif`;
      c.textAlign="center"; c.fillText("×",mx,my+3*this.zoom);
      v._del={x:mx,y:my,r:9*this.zoom};
    }
  },


  drawSpecialNodes(ox, oy, bW, bH, T) {
    const c = this.ctx;
    const nodes = [
      { spec: SPECIAL_NODE_LAGER,  x: ox - 70*this.zoom, y: oy + bH*0.25, typ:"both" },
      { spec: SPECIAL_NODE_EXPORT, x: ox + bW + 10*this.zoom, y: oy + bH*0.5, typ:"input" }
    ];

    for (let node of nodes) {
      const nW = 60*this.zoom, nH = 80*this.zoom;
      const nx = node.x, ny = node.y - nH/2;

      // Speichert Pos für Klick-Erkennung
      node._rect = { x:nx, y:ny, w:nW, h:nH };

      // Box
      const g = c.createLinearGradient(nx,ny,nx,ny+nH);
      g.addColorStop(0, node.spec.farbe); g.addColorStop(1, node.spec.farbe2);
      this.rr(c, nx, ny, nW, nH, 8*this.zoom);
      c.fillStyle = g; c.fill();
      c.strokeStyle = node.spec.glow; c.lineWidth = 1.5;
      c.shadowColor = node.spec.glow; c.shadowBlur = 8;
      c.stroke(); c.shadowBlur = 0;

      // Emoji + Name
      const esz = Math.max(16, Math.min(22*this.zoom, 28));
      c.font = esz+"px serif"; c.textAlign = "center";
      c.fillText(node.spec.emoji, nx+nW/2, ny+nH*0.45+esz*0.35);
      c.font = `bold ${Math.max(8,9*this.zoom)}px 'IBM Plex Sans',sans-serif`;
      c.fillStyle = "rgba(255,255,255,0.7)"; c.textAlign = "center";
      c.fillText(node.spec.name, nx+nW/2, ny+nH-6*this.zoom);

      // Ports
      const pr = Math.max(5, 6*this.zoom);
      if (node.typ === "both" || node.typ === "output") {
        // Output-Port rechts (Material aus Lager → Maschine)
        c.fillStyle="#44CC66"; c.strokeStyle="rgba(255,255,255,0.5)"; c.lineWidth=1.2;
        c.beginPath(); c.arc(nx+nW, ny+nH*0.35, pr,0,Math.PI*2); c.fill(); c.stroke();
        if (this.zoom > 0.6) { c.fillStyle="rgba(255,255,255,0.7)"; c.font=`bold ${Math.max(6,7*this.zoom)}px sans-serif`; c.textAlign="center"; c.fillText("▶",nx+nW,ny+nH*0.35+2.5*this.zoom); }
        node._outPort = {x:nx+nW, y:ny+nH*0.35};
      }
      if (node.typ === "both" || node.typ === "input") {
        // Input-Port rechts bei Lager, links bei Export
        const ipx = node.typ==="input" ? nx : nx+nW;
        const ipy = ny+nH*0.65;
        c.fillStyle="#4488FF"; c.strokeStyle="rgba(255,255,255,0.5)"; c.lineWidth=1.2;
        c.beginPath(); c.arc(ipx, ipy, pr,0,Math.PI*2); c.fill(); c.stroke();
        if (this.zoom > 0.6) { c.fillStyle="rgba(255,255,255,0.7)"; c.font=`bold ${Math.max(6,7*this.zoom)}px sans-serif`; c.textAlign="center"; c.fillText("◀",ipx,ipy+2.5*this.zoom); }
        node._inPort = {x:ipx, y:ipy};
      }

      this._specialNodes = this._specialNodes||[];
      const existing = this._specialNodes.find(n=>n.spec.id===node.spec.id);
      if (!existing) this._specialNodes.push(node); else Object.assign(existing, node);
    }
  },

  drawConnPreview() {
    const c=this.ctx, p1=this.verbindeVon, p2=this.mausPos;
    const cpx=(p1.x+p2.x)/2;
    c.strokeStyle="rgba(245,158,11,0.7)"; c.lineWidth=2.5; c.setLineDash([8,5]);
    c.beginPath(); c.moveTo(p1.x,p1.y);
    c.bezierCurveTo(cpx,p1.y,cpx,p2.y,p2.x,p2.y); c.stroke();
    c.setLineDash([]);
  },

  // ═══════════ MASCHINE ZEICHNEN ═══════════

  drawMachine(entry, ox, oy, T) {
    const c=this.ctx, md=entry.md, m=entry.m, pos=entry.pos;
    const tw=md.tileGroesse?.w||2, th=md.tileGroesse?.h||2;
    const vis=this.VISUALS[md.id]||this.VISUALS._default;
    const px=ox+pos.tx*T, py=oy+pos.ty*T, pw=tw*T, ph=th*T;
    const r=Math.min(10*this.zoom,pw*0.1);
    const sel=this.ausgewaehlt?.masId===md.id;
    const laueft=m&&m.laeuft;
    const inputs=this.getInputMats(md);
    const alleV=inputs.every((_,i)=>fabrik_verbindungen.some(v=>v.nachMasId===md.id&&v.nachPortIdx===i));

    // Glow
    if (laueft) { c.shadowColor=vis.glow; c.shadowBlur=14+Math.sin(this.t*1.8)*5; }
    else c.shadowBlur=0;

    // Körper
    const g=c.createLinearGradient(px,py,px,py+ph);
    g.addColorStop(0,vis.f); g.addColorStop(1,vis.f2);
    this.rr(c,px+2,py+2,pw-4,ph-4,r);
    c.fillStyle=g; c.fill();

    c.strokeStyle=sel?"#F59E0B":laueft?vis.glow:"rgba(255,255,255,0.1)";
    c.lineWidth=sel?2.5:laueft?1.5:0.8; c.shadowBlur=0; c.stroke();

    // Schrauben-Ecken (Detail)
    if (T>30) {
      const schrauben=[[px+6,py+6],[px+pw-6,py+6],[px+6,py+ph-6],[px+pw-6,py+ph-6]];
      for (let [sx,sy] of schrauben) {
        c.fillStyle="rgba(255,255,255,0.15)"; c.beginPath();
        c.arc(sx,sy,2.5*this.zoom,0,Math.PI*2); c.fill();
      }
    }

    // Top-Streifen (Lüftung)
    if (ph>50) {
      const strW=pw*0.4, strX=px+(pw-strW)/2;
      for (let i=0;i<3;i++) {
        c.fillStyle="rgba(0,0,0,0.25)";
        c.fillRect(strX+i*(strW/3+1),py+5,strW/4,Math.min(8*this.zoom,ph*0.08));
      }
    }

    // Icon
    const esz=Math.max(16,Math.min(T*0.55,40));
    c.font=esz+"px serif"; c.textAlign="center"; c.shadowBlur=0;
    c.fillText(vis.ico, px+pw/2, py+ph/2+esz*0.35);

    // Name (wenn genug Platz)
    if (pw>60&&ph>50) {
      c.font=`bold ${Math.max(8,Math.round(9*this.zoom))}px 'IBM Plex Sans',sans-serif`;
      c.fillStyle="rgba(255,255,255,0.65)"; c.textAlign="center";
      c.fillText(md.name.length>12?md.name.substring(0,11)+"…":md.name, px+pw/2, py+16*this.zoom);
    }

    // Rauch
    if (laueft&&pw>50) {
      const ry=Math.sin(this.t*2.5)*5;
      c.font=Math.max(10,12*this.zoom)+"px serif"; c.textAlign="center";
      c.globalAlpha=0.35+Math.sin(this.t*3)*0.2;
      c.fillText("💨", px+pw*0.65, py-8+ry); c.globalAlpha=1;
    }

    // Status-LED (oben rechts)
    const ledColor=laueft?"#22DD66":!alleV&&inputs.length?"#F59E0B":"#555";
    c.fillStyle=ledColor;
    if (laueft) { c.shadowColor=ledColor; c.shadowBlur=6; }
    c.beginPath(); c.arc(px+pw-9*this.zoom,py+9*this.zoom,3.5*this.zoom,0,Math.PI*2); c.fill();
    c.shadowBlur=0;

    // Auswahl-Dashed-Rahmen
    if (sel) {
      c.strokeStyle="#F59E0B"; c.lineWidth=2; c.setLineDash([6,4]);
      this.rr(c,px-2,py-2,pw+4,ph+4,r+2); c.stroke(); c.setLineDash([]);
    }

    // Ports zeichnen
    this.drawPorts(md, m, px, py, pw, ph);
  },

  drawPorts(md, m, px, py, pw, ph) {
    const c=this.ctx;
    const r=Math.max(5,6*this.zoom);
    const inputs=this.getInputMats(md), outputs=this.getOutputMats(md);
    const iKey=m&&m.instanceId?m.instanceId:md.id;

    inputs.forEach((mat,i)=>{
      const py2=py+ph*((i+1)/(inputs.length+1));
      const conn=fabrik_verbindungen.some(v=>v.nachInstId===iKey&&v.nachPortIdx===i);
      const farbe=this.MAT_FARBEN[mat]||this.MAT_FARBEN._def;
      c.fillStyle=conn?farbe:"rgba(200,60,60,0.7)";
      c.strokeStyle=conn?"rgba(255,255,255,0.6)":"#AA2222";
      c.lineWidth=1.2;
      c.beginPath(); c.arc(px,py2,r,0,Math.PI*2); c.fill(); c.stroke();
      // Pfeil-Zeichen
      if (this.zoom>0.7) {
        c.fillStyle="rgba(255,255,255,0.7)"; c.font=`bold ${Math.max(6,7*this.zoom)}px sans-serif`;
        c.textAlign="center"; c.fillText("◀",px,py2+2.5*this.zoom);
      }
    });

    outputs.forEach((mat,i)=>{
      const py2=py+ph*((i+1)/(outputs.length+1));
      const conn=fabrik_verbindungen.some(v=>v.vonInstId===iKey&&v.vonPortIdx===i);
      const farbe=this.MAT_FARBEN[mat]||this.MAT_FARBEN._def;
      c.fillStyle=conn?farbe:"rgba(80,80,80,0.6)";
      c.strokeStyle=conn?"rgba(255,255,255,0.6)":"rgba(150,150,150,0.5)";
      c.lineWidth=1.2;
      c.beginPath(); c.arc(px+pw,py2,r,0,Math.PI*2); c.fill(); c.stroke();
      if (this.zoom>0.7) {
        c.fillStyle="rgba(255,255,255,0.7)"; c.font=`bold ${Math.max(6,7*this.zoom)}px sans-serif`;
        c.textAlign="center"; c.fillText("▶",px+pw,py2+2.5*this.zoom);
      }
    });
  },

  drawGhost(md, tp, ox, oy, T) {
    const tw=md.tileGroesse?.w||2, th=md.tileGroesse?.h||2;
    const px=ox+tp.tx*T, py=oy+tp.ty*T, pw=tw*T, ph=th*T;
    const ok=tp.tx>=0&&tp.ty>=0&&tp.tx+tw<=this.gebaeude.tileBreite&&tp.ty+th<=this.gebaeude.tileHoehe&&!this.collides(tp.tx,tp.ty,tw,th,md.id);
    const c=this.ctx;
    c.globalAlpha=0.5;
    c.fillStyle=ok?"rgba(245,158,11,0.2)":"rgba(220,50,50,0.2)";
    this.rr(c,px+2,py+2,pw-4,ph-4,6); c.fill();
    c.strokeStyle=ok?"#F59E0B":"#DD3333"; c.lineWidth=2;
    c.setLineDash([7,5]); c.stroke(); c.setLineDash([]);
    const vis=this.VISUALS[md.id]||this.VISUALS._default;
    const esz=Math.max(14,Math.min(T*0.5,36));
    c.font=esz+"px serif"; c.textAlign="center";
    c.fillText(vis.ico, px+pw/2, py+ph/2+esz*0.35);
    c.globalAlpha=1;
  },

  // ═══════════ EVENTS ═══════════

  events() {
    const C=this.canvas, s=this;
    C.addEventListener("mousedown",  e=>{e.preventDefault();s.onDown(s.cp(e));});
    C.addEventListener("mousemove",  e=>{s.onMove(s.cp(e));});
    C.addEventListener("mouseup",    e=>{s.onUp(s.cp(e));});
    C.addEventListener("wheel",      e=>{e.preventDefault();s.onWheel(e);},{passive:false});
    C.addEventListener("touchstart", e=>{e.preventDefault();s.onTStart(e);},{passive:false});
    C.addEventListener("touchmove",  e=>{e.preventDefault();s.onTMove(e);}, {passive:false});
    C.addEventListener("touchend",   e=>{e.preventDefault();s.onTEnd(e);},  {passive:false});
  },

  cp(e) {
    const r=this.canvas.getBoundingClientRect();
    return {x:e.clientX-r.left, y:e.clientY-r.top};
  },

  onDown({x,y}) {
    this.mausPos={x,y};

    // Verbinde-Modus: Port prüfen
    if (this.verbindeModus) {
      const port=this.portAt(x,y);
      if (port) {
        if (!this.verbindeVon) { this.verbindeVon={...port,x,y}; return; }
        else { this.connectFinish(port); return; }
      }
    }

    // Verbindungs-Löschen
    for (let v of fabrik_verbindungen) {
      if (v._del&&Math.hypot(x-v._del.x,y-v._del.y)<v._del.r*1.2) {
        fabrik_verbindungen=fabrik_verbindungen.filter(vv=>vv!==v);
        spielstandSpeichern();
        fabrikSidebarAktualisieren();
        return;
      }
    }

    // Platzier-Modus: Canvas-Klick = platzieren
    if (this.platzierMaschine) {
      this.placeHere(x,y);
      return;
    }

    this.drag={aktiv:true,sx:x,sy:y,px0:this.panX,py0:this.panY,moved:false};
  },

  onMove({x,y}) {
    this.mausPos={x,y};
    if (this.drag.aktiv) {
      const dx=x-this.drag.sx, dy=y-this.drag.sy;
      if (Math.abs(dx)+Math.abs(dy)>3) this.drag.moved=true;
      this.panX=this.drag.px0+dx; this.panY=this.drag.py0+dy;
    }
    if (this.platzierMaschine) this.canvas.style.cursor="crosshair";
    else if (this.verbindeModus) this.canvas.style.cursor="cell";
    else this.canvas.style.cursor="grab";
  },

  onUp({x,y}) {
    if (!this.drag.moved&&!this.platzierMaschine&&!this.verbindeModus) this.click(x,y);
    this.drag.aktiv=false;
  },

  onWheel(e) {
    const {x,y}=this.cp(e), f=e.deltaY<0?1.12:0.88;
    this.zoom=Math.max(this.MIN_ZOOM,Math.min(this.MAX_ZOOM,this.zoom*f));
    const nz=this.zoom; // simplified zoom
    this.panX=x-(x-this.panX)*(nz/(nz/f));
    this.panY=y-(y-this.panY)*(nz/(nz/f));
  },

  onTStart(e) {
    if (e.touches.length===1) this.onDown(this.ct(e.touches[0]));
    else if (e.touches.length===2) { this.drag.aktiv=false; this.pinch={aktiv:true,d0:this.td(e.touches),z0:this.zoom}; }
  },
  onTMove(e) {
    if (e.touches.length===1&&!this.pinch.aktiv) this.onMove(this.ct(e.touches[0]));
    else if (e.touches.length===2&&this.pinch.aktiv) this.zoom=Math.max(this.MIN_ZOOM,Math.min(this.MAX_ZOOM,this.pinch.z0*(this.td(e.touches)/this.pinch.d0)));
  },
  onTEnd(e) {
    if (e.touches.length<2) this.pinch.aktiv=false;
    if (e.changedTouches.length) this.onUp(this.ct(e.changedTouches[0]));
  },

  ct(t) { const r=this.canvas.getBoundingClientRect(); return {x:t.clientX-r.left,y:t.clientY-r.top}; },
  td(t) { return Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY); },

  click(x,y) {
    const tp=this.screenToTile(x,y);
    for (let e of this.getMachines()) {
      if (!e.pos) continue;
      const tw=e.md.tileGroesse?.w||2, th=e.md.tileGroesse?.h||2;
      if (tp.tx>=e.pos.tx&&tp.tx<e.pos.tx+tw&&tp.ty>=e.pos.ty&&tp.ty<e.pos.ty+th) {
        this.ausgewaehlt={masId:e.md.id,md:e.md,m:e.m};
        fabrikInfoZeigen(e.md,e.m); return;
      }
    }
    this.ausgewaehlt=null; fabrikInfoAusblenden();
  },

  // ═══════════ PLATZIEREN ═══════════

  startPlace(md) {
    this.platzierMaschine=md; this.verbindeModus=false; this.verbindeVon=null;
    this.ausgewaehlt=null; fabrikInfoAusblenden();
    zeigeNotification("Klicke auf die Fabrikfläche um "+md.name+" zu platzieren","green");
  },

  cancelPlace() { this.platzierMaschine=null; this.canvas.style.cursor="grab"; fabrikSidebarAktualisieren(); },

  placeHere(x,y) {
    const md=this.platzierMaschine; if (!md) return;
    const tp=this.screenToTile(x,y);
    const tw=md.tileGroesse?.w||2, th=md.tileGroesse?.h||2;
    if (tp.tx<0||tp.ty<0||tp.tx+tw>this.gebaeude.tileBreite||tp.ty+th>this.gebaeude.tileHoehe) {
      zeigeNotification("❌ Außerhalb der Fabrik!","red"); return;
    }
    if (this.collides(tp.tx,tp.ty,tw,th,md.id)) { zeigeNotification("❌ Platz belegt!","red"); return; }

    // Finde das richtige Exemplar (erste unplatzierte Instanz dieser Maschine)
    const gebKey = this.gebaeude.id;
    for (let m of installierte_maschinen) {
      if (m.id!==md.id) continue;
      const key=m.instanceId||m.id;
      const posKey=gebKey+"_"+key;
      if (m.fabrikPos && m.fabrikPos[posKey]) continue; // schon platziert
      m.fabrikPos=m.fabrikPos||{};
      m.fabrikPos[posKey]={tx:tp.tx,ty:tp.ty};
      m.platziert=true;
      break;
    }
    zeigeNotification("✅ "+md.name+" platziert!","green");
    spielstandSpeichern();
    this.platzierMaschine=null; this.canvas.style.cursor="grab";
    fabrikSidebarAktualisieren();
  },

  collides(tx,ty,tw,th,skipId) {
    for (let e of this.getMachines()) {
      if (!e.pos||e.md.id===skipId) continue;
      const ew=e.md.tileGroesse?.w||2, eh=e.md.tileGroesse?.h||2;
      if (tx<e.pos.tx+ew&&tx+tw>e.pos.tx&&ty<e.pos.ty+eh&&ty+th>e.pos.ty) return true;
    }
    return false;
  },

  // ═══════════ VERBINDEN ═══════════

  portAt(x,y) {
    const r=Math.max(12,14*this.zoom);  // großzügige Trefferzone
    for (let e of this.getMachines()) {
      if (!e.pos) continue;
      const T=this.TILE*this.zoom, ox=this.panX, oy=this.panY;
      const tw=e.md.tileGroesse?.w||2, th=e.md.tileGroesse?.h||2;
      const px=ox+e.pos.tx*T, py=oy+e.pos.ty*T, pw=tw*T, ph=th*T;
      const inputs=this.getInputMats(e.md), outputs=this.getOutputMats(e.md);
      for (let i=0;i<inputs.length;i++) {
        const py2=py+ph*((i+1)/(inputs.length+1));
        if (Math.hypot(x-px,y-py2)<r) return {masId:e.md.id,instId:e.key||e.md.id,typ:"input",idx:i,mat:inputs[i],x:px,y:py2};
      }
      for (let i=0;i<outputs.length;i++) {
        const py2=py+ph*((i+1)/(outputs.length+1));
        if (Math.hypot(x-(px+pw),y-py2)<r) return {masId:e.md.id,instId:e.key||e.md.id,typ:"output",idx:i,mat:outputs[i],x:px+pw,y:py2};
      }
    }
    // Spezial-Nodes prüfen
    if (this._specialNodes) {
      for (let sn of this._specialNodes) {
        const r2 = Math.max(12, 14*this.zoom);
        if (sn._outPort && Math.hypot(x-sn._outPort.x, y-sn._outPort.y) < r2) {
          return {masId: sn.spec.id, instId: sn.spec.id, typ:"output", idx:0, mat:"*", x:sn._outPort.x, y:sn._outPort.y, special:true};
        }
        if (sn._inPort && Math.hypot(x-sn._inPort.x, y-sn._inPort.y) < r2) {
          return {masId: sn.spec.id, instId: sn.spec.id, typ:"input", idx:0, mat:"*", x:sn._inPort.x, y:sn._inPort.y, special:true};
        }
      }
    }
    return null;
  },

  portCoords(entry,typ,idx,ox,oy,T) {
    const tw=entry.md.tileGroesse?.w||2, th=entry.md.tileGroesse?.h||2;
    const px=ox+entry.pos.tx*T, py=oy+entry.pos.ty*T, pw=tw*T, ph=th*T;
    const arr=typ==="input"?this.getInputMats(entry.md):this.getOutputMats(entry.md);
    const n=Math.min(idx,arr.length-1);
    return {x:px+(typ==="output"?pw:0), y:py+ph*((n+1)/(arr.length+1))};
  },

  connectFinish(portB) {
    const portA=this.verbindeVon;
    this.verbindeVon=null;
    if (!portA||portA.masId===portB.masId) return;
    const von=portA.typ==="output"?portA:portB, nach=portA.typ==="input"?portA:portB;
    if (von.typ!=="output"||nach.typ!=="input") { zeigeNotification("❌ Output → Input!","red"); return; }
    if (fabrik_verbindungen.some(v=>v.vonMasId===von.masId&&v.vonPortIdx===von.idx&&v.nachMasId===nach.masId&&v.nachPortIdx===nach.idx)) {
      zeigeNotification("Bereits verbunden.","red"); return;
    }
    fabrik_verbindungen.push({id:Date.now(),vonMasId:von.masId,vonInstId:von.instId,vonPortIdx:von.idx,nachMasId:nach.masId,nachInstId:nach.instId,nachPortIdx:nach.idx,material:von.mat||nach.mat});
    zeigeNotification("🔗 Verbunden!","green");
    spielstandSpeichern(); fabrikSidebarAktualisieren();
  },

  // ═══════════ HELPER ═══════════

  screenToTile(sx,sy) {
    const T=this.TILE*this.zoom;
    return {tx:Math.floor((sx-this.panX)/T), ty:Math.floor((sy-this.panY)/T)};
  },

  getMachines() {
    if (typeof MASCHINEN==="undefined"||!this.gebaeude) return [];
    // instanceId für Eindeutigkeit, legacy fallback
    let idx=0;
    return installierte_maschinen.map(m=>{
      if (!m.instanceId) m.instanceId=m.id+"_"+idx;
      idx++;
      return m;
    })
    .filter(m=>{const md=MASCHINEN.find(d=>d.id===m.id); return md&&(!md.hallenTyp||md.hallenTyp.includes(this.gebaeude.hallenTyp));})
    .map(m=>{
      const md=MASCHINEN.find(d=>d.id===m.id);
      const key=m.instanceId||m.id;
      const pos=m.fabrikPos?.[this.gebaeude.id+"_"+key]||null;
      return {md,m,pos,key};
    });
  },

  getInputMats(md) {
    if (typeof REZEPTE==="undefined") return [];
    const m=installierte_maschinen.find(m=>m.id===md.id);
    const rezId=m?.aktivesRezept;
    const rez=rezId?REZEPTE.find(r=>r.id===rezId):REZEPTE.find(r=>r.maschine===md.id);
    return rez?rez.inputs.map(i=>i.material):[];
  },

  getOutputMats(md) {
    if (typeof REZEPTE==="undefined") return [];
    const rez=REZEPTE.find(r=>r.maschine===md.id);
    return rez?rez.outputs.map(o=>o.material):[];
  },

  rr(c,x,y,w,h,r) {
    c.beginPath(); c.moveTo(x+r,y); c.lineTo(x+w-r,y); c.quadraticCurveTo(x+w,y,x+w,y+r);
    c.lineTo(x+w,y+h-r); c.quadraticCurveTo(x+w,y+h,x+w-r,y+h); c.lineTo(x+r,y+h);
    c.quadraticCurveTo(x,y+h,x,y+h-r); c.lineTo(x,y+r); c.quadraticCurveTo(x,y,x+r,y); c.closePath();
  }
};

// ══════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════

function fabrikkarteOeffnen(gebaeudeId, gsId) {
  const geb = typeof GEBAEUDE!=="undefined"?GEBAEUDE.find(g=>g.id===gebaeudeId):null;
  if (!geb) return;
  let modal = document.getElementById("modal-fabrikkarte");
  if (!modal) { modal=document.createElement("div"); modal.id="modal-fabrikkarte"; document.body.appendChild(modal); }

  modal.innerHTML=`
    <div class="fk-wrap">
      <header class="fk-head">
        <div class="fk-head-l">
          <span class="fk-geb-emo">${geb.emoji||"🏭"}</span>
          <div>
            <div class="fk-geb-nm">${geb.name}</div>
            <div class="fk-geb-sb">${geb.tileBreite}×${geb.tileHoehe} Tiles · max ${geb.maxMaschinen||0} Maschinen</div>
          </div>
        </div>
        <div class="fk-head-r">
          <button class="fk-ib" onclick="FK.fit()" title="Zentrieren">⌖</button>
          <button class="fk-ib" id="fk-verb-btn" onclick="fabrikVerbindeModus()" title="Verbinden">🔗</button>
          <button class="fk-ib" onclick="FK.zoom=Math.min(FK.MAX_ZOOM,FK.zoom*1.2)">+</button>
          <button class="fk-ib" onclick="FK.zoom=Math.max(FK.MIN_ZOOM,FK.zoom*0.8)">−</button>
          <button class="fk-ib fk-ib-close" onclick="fabrikkarteSchliessen()">✕</button>
        </div>
      </header>
      <div class="fk-body">
        <canvas id="fk-c" class="fk-canvas"></canvas>
        <aside class="fk-side" id="fk-side">
          <div class="fk-side-inner">
            <div id="fk-list"></div>
            <div id="fk-info" style="display:none"></div>
          </div>
        </aside>
      </div>
    </div>`;

  modal.style.display="flex";

  // Canvas-Größe korrekt setzen nach Render
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      const canvas = document.getElementById("fk-c");
      if (!canvas) return;
      const sideEl = document.getElementById("fk-side");
      const headEl = document.querySelector(".fk-head");
      const sideW  = sideEl ? sideEl.offsetWidth  : 220;
      const headH  = headEl ? headEl.offsetHeight : 52;
      const isMob  = window.innerWidth < 768;

      if (isMob) {
        canvas.width  = window.innerWidth;
        canvas.height = Math.floor(window.innerHeight * 0.52);
      } else {
        canvas.width  = Math.max(300, window.innerWidth - sideW);
        canvas.height = Math.max(300, window.innerHeight - headH);
      }

      FK.init(canvas, geb, gsId);
      fabrikSidebarAktualisieren();
    });
  });
}

function fabrikkarteSchliessen() {
  FK.destroy();
  const m=document.getElementById("modal-fabrikkarte");
  if (m) m.style.display="none";
}

function fabrikVerbindeModus() {
  FK.verbindeModus=!FK.verbindeModus;
  FK.verbindeVon=null;
  FK.platzierMaschine=null;
  const btn=document.getElementById("fk-verb-btn");
  if (btn) {
    btn.classList.toggle("fk-ib-aktiv", FK.verbindeModus);
    btn.title=FK.verbindeModus?"Verbinde-Modus: Output → Input klicken":"Verbinden";
  }
  if (FK.verbindeModus) zeigeNotification("🔗 Klicke einen Ausgang (▶), dann einen Eingang (◀)","green");
  else zeigeNotification("Verbinde-Modus beendet","green");
  fabrikInfoAusblenden();
}

function fabrikSidebarAktualisieren() {
  const liste=document.getElementById("fk-list");
  if (!liste) return;
  const mas=FK.getMachines();
  const unp=mas.filter(m=>!m.pos), platz=mas.filter(m=>m.pos);
  let h="";

  // Wareneingang
  if (unp.length) {
    h+=`<div class="fk-sec-label">📦 Wareneingang (${unp.length})</div>`;
    h+=`<p class="fk-hint">Klicke "Platzieren", dann auf die Fabrikfläche.</p>`;
    for (let e of unp) {
      const v=FK.VISUALS[e.md.id]||FK.VISUALS._default;
      h+=`<div class="fk-item fk-item-wp">
        <span class="fk-i-ico">${v.ico}</span>
        <div class="fk-i-inf">
          <b>${e.md.name}</b>
          <span>${e.md.tileGroesse?.w||2}×${e.md.tileGroesse?.h||2} Tiles</span>
        </div>
        <button class="fk-btn-place" onclick="FK.startPlace(MASCHINEN.find(m=>m.id==='${e.md.id}'));fabrikSidebarAktualisieren()">Platzieren →</button>
      </div>`;
    }
  }

  // Platziert
  if (platz.length) {
    h+=`<div class="fk-sec-label">✅ Platziert (${platz.length})</div>`;
    for (let e of platz) {
      const v=FK.VISUALS[e.md.id]||FK.VISUALS._default;
      const inp=FK.getInputMats(e.md);
      const alleV=inp.every((_,i)=>fabrik_verbindungen.some(vv=>vv.nachMasId===e.md.id&&vv.nachPortIdx===i));
      const led=e.m?.laeuft?"🟢":!alleV&&inp.length?"🟡":"🔴";
      h+=`<div class="fk-item" onclick="FK.ausgewaehlt={masId:'${e.md.id}',md:FK.getMachines().find(m=>m.md.id==='${e.md.id}').md,m:FK.getMachines().find(m=>m.md.id==='${e.md.id}').m};fabrikInfoZeigen(FK.ausgewaehlt.md,FK.ausgewaehlt.m)">
        <span class="fk-i-ico">${v.ico}</span>
        <div class="fk-i-inf">
          <b>${e.md.name}</b>
          <span>${led} ${e.m?.laeuft?"Läuft":alleV||!inp.length?"Bereit":"Verbindung fehlt"}</span>
        </div>
      </div>`;
    }
  }

  if (!mas.length) h=`<div class="fk-leer">Keine Maschinen für diese Halle.<br>Kaufe Maschinen im Shop.</div>`;

  // Platzier-Modus Abbruch-Banner
  if (FK.platzierMaschine) {
    h=`<div class="fk-place-banner">
      <div>🎯 <b>${FK.platzierMaschine.name}</b><br>Klicke auf die Fabrikfläche</div>
      <button onclick="FK.cancelPlace();fabrikSidebarAktualisieren()">Abbrechen</button>
    </div>`+h;
  }

  liste.innerHTML=h;
}

function fabrikInfoZeigen(md, m) {
  const info=document.getElementById("fk-info"); if (!info) return;
  const v=FK.VISUALS[md.id]||FK.VISUALS._default;
  const laueft=m?.laeuft;
  const inp=FK.getInputMats(md);
  const alleV=inp.every((_,i)=>fabrik_verbindungen.some(vv=>vv.nachMasId===md.id&&vv.nachPortIdx===i));
  const rez=typeof REZEPTE!=="undefined"?REZEPTE.find(r=>r.id===m?.aktivesRezept):null;

  info.style.display="block";
  info.innerHTML=`
    <div class="fk-info-hd">
      <span style="font-size:22px">${v.ico}</span>
      <div>
        <div class="fk-info-nm">${md.name}</div>
        <div style="font-size:11px;color:${laueft?"var(--green)":!alleV&&inp.length?"var(--amber)":"var(--red)"};font-weight:700">
          ${laueft?"● Läuft":!alleV&&inp.length?"⚠ Verbindung fehlt":"● Gestoppt"}
        </div>
      </div>
    </div>
    ${rez?`<div class="fk-info-rez">📋 ${rez.name}</div>`:""}
    <div class="fk-info-btns">
      <button class="fk-btn-prim" onclick="fabrikToggle('${md.id}')">${laueft?"⏸ Stoppen":"▶ Starten"}</button>
      <button class="fk-btn-sec"  onclick="fabrikkarteVerbindeModus?fabrikkarteVerbindeModus():fabrikVerbindeModus()">🔗 Verbinden</button>
      <button class="fk-btn-sec"  onclick="fabrikVerschieben('${md.id}')">↔ Verschieben</button>
    </div>`;
}

function fabrikInfoAusblenden() {
  const i=document.getElementById("fk-info"); if (i) i.style.display="none";
}

function fabrikToggle(masId) {
  const sel=FK.ausgewaehlt;
  const m=(sel&&sel.masId===masId)?sel.m:installierte_maschinen.find(m=>m.id===masId);
  if (!m) return;
  const md=MASCHINEN.find(d=>d.id===masId);
  const iKey=m.instanceId||m.id;
  const inp=FK.getInputMats(md);
  const alleV=inp.length===0||inp.every((_,i)=>fabrik_verbindungen.some(v=>v.nachInstId===iKey&&v.nachPortIdx===i));
  if (!m.laeuft&&!alleV) { zeigeNotification("⚠ Erst alle Inputs verbinden! (🔗)","red"); return; }
  if (!m.laeuft&&m.platziert===false) { zeigeNotification("⚠ Erst platzieren!","red"); return; }
  if (m.laeuft) { if (typeof maschineStoppen==="function") maschineStoppen(m); }
  else          { if (typeof maschineStarten ==="function") maschineStarten(m); }
  setTimeout(()=>{const md=MASCHINEN.find(d=>d.id===masId);if (md) {fabrikInfoZeigen(md,m);fabrikSidebarAktualisieren();}},100);
}

function fabrikVerschieben(masId) {
  const m=installierte_maschinen.find(m=>m.id===masId); if (!m) return;
  const vKey=(m.instanceId||m.id); const vPosKey=FK.gebaeude.id+"_"+vKey;
  if (m.fabrikPos) delete m.fabrikPos[vPosKey];
  m.platziert=false;
  fabrikInfoAusblenden(); fabrikSidebarAktualisieren();
  zeigeNotification("↔ "+masId+" in Wareneingang zurückgelegt","green");
}
