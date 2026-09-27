// The office PC: a desktop, the «1Ц:Предприятие — Заявки» app and a match-3 game,
// all drawn on one 2D canvas that becomes the monitor texture.
import { ORG, PRODUCTS, CLIENTS, productByCode, clientByCode, shortFio } from './data.js';

const FONT = 'Arial, "Liberation Sans", "Helvetica Neue", Helvetica, sans-serif';
const f = (s, b) => `${b ? 'bold ' : ''}${s}px ${FONT}`;
const pad = (n, l = 2) => String(n).padStart(l, '0');
export const fmt = (n) => n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
const fmtTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const PASSWORD = '12345';
const TASKBAR = 44;

const SECTIONS = [
  { key: 'orders', name: 'Заявки', color: '#d9534f', glyph: 'cart', groups: [{ title: 'Заявки', items: [['Ввод заявки', 'form'], ['Журнал заявок', 'journal']] }] },
  { key: 'clients', name: 'Клиенты', color: '#3b78d0', glyph: 'person', groups: [{ title: 'Справочники', items: [['Клиенты (коды)', 'clients']] }] },
  { key: 'goods', name: 'Номенклатура', color: '#c98a1c', glyph: 'box', groups: [{ title: 'Справочники', items: [['Номенклатура и цены', 'goods']] }] },
  { key: 'reports', name: 'Отчеты', color: '#26917f', glyph: 'chart', groups: [{ title: 'Отчеты', items: [['Сводка заявок за день', 'report']] }] },
  { key: 'admin', name: 'Администрирование', color: '#555555', glyph: 'gear', groups: [{ title: 'Сервис', items: [['О программе', 'about'], ['Обновление конфигурации', 'msg:Обновление запрещено до конца смены. Приказ №14.']] }] },
];

// ============================================================
export class PC {
  // W×H is the logical UI size; the canvas is `px` wide and scaled up, so text stays readable on the monitor
  constructor(W = 1152, H = 648, px = 1600) {
    this.W = W; this.H = H;
    this.scale = px / W;
    this.canvas = document.createElement('canvas');
    this.canvas.width = px; this.canvas.height = Math.round(H * this.scale);
    this.g = this.canvas.getContext('2d');
    this.hits = []; this.wheels = [];
    this.mouse = { x: -100, y: -100, inside: false };
    this.hover = null; this.lastClick = { id: null, t: 0 };
    this.modal = null; this.popup = null; this.edit = null; this.toasts = [];
    this.dirty = true;
    this.onEvent = () => {};
    // desktop/shell
    this.front = null;            // 'onec' | 'match3' | null (desktop)
    this.launcher = false;
    this.splash = null;           // { t0 }
    this.login = null;            // { pass }
    this.appRunning = false;
    this.startMenu = false;
    this.deskSel = null;
    this.match3 = new Match3(this);
    // 1C app
    this.orders = [];
    this.counter = 214;
    this.tabs = [{ key: 'form', title: 'Ввод заявки' }];
    this.active = 0;
    this.menu = null;
    this.form = this.blankForm();
    this.lists = { journal: { sel: 0, scroll: 0 }, clients: { sel: 0, scroll: 0, search: '' }, goods: { sel: 0, scroll: 0 } };
    this.report = { state: 'idle' };
  }

  // ---------- input ----------
  pointerMove(x, y) {
    this.mouse = { x, y, inside: true };
    const h = this.hitAt(x, y);
    this.hover = h ? h.id : null;
    this.dirty = true;
  }
  pointerLeave() { this.mouse.inside = false; this.hover = null; this.dirty = true; }
  click(x, y) {
    this.pointerMove(x, y);
    const h = this.hitAt(x, y);
    if (this.edit && (!h || h.id !== this.edit.id) && !(h && h.keepEdit)) this.commitEdit();
    if (this.startMenu && (!h || !String(h.id).startsWith('sm'))) this.startMenu = false;
    if (!h) return;
    const now = performance.now();
    const dbl = this.lastClick.id === h.id && now - this.lastClick.t < 450;
    this.lastClick = { id: h.id, t: dbl ? 0 : now };
    if (dbl && h.dbl) h.dbl(); else if (h.fn) h.fn();
    this.onEvent('click');
    this.dirty = true;
  }
  wheel(x, y, dy) {
    for (let i = this.wheels.length - 1; i >= 0; i--) {
      const z = this.wheels[i];
      if (x >= z.x && y >= z.y && x < z.x + z.w && y < z.y + z.h) { z.fn(Math.sign(dy) * 3); this.dirty = true; return; }
    }
  }
  key(e) {
    this.dirty = true;
    const k = e.key;
    if (this.modal) {
      if (k === 'Escape') { const m = this.modal; this.modal = null; m.cancel?.(); return true; }
      if (k === 'Enter') { const b = this.modal.buttons.find((x) => x.primary) || this.modal.buttons[0]; this.modal = null; b.fn?.(); return true; }
      return true;
    }
    if (this.edit) {
      const ed = this.edit;
      if (ed.onKey && ed.onKey(e)) return true;
      if (k === 'Escape') { this.edit = null; return true; }
      if (k === 'Enter' || k === 'Tab') { this.commitEdit(); return true; }
      if (k === 'Backspace') { ed.value = ed.value.slice(0, -1); ed.live?.(ed.value); return true; }
      if (k.length === 1 && !e.ctrlKey && !e.metaKey) {
        if (ed.numeric && !/[0-9.,]/.test(k)) { this.onEvent('error'); return true; }
        if (ed.value.length < (ed.max || 60)) ed.value += k;
        ed.live?.(ed.value);
        return true;
      }
      return true;
    }
    if (this.popup) {
      if (k === 'Escape') { this.popup = null; return true; }
      return true;
    }
    if (this.startMenu && k === 'Escape') { this.startMenu = false; return true; }
    if (this.front === 'onec' && this.appRunning) {
      if (this.menu && k === 'Escape') { this.menu = null; return true; }
      const tab = this.tabs[this.active];
      if (tab.key === 'form') {
        if (e.ctrlKey && k === 'Enter') { this.saveOrder(); return true; }
        if (/^[0-9]$/.test(k) && !this.form.client) { this.focusCode(k); return true; }
        if (k.length === 1 && !e.ctrlKey && this.form.client) { this.focusProd(k); return true; }
      }
      const L = this.lists[tab.key];
      if (L) {
        const n = this.listRows(tab.key).length;
        if (k === 'ArrowDown') { L.sel = Math.min(n - 1, L.sel + 1); return true; }
        if (k === 'ArrowUp') { L.sel = Math.max(0, L.sel - 1); return true; }
        if (k === 'Enter') { this.openListRow(tab.key, L.sel); return true; }
        if (tab.key === 'clients' && k.length === 1 && !e.ctrlKey) { this.focusSearch(k); return true; }
      }
    }
    return false;
  }
  needsAnim() {
    return this.toasts.length > 0 || !!this.edit || !!this.splash || this.report.state === 'busy' || this.match3.busy();
  }

  // ---------- shell actions ----------
  openOneC() {
    this.startMenu = false;
    if (this.appRunning) { this.front = this.front === 'onec' ? null : 'onec'; return; }
    if (this.splash || this.login) return;
    this.launcher = true; this.launchSel = 0;
  }
  startSplash() {
    this.launcher = false;
    this.splash = { t0: performance.now() };
    this.onEvent('launch');
  }
  finishLogin() {
    if (this.login.pass !== PASSWORD) {
      this.login.pass = '';
      this.login.error = true;
      this.onEvent('error');
      this.modal = { title: '1Ц:Предприятие', icon: 'err', text: ['Идентификация пользователя не выполнена.', 'Неверный пароль. Подсказка: он на стикере.'], buttons: [{ label: 'OK', primary: true, fn: () => this.focusPass() }] };
      return;
    }
    this.login = null; this.edit = null;
    this.appRunning = true; this.front = 'onec';
    this.toast('1Ц:Предприятие', 'Добро пожаловать! Смена открыта.');
    this.focusCode('');
    this.onEvent('appReady');
  }
  focusPass() {
    this.edit = { id: 'login-pass', value: this.login?.pass || '', max: 16, mask: true, onCommit: (v) => { this.login.pass = v; this.finishLogin(); }, live: (v) => { if (this.login) this.login.pass = v; } };
  }
  openMatch3() { this.startMenu = false; this.front = this.front === 'match3' ? null : 'match3'; if (this.front === 'match3') this.onEvent('match3'); }
  closeOneC() {
    this.modal = {
      title: '1Ц:Предприятие', icon: 'q', text: ['Завершить работу с программой?'],
      buttons: [{ label: 'Да', fn: () => { this.appRunning = false; this.front = null; this.edit = null; this.onEvent('appClosed'); } }, { label: 'Нет', primary: true }],
    };
  }

