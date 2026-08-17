// ══════════════════════════════════════════════════════
// FABRIKKARTE v7 — Neu konzipiert, intuitiv
//
// INTERAKTIONSMODELL (kein Mode-Switching):
// • Unplatzierte Maschinen → Dock unten, Tap = direkt ziehen
// • Maschine tippen = auswählen + Info-Sheet unten
// • Port einer ausgewählten Maschine tippen = Verbinden-Drag
//   → auf andere Maschine ziehen → Verbindung erscheint
// • Doppeltippen auf Maschine = Start/Stop Toggle
// • Pinch = Zoom, 1-Finger-Drag = Pan
// ══════════════════════════════════════════════════════

let fabrik_verbindungen = [];

const FK = {
  canvas: null, ctx: null, geb: null, gsId: null,
  TILE: 56, zoom: 1.0, panX: 0, panY: 0,
  MIN_ZOOM: 0.25, MAX_ZOOM: 2.5,

  // Interaktions-State
  sel:      null,   // ausgewählte Maschine { entry, idx }
  drag:     null,   // Pan-Drag { sx,sy,px0,py0,moved }
  portDrag:    null,   // Port-Drag
  dockDrag:    null,   // Dock-Drag
  wpDrag:      null,   // Waypoint-Drag { conn, idx }
  pinch:       null,
  maus:        { x:0, y:0 },
  lastTap:     0,
  lastTapPos:  null,

  t: 0, frame: null,

  COLORS: {
    schmelzofen:      ["#9B3A1E","#5A1E0A"], steinbrecher: ["#4A4A4A","#2A2A2A"],
    oelraffinerie:    ["#3A2510","#1E1208"], formerei:      ["#103478","#081C42"],
    kabelwerk:        ["#381070","#1E0838"], motorenfabrik: ["#784010","#401C08"],
    betonwerk:        ["#3A3A3A","#202020"], kraftwerk_kohle:["#151515","#080808"],
    labor:            ["#104830","#082018"], lagerhalle:    ["#284018","#141E08"],
    elektronikfabrik: ["#102878","#081440"], titanschmiede: ["#183848","#0C1C24"],
    carbonfaserwerk:  ["#101010","#080808"], montagewerk_2: ["#503010","#281808"],
    kernkraftwerk:    ["#104818","#082410"], _def:          ["#1E2C3A","#0E161E"]
  },
  GLOW: {
    schmelzofen:"#E8501A",steinbrecher:"#888",oelraffinerie:"#A07820",
    formerei:"#3878CC",kabelwerk:"#8840DD",motorenfabrik:"#DD8030",
    betonwerk:"#707070",kraftwerk_kohle:"#FFDD00",labor:"#30CC70",
    lagerhalle:"#70B030",elektronikfabrik:"#3358CC",titanschmiede:"#3090CC",
    carbonfaserwerk:"#444",montagewerk_2:"#B06030",kernkraftwerk:"#00DD70",_def:"#3878AA"
  },
  ICO: {
    schmelzofen:"🔥",steinbrecher:"⛏️",oelraffinerie:"🛢️",formerei:"⚙️",
    kabelwerk:"🔌",motorenfabrik:"🔧",betonwerk:"🧱",kraftwerk_kohle:"⚡",
    labor:"🔬",lagerhalle:"📦",elektronikfabrik:"💾",titanschmiede:"🔷",
    carbonfaserwerk:"🖤",montagewerk_2:"🏗️",kernkraftwerk:"⚛️",_def:"⚙️"
  },
  MAT_COL: {
    eisenerz:"#8B4513",eisenplatte:"#9098A8",kupfererz:"#CC5500",kupferplatte:"#CD7F32",
    stahl:"#607888",kohle:"#2A2A2A",sand:"#D4B870",kalkstein:"#D8D0C0",glas:"#88CCEE",
    zement:"#A09880",rohoel:"#1A120A",plastik:"#DDCC00",gummi:"#282828",zahnrad:"#787888",
    kupferkabel:"#CC8833",stahltraeger:"#506070",betonplatte:"#808878",schaltkreis:"#00BB55",
    stahlrohr:"#506070",motor_klein:"#3A5870",elektronikmodul:"#2255BB",_def:"#446688"
  },

  DOCK_H: 0, // Höhe des Docks unten

  // ═══ INIT ═══
  init(canvas, geb, gsId) {
    this.canvas = canvas; this.ctx = canvas.getContext("2d");
    this.geb = geb; this.gsId = gsId;
    this.sel = null; this.portDrag = null; this.dockDrag = null;
    this._sn = null; // special nodes cache
    this.fit(); this.ev(); this.loop();

    // Fenstergröße/Bildschirmdrehung: Canvas-Pixelgröße nachziehen
    this._resize = () => {
      if (!this.canvas) return;
      const main = this.canvas.parentElement;
      if (!main) return;
      this.canvas.width  = main.clientWidth;
      this.canvas.height = main.clientHeight;
    };
    window.addEventListener("resize", this._resize);
    window.addEventListener("orientationchange", this._resize);
  },

  destroy() {
    if (this.frame) cancelAnimationFrame(this.frame);
    if (this._resize) {
      window.removeEventListener("resize", this._resize);
      window.removeEventListener("orientationchange", this._resize);
      this._resize = null;
    }
    this.canvas = null;
  },

  fit() {
    if (!this.geb || !this.canvas) return;
    const W = this.canvas.width, H = this.canvas.height - this.DOCK_H;
    const pad = 24;
    this.zoom = Math.max(0.3, Math.min(
      (W - pad*2) / (this.geb.tileBreite * this.TILE),
      (H - pad*2) / (this.geb.tileHoehe  * this.TILE), 1.3
    ));
    const bW = this.geb.tileBreite * this.TILE * this.zoom;
    const bH = this.geb.tileHoehe  * this.TILE * this.zoom;
    this.panX = Math.round((W - bW) / 2);
    this.panY = Math.round((H - bH) / 2);
  },

  // ═══ LOOP ═══
  loop() {
    const s = this;
    let frameCount = 0;
    function f(ts) {
      s.t = ts/1000; s.draw();
      // Verbindungs-Check ~1x/Sek statt jeden Frame (Performance + keine Spam-Meldungen)
      frameCount++;
      if (frameCount % 60 === 0) s.pruneInvalidConnections();
      s.frame = requestAnimationFrame(f);
    }
    this.frame = requestAnimationFrame(f);
  },

  // Entfernt Verbindungen, deren Port nach einem Rezeptwechsel nicht mehr
  // existiert oder ein anderes Material führt. Läuft unabhängig davon, wo
  // das Rezept gewechselt wurde (Shop/Verwalten/etc.) — kein externer Hook nötig.
  pruneInvalidConnections() {
    if (!fabrik_verbindungen.length) return;
    const mas = this.machines();
    const vorher = fabrik_verbindungen.length;

    fabrik_verbindungen = fabrik_verbindungen.filter(v => {
      const vonSpecial  = v.vonInstId  === "__lager__" || v.vonInstId  === "__export__";
      const nachSpecial = v.nachInstId === "__lager__" || v.nachInstId === "__export__";

      if (!nachSpecial) {
        const nachE = mas.find(m => m.key === v.nachInstId);
        if (nachE) {
          const inp = this.getInpMats(nachE.md);
          if (v.nachPortIdx >= inp.length) return false;
          if (v.material !== "*" && inp[v.nachPortIdx] !== v.material) return false;
        }
      }
      if (!vonSpecial) {
        const vonE = mas.find(m => m.key === v.vonInstId);
        if (vonE) {
          const out = this.getOutMats(vonE.md);
          if (v.vonPortIdx >= out.length) return false;
          if (v.material !== "*" && out[v.vonPortIdx] !== v.material) return false;
        }
      }
      return true;
    });

    if (fabrik_verbindungen.length < vorher) {
      const anzahl = vorher - fabrik_verbindungen.length;
      if (typeof zeigeNotification === "function") {
        zeigeNotification("🔌 " + anzahl + " Verbindung(en) durch Rezeptwechsel gelöst", "red");
      }
      if (typeof spielstandSpeichern === "function") spielstandSpeichern();
      fabrikInfoAktualisieren();
    }
  },

  // ═══ DRAW ═══
  draw() {
    if (!this.canvas) return;
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const T = this.TILE * this.zoom;
    const ox = this.panX, oy = this.panY;
    const bW = this.geb.tileBreite * T, bH = this.geb.tileHoehe * T;

    c.clearRect(0,0,W,H);

    // Hintergrund
    c.fillStyle = "#06080D"; c.fillRect(0,0,W,H);

    // Fabrikboden
    c.fillStyle = "#0C1018"; c.fillRect(ox,oy,bW,bH);

    // Boden-Kacheln
    for (let tx=0;tx<this.geb.tileBreite;tx++)
      for (let ty=0;ty<this.geb.tileHoehe;ty++)
        if ((tx+ty)%2===0) {
          c.fillStyle="rgba(255,255,255,0.018)";
          c.fillRect(ox+tx*T,oy+ty*T,T,T);
        }

    // Grid
    c.strokeStyle="rgba(255,255,255,0.055)"; c.lineWidth=0.5;
    for (let tx=0;tx<=this.geb.tileBreite;tx++) {
      c.beginPath(); c.moveTo(ox+tx*T,oy); c.lineTo(ox+tx*T,oy+bH); c.stroke();
    }
    for (let ty=0;ty<=this.geb.tileHoehe;ty++) {
      c.beginPath(); c.moveTo(ox,oy+ty*T); c.lineTo(ox+bW,oy+ty*T); c.stroke();
    }

    // Rand
    c.strokeStyle="rgba(245,158,11,0.4)"; c.lineWidth=1.5;
    c.strokeRect(ox,oy,bW,bH);

    // Spezial-Nodes (Lager + Export)
    this.drawSpecialNodes(ox,oy,bW,bH);

    // Verbindungen
    this.drawConns(ox,oy,T);

    // Platzierte Maschinen
    for (let e of this.machines()) {
      if (e.pos) this.drawMachine(e, ox, oy, T);
    }

    // Port-Drag Vorschau
    if (this.portDrag) {
      const pd = this.portDrag;
      c.strokeStyle="rgba(245,158,11,0.8)"; c.lineWidth=3; c.setLineDash([8,5]);
      c.beginPath(); c.moveTo(pd.x,pd.y);
      c.bezierCurveTo((pd.x+this.maus.x)/2,pd.y,(pd.x+this.maus.x)/2,this.maus.y,this.maus.x,this.maus.y);
      c.stroke(); c.setLineDash([]);
      // Cursor-Kreis
      c.fillStyle="rgba(245,158,11,0.6)"; c.beginPath();
      c.arc(this.maus.x,this.maus.y,10,0,Math.PI*2); c.fill();
    }

    // Dock-Drag Geist
    if (this.dockDrag) {
      const tp = this.screenToTile(this.maus.x, this.maus.y);
      this.drawGhost(this.dockDrag.md, tp, ox, oy, T);
    }

  },

  // ═══ SPEZIAL NODES ═══
  drawSpecialNodes(ox,oy,bW,bH) {
    const c = this.ctx;
    const nW = Math.max(52, 56*this.zoom), nH = Math.max(70, 76*this.zoom);

    const specs = [
      { id:"__lager__",  label:"Lager",  ico:"📦", col:"#1A4A2A", glow:"#33CC55", x: ox-nW-8,     y: oy+bH/2-nH/2, outPort:true, inPort:true },
      { id:"__export__", label:"Export", ico:"🚢", col:"#1A2A4A", glow:"#3355CC", x: ox+bW+8,     y: oy+bH/2-nH/2, outPort:false,inPort:true }
    ];

    this._sn = [];

    for (let s of specs) {
      const isSel = this.sel && this.sel.specId === s.id;

      c.shadowColor=s.glow; c.shadowBlur=isSel?16:6;
      const g=c.createLinearGradient(s.x,s.y,s.x,s.y+nH);
      g.addColorStop(0,s.col); g.addColorStop(1,s.col+"88");
      this.rr(c,s.x,s.y,nW,nH,8); c.fillStyle=g; c.fill();
      c.strokeStyle=isSel?"#F59E0B":s.glow; c.lineWidth=isSel?2:1.2; c.stroke();
      c.shadowBlur=0;

      // Emoji
      const esz=Math.max(18,22*this.zoom);
      c.font=esz+"px serif"; c.textAlign="center";
      c.fillText(s.ico, s.x+nW/2, s.y+nH*0.5+esz*0.3);
      c.font=`bold ${Math.max(8,9*this.zoom)}px 'IBM Plex Sans',sans-serif`;
      c.fillStyle="rgba(255,255,255,0.65)"; c.textAlign="center";
      c.fillText(s.label, s.x+nW/2, s.y+nH-7*this.zoom);

      const pr = Math.max(8,10*this.zoom);
      const ports = [];
      if (s.outPort) {
        const px=s.x+nW, py=s.y+nH*0.4;
        c.fillStyle=s.glow; c.strokeStyle="rgba(255,255,255,0.6)"; c.lineWidth=1.5;
        c.beginPath(); c.arc(px,py,pr,0,Math.PI*2); c.fill(); c.stroke();
        c.fillStyle="rgba(255,255,255,0.9)"; c.font=`bold ${Math.max(7,8*this.zoom)}px sans-serif`; c.textAlign="center";
        c.fillText("▶",px,py+3*this.zoom);
        ports.push({typ:"output",idx:0,mat:"*",x:px,y:py});
      }
      if (s.inPort) {
        const px=s.id==="__export__"?s.x:s.x+nW, py=s.y+nH*0.65;
        c.fillStyle=s.glow+"99"; c.strokeStyle="rgba(255,255,255,0.4)"; c.lineWidth=1.2;
        c.beginPath(); c.arc(px,py,pr,0,Math.PI*2); c.fill(); c.stroke();
        c.fillStyle="rgba(255,255,255,0.8)"; c.font=`bold ${Math.max(7,8*this.zoom)}px sans-serif`; c.textAlign="center";
        c.fillText("◀",px,py+3*this.zoom);
        ports.push({typ:"input",idx:0,mat:"*",x:px,y:py});
      }
      this._sn.push({...s,w:nW,h:nH,ports});
    }
  },

  // ═══ VERBINDUNGEN ═══
  drawConns(ox,oy,T) {
    const mas = this.machines();
    for (let v of fabrik_verbindungen) { try {
      const vonE  = v.vonInstId  ?mas.find(m=>m.key===v.vonInstId) :mas.find(m=>m.md.id===v.vonMasId);
      const nachE = v.nachInstId ?mas.find(m=>m.key===v.nachInstId):mas.find(m=>m.md.id===v.nachMasId);
      const vonSN  = this._sn?.find(n=>n.id===v.vonInstId);
      const nachSN = this._sn?.find(n=>n.id===v.nachInstId);
      if (!vonE&&!vonSN) continue;
      if (!nachE&&!nachSN) continue;
      if (vonE&&!vonE.pos) continue;
      if (nachE&&!nachE.pos) continue;

      const p1 = vonSN  ? vonSN.ports.find(p=>p.typ==="output")  : this.portXY(vonE, "output",v.vonPortIdx, ox,oy,T);
      const p2 = nachSN ? nachSN.ports.find(p=>p.typ==="input")  : this.portXY(nachE,"input", v.nachPortIdx,ox,oy,T);
      if (!p1||!p2) continue;

      const mat   = v.material||"_def";
      const farbe = this.MAT_COL[mat]||this.MAT_COL._def;
      const laueft = vonE?.m?.laeuft || false;
      const c = this.ctx;

      // Waypoints in Pixel-Koordinaten
      const wps=(v.waypoints||[]).map(wp=>({x:ox+wp.tx*T+T/2,y:oy+wp.ty*T+T/2}));
      const pts=[p1,...wps,p2];

      // Pfad durch alle Punkte (Catmull-Rom → Bézier)
      const drawPath=(dy=0)=>{
        c.beginPath(); c.moveTo(pts[0].x,pts[0].y+dy);
        for (let i=0;i<pts.length-1;i++) {
          const a=pts[Math.max(0,i-1)], p=pts[i], q=pts[i+1], b=pts[Math.min(pts.length-1,i+2)];
          const cp1x=p.x+(q.x-a.x)/6, cp1y=p.y+(q.y-a.y)/6+dy;
          const cp2x=q.x-(b.x-p.x)/6, cp2y=q.y-(b.y-p.y)/6+dy;
          c.bezierCurveTo(cp1x,cp1y,cp2x,cp2y,q.x,q.y+dy);
        }
      };

      // Schatten
      c.strokeStyle="rgba(0,0,0,0.5)"; c.lineWidth=6*this.zoom;
      drawPath(2); c.stroke();

      // Rohr
      c.strokeStyle=farbe; c.lineWidth=4.5*this.zoom;
      drawPath(0); c.stroke();

      // Glanz
      c.strokeStyle="rgba(255,255,255,0.18)"; c.lineWidth=1.5*this.zoom;
      drawPath(-1); c.stroke();

      // Fluss-Partikel entlang Linie
      if (laueft) {
        const f=(this.t*0.4+fabrik_verbindungen.indexOf(v)*0.25)%1;
        const seg=Math.floor(f*(pts.length-1)), sf=f*(pts.length-1)-seg;
        if (seg<pts.length-1) {
          const bx=pts[seg].x+(pts[seg+1].x-pts[seg].x)*sf;
          const by=pts[seg].y+(pts[seg+1].y-pts[seg].y)*sf;
          c.fillStyle="#fff"; c.shadowColor="#fff"; c.shadowBlur=4;
          c.beginPath(); c.arc(bx,by,3*this.zoom,0,Math.PI*2); c.fill();
          c.shadowBlur=0;
        }
      }

      // Waypoint-Handles zeichnen
      v._hitPts=[];
      for (let i=0;i<wps.length;i++) {
        const wp=wps[i], wr=7*this.zoom;
        const isDragging=this.wpDrag?.conn===v&&this.wpDrag?.idx===i;
        c.fillStyle=isDragging?"#F59E0B":"rgba(255,255,255,0.35)";
        c.strokeStyle=isDragging?"#F59E0B":"rgba(255,255,255,0.6)"; c.lineWidth=1.5;
        c.beginPath(); c.arc(wp.x,wp.y,wr,0,Math.PI*2); c.fill(); c.stroke();
        // × zum Löschen
        c.fillStyle="rgba(255,255,255,0.8)"; c.font=`bold ${Math.max(7,8*this.zoom)}px sans-serif`; c.textAlign="center";
        c.fillText("×",wp.x,wp.y+3*this.zoom);
        v._hitPts.push({x:wp.x,y:wp.y,r:wr*1.5,idx:i});
      }

      // "+ Punkt" entlang der Mitte jedes Segments anzeigen (für Hinzufügen)
      for (let i=0;i<pts.length-1;i++) {
        const mx=(pts[i].x+pts[i+1].x)/2, my=(pts[i].y+pts[i+1].y)/2;
        const pr=5*this.zoom;
        c.fillStyle="rgba(245,158,11,0.25)"; c.strokeStyle="rgba(245,158,11,0.5)"; c.lineWidth=1;
        c.beginPath(); c.arc(mx,my,pr,0,Math.PI*2); c.fill(); c.stroke();
        c.fillStyle="rgba(245,158,11,0.7)"; c.font=`bold ${Math.max(6,7*this.zoom)}px sans-serif`; c.textAlign="center";
        c.fillText("+",mx,my+2.5*this.zoom);
        v._hitPts=v._hitPts||[];
        v._hitPts.push({x:mx,y:my,r:pr*2,addAfterSeg:i});
      }

      // Löschen-Button
      const mx2=(p1.x+p2.x)/2, my2=(p1.y+p2.y)/2;
      const dr=7*this.zoom;
      c.fillStyle="rgba(180,30,30,0.85)";
      c.beginPath(); c.arc(mx2,my2,dr,0,Math.PI*2); c.fill();
      c.fillStyle="#fff"; c.font=`bold ${Math.max(8,10*this.zoom)}px sans-serif`; c.textAlign="center";
      c.fillText("×",mx2,my2+3*this.zoom);
      v._del={x:mx2,y:my2,r:dr*1.5};
    } catch(e){} }
  },

  // ═══ MASCHINE ═══
  drawMachine(entry, ox, oy, T) {
    const c=this.ctx, md=entry.md, m=entry.m, pos=entry.pos;
    const rawTw=md.tileGroesse?.w||2, rawTh=md.tileGroesse?.h||2;
    const rot=(m.fabrikRot||0);  // 0=0°,1=90°,2=180°,3=270°
    // Bei 90/270°: Breite und Höhe tauschen
    const tw=rot%2===0?rawTw:rawTh, th=rot%2===0?rawTh:rawTw;
    const cl=this.COLORS[md.id]||this.COLORS._def;
    const glow=this.GLOW[md.id]||this.GLOW._def;
    const ico=this.ICO[md.id]||this.ICO._def;
    const px=ox+pos.tx*T, py=oy+pos.ty*T, pw=tw*T, ph=th*T;
    const r=Math.min(10*this.zoom,pw*0.1);
    const sel=this.sel?.key===entry.key;
    const laueft=m?.laeuft;
    const inp=this.getInpMats(md);
    const iKey=entry.key;
    const alleV=inp.length===0||inp.every((_,i)=>fabrik_verbindungen.some(v=>(v.nachInstId===iKey||v.nachMasId===md.id)&&v.nachPortIdx===i));

    if (laueft) { c.shadowColor=glow; c.shadowBlur=16+Math.sin(this.t*1.8)*5; }
    else c.shadowBlur=0;

    // Rotation um Maschinen-Mittelpunkt
    const cx=px+pw/2, cy=py+ph/2;
    if (rot>0) { c.save(); c.translate(cx,cy); c.rotate(rot*Math.PI/2); c.translate(-cx,-cy); }

    // Körper
    const g=c.createLinearGradient(px,py,px,py+ph);
    g.addColorStop(0,cl[0]); g.addColorStop(1,cl[1]);
    this.rr(c,px+2,py+2,pw-4,ph-4,r); c.fillStyle=g; c.fill();

    c.strokeStyle=sel?"#F59E0B":laueft?glow:"rgba(255,255,255,0.1)";
    c.lineWidth=sel?3:laueft?1.5:0.8; c.shadowBlur=0; c.stroke();

    // Inneres Detail (Lüftungsschlitze)
    if (pw>50&&ph>50) {
      const sw=pw*0.35, sx=px+(pw-sw)/2;
      for (let i=0;i<3;i++) {
        c.fillStyle="rgba(0,0,0,0.3)";
        c.fillRect(sx+i*(sw/3+1), py+6, sw/4, Math.min(6*this.zoom,ph*0.07));
      }
    }

    // Icon
    const esz=Math.max(16,Math.min(T*0.6,40));
    c.font=esz+"px serif"; c.textAlign="center"; c.shadowBlur=0;
    c.fillText(ico, px+pw/2, py+ph/2+esz*0.35);

    // Name
    if (pw>55&&ph>48) {
      c.font=`bold ${Math.max(8,9*this.zoom)}px 'IBM Plex Sans',sans-serif`;
      c.fillStyle="rgba(255,255,255,0.6)"; c.textAlign="center";
      c.fillText(md.name.length>12?md.name.slice(0,11)+"…":md.name, px+pw/2, py+14*this.zoom);
    }

    // Rauch
    if (laueft&&pw>45) {
      c.font=Math.max(10,12*this.zoom)+"px serif";
      c.globalAlpha=0.35+Math.sin(this.t*2.5)*0.2;
      c.fillText("💨", px+pw*0.7, py-6+Math.sin(this.t*2.2+entry.idx)*5);
      c.globalAlpha=1;
    }

    // Status-LED
    const ledCol=laueft?glow:!alleV&&inp.length?"#F59E0B":"#333";
    c.fillStyle=ledCol;
    if (laueft){c.shadowColor=ledCol;c.shadowBlur=5;}
    c.beginPath(); c.arc(px+pw-9*this.zoom,py+9*this.zoom,3.5*this.zoom,0,Math.PI*2); c.fill();
    c.shadowBlur=0;

    // Rotation zurücksetzen vor Ports (Ports immer in Weltkoordinaten)
    if (rot>0) c.restore();

    // Ports (nur wenn ausgewählt oder Port-Drag aktiv)
    if (sel || this.portDrag) {
      this.drawPorts(entry, ox, oy, T, sel);
    }

    // Auswahl-Rahmen
    if (sel) {
      c.strokeStyle="#F59E0B"; c.lineWidth=2.5; c.setLineDash([6,4]);
      this.rr(c,px-2,py-2,pw+4,ph+4,r+2); c.stroke(); c.setLineDash([]);
    }
  },

  // Einzige Quelle für Port-Positionen (rotationsbewusst) — wird von
  // Zeichnen UND Hit-Testing (findPort) benutzt, damit beides immer übereinstimmt.
  drawPorts(entry, ox, oy, T, big) {
    const c=this.ctx;
    const r=big?Math.max(9,12*this.zoom):Math.max(5,6*this.zoom);
    const inp=this.getInpMats(entry.md), out=this.getOutMats(entry.md);
    const iKey=entry.key;

    inp.forEach((mat,i)=>{
      const p=this.portXY(entry,"input",i,ox,oy,T);
      const conn=fabrik_verbindungen.some(v=>(v.nachInstId===iKey||v.nachMasId===entry.md.id)&&v.nachPortIdx===i);
      const col=this.MAT_COL[mat]||this.MAT_COL._def;
      c.fillStyle=conn?col:"rgba(200,50,50,0.8)";
      c.strokeStyle=conn?"rgba(255,255,255,0.6)":"#AA2222"; c.lineWidth=1.5;
      c.beginPath(); c.arc(p.x,p.y,r,0,Math.PI*2); c.fill(); c.stroke();
      if (big&&r>7) {
        c.fillStyle="rgba(255,255,255,0.8)"; c.font=`bold ${Math.max(7,9*this.zoom)}px sans-serif`; c.textAlign="center";
        c.fillText("◀",p.x,p.y+3*this.zoom);
      }
    });

    out.forEach((mat,i)=>{
      const p=this.portXY(entry,"output",i,ox,oy,T);
      const conn=fabrik_verbindungen.some(v=>(v.vonInstId===iKey||v.vonMasId===entry.md.id)&&v.vonPortIdx===i);
      const col=this.MAT_COL[mat]||this.MAT_COL._def;
      c.fillStyle=conn?col:"rgba(80,80,80,0.7)";
      c.strokeStyle=conn?"rgba(255,255,255,0.6)":"rgba(150,150,150,0.4)"; c.lineWidth=1.5;
      c.beginPath(); c.arc(p.x,p.y,r,0,Math.PI*2); c.fill(); c.stroke();
      if (big&&r>7) {
        c.fillStyle="rgba(255,255,255,0.8)"; c.font=`bold ${Math.max(7,9*this.zoom)}px sans-serif`; c.textAlign="center";
        c.fillText("▶",p.x,p.y+3*this.zoom);
      }
    });
  },

  drawGhost(md, tp, ox, oy, T) {
    const tw=md.tileGroesse?.w||2, th=md.tileGroesse?.h||2;
    const ok=tp.tx>=0&&tp.ty>=0&&tp.tx+tw<=this.geb.tileBreite&&tp.ty+th<=this.geb.tileHoehe&&!this.collides(tp.tx,tp.ty,tw,th,null);
    const c=this.ctx;
    const px=ox+tp.tx*T, py=oy+tp.ty*T, pw=tw*T, ph=th*T;
    c.globalAlpha=0.55;
    c.fillStyle=ok?"rgba(245,158,11,0.2)":"rgba(220,50,50,0.2)";
    this.rr(c,px+2,py+2,pw-4,ph-4,6); c.fill();
    c.strokeStyle=ok?"#F59E0B":"#DD3333"; c.lineWidth=2; c.setLineDash([7,5]); c.stroke(); c.setLineDash([]);
    c.font=Math.max(16,Math.min(T*0.55,36))+"px serif"; c.textAlign="center";
    c.fillText(this.ICO[md.id]||this.ICO._def, px+pw/2, py+ph/2+8);
    if (ok) {
      c.font=`bold ${Math.max(9,10*this.zoom)}px 'IBM Plex Sans',sans-serif`;
      c.fillStyle="rgba(245,158,11,0.8)"; c.fillText("Hier platzieren", px+pw/2, py+ph+14*this.zoom);
    }
    c.globalAlpha=1;
  },


  // ═══ EVENTS ═══
  // Wichtig: nur der ERSTE Finger löst Tap/Select/Pan aus. Sobald ein
  // zweiter Finger dazukommt, wird jede laufende Aktion abgebrochen und
  // auf reines Pinch-Zoom umgeschaltet — verhindert Konflikte zwischen
  // Pan/Select und Zoom bei Mehrfachberührung.
  ev() {
    const C=this.canvas, s=this;
    C._ptrs={};

    C.addEventListener("pointerdown", e=>{
      e.preventDefault(); C.setPointerCapture(e.pointerId);
      const warLeer = Object.keys(C._ptrs).length===0;
      C._ptrs[e.pointerId]={x:e.clientX,y:e.clientY};
      if (Object.keys(C._ptrs).length>=2) {
        // Zweiter Finger: alle laufenden Einzel-Finger-Aktionen abbrechen
        s.drag=null; s.dockDrag=null; s.portDrag=null; s.wpDrag=null; s.pinch=null;
        return;
      }
      if (warLeer) s.onDown(s.cp(e), e);
    });

    C.addEventListener("pointermove", e=>{
      if (C._ptrs[e.pointerId]) C._ptrs[e.pointerId]={x:e.clientX,y:e.clientY};
      if (Object.keys(C._ptrs).length>=2) { s.checkPinch(); return; }
      s.onMove(s.cp(e));
    });

    C.addEventListener("pointerup", e=>{
      delete C._ptrs[e.pointerId];
      if (Object.keys(C._ptrs).length<2) s.pinch=null;
      if (Object.keys(C._ptrs).length===0) s.onUp(s.cp(e));
    });

    C.addEventListener("pointercancel", e=>{
      delete C._ptrs[e.pointerId];
      s.pinch=null; s.drag=null; s.dockDrag=null; s.portDrag=null; s.wpDrag=null;
    });

    C.addEventListener("wheel", e=>{e.preventDefault();s.onWheel(e);},{passive:false});
  },

  checkPinch() {
    const ptrs=Object.values(this.canvas._ptrs||{});
    if (ptrs.length<2) return;
    const [a,b]=ptrs;
    const d=Math.hypot(a.x-b.x,a.y-b.y);
    if (!this.pinch) { this.pinch={d0:d,z0:this.zoom}; return; }
    const nz=Math.max(this.MIN_ZOOM,Math.min(this.MAX_ZOOM,this.pinch.z0*(d/this.pinch.d0)));
    const mx=(a.x+b.x)/2-this.canvas.getBoundingClientRect().left;
    const my=(a.y+b.y)/2-this.canvas.getBoundingClientRect().top;
    this.panX=mx-(mx-this.panX)*(nz/this.zoom);
    this.panY=my-(my-this.panY)*(nz/this.zoom);
    this.zoom=nz;
  },

  cp(e){const r=this.canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};},

  onDown({x,y},e) {
    this.maus={x,y};
    const now=Date.now();

    // Verbindungs-Interaktion (Löschen, Waypoints)
    for (let v of fabrik_verbindungen) {
      // Verbindung löschen
      if (v._del&&Math.hypot(x-v._del.x,y-v._del.y)<v._del.r) {
        fabrik_verbindungen=fabrik_verbindungen.filter(vv=>vv!==v);
        spielstandSpeichern(); fabrikInfoAktualisieren(); return;
      }
      // Waypoint-Hits
      if (v._hitPts) {
        for (let hp of v._hitPts) {
          if (Math.hypot(x-hp.x,y-hp.y)<hp.r) {
            if (hp.idx!==undefined) {
              // Waypoint verschieben oder löschen (Doppeltippen)
              const now2=Date.now();
              if (now2-this.lastTap<350) {
                v.waypoints?.splice(hp.idx,1);
                spielstandSpeichern(); return;
              }
              this.lastTap=now2;
              this.wpDrag={conn:v,idx:hp.idx}; return;
            }
            if (hp.addAfterSeg!==undefined) {
              // Waypoint hinzufügen
              v.waypoints=v.waypoints||[];
              const T2=this.TILE*this.zoom;
              const tx=Math.round((x-this.panX)/T2-0.5), ty=Math.round((y-this.panY)/T2-0.5);
              v.waypoints.splice(hp.addAfterSeg,0,{tx,ty});
              this.wpDrag={conn:v,idx:hp.addAfterSeg};
              spielstandSpeichern(); return;
            }
          }
        }
      }
    }

    // Port-Drag starten (nur wenn Maschine ausgewählt)
    if (this.sel) {
      const port=this.findPort(x,y);
      if (port) { this.portDrag={...port}; return; }
    }

    // Special Node tippen
    if (this._sn) {
      for (let sn of this._sn) {
        if (x>=sn.x&&x<=sn.x+sn.w&&y>=sn.y&&y<=sn.y+sn.h) {
          this.sel={specId:sn.id}; fabrikInfoAusblenden(); return;
        }
      }
    }

    // Maschine tippen
    const tp=this.screenToTile(x,y);
    for (let entry of this.machines()) {
      if (!entry.pos) continue;
      const T=this.TILE*this.zoom, tw=entry.md.tileGroesse?.w||2, th=entry.md.tileGroesse?.h||2;
      if (tp.tx>=entry.pos.tx&&tp.tx<entry.pos.tx+tw&&tp.ty>=entry.pos.ty&&tp.ty<entry.pos.ty+th) {
        // Doppel-Tap = Toggle
        if (now-this.lastTap<350&&this.sel?.key===entry.key) {
          fabrikToggle(entry.key); this.lastTap=0; return;
        }
        this.lastTap=now;
        this.sel={key:entry.key,md:entry.md,m:entry.m};
        fabrikInfoZeigen(entry.md,entry.m,entry.key); return;
      }
    }

    // Leere Fläche: Pan starten
    this.sel=null; fabrikInfoAusblenden();
    this.drag={sx:x,sy:y,px0:this.panX,py0:this.panY,moved:false};
  },

  onMove({x,y}) {
    this.maus={x,y};
    if (this.wpDrag) {
      const T2=this.TILE*this.zoom;
      const tx=Math.round((x-this.panX)/T2-0.5), ty=Math.round((y-this.panY)/T2-0.5);
      if (this.wpDrag.conn.waypoints?.[this.wpDrag.idx]) {
        this.wpDrag.conn.waypoints[this.wpDrag.idx]={tx,ty};
      }
      return;
    }
    if (this.drag) {
      const dx=x-this.drag.sx, dy=y-this.drag.sy;
      if (Math.abs(dx)+Math.abs(dy)>4) this.drag.moved=true;
      this.panX=this.drag.px0+dx; this.panY=this.drag.py0+dy;
    }
  },

  onUp({x,y}) {
    this.maus={x,y};

    // Dock-Drag abschließen
    if (this.dockDrag) {
      const tp=this.screenToTile(x,y);
      // Auf Fabrik-Fläche?
      if (tp.tx>=0&&tp.ty>=0&&tp.tx<this.geb.tileBreite&&tp.ty<this.geb.tileHoehe) {
        this.placeAt(this.dockDrag.md, this.dockDrag.key, tp);
      }
      this.dockDrag=null; return;
    }

    // Waypoint-Drag abschließen
    if (this.wpDrag) { spielstandSpeichern(); this.wpDrag=null; return; }

    // Port-Drag abschließen
    if (this.portDrag) {
      const port=this.findPort(x,y);
      if (port&&port.masId!==this.portDrag.masId) this.connect(this.portDrag,port);
      this.portDrag=null; return;
    }

    this.drag=null;
  },

  onWheel(e) {
    const {x,y}=this.cp(e), f=e.deltaY<0?1.12:0.88;
    const nz=Math.max(this.MIN_ZOOM,Math.min(this.MAX_ZOOM,this.zoom*f));
    this.panX=x-(x-this.panX)*(nz/this.zoom);
    this.panY=y-(y-this.panY)*(nz/this.zoom);
    this.zoom=nz;
  },

  // ═══ PLATZIEREN ═══
  placeAt(md, instanceKey, tp) {
    const tw=md.tileGroesse?.w||2, th=md.tileGroesse?.h||2;
    if (tp.tx+tw>this.geb.tileBreite||tp.ty+th>this.geb.tileHoehe||this.collides(tp.tx,tp.ty,tw,th,instanceKey)) {
      zeigeNotification("❌ Platz belegt!","red"); return;
    }
    for (let m of installierte_maschinen) {
      const k=m.instanceId||m.id;
      if (k!==instanceKey&&m.id!==md.id) continue;
      if (k===instanceKey||(m.id===md.id&&!m.platziert)) {
        m.fabrikPos=m.fabrikPos||{};
        m.fabrikPos[this.geb.id+"_"+k]={tx:tp.tx,ty:tp.ty};
        m.platziert=true; break;
      }
    }
    zeigeNotification("✅ "+md.name+" platziert!","green");
    FK.dockDrag=null; FK.canvas.style.cursor="grab";
    document.querySelectorAll(".fk-dock-item").forEach(b=>b.classList.remove("aktiv"));
    spielstandSpeichern(); fabrikInfoAktualisieren();
  },

  // ═══ VERBINDEN ═══
  findPort(x,y) {
    const T=this.TILE*this.zoom, ox=this.panX, oy=this.panY;
    const r=Math.max(14,16*this.zoom);
    const mas=this.machines();

    // Spezial-Node Ports
    if (this._sn) {
      for (let sn of this._sn) {
        for (let p of sn.ports) {
          if (Math.hypot(x-p.x,y-p.y)<r) return {masId:sn.id,instId:sn.id,typ:p.typ,idx:0,mat:"*",x:p.x,y:p.y,special:true};
        }
      }
    }

    // Nutzt dieselbe portXY()-Berechnung wie das Zeichnen — garantiert dass
    // Klick-Trefferzone und sichtbarer Port immer exakt übereinstimmen,
    // auch bei gedrehten Maschinen.
    for (let e of mas) {
      if (!e.pos) continue;
      const inp=this.getInpMats(e.md), out=this.getOutMats(e.md);
      for (let i=0;i<inp.length;i++) {
        const p=this.portXY(e,"input",i,ox,oy,T);
        if (Math.hypot(x-p.x,y-p.y)<r) return {masId:e.md.id,instId:e.key,typ:"input",idx:i,mat:inp[i],x:p.x,y:p.y};
      }
      for (let i=0;i<out.length;i++) {
        const p=this.portXY(e,"output",i,ox,oy,T);
        if (Math.hypot(x-p.x,y-p.y)<r) return {masId:e.md.id,instId:e.key,typ:"output",idx:i,mat:out[i],x:p.x,y:p.y};
      }
    }
    return null;
  },

  connect(portA, portB) {
    const von  = portA.typ==="output"?portA:portB;
    const nach = portA.typ==="input" ?portA:portB;
    if (von.typ!=="output"||nach.typ!=="input") { zeigeNotification("❌ Output → Input verbinden","red"); return; }
    if (fabrik_verbindungen.some(v=>v.vonInstId===von.instId&&v.vonPortIdx===von.idx&&v.nachInstId===nach.instId&&v.nachPortIdx===nach.idx)) {
      zeigeNotification("Bereits verbunden.","red"); return;
    }
    fabrik_verbindungen.push({id:Date.now(),vonMasId:von.masId,vonInstId:von.instId,vonPortIdx:von.idx,nachMasId:nach.masId,nachInstId:nach.instId,nachPortIdx:nach.idx,material:von.mat!=="*"?von.mat:nach.mat});
    zeigeNotification("🔗 Verbunden!","green");
    spielstandSpeichern(); fabrikInfoAktualisieren();
  },

  // ═══ HELPER ═══
  screenToTile(sx,sy) {
    const T=this.TILE*this.zoom;
    return {tx:Math.floor((sx-this.panX)/T),ty:Math.floor((sy-this.panY)/T)};
  },

  portXY(entry,typ,idx,ox,oy,T) {
    if (!entry.pos) return null;
    const m=entry.m, rot=m?.fabrikRot||0;
    const rawTw=entry.md.tileGroesse?.w||2, rawTh=entry.md.tileGroesse?.h||2;
    const tw=rot%2===0?rawTw:rawTh, th=rot%2===0?rawTh:rawTw;
    const px=ox+entry.pos.tx*T, py=oy+entry.pos.ty*T, pw=tw*T, ph=th*T;
    const arr=typ==="input"?this.getInpMats(entry.md):this.getOutMats(entry.md);
    const n=Math.min(idx,Math.max(0,arr.length-1));
    const frac=(n+1)/(arr.length+1);
    // Ports rotieren: Basis = input links, output rechts
    // rot0: input=links, output=rechts
    // rot1(90°): input=oben, output=unten
    // rot2(180°): input=rechts, output=links
    // rot3(270°): input=unten, output=oben
    const isIn=typ==="input";
    if (rot===0) return {x:px+(isIn?0:pw),       y:py+ph*frac};
    if (rot===1) return {x:px+pw*frac,            y:py+(isIn?0:ph)};
    if (rot===2) return {x:px+(isIn?pw:0),         y:py+ph*(1-frac)};
    if (rot===3) return {x:px+pw*(1-frac),         y:py+(isIn?ph:0)};
    return {x:px+(isIn?0:pw), y:py+ph*frac};
  },

  collides(tx,ty,tw,th,skipKey) {
    for (let e of this.machines()) {
      if (!e.pos||e.key===skipKey) continue;
      const rawW=e.md.tileGroesse?.w||2, rawH=e.md.tileGroesse?.h||2;
      const rot=e.m?.fabrikRot||0;
      const ew=rot%2===0?rawW:rawH, eh=rot%2===0?rawH:rawW; // Rotation berücksichtigen
      if (tx<e.pos.tx+ew&&tx+tw>e.pos.tx&&ty<e.pos.ty+eh&&ty+th>e.pos.ty) return true;
    }
    return false;
  },

  machines() {
    if (typeof MASCHINEN==="undefined"||!this.geb) return [];
    let i=0;
    return installierte_maschinen.map(m=>{
      if (!m.instanceId) m.instanceId=m.id+"_leg_"+(i++);
      return m;
    }).filter(m=>{
      const md=MASCHINEN.find(d=>d.id===m.id);
      if (!md) return false;
      // Maschine gehört zu genau EINEM Gebäude (dort gekauft) — nicht global
      // nach Hallentyp anzeigen, sonst tauchen Maschinen aus Halle A auch in
      // Halle B auf. Legacy-Maschinen ohne gebaeudeId fallen auf Hallentyp zurück.
      if (m.gebaeudeId) return m.gebaeudeId===this.geb.id;
      return !md.hallenTyp||md.hallenTyp.includes(this.geb.hallenTyp);
    }).map((m,idx)=>{
      const md=MASCHINEN.find(d=>d.id===m.id);
      const key=m.instanceId;
      const pos=m.fabrikPos?.[this.geb.id+"_"+key]||null;
      return {md,m,pos,key,idx};
    });
  },

  getInpMats(md) {
    if (typeof REZEPTE==="undefined") return [];
    const m=installierte_maschinen.find(m=>m.id===md.id);
    const rez=m?.aktivesRezept?REZEPTE.find(r=>r.id===m.aktivesRezept):REZEPTE.find(r=>r.maschine===md.id);
    return rez?rez.inputs.map(i=>i.material):[];
  },

  getOutMats(md) {
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
  const geb=typeof GEBAEUDE!=="undefined"?GEBAEUDE.find(g=>g.id===gebaeudeId):null;
  if (!geb) return;
  let modal=document.getElementById("modal-fabrikkarte");
  if (!modal){modal=document.createElement("div");modal.id="modal-fabrikkarte";document.body.appendChild(modal);}

  modal.innerHTML=`
    <div class="fk-wrap">
      <header class="fk-head">
        <div class="fk-head-l">
          <span class="fk-geb-emo">${geb.emoji||"🏭"}</span>
          <div>
            <div class="fk-geb-nm">${geb.name}</div>
            <div class="fk-geb-sb">${geb.tileBreite}×${geb.tileHoehe} · max ${geb.maxMaschinen||0} Maschinen</div>
          </div>
        </div>
        <div class="fk-head-r">
          <button class="fk-ib" onclick="FK.fit()" title="Zentrieren">⌖</button>
          <button class="fk-ib" onclick="FK.zoom=Math.min(FK.MAX_ZOOM,FK.zoom*1.2)">+</button>
          <button class="fk-ib" onclick="FK.zoom=Math.max(FK.MIN_ZOOM,FK.zoom*0.8)">−</button>
          <button class="fk-ib fk-ib-close" onclick="fabrikkarteSchliessen()">✕</button>
        </div>
      </header>
      <div class="fk-main">
        <canvas id="fk-c" class="fk-canvas" style="display:block;touch-action:none"></canvas>
      </div>
      <div id="fk-dock" class="fk-dock">
        <div class="fk-dock-label">📦 WARENEINGANG</div>
        <div id="fk-dock-items" class="fk-dock-items"></div>
      </div>
      <div id="fk-sheet" class="fk-sheet" style="display:none"></div>
    </div>`;

  modal.style.display="flex";

  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const canvas=document.getElementById("fk-c");
    const main=canvas.parentElement;
    canvas.width  = main.clientWidth;
    canvas.height = main.clientHeight;
    FK.init(canvas, geb, gsId);
    fabrikDockAktualisieren();
  }));
}

