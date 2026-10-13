// HTML-Oberfläche: Kopfleiste, Ladenstatus, Baukatalog, Inspektor und Fenster.
import {
  CONFIG, FLOORS, SHOP_TYPES, FURNITURE, FURNITURE_CATS, PRODUCTS, SUPPLIES,
  productsFor, suppliesFor, furnitureFor,
} from './data.js';

const $ = (id) => document.getElementById(id);
const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const eur0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const money = (v) => (Math.abs(v) >= 1000 ? eur0 : eur).format(v);
const money2 = (v) => eur.format(v);
const clockStr = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stars = (rep) => {
  const n = Math.round(rep / 20 * 2) / 2;
  let s = '';
  for (let i = 1; i <= 5; i++) s += n >= i ? '★' : n >= i - 0.5 ? '⯪' : '☆';
  return s;
};

const STATE_TEXT = {
  approach: 'kommt zum Eingang', toQueue: 'geht zur Kasse', queue: 'wartet in der Schlange', ordering: 'bestellt gerade',
  toSeat: 'sucht sich einen Platz', sitting: 'sitzt und genießt', leaving: 'geht nach Hause', exit: 'geht weiter', pass: 'läuft vorbei',
};

export class UI {
  constructor(game, renderer, state, actions) {
    this.game = game;
    this.r = renderer;
    this.state = state;
    this.actions = actions;
    this.cat = 'service';
    this.panel = null;
    this.stepsCollapsed = false;
    this.lastHtml = {};
    this.thumbs = new Map();

    $('modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal') this.closeModal(); });
    $('modal').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) this.closeModal(); });
    this.buildStatic();
  }

  // ───────────── statische Teile ─────────────

  buildStatic() {
    const speed = $('speed');
    speed.innerHTML = [['0', '❚❚', 'Pause (Leertaste)'], ['1', '▶', 'Normal (1)'], ['2', '▶▶', 'Schnell (2)'], ['4', '▶▶▶', 'Sehr schnell (3)']]
      .map(([v, t, title]) => `<button data-speed="${v}" title="${title}">${t}</button>`).join('');
    speed.addEventListener('click', (e) => {
      const b = e.target.closest('[data-speed]');
      if (b) this.actions.setSpeed(Number(b.dataset.speed));
    });

    const menu = $('menu');
    menu.innerHTML = [
      ['menu', '☕', 'Speisekarte'], ['stock', '📦', 'Lager'], ['staff', '🧑‍🍳', 'Personal'],
      ['building', '🏢', 'Etagen'], ['stats', '📈', 'Bilanz'], ['game', '☰', 'Spiel'],
    ].map(([id, ico, lbl]) => `<button data-panel="${id}" title="${lbl}"><span class="ico">${ico}</span><span class="lbl">${lbl}</span></button>`).join('');
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-panel]');
      if (b) this.openPanel(b.dataset.panel);
    });

    const tools = $('tools');
    tools.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tool]');
      if (!b) return;
      if (b.dataset.tool === 'rotate') return this.actions.rotate();
      this.actions.setTool(b.dataset.tool === this.state.tool && b.dataset.tool !== 'select' ? 'select' : b.dataset.tool);
    });

    $('cats').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (b) { this.cat = b.dataset.cat; this.renderCatalog(); }
    });
    $('items').addEventListener('click', (e) => {
      if (e.target.closest('[data-open]')) return this.openPanel('building');
      const b = e.target.closest('[data-type]');
      if (b) this.actions.pickBuild(b.dataset.type);
    });

    $('floors').addEventListener('click', (e) => {
      const b = e.target.closest('[data-view]');
      if (b) this.actions.setView(b.dataset.view === 'out' ? 'out' : Number(b.dataset.view));
    });

    $('shopCard').addEventListener('click', (e) => {
      if (e.target.closest('[data-open]')) this.openPanel(e.target.closest('[data-open]').dataset.open);
    });
    $('shopCard').addEventListener('change', (e) => {
      if (e.target.matches('[data-shop-open]')) {
        const s = this.game.shops.get(Number(e.target.dataset.shopOpen));
        if (s) s.open = e.target.checked;
        this.update(true);
      }
    });
    $('steps').addEventListener('click', (e) => {
      if (e.target.closest('.collapse')) { this.stepsCollapsed = !this.stepsCollapsed; this.update(true); }
    });

    $('inspector').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) this.actions.inspectorAction(b.dataset.act);
    });

    this.renderTools();
    this.renderFloors();
  }

  set(id, html) {
    if (this.lastHtml[id] === html) return;
    this.lastHtml[id] = html;
    $(id).innerHTML = html;
  }

  // Laden der aktuell betrachteten Etage
  currentShop() {
    const v = this.state.view === 'out' ? 0 : this.state.view;
    return this.game.shopOnFloor(v);
  }

  renderTools() {
    const t = this.state.tool;
    const html = [
      ['select', '👆', 'Auswählen'], ['build', '🛠️', 'Einrichten'], ['sell', '🗑️', 'Verkaufen'],
      ...(t === 'build' || t === 'move' ? [['rotate', '⟳', 'Drehen']] : []),
    ].map(([id, ico, lbl]) => `<button data-tool="${id}" class="${t === id || (id === 'build' && t === 'move') ? 'on' : ''}" title="${lbl}"><span class="ico">${ico}</span><span class="lbl">${lbl}</span></button>`).join('');
    this.set('tools', html);
    $('catalog').classList.toggle('hidden', t !== 'build');
    if (t === 'build') this.renderCatalog();
    const hints = {
      build: this.state.buildType ? 'Feld antippen zum Platzieren · R oder ⟳ dreht' : 'Wähle ein Möbelstück aus dem Katalog',
      move: 'Neuen Platz antippen · R oder ⟳ dreht · Esc bricht ab',
      sell: 'Möbel antippen, um es für 50 % zu verkaufen',
      select: '',
    };
    $('hint').textContent = this.state.view === 'out' && t !== 'select' ? 'Zum Einrichten eine Etage wählen' : hints[t] || '';
  }

  renderCatalog() {
    const shop = this.currentShop();
    if (!shop) {
      this.set('cats', '');
      this.set('items', `<div style="padding:10px;color:var(--ink-2)">Auf dieser Etage gibt es noch keinen Laden. <button class="btn small primary" data-open="building">Etagen öffnen</button></div>`);
      return;
    }
    const types = furnitureFor(shop.type);
    this.set('cats', FURNITURE_CATS.map((c) => `<button data-cat="${c.id}" class="${this.cat === c.id ? 'on' : ''}">${c.name}</button>`).join(''));
    const list = types.filter((t) => FURNITURE[t].cat === this.cat);
    const html = list.map((t) => {
      const d = FURNITURE[t];
      return `<button class="item ${this.state.buildType === t ? 'on' : ''} ${this.game.money < d.cost ? 'poor' : ''}" data-type="${t}" title="${esc(d.desc)}">
        <canvas data-thumb="${t}" width="184" height="112"></canvas><b>${d.name}</b><span>${money(d.cost)}</span></button>`;
    }).join('');
    if (this.lastHtml.items !== html) {
      this.set('items', html);
      for (const c of $('items').querySelectorAll('canvas[data-thumb]')) this.r.thumbnail(c.dataset.thumb, c);
    }
  }

  renderFloors() {
    const g = this.game;
    const v = this.state.view;
    const rows = [['out', 'Außen', '']];
    for (let f = FLOORS.length - 1; f >= 0; f--) {
      const fl = g.floors[f];
      const shop = g.shops.get(fl.shop);
      rows.push([String(f), FLOORS[f].short, fl.unlocked ? (shop ? SHOP_TYPES[shop.type].name : 'leer') : 'frei', !fl.unlocked]);
    }
    this.set('floors', rows.map(([id, name, sub, locked]) => `<button data-view="${id}" class="${String(v) === id ? 'on' : ''} ${locked ? 'locked' : ''}" title="${name}">${name}${sub ? `<small>${sub}</small>` : ''}</button>`).join(''));
  }

  // ───────────── laufende Aktualisierung ─────────────

  update(force = false) {
    const g = this.game;
    if (force) this.lastHtml = {};
    const m = $('money');
    m.textContent = money(g.money);
    m.classList.toggle('neg', g.money < 0);
    $('dayLabel').textContent = `Tag ${g.day}`;
    $('clock').textContent = clockStr(g.clock);
    $('rep').textContent = stars(g.rep);
    $('rep').title = `Ruf ${Math.round(g.rep)} / 100`;
    for (const b of $('speed').children) b.classList.toggle('on', Number(b.dataset.speed) === (this.state.paused ? 0 : this.state.speed));

    this.renderShopCard();
    this.renderSteps();
    this.renderFloors();
    this.renderTools();
    this.renderInspector();
    if (this.panel && this.panel !== 'report' && this.panelLive) this.openPanel(this.panel, true);
  }

  renderShopCard() {
    const g = this.game;
    const v = this.state.view === 'out' ? 0 : this.state.view;
    const shop = g.shopOnFloor(v);
    if (!shop) {
      const fl = g.floors[v];
      this.set('shopCard', `<div class="head"><h3>${FLOORS[v].name}</h3><span class="pill wait">${fl.unlocked ? 'leer' : 'zu vermieten'}</span></div>
        <div class="sub">${fl.unlocked ? 'Hier kannst du einen neuen Laden eröffnen.' : `Anmieten für ${money(FLOORS[v].unlockCost)} · Miete ${money(FLOORS[v].rent)}/Tag`}</div>
        <div class="row" style="margin-top:10px"><button class="btn primary small" data-open="building">${fl.unlocked ? 'Laden eröffnen' : 'Etage ansehen'}</button></div>`);
      return;
    }
    const st = g.shopStatus(shop);
    const pill = st.serving ? '<span class="pill open">Geöffnet</span>'
      : st.ready ? `<span class="pill wait">${g.clock < CONFIG.openFrom ? 'öffnet ' + clockStr(CONFIG.openFrom) : 'Feierabend'}</span>`
        : '<span class="pill closed">Geschlossen</span>';
    const d = g.derived[shop.floor];
    const queue = d.registers.reduce((s, r) => s + r.queue.length, 0);
    const guests = [...g.agents.values()].filter((a) => a.shop === shop.id && a.kind === 'customer' && a.state !== 'exit').length;
    const satToday = shop.day.satN ? Math.round(shop.day.satSum / shop.day.satN) : '–';
    this.set('shopCard', `<div class="head"><h3>${esc(shop.name)}</h3>${pill}</div>
      <div class="sub">${SHOP_TYPES[shop.type].name} · ${FLOORS[shop.floor].name}</div>
      ${st.reasons.filter((r) => r !== 'Laden ist geschlossen').length ? `<ul class="reasons">${st.reasons.filter((r) => r !== 'Laden ist geschlossen').map((r) => `<li>${r}</li>`).join('')}</ul>` : ''}
      <div class="kpis">
        <div class="kpi"><label>Umsatz</label><b>${money(shop.day.revenue)}</b></div>
        <div class="kpi"><label>Gäste</label><b>${shop.day.served}</b></div>
        <div class="kpi"><label>Laune</label><b>${satToday}</b></div>
        <div class="kpi"><label>Im Laden</label><b>${guests}</b></div>
        <div class="kpi"><label>Schlange</label><b>${queue}</b></div>
        <div class="kpi"><label>Ambiente</label><b>${d.appeal}</b></div>
      </div>
      <label class="toggle"><input type="checkbox" data-shop-open="${shop.id}" ${shop.open ? 'checked' : ''}><span></span>Laden geöffnet</label>`);
  }

  steps() {
    const g = this.game;
    const shop = g.shopOnFloor(0);
    const d = g.derived[0];
    const servedTotal = g.history.reduce((s, h) => s + h.served, 0) + g.today.served;
    return [
      ['Theke mit Kasse aufstellen', d.registers.length > 0],
      ['Siebträger-Station aufstellen', d.machines.length > 0],
      ['Barista einstellen (Personal)', shop && shop.staff > 0],
      ['Kuchenvitrine für Snacks', d.displays.length > 0],
      ['Mindestens 4 Sitzplätze', d.seats.length >= 4],
      ['Ambiente auf 40 bringen (Deko)', d.appeal >= 40],
      ['100 Gäste bedienen', servedTotal >= 100],
      ['Das 1. Obergeschoss anmieten', g.floors[1].unlocked],
      ['Zweites Café im 1. OG eröffnen', !!g.floors[1].shop],
    ];
  }

  renderSteps() {
    const list = this.steps();
    const open = list.filter(([, done]) => !done);
    if (!open.length) { this.set('steps', ''); $('steps').classList.add('hidden'); return; }
    $('steps').classList.remove('hidden');
    let marked = false;
    const items = list.map(([txt, done]) => {
      let cls = done ? 'done' : '';
      if (!done && !marked) { cls = 'next'; marked = true; }
      return `<li class="${cls}"><i>${done ? '✓' : ''}</i>${txt}</li>`;
    });
    const shown = this.stepsCollapsed ? items.filter((h) => h.includes('class="next"')) : items;
    this.set('steps', `<h3>Nächste Schritte <button class="collapse">${this.stepsCollapsed ? 'alle zeigen' : 'einklappen'}</button></h3><ol>${shown.join('')}</ol>`);
  }

  renderInspector() {
    const sel = this.state.selected;
    const g = this.game;
    const box = $('inspector');
    if (!sel) { box.classList.add('hidden'); this.lastHtml.inspector = ''; return; }
    let html = '';
    if (sel.kind === 'item') {
      const it = g.items.get(sel.id);
      if (!it) { this.state.selected = null; box.classList.add('hidden'); return; }
      const d = FURNITURE[it.type];
      const rows = [];
      const der = g.derived[it.floor];
      if (d.register) {
        const r = der.registers.find((x) => x.id === it.id);
        const shop = g.shopOnFloor(it.floor);
        const staffed = shop && g.staffedRegisters(shop).includes(r);
        rows.push(['Besetzt', staffed ? 'ja' : '<b style="color:var(--red)">keine Barista</b>']);
        rows.push(['Warteschlange', `${r ? r.queue.length : 0} / ${r ? r.queueSpots.length : 0}`]);
      }
      if (d.seat) {
        const seats = der.seats.filter((s) => s.item === it.id);
        rows.push(['Sitzplätze', seats.length ? `${seats.filter((s) => g.seatTaken.has(s.id)).length} / ${seats.length} belegt` : '<b style="color:var(--red)">kein Tisch daneben</b>']);
      }
      if (d.machine) rows.push(['Maschinen im Laden', der.machines.length]);
      if (d.decor) rows.push(['Ambiente', `+${d.decor}`]);
      rows.push(['Verkaufswert', money(Math.round(d.cost * CONFIG.sellRefund))]);
      html = `<button class="x" data-act="close">×</button><h3>${d.name}</h3><div class="desc">${esc(d.desc)}</div>
        <div class="rows">${rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
        <div class="actions"><button class="btn small" data-act="rotate">⟳ Drehen</button><button class="btn small" data-act="move">✥ Verschieben</button><button class="btn small danger" data-act="sell">Verkaufen</button></div>`;
    } else if (sel.kind === 'agent') {
      const a = g.agents.get(sel.id);
      if (!a) { this.state.selected = null; box.classList.add('hidden'); return; }
      if (a.kind === 'ped') {
        html = `<button class="x" data-act="close">×</button><h3>Passant</h3><div class="desc">Läuft nur vorbei. Mit besserem Ruf und Ambiente kommen mehr Leute herein.</div>`;
      } else {
        const mood = a.sat >= 75 ? '😊' : a.sat >= 55 ? '🙂' : a.sat >= 40 ? '😐' : '😠';
        const wants = (a.items || a.wants || []).map((p) => PRODUCTS[p].name).join(', ') || '–';
        html = `<button class="x" data-act="close">×</button><h3>Gast</h3><div class="desc">${STATE_TEXT[a.state] || a.state}</div>
          <div class="rows"><div><span>Bestellung</span><b>${wants}</b></div>
          <div><span>Wartezeit</span><b>${Math.round(a.wait)} s</b></div>
          <div><span>Laune</span><b>${mood} ${Math.round(Math.max(0, Math.min(100, a.sat)))}</b></div>
          ${a.paid ? `<div><span>Bezahlt</span><b>${money2(a.paid)}</b></div>` : ''}</div>`;
      }
    }
    box.classList.remove('hidden');
    this.set('inspector', html);
  }

  // ───────────── Hinweise ─────────────

  toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 2600);
    while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
  }

  // ───────────── Fenster ─────────────

  closeModal() {
    const wasReport = this.panel === 'report';
    this.panel = null;
    $('modal').classList.add('hidden');
    if (wasReport) this.actions.reportClosed();
  }

  openPanel(id, refresh = false) {
    const body = $('modalBody');
    const scroll = $('modal').querySelector('.sheet').scrollTop;
    const html = this[`panel_${id}`]?.();
    if (html == null) return;
    if (refresh && this.lastPanelHtml === html) return;
    // Beim Aktualisieren keine Eingaben unterbrechen
    if (refresh && body.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    this.panel = id;
    this.lastPanelHtml = html;
    body.innerHTML = html;
    $('modal').classList.remove('hidden');
    $('modal').querySelector('.sheet').scrollTop = refresh ? scroll : 0;
    if (!refresh) this.bindPanel(id);
    this.panelLive = ['menu', 'stock', 'staff', 'building', 'stats'].includes(id);
    if (id === 'stats') this.drawChart();
  }

  bindPanel() {
    const body = $('modalBody');
    if (body.dataset.bound) return;
    body.dataset.bound = '1';
    body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-do]');
      if (!b || b.disabled) return;
      const [act, ...args] = b.dataset.do.split(':');
      this.actions.panelAction(act, args);
      if (this.panel) this.openPanel(this.panel, true);
    });
    body.addEventListener('change', (e) => {
      const el = e.target.closest('[data-change]');
      if (!el) return;
      const [act, ...args] = el.dataset.change.split(':');
      this.actions.panelAction(act, [...args, el.type === 'checkbox' ? el.checked : el.value]);
      if (this.panel) this.openPanel(this.panel, true);
    });
  }

  shopTabs(active) {
    const shops = [...this.game.shops.values()];
    if (shops.length < 2) return '';
    return `<div class="cats" style="margin-bottom:12px">${shops.map((s) => `<button data-do="tab:${s.id}" class="${s.id === active.id ? 'on' : ''}">${esc(s.name)} · ${FLOORS[s.floor].short}</button>`).join('')}</div>`;
  }

  panelShop() {
    const id = this.state.panelShop;
    return this.game.shops.get(id) || this.currentShop() || [...this.game.shops.values()][0];
  }

  panel_menu() {
    const g = this.game;
    const shop = this.panelShop();
    if (!shop) return null;
    const rows = productsFor(shop.type).map((pid) => {
      const p = PRODUCTS[pid];
      const m = shop.menu[pid];
      const offer = g.offerable(shop, pid);
      const missing = p.needs === 'machine' && !g.derived[shop.floor].machines.length ? 'Siebträger fehlt'
        : p.needs === 'display' && !g.derived[shop.floor].displays.length ? 'Vitrine fehlt' : '';
      const ratio = m.price / p.fair;
      const fair = ratio <= 0.92 ? '<span class="fair lo">günstig</span>' : ratio <= 1.08 ? '<span class="fair">fair</span>' : ratio <= 1.25 ? '<span class="fair hi">teuer</span>' : '<span class="fair hi">viel zu teuer</span>';
      const stock = g.inStock(shop, pid) ? '' : ' · <span style="color:var(--red)">ausverkauft</span>';
      return `<tr class="${offer ? '' : 'off'}">
        <td><b>${p.name}</b><br><small style="color:var(--ink-3)">${p.kind === 'drink' ? 'Getränk' : 'Snack'}${missing ? ' · ' + missing : stock}</small></td>
        <td><span class="stepper"><button data-do="price:${shop.id}:${pid}:-0.1">−</button><b>${money2(m.price)}</b><button data-do="price:${shop.id}:${pid}:0.1">+</button></span><br>${fair}</td>
        <td class="num">${shop.day.sold[pid] || 0}</td>
        <td><label class="toggle" style="margin:0"><input type="checkbox" data-change="product:${shop.id}:${pid}" ${m.on ? 'checked' : ''}><span></span></label></td></tr>`;
    }).join('');
    return `<h2>Speisekarte</h2><p class="lead">Preise über dem fairen Wert bringen mehr pro Tasse, vergraulen aber Gäste und drücken die Laune.</p>
      ${this.shopTabs(shop)}
      <table class="list"><tr><th>Produkt</th><th>Preis</th><th class="num">Heute</th><th>Im Angebot</th></tr>${rows}</table>`;
  }

  panel_stock() {
    const g = this.game;
    const shop = this.panelShop();
    if (!shop) return null;
    const rows = suppliesFor(shop.type).map((sid) => {
      const s = SUPPLIES[sid];
      const have = shop.stock[sid];
      const pct = Math.min(100, have / (s.pack * 2) * 100);
      return `<tr><td><b>${s.name}</b><br><small style="color:var(--ink-3)">${s.pack} ${s.unit} für ${money2(s.cost)}${s.fresh ? ' · verdirbt abends' : ''}</small></td>
        <td><div class="bar ${have < s.pack * 0.25 ? 'low' : ''}"><i style="width:${pct}%"></i></div><small>${have} ${s.unit}</small></td>
        <td><button class="btn small" data-do="buy:${shop.id}:${sid}:1" ${g.money < s.cost ? 'disabled' : ''}>+1</button>
            <button class="btn small" data-do="buy:${shop.id}:${sid}:5" ${g.money < s.cost * 5 ? 'disabled' : ''}>+5</button></td>
        <td><label class="toggle" style="margin:0" title="Automatisch nachbestellen (+${CONFIG.autoFee * 100}% Liefergebühr)"><input type="checkbox" data-change="auto:${shop.id}:${sid}" ${shop.auto[sid] ? 'checked' : ''}><span></span></label></td></tr>`;
    }).join('');
    return `<h2>Lager</h2><p class="lead">Frische Backwaren werden abends entsorgt – kauf lieber kleinere Mengen. Die Automatik bestellt nach, wenn ein Vorrat zur Neige geht (+${CONFIG.autoFee * 100} % Liefergebühr).</p>
      ${this.shopTabs(shop)}
      <table class="list"><tr><th>Ware</th><th>Bestand</th><th>Kaufen</th><th>Auto</th></tr>${rows}</table>`;
  }

  panel_staff() {
    const g = this.game;
    const shop = this.panelShop();
    if (!shop) return null;
    const d = g.derived[shop.floor];
    const regs = d.registers.length;
    const staffed = Math.min(shop.staff, regs);
    const helpers = Math.max(0, shop.staff - regs);
    const total = [...g.shops.values()].reduce((s, x) => s + x.staff, 0);
    return `<h2>Personal</h2><p class="lead">Jede Kasse braucht eine Barista. Wer übrig ist, hilft an der Siebträger-Station und macht den Service schneller.</p>
      ${this.shopTabs(shop)}
      <div class="staffrow"><div class="people">${'🧑‍🍳'.repeat(shop.staff) || '<span style="font-size:14px;color:var(--ink-3)">Noch niemand eingestellt</span>'}</div>
        <span class="stepper"><button data-do="fire:${shop.id}" ${shop.staff ? '' : 'disabled'}>−</button><b>${shop.staff}</b><button data-do="hire:${shop.id}" ${shop.staff >= CONFIG.maxStaff ? 'disabled' : ''}>+</button></span></div>
      <div class="grid2" style="margin-top:12px">
        <div class="tile"><label>Kassen besetzt</label><b>${staffed} / ${regs}</b></div>
        <div class="tile"><label>Helfer an der Maschine</label><b>${helpers}</b></div>
        <div class="tile"><label>Tempo</label><b>${Math.round(g.serviceSpeed(shop) / 1.6 * 100)} %</b></div>
        <div class="tile"><label>Lohnkosten / Tag (alle Läden)</label><b>${money(total * CONFIG.wage)}</b></div>
      </div>
      ${regs === 0 ? '<div class="tip">Stell zuerst eine Theke mit Kasse auf – sonst kann niemand bedienen.</div>' : ''}
      ${shop.staff > regs + 2 ? '<div class="tip">Mehr als zwei Helfer je Kasse bringen kaum noch etwas. Stell lieber eine weitere Theke auf.</div>' : ''}`;
  }

  panel_building() {
    const g = this.game;
    const rows = [];
    for (let f = FLOORS.length - 1; f >= 0; f--) {
      const fl = g.floors[f];
      const shop = g.shops.get(fl.shop);
      let right = '', extra = '';
      if (!fl.unlocked) {
        const c = g.canUnlock(f);
        right = `<button class="btn primary small" data-do="unlock:${f}" ${c.ok ? '' : 'disabled'} title="${c.reason || ''}">Anmieten · ${money(FLOORS[f].unlockCost)}</button>`;
      } else if (!shop) {
        extra = `<div class="shoptypes">${Object.entries(SHOP_TYPES).map(([id, t]) => `<button class="shoptype" data-do="openShop:${f}:${id}" ${t.available ? '' : 'disabled'}><b>${t.name}</b><small>${t.desc}</small>${t.available ? '' : '<span class="soon">bald verfügbar</span>'}</button>`).join('')}</div>`;
      } else {
        right = `<button class="btn small" data-do="view:${f}">Ansehen</button>`;
        extra = `<div style="margin-top:8px"><input class="text" data-change="rename:${shop.id}" value="${esc(shop.name)}" maxlength="24" aria-label="Name"></div>`;
      }
      rows.push(`<div class="floorrow ${fl.unlocked ? '' : 'locked'}" style="flex-wrap:wrap"><div class="lvl">${FLOORS[f].short}</div>
        <div class="info"><b>${FLOORS[f].name}</b><small>${fl.unlocked ? (shop ? `${SHOP_TYPES[shop.type].name} · Miete ${money(FLOORS[f].rent)}/Tag` : 'Angemietet – noch kein Laden') : `Miete ${money(FLOORS[f].rent)}/Tag nach Anmietung`}</small></div>
        ${right}<div style="flex-basis:100%">${extra}</div></div>`);
    }
    return `<h2>Etagen</h2><p class="lead">Jede Etage kann einen eigenen Laden aufnehmen. Gäste der oberen Etagen kommen über das Treppenhaus. Weitere Ladentypen folgen.</p>${rows.join('')}`;
  }

  panel_stats() {
    const g = this.game;
    const h = g.history.slice(-7).reverse();
    const sum = (k) => g.history.reduce((s, x) => s + x[k], 0);
    const rows = h.map((r) => `<tr><td>Tag ${r.day}</td><td class="num">${r.served}</td><td class="num">${money(r.revenue)}</td><td class="num">${money(r.supplies + r.wages + r.rent)}</td>
      <td class="num" style="color:${r.profit >= 0 ? 'var(--pos)' : 'var(--red)'}">${money(r.profit)}</td><td class="num">${r.sat ?? '–'}</td></tr>`).join('');
    const sold = Object.entries(g.today.sold).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${PRODUCTS[p].name} ${n}×`).join(' · ') || 'noch nichts';
    return `<h2>Bilanz</h2><p class="lead">Heute bisher: ${money(g.today.revenue)} Umsatz, ${money(g.today.supplies)} Wareneinkauf. Verkauft: ${sold}.</p>
      <div class="grid2">
        <div class="tile"><label>Kasse</label><b class="${g.money >= 0 ? '' : 'neg'}">${money(g.money)}</b></div>
        <div class="tile"><label>Ruf</label><b>${Math.round(g.rep)} / 100</b></div>
        <div class="tile"><label>Gäste gesamt</label><b>${sum('served') + g.today.served}</b></div>
        <div class="tile"><label>Gewinn gesamt</label><b class="${sum('profit') >= 0 ? 'pos' : 'neg'}">${money(sum('profit'))}</b></div>
      </div>
      <h4>Umsatz und Gewinn je Tag</h4>
      ${g.history.length ? '<canvas class="chart" id="chart" width="1360" height="320"></canvas>' : '<p style="color:var(--ink-3)">Nach dem ersten Tag erscheint hier der Verlauf.</p>'}
      ${h.length ? `<h4>Letzte Tage</h4><table class="list"><tr><th>Tag</th><th class="num">Gäste</th><th class="num">Umsatz</th><th class="num">Kosten</th><th class="num">Gewinn</th><th class="num">Laune</th></tr>${rows}</table>` : ''}`;
  }

  panel_game() {
    return `<h2>Spiel</h2><p class="lead">Dein Spielstand wird automatisch im Browser gespeichert.</p>
      <div class="row"><button class="btn primary" data-do="save">Jetzt speichern</button><button class="btn danger" data-do="newGame">Neues Spiel</button></div>
      <h4>Steuerung</h4>
      <table class="list">
        <tr><td>Kamera drehen</td><td>Ziehen mit links / einem Finger</td></tr>
        <tr><td>Verschieben</td><td>Rechte Maustaste / zwei Finger</td></tr>
        <tr><td>Zoomen</td><td>Mausrad / Pinch</td></tr>
        <tr><td>Möbel drehen</td><td>R</td></tr>
        <tr><td>Etage wechseln</td><td>Bild ↑ / Bild ↓</td></tr>
        <tr><td>Pause / Tempo</td><td>Leertaste · 1 · 2 · 3</td></tr>
        <tr><td>Abbrechen</td><td>Esc</td></tr>
      </table>
      <h4>So läuft dein Café</h4>
      <p style="color:var(--ink-2);margin:0">Gäste lesen an der Tür die Karte. Ist ihnen alles zu teuer, gehen sie weiter. Sonst stellen sie sich an der Theke an, bestellen, bezahlen und setzen sich ab und zu an einen freien Platz. Lange Wartezeiten, leere Vitrinen und volle Tische drücken die Laune – die Laune bestimmt deinen Ruf, und der Ruf bringt neue Gäste. Abends werden Löhne und Miete fällig.</p>`;
  }

  showReport(r) {
    const line = (k, v, cls = '') => `<div class="line"><span>${k}</span><b class="${cls}">${v}</b></div>`;
    const lost = r.lostPrice + r.lostWait + r.lostFull + r.lostStock;
    const tips = [];
    if (r.lostPrice > r.served * 0.15) tips.push('Viele Gäste fanden die Preise zu hoch.');
    if (r.lostWait > 2) tips.push('Gäste sind wegen langer Wartezeit gegangen – mehr Personal oder eine zweite Theke helfen.');
    if (r.lostFull > 2) tips.push('Die Schlange war voll. Mehr Platz vor der Theke oder eine zweite Kasse helfen.');
    if (r.lostStock > 2) tips.push('Einige Produkte waren ausverkauft. Prüf das Lager oder die Auto-Bestellung.');
    if (r.spoiled > 10) tips.push(`Backwaren im Wert von ${money2(r.spoiled)} wurden entsorgt.`);
    const html = `<h2>Tag ${r.day} – Abrechnung</h2><p class="lead">${r.served} Gäste bedient${lost ? `, ${lost} ohne Kauf gegangen` : ''}. Laune im Schnitt ${r.sat ?? '–'}, Ruf ${r.rep} (${r.repDelta >= 0 ? '+' : ''}${r.repDelta}).</p>
      <div class="report">
        ${line('Umsatz', money2(r.revenue), 'pos')}
        ${line('Wareneinkauf', '−' + money2(r.supplies))}
        ${line('Löhne', '−' + money2(r.wages))}
        ${line('Miete', '−' + money2(r.rent))}
        ${line('Gewinn', money2(r.profit), r.profit >= 0 ? 'pos' : 'neg').replace('class="line"', 'class="line total"')}
        ${r.build ? line('Investiert in Einrichtung', money2(r.build)) : ''}
      </div>
      ${tips.map((t) => `<div class="tip">${t}</div>`).join('')}
      <div class="row"><button class="btn primary" data-close>Weiter zu Tag ${r.day + 1}</button></div>`;
    $('modalBody').innerHTML = html;
    this.panel = 'report';
    this.panelLive = false;
    $('modal').classList.remove('hidden');
  }

  drawChart() {
    const c = document.getElementById('chart');
    if (!c) return;
    const g = c.getContext('2d');
    const h = this.game.history.slice(-21);
    const W = c.width, Hh = c.height, pad = 50;
    g.clearRect(0, 0, W, Hh);
    const max = Math.max(50, ...h.map((r) => r.revenue));
    const min = Math.min(0, ...h.map((r) => r.profit));
    const y = (v) => Hh - pad / 2 - (v - min) / (max - min) * (Hh - pad);
    const bw = (W - pad * 1.5) / Math.max(7, h.length);
    g.font = '22px Inter, sans-serif';
    g.fillStyle = '#9a8a7c';
    g.strokeStyle = '#e2d6c2';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(pad, y(0)); g.lineTo(W, y(0)); g.stroke();
    g.fillText(money(max), 0, y(max) + 8);
    h.forEach((r, i) => {
      const x = pad + i * bw + bw * 0.15;
      g.fillStyle = '#d9c6a6';
      g.fillRect(x, y(r.revenue), bw * 0.32, y(0) - y(r.revenue));
      g.fillStyle = r.profit >= 0 ? '#2f7d4f' : '#b5483a';
      const top = Math.min(y(0), y(r.profit));
      g.fillRect(x + bw * 0.36, top, bw * 0.32, Math.abs(y(r.profit) - y(0)));
      g.fillStyle = '#9a8a7c';
      if (h.length <= 12 || i % 2 === 0) g.fillText(String(r.day), x + bw * 0.2, Hh - 2);
    });
  }
}