  // ---------- 1C: order form ----------
  blankForm() { return { code: '', client: null, rows: [], prod: null, query: '', qty: '', pick: 0, num: null, notFound: false }; }
  formTotal() { return this.form.rows.reduce((s, r) => s + r.qty * productByCode(r.code).price, 0); }
  focusCode(first) {
    const F = this.form;
    this.edit = {
      id: 'f-code', value: first ?? F.code, numeric: true, max: 5,
      live: (v) => { F.notFound = false; if (F.client && v !== F.client.code) F.client = null; },
      onCommit: (v) => {
        F.code = v.trim();
        F.client = clientByCode(F.code) || null;
        F.notFound = !F.client && F.code.length > 0;
        if (F.client) { this.onEvent('lookup', F.client); this.focusProd(''); } else if (F.notFound) this.onEvent('error');
      },
    };
  }
  prodMatches(q) {
    q = (q || '').toLowerCase().trim();
    if (!q) return PRODUCTS;
    return PRODUCTS.filter((p) => p.code.startsWith(q) || p.name.toLowerCase().includes(q) || p.nom.includes(q) || p.gen.includes(q));
  }
  focusProd(first) {
    const F = this.form;
    F.query = first; F.pick = 0; F.prod = null; F.showAll = false;
    this.edit = {
      id: 'f-prod', value: first, max: 30,
      live: (v) => { F.query = v; F.pick = 0; },
      onKey: (e) => {
        const m = this.prodMatches(F.query);
        if (e.key === 'ArrowDown') { if (!F.query && !F.showAll) { F.showAll = true; return true; } F.pick = Math.min(Math.min(m.length, 7) - 1, F.pick + 1); return true; }
        if (e.key === 'ArrowUp') { F.pick = Math.max(0, F.pick - 1); return true; }
        if (e.key === 'Escape') { this.edit = null; F.query = ''; return true; }
        if (e.ctrlKey && e.key === 'Enter') { this.edit = null; this.saveOrder(); return true; }
        return false;
      },
      onCommit: () => { const m = this.prodMatches(F.query); if (m.length && F.query !== '') this.chooseProd(m[Math.min(F.pick, m.length - 1)]); else this.focusProd(''); },
    };
  }
  chooseProd(p) {
    const F = this.form;
    F.prod = p; F.query = '';
    this.edit = null;
    this.focusQty();
  }
  focusQty() {
    const F = this.form;
    this.edit = {
      id: 'f-qty', value: '', numeric: true, max: 4,
      onKey: (e) => { if (e.ctrlKey && e.key === 'Enter') { this.edit = null; this.saveOrder(); return true; } return false; },
      onCommit: (v) => { F.qty = v; this.addRow(); },
    };
  }
  addRow() {
    const F = this.form;
    const q = parseInt(F.qty, 10);
    if (!F.prod) { this.focusProd(''); return; }
    if (!(q > 0)) { this.onEvent('error'); this.focusQty(); return; }
    const ex = F.rows.find((r) => r.code === F.prod.code);
    if (ex) { ex.qty += q; this.toast('Количество увеличено', `${F.prod.name}: ${ex.qty} ${F.prod.unit}`); }
    else F.rows.push({ code: F.prod.code, qty: q });
    F.prod = null; F.qty = '';
    this.focusProd('');
  }
  newOrder() { this.form = this.blankForm(); this.focusCode(''); }
  // an order entered by someone else in the same base (the boss)
  addExternalOrder(code, rows, op) {
    this.counter++;
    const order = { num: `ЗК-${pad(this.counter, 6)}`, time: new Date(), code, rows: rows.map((r) => ({ ...r })), op };
    order.total = order.rows.reduce((s, r) => s + r.qty * productByCode(r.code).price, 0);
    this.orders.push(order);
    this.report.state = 'idle';
    if (this.appRunning) this.toast(`Новая заявка (${op})`, `${order.num} · ${shortFio(clientByCode(code).fio)} · ${fmt(order.total)} ₽`);
    this.dirty = true;
    return order;
  }
  saveOrder() {
    const F = this.form;
    if (this.edit) this.commitEdit();
    const errs = [];
    if (!F.client) errs.push('Не указан клиент (поле «Код клиента»).');
    if (!F.rows.length) errs.push('Табличная часть «Товары» не заполнена.');
    if (errs.length) {
      this.modal = { title: 'Не удалось записать', icon: 'err', text: ['Заявка не записана:', ...errs], buttons: [{ label: 'OK', primary: true }] };
      this.onEvent('error');
      return;
    }
    let order;
    if (F.num) {
      order = this.orders.find((o) => o.num === F.num);
      Object.assign(order, { code: F.client.code, rows: F.rows.map((r) => ({ ...r })), total: this.formTotal() });
    } else {
      this.counter++;
      order = { num: `ЗК-${pad(this.counter, 6)}`, time: new Date(), code: F.client.code, rows: F.rows.map((r) => ({ ...r })), total: this.formTotal(), op: 'Вы' };
      this.orders.push(order);
    }
    this.toast('Заявка записана', `${order.num} · ${shortFio(F.client.fio)} · ${fmt(order.total)} ₽`);
    this.onEvent('orderSaved', order);
    this.report.state = 'idle';
    this.newOrder();
  }

  // ---------- 1C: lists ----------
  listRows(key) {
    if (key === 'journal') return this.orders;
    if (key === 'clients') { const s = this.lists.clients.search.toLowerCase(); return CLIENTS.filter((c) => !s || c.code.includes(s) || c.fio.toLowerCase().includes(s) || c.shop.toLowerCase().includes(s)); }
    if (key === 'goods') return PRODUCTS;
    return [];
  }
  openListRow(key, i) {
    const r = this.listRows(key)[i];
    if (!r) return;
    if (key === 'journal') {
      this.form = { ...this.blankForm(), code: r.code, client: clientByCode(r.code), rows: r.rows.map((x) => ({ ...x })), num: r.num };
      this.active = 0; this.edit = null;
    } else if (key === 'clients') {
      this.modal = { title: 'Клиент', icon: 'info', text: [`Код: ${r.code}`, r.fio, `Точка: ${r.shop}`, `Адрес: ${r.addr}`, `Маршрут доставки: №${r.route}`], buttons: [{ label: 'Закрыть', primary: true }] };
    } else {
      this.modal = { title: 'Номенклатура', icon: 'info', text: [`${r.code} — ${r.name}`, `Цена: ${fmt(r.price)} ₽ за ${r.unit}`], buttons: [{ label: 'Закрыть', primary: true }] };
    }
  }
  focusSearch(first) {
    const L = this.lists.clients;
    this.edit = { id: 'search-clients', value: first, max: 30, live: (v) => { L.search = v; L.sel = 0; L.scroll = 0; }, onCommit: (v) => { L.search = v; } };
    L.search = first; L.sel = 0; L.scroll = 0;
  }
  openTab(key, title) {
    this.menu = null;
    const i = this.tabs.findIndex((t) => t.key === key);
    if (i >= 0) { this.active = i; return; }
    this.tabs.push({ key, title });
    this.active = this.tabs.length - 1;
  }
  runCommand(cmd) {
    this.menu = null;
    if (cmd === 'form') this.active = 0;
    else if (cmd === 'journal') this.openTab('journal', 'Журнал заявок');
    else if (cmd === 'clients') this.openTab('clients', 'Клиенты');
    else if (cmd === 'goods') this.openTab('goods', 'Номенклатура');
    else if (cmd === 'report') this.openTab('report', 'Сводка заявок за день');
    else if (cmd === 'about') this.modal = { title: 'О программе', icon: 'info', text: ['1Ц:Предприятие 8.3 (8.3.25.1286)', 'Конфигурация: Хлебзавод. Заявки, редакция 2.1', `Лицензия: ${ORG.name}`, 'Пользователь: Оператор (отдел заявок)', 'Компьютер: ZAYAVKI-02'], buttons: [{ label: 'Закрыть', primary: true }] };
    else if (cmd.startsWith('msg:')) this.message(cmd.slice(4));
  }
  closeTab(i) {
    if (i === 0) return;
    this.tabs.splice(i, 1);
    if (this.active >= i) this.active = Math.max(0, this.active - 1);
  }
  message(text, title = '1Ц:Предприятие') { this.modal = { title, icon: 'info', text: [text], buttons: [{ label: 'OK', primary: true }] }; }
  toast(title, text) { this.toasts.push({ title, text, t0: performance.now() }); if (this.toasts.length > 3) this.toasts.shift(); }
  commitEdit() { const ed = this.edit; this.edit = null; ed?.onCommit?.(ed.value); this.dirty = true; }