function fabrikkarteSchliessen() {
  FK.destroy();
  const m=document.getElementById("modal-fabrikkarte");
  if (m) m.style.display="none";
}

function fabrikInfoZeigen(md, m, key) {
  const sheet=document.getElementById("fk-sheet"); if (!sheet) return;
  const ico=FK.ICO?.[md.id]||"⚙️";
  const laueft=m?.laeuft;
  const inp=FK.getInpMats(md);
  const alleV=inp.length===0||inp.every((_,i)=>fabrik_verbindungen.some(v=>(v.nachInstId===key||v.nachMasId===md.id)&&v.nachPortIdx===i));
  const rez=typeof REZEPTE!=="undefined"?REZEPTE.find(r=>r.id===m?.aktivesRezept):null;

  const status=laueft?"🟢 Läuft":!alleV&&inp.length?"🟡 Verbindung fehlt":"🔴 Gestoppt";
  const btnTxt=laueft?"⏸ Stoppen":"▶ Starten";
  const btnDis=!laueft&&!alleV&&inp.length?"disabled":"";

  sheet.innerHTML=`
    <div class="fks-handle"></div>
    <div class="fks-body">
      <div class="fks-hd">
        <span style="font-size:26px">${ico}</span>
        <div>
          <div class="fks-nm">${md.name}</div>
          <div class="fks-st" style="color:${laueft?"var(--green)":!alleV&&inp.length?"var(--amber)":"var(--red)"}">${status}</div>
        </div>
        <button class="fks-close" onclick="fabrikInfoAusblenden()">✕</button>
      </div>
      ${rez?`<div class="fks-rez">📋 ${rez.name}</div>`:""}
      ${!alleV&&inp.length?`<div class="fks-hint">Tippe auf einen Port (◀▶) und ziehe zur anderen Maschine um zu verbinden.</div>`:""}
      <div class="fks-btns">
        <button class="fks-btn-prim" onclick="fabrikToggle('${key}')" ${btnDis}>${btnTxt}</button>
        <button class="fks-btn-sec"  onclick="fabrikVerschieben('${key}')">↔ Zurück in Wareneingang</button>
      </div>
    </div>`;
  sheet.style.display="block";
}

