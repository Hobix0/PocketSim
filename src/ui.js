// HUD, Baumenü, Inspektor, Aufträge, Forschung, Statistik, Menü.
import { ITEMS, ITEM_IDS, RECIPES, BUILDINGS, CATEGORIES, RESEARCH, RESEARCH_BY_ID, GOALS, CONFIG, BUYABLE } from './data.js';
import { fmtMoney, levelMul, upgradeCost } from './sim.js';
import { forkliftStatus, shippable } from './logistics.js';
import { sound, audio } from './audio.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ICONS = {
  cursor: '<path d="M5 3l14 8-6 2-3 6z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-3-6.2M20 4v5h-5"/>',
  flask: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7 15h10"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  cube: '<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/>',
};
export const icon = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]}</svg>`;

const fmt = (n, d = 0) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: d, minimumFractionDigits: d });
const fmtTime = s => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export class UI {
  constructor(game, controls, renderer, thumbs, api) {
    Object.assign(this, { game, controls, renderer, thumbs, api });
    this.cat = 'logistik';
    this.modal = null;
    this.goalCollapsed = false;
    this.lastHtml = {};

    document.querySelectorAll('[data-icon]').forEach(el => { el.outerHTML = icon(el.dataset.icon); });
    document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { sound('ui'); this.open(b.dataset.open); }));
    $('#isoBtn').addEventListener('click', () => { sound('ui'); this.controls.setIso(!this.controls.cam.iso); });
    $('#modal').addEventListener('pointerdown', e => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) this.close(); });
    $('#goal').addEventListener('click', () => { this.goalCollapsed = !this.goalCollapsed; this.renderGoal(); });

    this.renderSpeed();
    this.renderTools();
    this.renderCats();
    this.renderBuild();
    this.renderGoal();
    this.renderContracts();

    game.on('toast', t => this.toast(t.text, t.kind));
    game.on('contracts', () => this.renderContracts(true));
    game.on('research', () => { this.renderBuild(); this.renderSelected(true); });
    game.on('goal', () => { this.renderGoal(); sound('success'); });
    game.on('event', () => this.renderEvent());
    game.on('entityChanged', () => this.renderSelected(true));
    game.on('world', () => {
      if (controls.selected != null && !game.entities.has(controls.selected)) controls.select(null);
    });
    this.setupBuildTooltips();
    this._t = 0;
  }

  thumb(type) { return this.thumbs.buildings[type]; }
  itemImg(id, title = true) { return `<img src="${this.thumbs.items[id]}" alt="" ${title ? `title="${esc(ITEMS[id].name)}"` : ''}>`; }

  // ───────────────────────── Laufende Aktualisierung
  frame(dt) {
    this._t += dt;
    if (this._t < 0.2) return;
    this._t = 0;
    const g = this.game;
    $('#money').textContent = fmtMoney(g.money);
    const inc = g.incomePerMin();
    const incEl = $('#income');
    incEl.textContent = g.stats.history.length ? `${inc >= 0 ? '+' : ''}${fmtMoney(inc)}/min` : '';
    incEl.classList.toggle('neg', inc < 0);
    const p = g.power || { demand: 0, supply: 0, ratio: 1 };
    const bar = $('#powerBar');
    bar.style.width = `${p.supply > 0 ? Math.min(100, p.demand / p.supply * 100) : 0}%`;
    bar.className = p.ratio < 1 ? 'bad' : p.demand > p.supply * 0.85 ? 'warn' : '';
    $('#powerText').textContent = `${fmt(p.demand)} / ${fmt(p.supply)} kW`;
    const h = g.dayFrac * 24;
    $('#clock').textContent = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60 / 10) * 10).padStart(2, '0')}`;
    $('#dayLabel').textContent = `Tag ${g.day}`;
    $('#weather').textContent = g.daylight > 0.05 ? 'TAGSCHICHT' : 'NACHTSCHICHT';
    this.refreshBuild();
    this.renderContracts();
    this.renderEvent();
    this.renderSelected();
    const ready = RESEARCH.filter(r => g.researchState(r.id) === 'ready').length;
    const badge = $('#researchBadge');
    badge.classList.toggle('hidden', !ready);
    badge.textContent = ready;
    if (this.modal && this.modal !== 'menu') this.renderModal();
  }

  setHtml(el, key, html) {
    if (this.lastHtml[key] === html) return false;
    this.lastHtml[key] = html;
    el.innerHTML = html;
    return true;
  }

  // ───────────────────────── Geschwindigkeit
  renderSpeed() {
    const el = $('#speed'), g = this.game;
    const opts = [[0, icon('pause')], [1, '1×'], [2, '2×'], [4, '4×']];
    el.innerHTML = opts.map(([v, l]) => `<button data-v="${v}" title="${v ? `Tempo ${v}×` : 'Pause (Leertaste)'}" class="${(v === 0 ? g.paused : !g.paused && g.speed === v) ? 'on' : ''}">${l}</button>`).join('');
    el.querySelectorAll('button').forEach(b => b.onclick = () => {
      const v = +b.dataset.v;
      if (v === 0) g.paused = !g.paused; else { g.paused = false; g.speed = v; }
      sound('ui');
      this.renderSpeed();
    });
  }

  // ───────────────────────── Werkzeuge & Baumenü
  renderTools() {
    const c = this.controls;
    $('#tools').innerHTML = `
      <button data-t="select" class="${c.tool === 'select' ? 'on' : ''}" title="Auswählen (Esc)">${icon('cursor')}</button>
      <button data-t="delete" class="del ${c.tool === 'delete' ? 'on' : ''}" title="Abreißen (X)">${icon('trash')}<kbd>X</kbd></button>
      <button data-t="rotate" title="Drehen (R)">${icon('rotate')}<kbd>R</kbd></button>`;
    $('#tools').querySelectorAll('button').forEach(b => b.onclick = () => {
      sound('ui');
      if (b.dataset.t === 'rotate') c.rotate();
      else c.setTool(b.dataset.t === c.tool && b.dataset.t !== 'select' ? 'select' : b.dataset.t);
    });
  }

  renderCats() {
    $('#cats').innerHTML = CATEGORIES.map(c => `<button data-c="${c.id}" class="${this.cat === c.id ? 'on' : ''}">${c.name}</button>`).join('');
    $('#cats').querySelectorAll('button').forEach(b => b.onclick = () => { this.cat = b.dataset.c; sound('ui'); this.renderCats(); this.renderBuild(); });
  }

  buildList() { return Object.keys(BUILDINGS).filter(t => BUILDINGS[t].cat === this.cat); }

  renderBuild() {
    const g = this.game, c = this.controls;
    $('#buildItems').innerHTML = this.buildList().map((t, i) => {
      const B = BUILDINGS[t], unlocked = g.isUnlocked(t);
      const cost = unlocked ? fmtMoney(B.cost) : RESEARCH_BY_ID[B.unlock].name;
      return `<button class="bitem ${unlocked ? '' : 'locked'} ${c.buildType === t ? 'on' : ''}" data-b="${t}">
        <kbd>${i + 1}</kbd><img src="${this.thumb(t)}" alt=""><span class="n">${B.name}</span><span class="c">${cost}</span></button>`;
    }).join('');
    $('#buildItems').querySelectorAll('.bitem').forEach(b => b.onclick = () => this.pickBuilding(b.dataset.b));
  }

  pickBuilding(t) {
    const g = this.game;
    if (!g.isUnlocked(t)) { this.toast(`Erfordert Forschung „${RESEARCH_BY_ID[BUILDINGS[t].unlock].name}“`, 'warn'); sound('error'); return; }
    sound('ui');
    this.controls.setTool('build', t);
  }

  refreshBuild() {
    const g = this.game;
    $('#buildItems').querySelectorAll('.bitem').forEach(b => {
      const t = b.dataset.b;
      b.classList.toggle('poor', g.isUnlocked(t) && g.money < BUILDINGS[t].cost);
      b.classList.toggle('on', this.controls.buildType === t);
    });
  }

  setupBuildTooltips() {
    const tip = $('#tooltip');
    const items = $('#buildItems');
    items.addEventListener('pointerover', e => {
      const b = e.target.closest('.bitem');
      if (!b || e.pointerType === 'touch') return;
      const B = BUILDINGS[b.dataset.b];
      const extra = [];
      if (B.power) extra.push(`${B.power} kW`);
      if (B.supply) extra.push(`+${B.supply} kW`);
      extra.push(`${B.size}×${B.size}`);
      tip.innerHTML = `<b>${B.name}</b>${esc(B.desc)}<div class="meta"><span>${fmtMoney(B.cost)}</span>${extra.map(x => `<span>${x}</span>`).join('')}</div>`;
      tip.classList.remove('hidden');
      const r = b.getBoundingClientRect();
      tip.style.left = `${Math.max(8, Math.min(innerWidth - 270, r.left + r.width / 2 - 130))}px`;
      tip.style.top = `${r.top - tip.offsetHeight - 10}px`;
    });
    items.addEventListener('pointerout', e => { if (!e.relatedTarget?.closest?.('.bitem')) tip.classList.add('hidden'); });
    items.addEventListener('click', () => tip.classList.add('hidden'));
  }

  onTool() { this.renderTools(); this.renderBuild(); }

  onIso(on) {
    const b = $('#isoBtn');
    b.classList.toggle('on', on);
    b.querySelector('span').textContent = on ? 'Isometrisch' : 'Perspektive';
    this.api.saveSettings();
  }

  onKey(k) {
    if (k === ' ') { this.game.paused = !this.game.paused; this.renderSpeed(); }
    else if (k === 'f') this.modal === 'research' ? this.close() : this.open('research');
    else if (k === 't') this.modal === 'stats' ? this.close() : this.open('stats');
    else if (k === 'tab') { const i = CATEGORIES.findIndex(c => c.id === this.cat); this.cat = CATEGORIES[(i + 1) % CATEGORIES.length].id; this.renderCats(); this.renderBuild(); }
    else if (/^[1-9]$/.test(k)) { const t = this.buildList()[+k - 1]; if (t) this.pickBuilding(t); }
  }

  onEscape() { if (this.modal) this.close(); }

  // ───────────────────────── Hover
  onHover(t) {
    const el = $('#hoverInfo'), g = this.game;
    if (!t) { el.textContent = ''; return; }
    const parts = [`Feld ${t.x}, ${t.z}`];
    const i = g.idx(t.x, t.z);
    if (g.terrain[i] === 2) parts.push('Hallenstütze');
    const ent = g.at(t.x, t.z);
    if (ent) parts.push(BUILDINGS[ent.type].name);
    el.textContent = parts.join(' · ');
  }

  // ───────────────────────── Ziel
  renderGoal() {
    const g = this.game, goal = GOALS[g.goalIndex], el = $('#goal');
    if (!goal) { el.classList.add('hidden'); return; }
    el.classList.toggle('collapsed', this.goalCollapsed);
    const steps = GOALS.map((_, i) => `<i class="${i < g.goalIndex ? 'done' : i === g.goalIndex ? 'now' : ''}"></i>`).join('');
    el.innerHTML = `<span class="label">Aktuelles Ziel</span><span class="count">${String(g.goalIndex + 1).padStart(2, '0')} / ${String(GOALS.length).padStart(2, '0')}</span>
      <span class="text">${esc(goal.text)}</span><span class="reward">+${fmtMoney(goal.reward)}</span><span class="steps">${steps}</span>`;
  }

  // ───────────────────────── Aufträge
  renderContracts() {
    const g = this.game;
    $('#contractCount').textContent = `${g.contracts.length}/3`;
    const html = g.contracts.length ? g.contracts.map(c => `
      <div class="contract">
        ${this.itemImg(c.item)}
        <span class="title">${c.delivered}/${c.qty} ${esc(ITEMS[c.item].name)}</span>
        <span class="reward">+${fmtMoney(c.reward)}</span>
        <span class="prog"><i style="width:${c.delivered / c.qty * 100}%"></i></span>
        <span class="time ${c.time < 60 ? 'urgent' : ''}">${fmtTime(c.time)}</span>
      </div>`).join('') : '<div class="empty">Neue Aufträge treffen bald ein. Liefere die Teile an den Versand.</div>';
    this.setHtml($('#contracts'), 'contracts', html);
  }

  // ───────────────────────── Ereignis
  renderEvent() {
    const ev = this.game.event, el = $('#eventBanner');
    if (!ev) { el.classList.add('hidden'); this.lastHtml.event = ''; return; }
    el.classList.remove('hidden');
    this.setHtml(el, 'event', `<b>${esc(ev.title)}</b><span>${esc(ev.text)}</span><span class="bar"><i style="width:${ev.left / ev.duration * 100}%"></i></span>`);
  }

  // ───────────────────────── Inspektor
  onSelect() { this.renderSelected(true); }

  renderSelected(force = false) {
    const g = this.game, el = $('#inspector');
    const e = this.controls.selected != null ? g.entities.get(this.controls.selected) : null;
    if (!e) { el.classList.add('hidden'); this.lastHtml.insp = ''; return; }
    el.classList.remove('hidden');
    const B = BUILDINGS[e.type];
    let status = '', body = '', progress = null;
    const powerOk = (g.power?.ratio ?? 1) >= 0.999;
    const pm = g.power?.ratio ?? 1;

    if (B.kind === 'machine') {
      const r = RECIPES[e.recipe];
      const missing = r && Object.keys(r.in).some(k => (e.inBuf[k] || 0) < r.in[k]);
      const outFull = Object.values(e.outBuf).reduce((a, b) => a + b, 0) >= 8;
      status = e.crafting ? (powerOk ? ['ok', 'Produziert'] : ['bad', `Strommangel (${Math.round(pm * 100)} %)`]) : outFull ? ['bad', 'Ausgabe voll – Abtransport fehlt'] : missing ? ['idle', 'Wartet auf Zutaten'] : ['idle', 'Bereit'];
      progress = e.progress;
      const speed = g.mods.machineMul * levelMul(e.level);
      const rs = g.recipesFor(e.type);
      body += `<div class="sect">Rezept</div><div class="recipes">${rs.map(rid => {
        const R = RECIPES[rid], ok = g.recipeUnlocked(rid);
        const ins = Object.entries(R.in).map(([k, n]) => `<span class="chip">${n}${this.itemImg(k)}</span>`).join('');
        const outs = Object.entries(R.out).map(([k, n]) => `<span class="chip">${n}${this.itemImg(k)}</span>`).join('');
        return `<button class="recipe ${rid === e.recipe ? 'on' : ''}" data-recipe="${rid}" ${ok ? '' : 'disabled style="opacity:.4"'}>${ins}<span class="arrow">→</span>${outs}<span class="t">${ok ? `${fmt(R.time / speed, 1)} s` : 'GESPERRT'}</span></button>`;
      }).join('')}</div>`;
      if (r) {
        body += `<div class="sect">Eingang</div><div class="bufs">${Object.entries(r.in).map(([k, n]) => `<span class="buf ${(e.inBuf[k] || 0) < n ? 'low' : ''}">${this.itemImg(k)}${e.inBuf[k] || 0}/${n}</span>`).join('')}</div>`;
        const outs = Object.entries(e.outBuf).filter(([, n]) => n > 0);
        body += `<div class="sect">Ausgang</div><div class="bufs">${outs.length ? outs.map(([k, n]) => `<span class="buf">${this.itemImg(k)}${n}</span>`).join('') : '<span class="empty">leer</span>'}</div>`;
        const per = 60 / (r.time / speed);
        body += `<div class="sect">Leistung</div><div class="kv">${Object.entries(r.out).map(([k, n]) => `<span>${ITEMS[k].name}</span><span>${fmt(per * n, 1)}/min</span>`).join('')}${Object.entries(r.in).map(([k, n]) => `<span>Bedarf ${ITEMS[k].name}</span><span>${fmt(per * n, 1)}/min</span>`).join('')}<span>Strom</span><span>${B.power} kW</span></div>`;
      }
    } else if (B.kind === 'inbound') {
      const price = g.buyPrice(e.order) * CONFIG.palletQty, perMin = 60 / (CONFIG.palletInterval / levelMul(e.level));
      status = !e.on ? ['idle', 'Bestellung pausiert'] : e._poor ? ['bad', 'Zu wenig Geld für die nächste Palette'] : e.dock.length >= CONFIG.dockSlots ? ['bad', 'Tor voll – Stapler fehlt oder Regal voll'] : ['ok', 'Nächster LKW kommt'];
      progress = e.on && e.dock.length < CONFIG.dockSlots ? Math.min(1, e.timer / CONFIG.palletInterval) : null;
      body += `<div class="sect">Material bestellen · Palette à ${CONFIG.palletQty}</div><div class="recipes">${BUYABLE.map(id => {
        const ok = g.buyUnlocked(id);
        return `<button class="recipe ${id === e.order ? 'on' : ''}" data-buy="${id}" ${ok ? '' : 'disabled style="opacity:.4"'}><span class="chip">${this.itemImg(id)}</span>${ITEMS[id].name}<span class="t">${ok ? fmtMoney(g.buyPrice(id) * CONFIG.palletQty) : 'GESPERRT'}</span></button>`;
      }).join('')}</div>
        <div class="sect">Am Tor</div>${this.palletsHtml(e.dock, CONFIG.dockSlots)}
        <div class="kv" style="margin-top:10px"><span>Lieferung</span><span>${fmt(perMin, 1)} Paletten/min</span><span>Kosten</span><span>${fmtMoney(price * perMin)}/min</span></div>`;
    } else if (B.kind === 'rack') {
      const used = e.slots.filter(Boolean).length;
      status = used >= B.slots ? ['bad', 'Regal voll'] : ['ok', `${used} / ${B.slots} Plätze belegt`];
      body += `<div class="sect">Lagerplätze</div>${this.palletsHtml(e.slots, B.slots)}
        <div class="kv" style="margin-top:10px"><span>Unterwegs hierher</span><span>${e.incoming || 0}</span></div>`;
    } else if (B.kind === 'feeder') {
      const p = e.pallets[0];
      status = p ? ['ok', `Gibt ${ITEMS[p.item].name} aufs Band`] : ['bad', `Wartet auf eine Palette ${ITEMS[e.want].name}`];
      const opts = this.feederOptions();
      body += `<div class="sect">Angefordertes Material</div><div class="itemgrid">${opts.map(id => `<button class="ichip ${id === e.want ? 'on' : ''}" data-want="${id}" title="${esc(ITEMS[id].name)}">${this.itemImg(id, false)}</button>`).join('')}</div>
        <div class="sect">Paletten</div>${this.palletsHtml(e.pallets, 2)}
        <div class="kv" style="margin-top:10px"><span>Unterwegs hierher</span><span>${e.incoming || 0}</span><span>Im Lager verfügbar</span><span>${g.palletsIn('rack', e.want)}</span></div>`;
    } else if (B.kind === 'collector') {
      const filling = e.pallets.find(p => !p.ready), ready = e.pallets.filter(p => p.ready).length;
      status = ready >= 2 ? ['bad', 'Beide Paletten voll – Stapler fehlt'] : filling?.qty ? ['ok', `Palettiert ${ITEMS[filling.item].name}`] : ['idle', 'Wartet auf Teile vom Band'];
      const dest = filling?.qty ? (shippable(g, filling.item) ? 'Lager, danach Versand' : 'Lager / Aufgabestation') : '–';
      body += `<div class="sect">Paletten</div>${this.palletsHtml(e.pallets, 2)}
        <div class="kv" style="margin-top:10px"><span>Ziel</span><span>${dest}</span><span>Teilpalette nach</span><span>${CONFIG.partialPickup} s ohne Nachschub</span></div>`;
    } else if (B.kind === 'parking') {
      const fl = g.forklifts.filter(f => f.home === e.id);
      status = ['ok', `${fl.length} Gabelstapler`];
      body += `<div class="sect">Stapler</div><div class="kv">${fl.map((f, i) => `<span>Stapler ${i + 1}</span><span>${forkliftStatus(f)}</span>`).join('')}</div>`;
    } else if (B.kind === 'outbound') {
      status = ['ok', 'Nimmt alle Teile von jeder Seite an'];
      const top = ITEM_IDS.filter(k => g.stats.sold[k]).sort((a, b) => g.ratePerMin('sold', b) * ITEMS[b].price - g.ratePerMin('sold', a) * ITEMS[a].price).slice(0, 6);
      body += `<div class="sect">Aktuelle Preise</div><div class="kv">${top.length ? top.map(k => `<span>${ITEMS[k].name}</span><span>${fmtMoney(g.price(k))}</span>`).join('') : '<span>Noch nichts verkauft</span><span></span>'}</div>`;
    } else if (B.kind === 'decor') {
      status = ['idle', 'Altbestand'];
      body += `<div class="kv"><span>Entsorgung</span><span>${B.removeCost ? fmtMoney(B.removeCost) : 'kostenlos'}</span></div>`;
    } else if (B.kind === 'grid') {
      const p = g.power;
      status = ['ok', 'Verbunden mit dem Stadtnetz'];
      body += `<div class="kv"><span>Kapazität</span><span>${fmt(B.supply * g.mods.gridMul)} kW</span><span>Netzbezug gesamt</span><span>${fmt(p?.gridDraw || 0)} kW</span><span>Kosten</span><span>${fmtMoney((p?.gridDraw || 0) * CONFIG.gridCostPerKWs * 60 * (g.event?.gridCost || 1))}/min</span></div>`;
    } else if (B.kind === 'belt') {
      status = ['ok', `${e.items.length} Teile auf der Bahn`];
      body += `<div class="kv"><span>Durchsatz max.</span><span>${fmt(CONFIG.beltSpeed * g.mods.beltMul / CONFIG.beltSpacing * 60)} Teile/min</span></div>`;
    } else {
      status = ['ok', 'Aktiv'];
    }

    const canUp = g.canUpgrade(e);
    const cost = canUp ? upgradeCost(e) : 0;
    const html = `
      <div class="insp-head"><img src="${this.thumb(e.type)}" alt=""><div><h2>${B.name}${['machine', 'inbound'].includes(B.kind) ? `<span class="lvl">Stufe ${e.level}</span>` : ''}</h2><p>${esc(B.desc)}</p></div><button class="x" data-act="close">&times;</button></div>
      <div class="status ${status[0]}">${status[1]}</div>
      ${progress != null ? `<div class="progress"><i id="inspProg" style="width:${progress * 100}%"></i></div>` : ''}
      ${body}
      ${B.kind === 'machine' ? '<div class="ports"><i></i>Ausgang vorne (Pfeil) · Eingänge hinten und seitlich</div>' : ''}
      ${B.kind === 'feeder' ? '<div class="ports"><i></i>Bandseite vorne (Pfeil) · Stapler von hinten oder seitlich</div>' : ''}
      ${B.kind === 'collector' ? '<div class="ports"><i></i>Band kommt vorne an (Pfeil) · Stapler von hinten oder seitlich</div>' : ''}
      <div class="actions">
        ${canUp ? `<button class="btn primary" data-act="upgrade" ${g.money < cost ? 'disabled' : ''}>${icon('up')} Stufe ${e.level + 1} · ${fmtMoney(cost)}</button>` : ''}
        ${B.kind === 'inbound' ? `<button class="btn" data-act="toggle">${e.on ? 'Pausieren' : 'Fortsetzen'}</button>` : ''}
        ${B.kind === 'collector' && e.pallets.some(p => !p.ready && p.qty > 0) ? '<button class="btn" data-act="release">Abholen lassen</button>' : ''}
        ${B.kind === 'parking' && g.forklifts.filter(f => f.home === e.id).length < B.maxForklifts ? `<button class="btn primary" data-act="forklift" ${g.money < B.forkliftCost ? 'disabled' : ''}>+ Stapler · ${fmtMoney(B.forkliftCost)}</button>` : ''}
        ${B.kind === 'decor' ? `<button class="btn danger" data-act="delete" ${g.money < B.removeCost ? 'disabled' : ''}>${icon('trash')} ${B.removeCost ? `Entsorgen · ${fmtMoney(B.removeCost)}` : 'Wegfahren'}</button>` : `
        ${B.wall ? '' : `<button class="btn" data-act="rotate" title="R">${icon('rotate')}</button>`}
        ${g.isUnlocked(e.type) ? `<button class="btn" data-act="copy" title="Kopieren (C)">${icon('copy')}</button>` : ''}
        <button class="btn danger" data-act="delete" title="Abreißen">${icon('trash')}</button>`}
      </div>`;
    // Fortschritt ohne Neuaufbau aktualisieren, damit Klicks nicht verloren gehen
    const key = html.replace(/style="width:[^"]*"/, '');
    if (!force && this.lastHtml.inspKey === key) {
      const pr = $('#inspProg');
      if (pr) pr.style.width = `${progress * 100}%`;
      return;
    }
    this.lastHtml.inspKey = key;
    el.innerHTML = html;
    el.onpointerdown = ev => {
      const b = ev.target.closest('[data-act],[data-recipe],[data-buy],[data-want]');
      if (!b || b.disabled) return;
      ev.preventDefault();
      if (b.dataset.recipe) { g.setRecipe(e.id, b.dataset.recipe); sound('click'); return; }
      if (b.dataset.buy) { g.setInbound(e.id, b.dataset.buy); sound('click'); return; }
      if (b.dataset.want) { g.setFeeder(e.id, b.dataset.want); sound('click'); return; }
      const a = b.dataset.act;
      if (a === 'close') this.controls.select(null);
      if (a === 'upgrade' && g.upgrade(e.id)) sound('money');
      if (a === 'rotate') { g.rotate(e.id); sound('rotate'); }
      if (a === 'toggle') { g.toggleInbound(e.id); sound('click'); }
      if (a === 'release') { g.releaseCollector(e.id); sound('click'); }
      if (a === 'forklift' && g.buyForklift(e.id)) sound('money');
      if (a === 'copy') { this.controls.buildRot = e.rot; this.controls.setTool('build', e.type); }
      if (a === 'delete') { if (g.remove(e.id)) { sound('delete'); this.controls.select(null); } }
      this.renderSelected(true);
    };
  }

  // Palettenplätze als Kacheln
  palletsHtml(list, slots) {
    const cells = Array.from({ length: slots }, (_, i) => {
      const p = list[i];
      if (!p) return '<span class="pslot empty"></span>';
      return `<span class="pslot ${p.ready ? 'ready' : ''} ${p.res ? 'res' : ''}" title="${esc(ITEMS[p.item].name)}">${this.itemImg(p.item, false)}<b>${p.qty}</b></span>`;
    }).join('');
    return `<div class="pslots">${cells}</div>`;
  }

  // Material, das eine Aufgabestation anfordern kann: Einkaufsware und alles, was gefertigt werden kann
  feederOptions() {
    const g = this.game;
    return ITEM_IDS.filter(id => (ITEMS[id].buy && g.buyUnlocked(id)) || g.producible().includes(id));
  }

  // ───────────────────────── Modals
  open(name) {
    this.modal = name;
    this.lastHtml.modal = '';
    $('#modal').classList.remove('hidden');
    this.renderModal();
  }

  close() {
    this.modal = null;
    $('#modal').classList.add('hidden');
  }

  renderModal() {
    const body = $('#modalBody');
    let html = '';
    if (this.modal === 'research') html = this.researchHtml();
    else if (this.modal === 'stats') html = this.statsHtml();
    else if (this.modal === 'menu') html = this.menuHtml();
    if (this.setHtml(body, 'modal', html)) this.bindModal(body);
    if (this.modal === 'stats') this.drawChart();
  }

  researchHtml() {
    const g = this.game;
    const depth = {};
    const d = id => depth[id] ??= RESEARCH_BY_ID[id].prereq.reduce((m, p) => Math.max(m, d(p) + 1), 0);
    RESEARCH.forEach(r => d(r.id));
    const cards = [...RESEARCH].sort((a, b) => depth[a.id] - depth[b.id]).map(r => {
      const st = g.researchState(r.id);
      const reqs = Object.entries(r.req).map(([k, n]) => {
        const have = Math.min(n, g.stats.sold[k] || 0);
        return `<div class="req ${have >= n ? 'ok' : ''}">${this.itemImg(k)}<span class="bar"><i style="width:${have / n * 100}%"></i></span><span>${fmt(have)}/${fmt(n)}</span></div>`;
      }).join('');
      const pre = r.prereq.length ? `<div class="pre">Benötigt: ${r.prereq.map(p => RESEARCH_BY_ID[p].name).join(', ')}</div>` : '';
      const btn = st === 'done' ? '<span class="tag good">Erforscht</span>'
        : `<button class="btn ${st === 'ready' ? 'primary' : ''}" data-research="${r.id}" ${st === 'ready' ? '' : 'disabled'}>${st === 'locked' ? 'Gesperrt' : st === 'req' ? 'Lieferungen fehlen' : `Erforschen · ${fmtMoney(r.cost)}`}</button>`;
      return `<div class="rcard ${st}"><h4>${r.name}${st !== 'done' ? `<span class="tag">${fmtMoney(r.cost)}</span>` : ''}</h4><p>${esc(r.desc)}</p>${st !== 'done' ? reqs + pre : ''}${btn}</div>`;
    }).join('');
    return `<h2>Forschung</h2><p class="sub">Forschung kostet Geld und verlangt, dass du bestimmte Teile bereits an den Versand geliefert hast. Lieferungen für Aufträge zählen mit.</p><div class="rgrid">${cards}</div>`;
  }

  statsHtml() {
    const g = this.game, s = g.stats;
    const rows = ITEM_IDS.filter(k => s.produced[k] || s.sold[k]).map(k => {
      const m = g.market[k];
      const trend = m > 1.02 ? '<span class="trend up">▲</span>' : m < 0.98 ? '<span class="trend down">▼</span>' : '';
      return `<tr><td>${this.itemImg(k, false)}${ITEMS[k].name}</td><td>${fmt(g.ratePerMin('produced', k), 1)}</td><td>${fmt(g.ratePerMin('sold', k), 1)}</td><td>${fmt(s.sold[k] || 0)}</td><td>${fmtMoney(g.price(k))} ${trend}</td><td>${Math.round(m * 100)} %</td></tr>`;
    }).join('');
    const buildings = g.countBuildings(e => e.type !== 'band');
    return `<h2>Statistik</h2><p class="sub">Tag ${g.day} · ${buildings} Gebäude · ${g.countBuildings(e => e.type === 'band')} Förderbänder</p>
      <div class="stats-grid">
        <div class="kpi"><label>Einnahmen gesamt</label><b>${fmtMoney(s.earned)}</b></div>
        <div class="kpi"><label>Pro Minute</label><b>${fmtMoney(g.incomePerMin())}</b></div>
        <div class="kpi"><label>Einkauf + Strom</label><b>${fmtMoney((s.buyCost || 0) + s.powerCost)}</b></div>
        <div class="kpi"><label>Aufträge erfüllt</label><b>${s.contractsDone}</b></div>
      </div>
      <canvas class="chart" id="chart"></canvas>
      <table class="items-table"><thead><tr><th>Ware</th><th>Prod./min</th><th>Geliefert/min</th><th>Geliefert</th><th>Preis</th><th>Markt</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="empty">Noch keine Produktion.</td></tr>'}</tbody></table>`;
  }

  drawChart() {
    const cv = $('#chart');
    if (!cv) return;
    const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const hist = this.game.stats.history.slice(-120);
    c.fillStyle = '#8a8380'; c.font = '11px "Geist Mono", monospace';
    if (hist.length < 2) { c.fillText('Daten werden gesammelt …', 14, 24); return; }
    const pad = 28, maxE = Math.max(1, ...hist.map(p => p.earned)), maxM = Math.max(1, ...hist.map(p => p.money)), minM = Math.min(0, ...hist.map(p => p.money));
    const bw = (w - pad * 2) / hist.length;
    hist.forEach((p, i) => {
      const bh = p.earned / maxE * (h - pad * 2);
      c.fillStyle = 'rgba(160,202,146,.55)';
      c.fillRect(pad + i * bw + 1, h - pad - bh, Math.max(1, bw - 2), bh);
      const ph = (p.power + (p.buy || 0)) / maxE * (h - pad * 2);
      c.fillStyle = '#ee6018';
      c.fillRect(pad + i * bw + 1, h - pad - ph, Math.max(1, bw - 2), 2);
    });
    c.beginPath();
    hist.forEach((p, i) => {
      const x = pad + i * bw + bw / 2, y = h - pad - (p.money - minM) / (maxM - minM) * (h - pad * 2);
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    });
    c.strokeStyle = '#eeeeee'; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = '#8a8380';
    c.fillText('KAPITAL', pad, 16);
    c.fillStyle = '#eeeeee'; c.fillRect(pad - 12, 9, 8, 2);
    c.fillStyle = '#a0ca92'; c.fillRect(pad + 50, 8, 8, 8);
    c.fillStyle = '#8a8380'; c.fillText('EINNAHMEN JE 5 S · STROMKOSTEN', pad + 62, 16);
    c.fillText(`max ${fmtMoney(maxM)}`, w - pad - 90, 16);
  }

  menuHtml() {
    const q = this.renderer.quality;
    return `<h2>Menü</h2><p class="sub">Dein Spiel wird automatisch alle 30 Sekunden im Browser gespeichert.</p>
      <div class="menu-grid">
        <section><h4>Spielstand</h4><div class="row">
          <button class="btn primary" data-m="save">Jetzt speichern</button>
          <button class="btn" data-m="export">Exportieren</button>
          <button class="btn" data-m="import">Importieren</button>
          <button class="btn danger" data-m="new">Neues Spiel</button>
        </div><input type="file" id="importFile" accept="application/json,.json" hidden></section>
        <section><h4>Einstellungen</h4>
          <label class="toggle">Schatten <input type="checkbox" data-q="shadows" ${q.shadows ? 'checked' : ''}></label>
          <label class="toggle">Umgebungsverdeckung (AO) <input type="checkbox" data-q="ao" ${q.ao ? 'checked' : ''}></label>
          <label class="toggle">Leuchteffekte (Bloom) <input type="checkbox" data-q="bloom" ${q.bloom ? 'checked' : ''}></label>
          <label class="toggle">Dachbinder anzeigen <input type="checkbox" data-q="trusses" ${q.trusses ? 'checked' : ''}></label>
          <label class="toggle">Sound <input type="checkbox" data-q="sound" ${audio.enabled ? 'checked' : ''}></label>
        </section>
        <section><h4>Steuerung</h4><div class="keys">
          <kbd>Links</kbd><span>Auswählen · Bauen · Ziehen verschiebt die Karte</span>
          <kbd>Rechts</kbd><span>Karte verschieben</span>
          <kbd>Mitte</kbd><span>Kamera drehen</span>
          <kbd>WASD</kbd><span>Kamera bewegen</span>
          <kbd>Q / E</kbd><span>Kamera drehen (isometrisch in 90°-Schritten)</span>
          <kbd>I</kbd><span>Isometrische Ansicht ein/aus</span>
          <kbd>R</kbd><span>Gebäude / Band drehen</span>
          <kbd>X</kbd><span>Abrisswerkzeug</span>
          <kbd>C</kbd><span>Gebäude unter der Maus kopieren</span>
          <kbd>1–9</kbd><span>Gebäude wählen · <kbd>Tab</kbd> Kategorie</span>
          <kbd>F / T</kbd><span>Forschung / Statistik</span>
          <kbd>Leertaste</kbd><span>Pause</span>
        </div></section>
        <section><h4>So funktioniert's</h4><div class="keys" style="grid-template-columns:1fr">
          <span>Am Wareneingang kommen Paletten per LKW an. Gabelstapler lagern sie ins Regal ein.</span>
          <span>Eine Aufgabestation fordert Material an, der Stapler bringt die Palette, die Teile laufen aufs Band.</span>
          <span>Die Abnahmestation palettiert Teile vom Band. Volle Paletten gehen ins Lager, zur nächsten Aufgabestation oder zum Versand.</span>
          <span>Stapler fahren nur über freie Hallenfelder. Rollenbahnen sind für sie Wände, also Gänge freilassen.</span>
          <span>Maschinen geben nur vorne ab (oranger Pfeil am Boden) und nehmen hinten und seitlich an.</span>
          <span>Die Signalsäule zeigt den Zustand: grün läuft, orange blockiert, aus wartet.</span>
          <span>Alles, was im Versand ankommt, wird verkauft oder für einen Auftrag gezählt.</span>
          <span>Viel von demselben Teil drückt den Preis. Lohnender sind Aufträge und höhere Produktstufen.</span>
          <span>Auf dem Handy: Mit zwei Fingern bewegen, zoomen und drehen.</span>
        </div></section>
      </div>`;
  }

  bindModal(body) {
    const g = this.game;
    body.querySelectorAll('[data-research]').forEach(b => b.onpointerdown = () => {
      if (g.doResearch(b.dataset.research)) { sound('success'); this.lastHtml.modal = ''; this.renderModal(); }
    });
    body.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
      const m = b.dataset.m;
      if (m === 'save') { this.api.save(); this.toast('Gespeichert', 'success'); }
      if (m === 'export') this.api.exportSave();
      if (m === 'import') body.querySelector('#importFile').click();
      if (m === 'new' && confirm('Neues Spiel beginnen? Der aktuelle Spielstand geht verloren.')) { this.close(); this.api.newGame(); }
    });
    const file = body.querySelector('#importFile');
    if (file) file.onchange = async () => {
      const f = file.files[0];
      if (!f) return;
      try { this.api.importSave(JSON.parse(await f.text())); this.close(); this.toast('Spielstand importiert', 'success'); }
      catch (err) { this.toast(`Import fehlgeschlagen: ${err.message}`, 'warn'); }
    };
    body.querySelectorAll('[data-q]').forEach(inp => inp.onchange = () => {
      const k = inp.dataset.q;
      if (k === 'sound') audio.enabled = inp.checked;
      else this.renderer.setQuality({ [k]: inp.checked });
      this.api.saveSettings();
    });
    body.querySelectorAll('[data-close]').forEach(b => b.onclick = () => this.close());
  }

  // ───────────────────────── Toasts
  toast(text, kind = 'info') {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    if (kind === 'warn') sound('warn');
    if (kind === 'event') sound('event');
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, kind === 'warn' ? 2600 : 4000);
  }
}