  // ============================================================
  // primitives
  hitAt(x, y) {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (x >= h.x && y >= h.y && x < h.x + h.w && y < h.y + h.h) return h;
    }
    return null;
  }
  hit(x, y, w, h, id, fn, extra = {}) { this.hits.push({ x, y, w, h, id, fn, ...extra }); }
  rr(x, y, w, h, r) {
    const g = this.g;
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  box(x, y, w, h, fill, stroke) {
    const g = this.g;
    if (fill) { g.fillStyle = fill; g.fillRect(x, y, w, h); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
  }
  fit(s, maxW) {
    const g = this.g;
    s = String(s);
    if (!maxW || g.measureText(s).width <= maxW) return s;
    while (s.length > 1 && g.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }
  text(s, x, y, o = {}) {
    const g = this.g;
    g.font = f(o.size || 14, o.bold);
    g.fillStyle = o.color || '#333';
    g.textAlign = o.align || 'left';
    g.textBaseline = o.base || 'middle';
    const str = this.fit(s, o.maxW);
    g.fillText(str, x, y);
    return g.measureText(str).width;
  }
  caret(x, y, c) { const g = this.g; g.fillStyle = c; g.beginPath(); g.moveTo(x - 4, y - 2); g.lineTo(x + 4, y - 2); g.lineTo(x, y + 3); g.closePath(); g.fill(); }
  button(x, y, label, o = {}) {
    const g = this.g;
    g.font = f(o.size || 14, o.primary);
    const w = o.w || Math.ceil(g.measureText(label).width) + (o.drop ? 38 : 26);
    const h = o.h || 28;
    const hov = this.hover === o.id && !o.disabled;
    const grd = g.createLinearGradient(0, y, 0, y + h);
    if (o.primary) { grd.addColorStop(0, hov ? '#ffe98a' : '#ffe27a'); grd.addColorStop(1, hov ? '#f8cf3f' : '#f5c634'); }
    else { grd.addColorStop(0, hov ? '#ffffff' : '#fbfbfb'); grd.addColorStop(1, hov ? '#ececec' : '#e6e6e6'); }
    this.rr(x + 0.5, y + 0.5, w - 1, h - 1, 3);
    g.fillStyle = grd; g.fill();
    g.strokeStyle = o.primary ? '#c9a21e' : hov ? '#9a9a9a' : '#b9b9b9'; g.lineWidth = 1; g.stroke();
    this.text(label, x + (o.drop ? (w - 12) / 2 : w / 2), y + h / 2 + 1, { align: 'center', bold: o.primary, color: o.disabled ? '#a0a0a0' : '#2b2b2b', size: o.size || 14 });
    if (o.drop) this.caret(x + w - 16, y + h / 2, '#555');
    if (o.id && !o.disabled) this.hit(x, y, w, h, o.id, o.fn);
    return w;
  }
  link(x, y, label, id, fn, o = {}) {
    const w = this.text(label, x, y, { color: this.hover === id ? '#c0392b' : '#24569b', size: o.size || 15 });
    if (this.hover === id) { this.g.fillStyle = '#c0392b'; this.g.fillRect(x, y + 9, w, 1); }
    this.hit(x - 2, y - 11, w + 4, 22, id, fn);
    return w;
  }
  field(x, y, w, value, o = {}) {
    const h = o.h || 30;
    const editing = this.edit && this.edit.id === o.id;
    const hov = this.hover === o.id;
    this.box(x, y, w, h, o.readonly ? '#f6f6f6' : '#ffffff', editing ? '#e0ac00' : o.invalid ? '#e0786c' : hov && !o.readonly ? '#8a8a8a' : '#b3b3b3');
    if (editing) { this.g.strokeStyle = 'rgba(240,190,0,.35)'; this.g.lineWidth = 3; this.g.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3); }
    const dropW = o.drop ? 24 : 0;
    let shown = editing ? this.edit.value : value;
    if ((editing && this.edit.mask) || (o.mask && shown)) shown = '•'.repeat(shown.length);
    const g = this.g;
    g.save(); g.beginPath(); g.rect(x + 2, y, w - 4 - dropW, h); g.clip();
    let tw = 0;
    const size = o.size || 15;
    if (shown === '' || shown == null) { if (o.placeholder && !editing) this.text(o.placeholder, x + 8, y + h / 2 + 1, { color: o.invalid ? '#d0685c' : '#a5a5a5', size }); }
    else tw = this.text(shown, x + 8, y + h / 2 + 1, { size, color: o.color || '#222', bold: o.bold });
    if (editing && Math.floor(performance.now() / 530) % 2 === 0) { g.fillStyle = '#111'; g.fillRect(x + 9 + tw, y + 6, 1.5, h - 12); }
    g.restore();
    if (o.drop) { this.box(x + w - dropW, y + 1, dropW - 1, h - 2, hov ? '#f2f2f2' : '#fafafa'); this.caret(x + w - dropW / 2, y + h / 2, '#555'); }
    if (o.id && !o.readonly) this.hit(x, y, w, h, o.id, o.fn, { cursor: 'text' });
    return h;
  }
  glyph(kind, cx, cy, color) {
    const g = this.g;
    g.save();
    g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 2; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    switch (kind) {
      case 'home': g.moveTo(cx - 8, cy); g.lineTo(cx, cy - 7); g.lineTo(cx + 8, cy); g.moveTo(cx - 5, cy - 2); g.lineTo(cx - 5, cy + 7); g.lineTo(cx + 5, cy + 7); g.lineTo(cx + 5, cy - 2); g.stroke(); break;
      case 'chart': g.moveTo(cx - 7, cy + 7); g.lineTo(cx - 7, cy + 1); g.moveTo(cx - 2, cy + 7); g.lineTo(cx - 2, cy - 6); g.moveTo(cx + 3, cy + 7); g.lineTo(cx + 3, cy - 2); g.moveTo(cx + 8, cy + 7); g.lineTo(cx + 8, cy - 8); g.stroke(); break;
      case 'cart': g.moveTo(cx - 9, cy - 6); g.lineTo(cx - 6, cy - 6); g.lineTo(cx - 3, cy + 4); g.lineTo(cx + 7, cy + 4); g.lineTo(cx + 9, cy - 3); g.lineTo(cx - 5, cy - 3); g.stroke(); g.beginPath(); g.arc(cx - 2, cy + 8, 1.6, 0, 7); g.arc(cx + 6, cy + 8, 1.6, 0, 7); g.fill(); break;
      case 'box': g.rect(cx - 7, cy - 5, 14, 12); g.moveTo(cx - 7, cy - 1); g.lineTo(cx + 7, cy - 1); g.stroke(); break;
      case 'gear': g.arc(cx, cy, 4, 0, 7); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; g.moveTo(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6); g.lineTo(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9); } g.stroke(); break;
      case 'person': g.arc(cx, cy - 4, 4, 0, 7); g.moveTo(cx - 7, cy + 8); g.quadraticCurveTo(cx, cy - 3, cx + 7, cy + 8); g.stroke(); break;
    }
    g.restore();
  }
  onecLogo(cx, cy, r) {
    const g = this.g;
    g.fillStyle = '#e1231b'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    this.text('1Ц', cx, cy + 1, { align: 'center', bold: true, color: '#ffd200', size: Math.round(r * 0.95) });
  }
  winFrame(x, y, w, h, title, o = {}) {
    const g = this.g;
    g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 22; g.shadowOffsetY = 6;
    this.box(x, y, w, h, o.bg || '#ffffff'); g.restore();
    this.box(x, y, w, h, null, '#8d8a80');
    this.box(x + 1, y + 1, w - 2, 34, o.titleBg || '#f7f6f2');
    if (o.logo) this.onecLogo(x + 20, y + 18, 11);
    this.text(title, x + (o.logo ? 38 : 14), y + 18, { size: 14, bold: true, color: '#333' });
    if (o.onClose) {
      const id = `${o.id}-x`;
      if (this.hover === id) this.box(x + w - 44, y + 1, 43, 33, '#e0493a');
      this.text('×', x + w - 22, y + 17, { align: 'center', size: 20, color: this.hover === id ? '#fff' : '#555' });
      this.hit(x + w - 44, y + 1, 43, 33, id, o.onClose);
    }
  }

  // ============================================================
  draw() {
    const g = this.g, W = this.W, H = this.H;
    this.hits = []; this.wheels = [];
    const now = performance.now();
    this.toasts = this.toasts.filter((t) => now - t.t0 < 6000);
    g.setTransform(this.scale, 0, 0, this.scale, 0, 0);

    this.drawDesktop();
    if (this.appRunning && this.front === 'onec') this.drawOneC();
    if (this.front === 'match3') this.match3.draw(0, 0, W, H - TASKBAR);
    if (this.launcher) this.drawLauncher();
    if (this.splash) this.drawSplash(now);
    if (this.login) this.drawLogin();
    if (this.popup) this.drawPopup();
    this.drawToasts(now);
    if (this.modal) this.drawModal();
    this.drawTaskbar();
    if (this.startMenu) this.drawStartMenu();
    this.drawCursor();
    this.dirty = false;
  }

  drawDesktop() {
    const g = this.g, W = this.W, H = this.H - TASKBAR;
    // wallpaper: wheat field at sunrise
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#5b86b8'); sky.addColorStop(0.5, '#e9c98a'); sky.addColorStop(0.62, '#f3d98f'); sky.addColorStop(1, '#b8862d');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,245,210,.9)'; g.beginPath(); g.arc(W * 0.7, H * 0.52, 70, 0, 7); g.fill();
    g.fillStyle = '#c99a3a'; g.beginPath(); g.moveTo(0, H * 0.6);
    for (let x = 0; x <= W; x += 40) g.lineTo(x, H * 0.6 + Math.sin(x * 0.01) * 12);
    g.lineTo(W, H); g.lineTo(0, H); g.fill();
    g.strokeStyle = 'rgba(120,80,20,.35)'; g.lineWidth = 2;
    for (let i = 0; i < 160; i++) { const x = (i * 97) % W, y = H * 0.66 + ((i * 53) % (H * 0.34)); g.beginPath(); g.moveTo(x, y + 30); g.quadraticCurveTo(x + 4, y + 10, x + 2, y); g.stroke(); }
    // icons
    const icons = [['onec', '1Ц:Предприятие', () => this.openOneC()], ['match3', 'Хлебная лихорадка', () => this.openMatch3()]];
    icons.forEach(([id, label, fn], i) => {
      const x = 30, y = 30 + i * 120, hid = `di-${id}`;
      if (this.deskSel === id || this.hover === hid) this.box(x - 8, y - 6, 116, 108, this.deskSel === id ? 'rgba(80,140,230,.45)' : 'rgba(255,255,255,.18)', 'rgba(255,255,255,.5)');
      if (id === 'onec') this.onecLogo(x + 50, y + 30, 28);
      else this.m3icon(x + 50, y + 30, 28);
      this.text(label, x + 50, y + 80, { align: 'center', size: 14, color: '#fff', maxW: 112 });
      this.hit(x - 8, y - 6, 116, 108, hid, () => { this.deskSel = id; }, { dbl: fn });
    });
    this.text('Двойной щелчок — открыть', 30, H - 22, { size: 13, color: 'rgba(255,255,255,.75)' });
  }
  m3icon(cx, cy, r) {
    const g = this.g;
    g.fillStyle = '#7a3e12'; this.rr(cx - r, cy - r, r * 2, r * 2, 10); g.fill();
    const cols = ['#f2c14e', '#e76f51', '#8ab17d'];
    for (let i = 0; i < 3; i++) { g.fillStyle = cols[i]; g.beginPath(); g.arc(cx - r * 0.55 + i * r * 0.55, cy + (i === 1 ? -6 : 4), r * 0.28, 0, 7); g.fill(); }
  }

  drawLauncher() {
    const g = this.g;
    const w = 820, h = 470, x = (this.W - w) / 2, y = (this.H - TASKBAR - h) / 2;
    this.winFrame(x, y, w, h, 'Запуск 1Ц:Предприятия', { logo: true, id: 'ln', onClose: () => { this.launcher = false; } });
    this.text('Информационные базы:', x + 20, y + 58, { size: 14, color: '#555' });
    const bases = [['Хлебзавод — Заявки (рабочая)', 'File="D:\\1C\\Zayavki"'], ['Хлебзавод — Заявки (копия 2019, НЕ ТРОГАТЬ)', 'File="D:\\1C\\Zayavki_old"'], ['Бухгалтерия (не ваша)', 'Srvr="buh01";Ref="buh"']];
    this.box(x + 20, y + 74, 560, 300, '#fff', '#b3b3b3');
    bases.forEach(([n, p], i) => {
      const ry = y + 76 + i * 50, id = `ln-b${i}`;
      if (this.launchSel === i) this.box(x + 22, ry, 556, 48, '#fbe7a1');
      else if (this.hover === id) this.box(x + 22, ry, 556, 48, '#f6f3e7');
      this.onecLogo(x + 44, ry + 24, 12);
      this.text(n, x + 66, ry + 17, { size: 15, bold: this.launchSel === i, color: '#222' });
      this.text(p, x + 66, ry + 35, { size: 12, color: '#888' });
      this.hit(x + 22, ry, 556, 48, id, () => { this.launchSel = i; }, { dbl: () => { this.launchSel = i; this.launchSelected(); } });
    });
    const bx = x + 600;
    [['1Ц:Предприятие', true, () => this.launchSelected()], ['Конфигуратор', false, () => this.message('Конфигуратор доступен только программисту. Программист в отпуске.')], ['Добавить…', false, () => this.message('Недостаточно прав.')], ['Изменить…', false, () => this.message('Недостаточно прав.')], ['Удалить', false, () => this.message('Даже не думайте.')], ['Выход', false, () => { this.launcher = false; }]]
      .forEach(([l, p, fn], i) => this.button(bx, y + 74 + i * 42, l, { w: 200, h: 32, primary: p, id: `ln-btn${i}`, fn }));
    this.text('Выберите базу и нажмите «1Ц:Предприятие»', x + 20, y + h - 40, { size: 13, color: '#8a6d00' });
  }
  launchSelected() {
    if (this.launchSel === 0) this.startSplash();
    else if (this.launchSel === 1) this.message('База «копия 2019» заблокирована. Сеанс открыт пользователем «Алёна В.» с 2019 года.');
    else this.message('Нет доступа к серверу buh01. Это другой отдел.');
  }
  drawSplash(now) {
    const g = this.g;
    const t = (now - this.splash.t0) / 3200;
    const w = 600, h = 320, x = (this.W - w) / 2, y = (this.H - TASKBAR - h) / 2;
    g.save(); g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 30;
    const grd = g.createLinearGradient(x, y, x, y + h); grd.addColorStop(0, '#fff6cf'); grd.addColorStop(1, '#f6d65a');
    g.fillStyle = grd; g.fillRect(x, y, w, h); g.restore();
    this.onecLogo(x + 90, y + 110, 52);
    this.text('1Ц:Предприятие', x + 170, y + 92, { size: 38, bold: true, color: '#b3261e' });
    this.text('8.3', x + 170, y + 132, { size: 24, color: '#6d5a1a' });
    this.text('Хлебзавод. Заявки, ред. 2.1', x + 170, y + 166, { size: 16, color: '#6d5a1a' });
    const msgs = ['Загрузка конфигурации…', 'Проверка лицензии…', 'Обновление интерфейса…', 'Запуск…'];
    this.text(msgs[Math.min(3, Math.floor(t * 4))], x + 40, y + 240, { size: 14, color: '#5c4c14' });
    this.box(x + 40, y + 258, w - 80, 16, '#fff9e2', '#c9a21e');
    g.fillStyle = '#e1231b'; g.fillRect(x + 42, y + 260, (w - 84) * Math.min(1, t), 12);
    if (t >= 1) { this.splash = null; this.login = { pass: '' }; this.focusPass(); }
  }
  drawLogin() {
    const w = 560, h = 250, x = (this.W - w) / 2, y = (this.H - TASKBAR - h) / 2;
    this.winFrame(x, y, w, h, 'Доступ к информационной базе', { logo: true, id: 'lg', onClose: () => { this.login = null; this.edit = null; } });
    this.text('Хлебзавод — Заявки (рабочая)', x + 24, y + 58, { size: 14, color: '#777' });
    this.text('Пользователь:', x + 24, y + 102, { size: 15, color: '#444' });
    this.field(x + 160, y + 87, 370, 'Оператор (отдел заявок)', { drop: true, readonly: true });
    this.text('Пароль:', x + 24, y + 146, { size: 15, color: '#444' });
    this.field(x + 160, y + 131, 370, this.login.pass, { id: 'login-pass', mask: true, fn: () => this.focusPass(), invalid: this.login.error && !this.login.pass });
    this.button(x + w - 230, y + h - 52, 'OK', { primary: true, w: 100, h: 32, id: 'lg-ok', fn: () => { if (this.edit) this.commitEdit(); else this.finishLogin(); } });
    this.button(x + w - 120, y + h - 52, 'Отмена', { w: 100, h: 32, id: 'lg-cancel', fn: () => { this.login = null; this.edit = null; } });
  }

  drawTaskbar() {
    const g = this.g, W = this.W, H = this.H;
    const y = H - TASKBAR;
    g.fillStyle = '#1d2530'; g.fillRect(0, y, W, TASKBAR);
    const sh = this.hover === 'start' || this.startMenu;
    if (sh) this.box(0, y, 52, TASKBAR, '#34404f');
    g.fillStyle = '#6fb7ff';
    [[16, 12], [27, 12], [16, 23], [27, 23]].forEach(([dx, dy]) => g.fillRect(dx, y + dy, 9, 9));
    this.hit(0, y, 52, TASKBAR, 'start', () => { this.startMenu = !this.startMenu; });
    const apps = [['onec', this.appRunning || this.launcher || this.splash || this.login, this.front === 'onec'], ['match3', this.front === 'match3', this.front === 'match3']];
    apps.forEach(([id, running, act], i) => {
      const x = 64 + i * 56, hid = `tb-${id}`;
      if (act || this.hover === hid) this.box(x, y, 56, TASKBAR, act ? '#34404f' : '#2b3542');
      if (running) { g.fillStyle = '#6fb7ff'; g.fillRect(x + (act ? 12 : 20), y + 41, act ? 32 : 16, 3); }
      if (id === 'onec') this.onecLogo(x + 28, y + 21, 13); else this.m3icon(x + 28, y + 21, 13);
      this.hit(x, y, 56, TASKBAR, hid, id === 'onec' ? () => this.openOneC() : () => this.openMatch3());
    });
    const now = new Date();
    this.text(fmtTime(now), W - 50, y + 14, { align: 'center', size: 13, color: '#e8edf3' });
    this.text(fmtDate(now), W - 50, y + 31, { align: 'center', size: 12, color: '#c3ccd8' });
    this.text('РУС', W - 118, y + 22, { align: 'center', size: 12, color: '#e8edf3' });
  }
  drawStartMenu() {
    const x = 0, w = 340, h = 250, y = this.H - TASKBAR - h;
    this.hit(0, 0, this.W, this.H - TASKBAR, 'sm-block', () => { this.startMenu = false; });
    this.box(x, y, w, h, '#232d3a', '#3c4859');
    this.text('Оператор (отдел заявок)', x + 20, y + 28, { size: 15, bold: true, color: '#e8edf3' });
    const items = [['onec', '1Ц:Предприятие 8.3', () => this.openOneC()], ['match3', 'Хлебная лихорадка (три в ряд)', () => this.openMatch3()], ['off', 'Завершение работы', () => { this.startMenu = false; this.message('Завершение работы запрещено до 18:00 групповой политикой.', 'Windows'); }]];
    items.forEach(([id, label, fn], i) => {
      const iy = y + 60 + i * 56, hid = `sm-${id}`;
      if (this.hover === hid) this.box(x + 6, iy, w - 12, 50, '#34404f');
      if (id === 'onec') this.onecLogo(x + 34, iy + 25, 14);
      else if (id === 'match3') this.m3icon(x + 34, iy + 25, 14);
      else { const g = this.g; g.strokeStyle = '#e8edf3'; g.lineWidth = 2.5; g.beginPath(); g.arc(x + 34, iy + 27, 10, -1.1, 4.25); g.stroke(); g.beginPath(); g.moveTo(x + 34, iy + 13); g.lineTo(x + 34, iy + 25); g.stroke(); }
      this.text(label, x + 62, iy + 26, { size: 15, color: '#e8edf3' });
      this.hit(x + 6, iy, w - 12, 50, hid, fn);
    });
  }

  // ---------- the 1C window ----------
  drawOneC() {
    const g = this.g, W = this.W, H = this.H - TASKBAR;
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    // header
    const grd = g.createLinearGradient(0, 0, 0, 40);
    grd.addColorStop(0, '#fbe9a0'); grd.addColorStop(1, '#f2d874');
    g.fillStyle = grd; g.fillRect(0, 0, W, 40);
    g.fillStyle = '#d8bd55'; g.fillRect(0, 39, W, 1);
    this.onecLogo(22, 20, 13);
    this.text('Хлебзавод. Заявки, редакция 2.1', 46, 20, { bold: true, color: '#3c3522', size: 15 });
    this.text(`/  ${ORG.name}, ${ORG.dept}   (1Ц:Предприятие)`, 312, 20, { color: '#5a5037', size: 14 });
    this.text('Оператор', W - 230, 20, { color: '#3c3522', size: 14 });
    g.fillStyle = '#9b8a52'; g.beginPath(); g.arc(W - 242, 20, 6, 0, 7); g.fill();
    ['–', '□', '×'].forEach((s, i) => {
      const x = W - 138 + i * 46, id = `win${i}`;
      if (this.hover === id) this.box(x, 0, 46, 39, i === 2 ? '#e0493a' : 'rgba(0,0,0,.08)');
      this.text(s, x + 23, 19, { align: 'center', size: i === 1 ? 16 : 20, color: this.hover === id && i === 2 ? '#fff' : '#3c3522' });
      this.hit(x, 0, 46, 39, id, [() => { this.front = null; }, () => this.message('Окно уже развернуто.'), () => this.closeOneC()][i]);
    });
    // sections
    g.fillStyle = '#f6f5f1'; g.fillRect(0, 40, 212, H - 40);
    g.fillStyle = '#dcdad2'; g.fillRect(211, 40, 1, H - 40);
    const cur = this.menu || { form: 'orders', journal: 'orders', clients: 'clients', goods: 'goods', report: 'reports' }[this.tabs[this.active].key];
    SECTIONS.forEach((s, i) => {
      const y = 48 + i * 46, id = `sec:${s.key}`, act = cur === s.key;
      if (act) { this.box(0, y, 211, 44, '#fff0bd'); g.fillStyle = '#e9b800'; g.fillRect(0, y, 4, 44); }
      else if (this.hover === id) this.box(0, y, 211, 44, '#ebe9e2');
      g.fillStyle = s.color; g.beginPath(); g.arc(30, y + 22, 14, 0, 7); g.fill();
      this.glyph(s.glyph, 30, y + 22, '#fff');
      this.text(s.name, 54, y + 23, { size: 15, bold: act, color: '#2f2f2f', maxW: 150 });
      this.hit(0, y, 211, 44, id, () => { this.menu = this.menu === s.key ? null : s.key; });
    });
    this.text(`Заявок за смену: ${this.orders.length}`, 14, H - 22, { size: 13, color: '#8a877c' });
    // tabs
    g.fillStyle = '#e8e7e2'; g.fillRect(212, 40, W - 212, 36);
    g.fillStyle = '#cfcdc4'; g.fillRect(212, 75, W - 212, 1);
    let x = 216;
    this.tabs.forEach((t, i) => {
      const act = i === this.active;
      g.font = f(13, act);
      const tw = Math.min(260, Math.ceil(g.measureText(t.title).width) + (i ? 44 : 24));
      const id = `tab:${i}`;
      if (act) { this.box(x, 44, tw, 32, '#fff', '#cfcdc4'); g.fillStyle = '#fff'; g.fillRect(x + 1, 74, tw - 2, 3); g.fillStyle = '#e9b800'; g.fillRect(x, 44, tw, 3); }
      else if (this.hover === id) this.box(x, 46, tw, 29, '#f3f2ee');
      this.text(t.title, x + 12, 61, { size: 13, bold: act, color: '#333', maxW: tw - 36 });
      this.hit(x, 44, tw, 32, id, () => { this.active = i; this.menu = null; });
      if (i) {
        const xid = `tabx:${i}`;
        this.text('×', x + tw - 16, 60, { align: 'center', size: 17, color: this.hover === xid ? '#c0392b' : '#777' });
        this.hit(x + tw - 26, 50, 22, 22, xid, () => this.closeTab(i));
      }
      x += tw + 3;
    });
    const C = { x: 212, y: 76, w: W - 212, h: H - 76 };
    g.save(); g.beginPath(); g.rect(C.x, C.y, C.w, C.h); g.clip();
    const key = this.tabs[this.active].key;
    if (key === 'form') this.drawForm(C);
    else if (key === 'report') this.drawReport(C);
    else this.drawList(key, C);
    g.restore();
    if (this.menu) this.drawMenu(C);
  }
  formTitle(C, s) { this.text(s, C.x + 20, C.y + 28, { size: 22, color: '#4a4a4a', maxW: C.w - 40 }); }

  drawForm(C) {
    const g = this.g, F = this.form;
    this.formTitle(C, F.num ? `Заявка ${F.num} (изменение)` : 'Заявка покупателя (создание)');
    let bx = C.x + 20;
    const ty = C.y + 50;
    bx += this.button(bx, ty, 'Записать заявку  Ctrl+Enter', { primary: true, id: 'o-save', fn: () => this.saveOrder() }) + 8;
    bx += this.button(bx, ty, 'Новая заявка', { id: 'o-new', fn: () => this.newOrder() }) + 8;
    this.button(bx, ty, 'Журнал заявок', { id: 'o-journal', fn: () => this.runCommand('journal') });
    const tomorrow = new Date(Date.now() + 86400000);
    this.text(`Отгрузка: ${fmtDate(tomorrow)}, утро`, C.x + C.w - 24, ty + 14, { align: 'right', size: 14, color: '#777' });

    // client code
    const fx = C.x + 20, fy = C.y + 100;
    this.box(fx, fy, C.w - 40, 96, '#fbfaf5', '#e4e1d4');
    this.text('Код клиента:', fx + 16, fy + 30, { size: 16, bold: true, color: '#333' });
    this.field(fx + 140, fy + 13, 150, F.code, { id: 'f-code', size: 20, h: 36, bold: true, placeholder: '_____', fn: () => this.focusCode(F.code), invalid: F.notFound });
    this.button(fx + 300, fy + 17, 'Найти', { id: 'f-find', fn: () => { if (this.edit?.id === 'f-code') this.commitEdit(); else this.focusCode(F.code); } });
    if (F.client) {
      const c = F.client;
      this.text(c.fio, fx + 400, fy + 26, { size: 20, bold: true, color: '#1f4e9c' });
      this.text(`${c.shop} · ${c.addr} · маршрут №${c.route}`, fx + 400, fy + 56, { size: 14, color: '#555' });
    } else if (F.notFound) {
      this.text(`Клиент с кодом «${F.code}» не найден`, fx + 400, fy + 32, { size: 16, color: '#c0392b', bold: true });
    } else {
      this.text('Введите код клиента, который назвали по телефону, и нажмите Enter', fx + 400, fy + 32, { size: 14, color: '#999' });
    }
    this.text('Сверьте фамилию с собеседником', fx + 16, fy + 74, { size: 12, color: '#999' });

    // entry line
    const ey = fy + 116;
    this.text('Номенклатура:', fx, ey + 16, { size: 15, color: '#444' });
    const prodEditing = this.edit?.id === 'f-prod';
    this.field(fx + 120, ey, 420, F.prod ? `${F.prod.code}  ${F.prod.name}` : F.query, { id: 'f-prod', drop: true, placeholder: F.client ? 'код товара или название: «бел», «101»…' : 'сначала укажите клиента', fn: () => { if (F.client) { this.focusProd(''); F.showAll = true; } } });
    this.text('Кол-во:', fx + 556, ey + 16, { size: 15, color: '#444' });
    this.field(fx + 616, ey, 90, F.qty, { id: 'f-qty', fn: () => { if (F.prod) this.focusQty(); } });
    this.button(fx + 718, ey + 1, 'Добавить  Enter', { id: 'f-add', fn: () => { if (this.edit?.id === 'f-qty') this.commitEdit(); else this.addRow(); } });

    // table
    const tx = fx, tyy = ey + 50, tw = C.w - 40, th = C.y + C.h - 70 - tyy;
    const cols = [['N', 40], ['Код', 60], ['Номенклатура', 0], ['Кол-во', 100, 'right'], ['Ед.', 50], ['Цена', 100, 'right'], ['Сумма', 130, 'right'], ['', 40]];
    this.box(tx, tyy, tw, th, '#fff', '#c9c7bf');
    const hh = 30, rh = 32;
    const grd = g.createLinearGradient(0, tyy, 0, tyy + hh); grd.addColorStop(0, '#f7f6f2'); grd.addColorStop(1, '#ebe9e2');
    g.fillStyle = grd; g.fillRect(tx + 1, tyy + 1, tw - 2, hh - 1);
    const flex = tw - cols.reduce((s, c) => s + c[1], 0);
    const widths = cols.map((c) => c[1] || flex);
    const cx = []; let acc = tx; widths.forEach((w) => { cx.push(acc); acc += w; });
    cols.forEach((c, i) => this.text(c[0], c[2] === 'right' ? cx[i] + widths[i] - 10 : cx[i] + 10, tyy + hh / 2 + 1, { size: 13, color: '#555', align: c[2] === 'right' ? 'right' : 'left' }));
    F.rows.forEach((r, i) => {
      const ry = tyy + hh + 1 + i * rh;
      if (ry + rh > tyy + th) return;
      const p = productByCode(r.code);
      if (i % 2) this.box(tx + 1, ry, tw - 2, rh, '#fcfcfa');
      const vals = [String(i + 1), p.code, p.name, String(r.qty), p.unit, fmt(p.price), fmt(p.price * r.qty)];
      vals.forEach((v, k) => {
        const right = cols[k][2] === 'right';
        const cid = `rq:${i}`;
        if (k === 3) {
          const editing = this.edit?.id === cid;
          if (editing || this.hover === cid) this.box(cx[k] + 3, ry + 3, widths[k] - 6, rh - 6, '#fff', editing ? '#e0ac00' : '#b8b5aa');
          if (editing) {
            const w2 = this.text(this.edit.value, cx[k] + 12, ry + rh / 2 + 1, { size: 15 });
            if (Math.floor(performance.now() / 530) % 2 === 0) { g.fillStyle = '#111'; g.fillRect(cx[k] + 13 + w2, ry + 8, 1.5, rh - 16); }
          } else this.text(v, cx[k] + widths[k] - 10, ry + rh / 2 + 1, { size: 15, align: 'right', bold: true });
          this.hit(cx[k], ry, widths[k], rh, cid, () => {
            this.edit = { id: cid, value: String(r.qty), numeric: true, max: 4, onCommit: (v2) => { const n = parseInt(v2, 10); if (n > 0) r.qty = n; } };
          }, { cursor: 'text' });
          return;
        }
        this.text(v, right ? cx[k] + widths[k] - 10 : cx[k] + 10, ry + rh / 2 + 1, { size: 15, align: right ? 'right' : 'left', maxW: widths[k] - 16 });
      });
      const did = `rd:${i}`;
      this.text('×', cx[7] + 20, ry + rh / 2, { align: 'center', size: 20, color: this.hover === did ? '#c0392b' : '#aaa' });
      this.hit(cx[7], ry, widths[7], rh, did, () => { F.rows.splice(i, 1); });
      g.fillStyle = '#efede6'; g.fillRect(tx + 1, ry + rh - 1, tw - 2, 1);
    });
    if (!F.rows.length) this.text('Товаров пока нет. Диктуют — записывайте.', tx + tw / 2, tyy + hh + 44, { align: 'center', color: '#aaa', size: 15 });
    // product suggestions dropdown (drawn over the table)
    if (prodEditing && (F.query || F.showAll)) {
      const m = this.prodMatches(F.query).slice(0, 7);
      const px = fx + 120, py = ey + 32, pw = 420;
      g.save(); g.shadowColor = 'rgba(0,0,0,.2)'; g.shadowBlur = 10; this.box(px, py, pw, m.length * 30 + 4, '#fff'); g.restore();
      this.box(px, py, pw, m.length * 30 + 4, null, '#a7a497');
      if (!m.length) { this.box(px, py, pw, 34, '#fff', '#a7a497'); this.text('Ничего не найдено', px + 12, py + 17, { color: '#c0392b' }); }
      m.forEach((p, i) => {
        const iy = py + 2 + i * 30, id = `sug:${i}`;
        if (i === F.pick || this.hover === id) this.box(px + 2, iy, pw - 4, 30, i === F.pick ? '#fbe7a1' : '#f6f3e7');
        this.text(p.code, px + 12, iy + 15, { size: 14, color: '#888' });
        this.text(p.name, px + 60, iy + 15, { size: 15 });
        this.text(`${fmt(p.price)} ₽`, px + pw - 12, iy + 15, { size: 14, align: 'right', color: '#555' });
        this.hit(px + 2, iy, pw - 4, 30, id, () => this.chooseProd(p), { keepEdit: true });
      });
    }
    // total
    const total = this.formTotal();
    const by = C.y + C.h - 56;
    this.text('Сумма заказа:', C.x + C.w - 290, by + 22, { size: 17, color: '#555', align: 'right' });
    this.text(`${fmt(total)} ₽`, C.x + C.w - 24, by + 22, { size: 26, bold: true, color: '#222', align: 'right' });
    this.text('Код → Enter → товар → Enter → кол-во → Enter. Записать: Ctrl+Enter', fx, by + 24, { size: 13, color: '#8a877c', maxW: C.w - 380 });
  }

  drawList(key, C) {
    const g = this.g, L = this.lists[key];
    const titles = { journal: 'Журнал заявок за смену', clients: 'Клиенты (коды для сверки)', goods: 'Номенклатура и цены' };
    this.formTitle(C, titles[key]);
    const ty = C.y + 50;
    if (key === 'journal') this.button(C.x + 20, ty, 'Открыть', { id: 'j-open', fn: () => this.openListRow(key, L.sel) });
    if (key === 'clients') {
      this.field(C.x + 20, ty, 320, L.search, { id: 'search-clients', placeholder: 'Поиск по коду или фамилии', fn: () => this.focusSearch(L.search) });
    }
    const rows = this.listRows(key);
    const cols = {
      journal: [['Время', 70, (o) => fmtTime(o.time)], ['Номер', 120, (o) => o.num], ['Код', 90, (o) => o.code], ['Клиент', 190, (o) => shortFio(clientByCode(o.code).fio)], ['Точка', 0, (o) => clientByCode(o.code).shop], ['Принял', 100, (o) => o.op || 'Вы'], ['Позиций', 80, (o) => String(o.rows.length), 'right'], ['Сумма', 120, (o) => fmt(o.total), 'right']],
      clients: [['Код', 80, (c) => c.code], ['ФИО', 290, (c) => c.fio], ['Точка', 240, (c) => c.shop], ['Адрес', 0, (c) => c.addr], ['Маршрут', 100, (c) => `№${c.route}`]],
      goods: [['Код', 90, (p) => p.code], ['Наименование', 0, (p) => p.name], ['Ед.', 80, (p) => p.unit], ['Цена', 150, (p) => fmt(p.price), 'right']],
    }[key];
    const x = C.x + 20, y = C.y + 94, w = C.w - 40, h = C.h - 108, rh = 28, hh = 30;
    this.box(x, y, w, h, '#fff', '#c9c7bf');
    const grd = g.createLinearGradient(0, y, 0, y + hh); grd.addColorStop(0, '#f7f6f2'); grd.addColorStop(1, '#ebe9e2');
    g.fillStyle = grd; g.fillRect(x + 1, y + 1, w - 2, hh - 1);
    const flex = w - cols.reduce((s, c) => s + c[1], 0) - 14;
    const widths = cols.map((c) => c[1] || Math.max(80, flex));
    let cx = x;
    cols.forEach((c, i) => { this.text(c[0], c[3] === 'right' ? cx + widths[i] - 10 : cx + 10, y + hh / 2 + 1, { size: 13, color: '#555', align: c[3] === 'right' ? 'right' : 'left' }); cx += widths[i]; });
    const vis = Math.floor((h - hh - 2) / rh);
    L.scroll = Math.max(0, Math.min(L.scroll, rows.length - vis));
    for (let r = 0; r < vis; r++) {
      const i = L.scroll + r;
      if (i >= rows.length) break;
      const ry = y + hh + 1 + r * rh, id = `row:${key}:${i}`;
      if (i === L.sel) this.box(x + 1, ry, w - 2, rh, '#fbe7a1');
      else if (this.hover === id) this.box(x + 1, ry, w - 2, rh, '#f6f3e7');
      let c2 = x;
      cols.forEach((c, k) => { this.text(c[2](rows[i]), c[3] === 'right' ? c2 + widths[k] - 10 : c2 + 10, ry + rh / 2 + 1, { size: 14, align: c[3] === 'right' ? 'right' : 'left', maxW: widths[k] - 16 }); c2 += widths[k]; });
      this.hit(x + 1, ry, w - 16, rh, id, () => { L.sel = i; }, { dbl: () => { L.sel = i; this.openListRow(key, i); } });
    }
    if (!rows.length) this.text(key === 'journal' ? 'Заявок пока нет' : 'Ничего не найдено', x + w / 2, y + hh + 40, { align: 'center', color: '#999' });
    this.wheels.push({ x, y, w, h, fn: (d) => { L.scroll = Math.max(0, Math.min(rows.length - vis, L.scroll + d)); } });
  }

  drawReport(C) {
    const g = this.g, R = this.report;
    this.formTitle(C, 'Сводка заявок за день');
    const ty = C.y + 50;
    let x = C.x + 20;
    x += this.button(x, ty, 'Сформировать', { primary: true, id: 'r-run', fn: () => { R.state = 'busy'; R.t0 = performance.now(); } }) + 8;
    this.button(x, ty, 'Печать', { id: 'r-print', disabled: R.state !== 'done', fn: () => { this.toast('Печать', 'Сводка отправлена на принтер «МФУ-офис»'); this.onEvent('print', { orders: this.orders.length, total: this.orders.reduce((s, o) => s + o.total, 0) }); } });
    this.text(`Дата: ${fmtDate(new Date())}`, C.x + C.w - 24, ty + 14, { align: 'right', size: 14, color: '#777' });
    const ry = C.y + 94, rh = C.h - 108;
    this.box(C.x + 20, ry, C.w - 40, rh, '#fff', '#c9c7bf');
    if (R.state === 'busy' && performance.now() - R.t0 > 1100) { R.state = 'done'; this.onEvent('report'); }
    if (R.state === 'idle') { this.text('Отчет не сформирован. Нажмите «Сформировать» для получения отчета.', C.x + C.w / 2, ry + rh / 2, { align: 'center', color: '#8c8c8c', size: 15 }); return; }
    if (R.state === 'busy') {
      const cx = C.x + C.w / 2, cy = ry + rh / 2 - 20, a = performance.now() / 150;
      for (let i = 0; i < 12; i++) { g.fillStyle = `rgba(90,90,90,${((i + Math.floor(a)) % 12) / 12})`; g.beginPath(); g.arc(cx + Math.cos(i * Math.PI / 6) * 16, cy + Math.sin(i * Math.PI / 6) * 16, 3, 0, 7); g.fill(); }
      this.text('Отчет формируется…', cx, cy + 44, { align: 'center', color: '#666', size: 15 });
      return;
    }
    // the sheet scrolls: a day easily has 30+ orders
    const contentH = 120 + (this.orders.length + 2) * 27;
    R.scroll = Math.max(0, Math.min(R.scroll || 0, contentH - rh + 20));
    this.wheels.push({ x: C.x + 20, y: ry, w: C.w - 40, h: rh, fn: (d) => { R.scroll = Math.max(0, Math.min(contentH - rh + 20, (R.scroll || 0) + d * 18)); } });
    g.save(); g.beginPath(); g.rect(C.x + 21, ry + 1, C.w - 42, rh - 2); g.clip(); g.translate(0, -R.scroll);
    const X = C.x + 40;
    let y = ry + 30;
    this.text(`Сводка заявок на ${fmtDate(new Date(Date.now() + 86400000))}`, X, y, { size: 19, bold: true, color: '#222' });
    this.text(`${ORG.name} · ${ORG.dept} · оператор: место №2`, X, y + 26, { size: 13, color: '#666' });
    y += 56;
    const colsA = [['№', 110], ['Время', 56], ['Код', 60], ['Клиент', 160], ['Сумма', 100, 'right']];
    const hdr = (cols, x0) => { let cx = x0; this.box(x0, y, cols.reduce((s, c) => s + c[1], 0), 28, '#f1ecd6', '#d6cfae'); cols.forEach(([t, w, al]) => { this.text(t, al ? cx + w - 8 : cx + 8, y + 15, { size: 13, bold: true, color: '#4a4535', align: al ? 'right' : 'left' }); cx += w; }); };
    const y0 = y;
    hdr(colsA, X);
    y += 28;
    this.orders.forEach((o) => {
      let cx = X;
      [o.num, fmtTime(o.time), o.code, shortFio(clientByCode(o.code).fio), fmt(o.total)].forEach((v, i) => { const [, w, al] = colsA[i]; this.text(v, al ? cx + w - 8 : cx + 8, y + 14, { size: 13, align: al ? 'right' : 'left', maxW: w - 12 }); cx += w; });
      g.fillStyle = '#e9e6da'; g.fillRect(X, y + 27, 486, 1);
      y += 27;
    });
    const total = this.orders.reduce((s, o) => s + o.total, 0);
    this.box(X, y, 486, 28, '#f7f4e6');
    this.text(`Итого заявок: ${this.orders.length}`, X + 8, y + 15, { size: 13, bold: true });
    this.text(fmt(total), X + 478, y + 15, { size: 13, bold: true, align: 'right' });
    // bake plan
    const X2 = X + 506;
    y = y0;
    this.text('К выпечке, шт/уп', X2, y - 18, { size: 14, bold: true, color: '#444' });
    const colsB = [['Номенклатура', 250], ['Кол-во', 70, 'right']];
    hdr(colsB, X2);
    y += 28;
    const sum = {};
    this.orders.forEach((o) => o.rows.forEach((r) => (sum[r.code] = (sum[r.code] || 0) + r.qty)));
    PRODUCTS.filter((p) => sum[p.code]).forEach((p) => {
      this.text(p.name, X2 + 8, y + 14, { size: 13, maxW: 236 });
      this.text(String(sum[p.code]), X2 + 312, y + 14, { size: 13, align: 'right', bold: true });
      g.fillStyle = '#e9e6da'; g.fillRect(X2, y + 27, 320, 1);
      y += 27;
    });
    g.restore();
    if (contentH > rh) this.text('колесо мыши — прокрутка', C.x + C.w - 30, ry + rh - 14, { align: 'right', size: 12, color: '#aaa' });
  }

  drawMenu(C) {
    const g = this.g;
    const s = SECTIONS.find((x) => x.key === this.menu);
    this.hit(C.x, 40, C.w, C.h + 36, 'menu-block', () => { this.menu = null; });
    g.save(); g.shadowColor = 'rgba(0,0,0,.2)'; g.shadowBlur = 20; g.shadowOffsetX = 4;
    this.box(C.x, 40, 700, C.h + 36, '#fff'); g.restore();
    this.hit(C.x, 40, 700, C.h + 36, 'menu-panel', null);
    this.text(s.name, C.x + 30, 76, { size: 24, color: '#333' });
    s.groups.forEach((gr, gi) => {
      const x = C.x + 30 + gi * 310;
      let y = 124;
      this.text(gr.title, x, y, { size: 15, bold: true, color: '#8a8a8a' });
      y += 34;
      gr.items.forEach(([label, cmd], ii) => { this.link(x, y, label, `m:${gi}:${ii}`, () => this.runCommand(cmd)); y += 30; });
    });
  }

  drawPopup() {}

  drawModal() {
    const m = this.modal, g = this.g;
    this.hit(0, 0, this.W, this.H, 'modal-block', null);
    g.fillStyle = 'rgba(40,40,40,.28)'; g.fillRect(0, 0, this.W, this.H);
    g.font = f(15);
    const lines = m.text.flatMap((t) => String(t).split('\n'));
    const w = Math.min(900, Math.max(460, ...lines.map((l) => g.measureText(l).width + 130)));
    const h = 120 + lines.length * 24;
    const x = (this.W - w) / 2, y = (this.H - h) / 2 - 30;
    g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 24; g.shadowOffsetY = 6;
    this.box(x, y, w, h, '#fff'); g.restore();
    this.box(x, y, w, h, null, '#a7a497');
    this.box(x + 1, y + 1, w - 2, 36, '#f7f6f2');
    this.text(m.title, x + 16, y + 19, { size: 15, bold: true, color: '#333' });
    const ic = m.icon || 'info';
    g.fillStyle = ic === 'err' ? '#d9453a' : ic === 'q' ? '#3b78d0' : '#e6b400';
    g.beginPath(); g.arc(x + 42, y + 78, 18, 0, 7); g.fill();
    this.text(ic === 'err' ? '!' : ic === 'q' ? '?' : 'i', x + 42, y + 79, { align: 'center', size: 22, bold: true, color: '#fff' });
    lines.forEach((l, i) => this.text(l, x + 80, y + 70 + i * 24, { size: 15, color: '#222', maxW: w - 100 }));
    let bx = x + w - 16;
    [...m.buttons].reverse().forEach((b, i) => {
      g.font = f(14, b.primary);
      const bw = Math.max(90, g.measureText(b.label).width + 30);
      bx -= bw;
      this.button(bx, y + h - 46, b.label, { primary: b.primary, w: bw, id: `mb:${i}`, fn: () => { this.modal = null; b.fn?.(); } });
      bx -= 8;
    });
  }
  drawToasts(now) {
    const g = this.g;
    this.toasts.forEach((t, i) => {
      const age = now - t.t0;
      const a = Math.max(0, Math.min(1, age / 200, (6000 - age) / 600));
      const w = 440, h = 66, x = this.W - w - 18, y = this.H - TASKBAR - 16 - (h + 10) * (this.toasts.length - i);
      g.save(); g.globalAlpha = a; g.shadowColor = 'rgba(0,0,0,.2)'; g.shadowBlur = 10;
      this.box(x, y, w, h, '#fffbe8'); g.restore();
      g.save(); g.globalAlpha = a;
      this.box(x, y, w, h, null, '#dfcf86');
      this.text(t.title, x + 14, y + 20, { size: 14, bold: true, color: '#333' });
      this.text(t.text, x + 14, y + 44, { size: 13, color: '#24569b', maxW: w - 28 });
      g.restore();
    });
  }
  drawCursor() {
    if (!this.mouse.inside) return;
    const g = this.g, { x, y } = this.mouse;
    const h = this.hitAt(x, y);
    if (h?.cursor === 'text') {
      g.strokeStyle = '#000'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x - 4, y - 10); g.lineTo(x + 4, y - 10); g.moveTo(x, y - 10); g.lineTo(x, y + 10); g.moveTo(x - 4, y + 10); g.lineTo(x + 4, y + 10); g.stroke();
      return;
    }
    g.save(); g.translate(x, y); g.scale(1.25, 1.25);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 17); g.lineTo(4.5, 13); g.lineTo(7.5, 20); g.lineTo(10, 19); g.lineTo(7, 12); g.lineTo(12.5, 12); g.closePath();
    g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1.2; g.stroke();
    g.restore();
  }
}