function fabrikInfoAusblenden() {
  const s=document.getElementById("fk-sheet"); if (s) s.style.display="none";
}

function fabrikInfoAktualisieren() {
  if (FK.sel?.key) {
    const e=FK.machines().find(m=>m.key===FK.sel.key);
    if (e) fabrikInfoZeigen(e.md,e.m,e.key);
  }
  fabrikDockAktualisieren();
}

function fabrikToggle(key) {
  const m=installierte_maschinen.find(m=>(m.instanceId||m.id)===key);
  if (!m) return;
  const md=MASCHINEN?.find(d=>d.id===m.id);
  const inp=md?FK.getInpMats(md):[];
  const alleV=inp.length===0||inp.every((_,i)=>fabrik_verbindungen.some(v=>(v.nachInstId===key||v.nachMasId===m.id)&&v.nachPortIdx===i));
  if (!m.laeuft&&!alleV&&inp.length) { zeigeNotification("⚠ Erst Ports verbinden (◀▶)","red"); return; }
  if (m.laeuft){if(typeof maschineStoppen==="function")maschineStoppen(m);}
  else         {if(typeof maschineStarten ==="function")maschineStarten(m);}
  if (typeof spielstandSpeichern==="function") spielstandSpeichern();
  setTimeout(()=>{if(md)fabrikInfoZeigen(md,m,key);},80);
}