// ============================================================
// «Хлебная лихорадка» — a small match-3
const TILES = [
  { c: '#c8843a', d: 'loaf' }, { c: '#f0c35a', d: 'bun' }, { c: '#e0785a', d: 'donut' },
  { c: '#8c5a2b', d: 'rye' }, { c: '#f3e0b0', d: 'baguette' }, { c: '#7fae6a', d: 'pretzel' },
];
class Match3 {
  constructor(pc) {
    this.pc = pc; this.N = 8;
    this.score = 0; this.moves = 0; this.sel = null; this.anim = null; this.best = 0;
    this.reset();
  }
  reset() {
    const N = this.N;
    this.grid = [];
    for (let y = 0; y < N; y++) { this.grid.push([]); for (let x = 0; x < N; x++) { let t; do t = Math.floor(Math.random() * 6); while ((x > 1 && this.grid[y][x - 1] === t && this.grid[y][x - 2] === t) || (y > 1 && this.grid[y - 1][x] === t && this.grid[y - 2][x] === t)); this.grid[y].push(t); } }
    this.score = 0; this.moves = 0; this.sel = null;
  }
  busy() { return !!this.anim; }
  matches() {
    const N = this.N, g = this.grid, m = new Set();
    for (let y = 0; y < N; y++) for (let x = 0; x < N - 2; x++) { const t = g[y][x]; if (t >= 0 && g[y][x + 1] === t && g[y][x + 2] === t) { m.add(y * N + x); m.add(y * N + x + 1); m.add(y * N + x + 2); } }
    for (let x = 0; x < N; x++) for (let y = 0; y < N - 2; y++) { const t = g[y][x]; if (t >= 0 && g[y + 1][x] === t && g[y + 2][x] === t) { m.add(y * N + x); m.add((y + 1) * N + x); m.add((y + 2) * N + x); } }
    return m;
  }
  clickCell(x, y) {
    if (this.anim) return;
    if (!this.sel) { this.sel = { x, y }; return; }
    const s = this.sel;
    this.sel = null;
    if (Math.abs(s.x - x) + Math.abs(s.y - y) !== 1) { this.sel = { x, y }; return; }
    this.swap(s, { x, y });
    if (this.matches().size) { this.moves++; this.resolve(1); }
    else { this.swap(s, { x, y }); this.pc.onEvent('error'); }
  }
  swap(a, b) { const g = this.grid; [g[a.y][a.x], g[b.y][b.x]] = [g[b.y][b.x], g[a.y][a.x]]; }
  resolve(chain) {
    const m = this.matches();
    if (!m.size) { this.anim = null; this.best = Math.max(this.best, this.score); return; }
    this.anim = { cells: m, t0: performance.now() };
    this.score += m.size * 10 * chain;
    setTimeout(() => {
      const N = this.N;
      m.forEach((i) => (this.grid[Math.floor(i / N)][i % N] = -1));
      for (let x = 0; x < N; x++) {
        const col = [];
        for (let y = N - 1; y >= 0; y--) if (this.grid[y][x] >= 0) col.push(this.grid[y][x]);
        for (let y = N - 1, k = 0; y >= 0; y--, k++) this.grid[y][x] = k < col.length ? col[k] : Math.floor(Math.random() * 6);
      }
      this.pc.dirty = true;
      this.pc.onEvent('m3pop');
      setTimeout(() => this.resolve(chain + 1), 120);
    }, 260);
  }
  tile(t, cx, cy, s, g) {
    const T = TILES[t];
    g.save(); g.translate(cx, cy);
    g.fillStyle = T.c; g.strokeStyle = 'rgba(60,30,10,.55)'; g.lineWidth = 3;
    g.beginPath();
    switch (T.d) {
      case 'loaf': g.ellipse(0, 4, s * 0.4, s * 0.28, 0, 0, 7); g.fill(); g.stroke(); g.beginPath(); for (let i = -1; i <= 1; i++) { g.moveTo(i * s * 0.15 - 6, -4); g.lineTo(i * s * 0.15 + 6, 10); } g.stroke(); break;
      case 'bun': g.arc(0, 0, s * 0.33, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#3a2a1a'; for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(Math.cos(i * 2.4) * s * 0.18, Math.sin(i * 2.4) * s * 0.18, 2.2, 0, 7); g.fill(); } break;
      case 'donut': g.arc(0, 0, s * 0.35, 0, 7); g.arc(0, 0, s * 0.12, 0, 7, true); g.fill('evenodd'); g.stroke(); break;
      case 'rye': this.pc.rr(-s * 0.36, -s * 0.26, s * 0.72, s * 0.52, 10); g.fill(); g.stroke(); break;
      case 'baguette': g.rotate(-0.6); g.ellipse(0, 0, s * 0.44, s * 0.14, 0, 0, 7); g.fill(); g.stroke(); break;
      case 'pretzel': g.lineWidth = 9; g.strokeStyle = T.c; g.arc(-s * 0.12, 0, s * 0.18, 0, 7); g.moveTo(s * 0.42, 0); g.arc(s * 0.12, 0, s * 0.18, 0, 7); g.stroke(); break;
    }
    g.restore();
  }
  draw(X, Y, W, H) {
    const pc = this.pc, g = pc.g;
    g.fillStyle = '#3b2412'; g.fillRect(X, Y, W, H);
    pc.box(X, Y, W, 40, '#f7f6f2');
    pc.m3icon(X + 22, Y + 20, 12);
    pc.text('Хлебная лихорадка — три в ряд', X + 44, Y + 20, { size: 15, bold: true, color: '#333' });
    ['–', '×'].forEach((s, i) => {
      const x = X + W - 92 + i * 46, id = `m3w${i}`;
      if (pc.hover === id) pc.box(x, Y, 46, 39, i ? '#e0493a' : 'rgba(0,0,0,.08)');
      pc.text(s, x + 23, Y + 19, { align: 'center', size: 20, color: pc.hover === id && i ? '#fff' : '#333' });
      pc.hit(x, Y, 46, 39, id, () => { pc.front = null; if (i) this.reset(); });
    });
    const N = this.N, cell = Math.floor((H - 100) / N), bw = cell * N;
    const bx = X + (W - bw) / 2 - 150, by = Y + 60;
    pc.box(bx - 10, by - 10, bw + 20, bw + 20, '#5a3818');
    const now = performance.now();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const cx = bx + x * cell, cy = by + y * cell, id = `m3:${x}:${y}`;
      g.fillStyle = (x + y) % 2 ? '#6b4522' : '#734b26'; g.fillRect(cx, cy, cell, cell);
      if (this.sel && this.sel.x === x && this.sel.y === y) { g.fillStyle = 'rgba(255,220,120,.45)'; g.fillRect(cx, cy, cell, cell); }
      else if (pc.hover === id) { g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(cx, cy, cell, cell); }
      const t = this.grid[y][x];
      if (t >= 0) {
        const popping = this.anim?.cells.has(y * N + x);
        const k = popping ? Math.max(0.05, 1 - (now - this.anim.t0) / 260) : 1;
        this.tile(t, cx + cell / 2, cy + cell / 2, cell * k, g);
      }
      pc.hit(cx, cy, cell, cell, id, () => this.clickCell(x, y));
    }
    const px = bx + bw + 60;
    pc.text('Очки', px, by + 20, { size: 18, color: '#e9c98a' });
    pc.text(String(this.score), px, by + 64, { size: 48, bold: true, color: '#fff3d6' });
    pc.text(`Ходов: ${this.moves}`, px, by + 120, { size: 18, color: '#e9c98a' });
    pc.text(`Рекорд смены: ${this.best}`, px, by + 154, { size: 18, color: '#e9c98a' });
    pc.text('Собирайте по три одинаковых', px, by + 220, { size: 15, color: '#c9a878' });
    pc.text('в ряд. Начальница не видит.', px, by + 244, { size: 15, color: '#c9a878' });
    pc.text('(Наверное.)', px, by + 268, { size: 15, color: '#c9a878' });
    pc.button(px, by + 310, 'Новая игра', { id: 'm3-new', fn: () => this.reset() });
  }
}