function fabrikVerschieben(key) {
  const m=installierte_maschinen.find(m=>(m.instanceId||m.id)===key);
  if (!m||!FK.geb) return;
  const posKey=FK.geb.id+"_"+key;
  if (m.fabrikPos) delete m.fabrikPos[posKey];
  m.platziert=false;
  // Verbindungen dieser Maschine sind jetzt ungültig (nicht mehr platziert)
  fabrik_verbindungen = fabrik_verbindungen.filter(v => v.vonInstId!==key && v.nachInstId!==key);
  FK.sel=null; fabrikInfoAusblenden();
  spielstandSpeichern();
  zeigeNotification("↔ In Wareneingang zurück","green");
}

function fabrikRotieren(key) {
  const m = installierte_maschinen.find(m => (m.instanceId||m.id) === key);
  if (!m) return;
  m.fabrikRot = ((m.fabrikRot||0) + 1) % 4;
  const rotLabels = ["0°","90°","180°","270°"];
  zeigeNotification("↻ " + rotLabels[m.fabrikRot] + " gedreht", "green");
  spielstandSpeichern();
}

function fabrikDockAktualisieren() {
  const items = document.getElementById("fk-dock-items");
  if (!items) return;

  const mas = FK.machines().filter(m => !m.pos);
  const dock = document.getElementById("fk-dock");

  if (mas.length === 0) {
    if (dock) dock.style.display = "none";
    return;
  }
  if (dock) dock.style.display = "flex";

  items.innerHTML = mas.map(e => {
    const ico = FK.ICO[e.md.id] || FK.ICO._def;
    const cl  = FK.COLORS[e.md.id] || FK.COLORS._def;
    const nm  = e.md.name.length > 9 ? e.md.name.slice(0, 8) + "…" : e.md.name;
    return `<button class="fk-dock-item" 
      onclick="fabrikDockWaehlen('${e.key}', event)"
      style="--cl1:${cl[0]};--cl2:${cl[1]}">
      <span class="fk-di-ico">${ico}</span>
      <span class="fk-di-nm">${nm}</span>
      <span class="fk-di-sz">${e.md.tileGroesse?.w||2}×${e.md.tileGroesse?.h||2}</span>
    </button>`;
  }).join("");
}

function fabrikDockWaehlen(key, evt) {
  const e = FK.machines().find(m => m.key === key);
  if (!e) return;

  // Aktiven Zustand toggeln
  if (FK.dockDrag?.key === key) {
    FK.dockDrag = null;
    FK.canvas.style.cursor = "grab";
    document.querySelectorAll(".fk-dock-item").forEach(b => b.classList.remove("aktiv"));
    zeigeNotification("Platzierung abgebrochen", "green");
    return;
  }

  FK.dockDrag = { md: e.md, key };
  FK.sel = null;
  fabrikInfoAusblenden();
  FK.canvas.style.cursor = "crosshair";

  // Aktiven Button markieren
  document.querySelectorAll(".fk-dock-item").forEach(b => b.classList.remove("aktiv"));
  if (evt && evt.currentTarget) evt.currentTarget.classList.add("aktiv");
  zeigeNotification("📦 " + e.md.name + " — Tippe auf die Fabrik um sie zu platzieren", "green");
}
