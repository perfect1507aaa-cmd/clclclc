// «1Ц:Предприятие» — a small accounting app drawn on a 2D canvas.
// The canvas becomes the texture of the 3D monitor; pointer/keyboard input
// arrives in canvas pixel coordinates from main.js.

const FONT = 'Arial, "Liberation Sans", "Helvetica Neue", Helvetica, sans-serif';
const f = (s, b) => `${b ? 'bold ' : ''}${s}px ${FONT}`;
const pad = (n, l = 2) => String(n).padStart(l, '0');
const fmt = (n) => n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQ = (n) => n.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
const fmtDate = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
const fmtDT = (d) => `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

// ---------- справочники ----------
export const ORG = {
  name: 'ООО «Вектор»', inn: '7714058312', kpp: '771401001',
  addr: 'г. Москва, ул. Складочная, д. 3, офис 214', bank: 'р/с 40702810400000012345 в ПАО «Банк Северный»',
};

export const PARTNERS = [
  { id: 'romashka', name: 'ООО «Ромашка»', inn: '7701234567', city: 'Москва', role: 'Покупатель', phone: '+7 495 123-45-67' },
  { id: 'sidorov', name: 'ИП Сидоров А. В.', inn: '502713456781', city: 'Мытищи', role: 'Покупатель', phone: '+7 916 555-12-34' },
  { id: 'gorizont', name: 'АО «Горизонт»', inn: '7810456123', city: 'Санкт-Петербург', role: 'Покупатель', phone: '+7 812 400-11-22' },
  { id: 'lutik', name: 'ООО «Лютик и партнёры»', inn: '7725001188', city: 'Москва', role: 'Покупатель', phone: '+7 495 777-00-01' },
  { id: 'meridian', name: 'ЗАО «Меридиан»', inn: '5024119870', city: 'Красногорск', role: 'Покупатель', phone: '+7 498 600-60-60' },
  { id: 'technosnab', name: 'ООО «ТехноСнаб»', inn: '7720334455', city: 'Москва', role: 'Поставщик', phone: '+7 495 210-33-44' },
  { id: 'kancmir', name: 'ООО «Канцмир»', inn: '7736612090', city: 'Москва', role: 'Поставщик', phone: '+7 495 988-10-10' },
  { id: 'energo', name: 'ООО «ЭнергоРесурс»', inn: '7702998877', city: 'Москва', role: 'Поставщик', phone: '+7 495 300-00-00' },
];

export const PRODUCTS = [
  { id: 'paper', name: 'Бумага А4 «Снежинка», 500 л.', unit: 'пач', price: 420, stock: 180 },
  { id: 'cart', name: 'Картридж лазерный 85A', unit: 'шт', price: 3900, stock: 4 },
  { id: 'pen', name: 'Ручка шариковая синяя', unit: 'шт', price: 25, stock: 950 },
  { id: 'binder', name: 'Папка-регистратор 75 мм', unit: 'шт', price: 210, stock: 120 },
  { id: 'stapler', name: 'Степлер №24/6', unit: 'шт', price: 390, stock: 35 },
  { id: 'clips', name: 'Скрепки 28 мм, 100 шт.', unit: 'уп', price: 45, stock: 300 },
  { id: 'calc', name: 'Калькулятор настольный 12 разр.', unit: 'шт', price: 1250, stock: 18 },
  { id: 'chair', name: 'Кресло офисное «Директор»', unit: 'шт', price: 8900, stock: 7 },
  { id: 'monitor', name: 'Монитор 24" IPS', unit: 'шт', price: 14500, stock: 5 },
  { id: 'delivery', name: 'Доставка по Москве', unit: 'усл', price: 1500, stock: 0, service: true },
];

const EMPLOYEES = [
  { name: 'Громов Виктор Павлович', pos: 'Генеральный директор', since: '15.01.2010', tab: '0000-00001' },
  { name: 'Петрова Людмила Петровна', pos: 'Главный бухгалтер', since: '12.03.2004', tab: '0000-00002' },
  { name: 'Козлов Сергей Игоревич', pos: 'Менеджер по продажам', since: '01.06.2023', tab: '0000-00017' },
  { name: 'Новиков Бухгалтер (вы)', pos: 'Бухгалтер', since: fmtDate(new Date()), tab: '0000-00023' },
];

const partner = (id) => PARTNERS.find((p) => p.id === id);
const product = (id) => PRODUCTS.find((p) => p.id === id);

const DOC_TYPES = {
  sale: { list: 'Реализация (акты, накладные)', one: 'Реализация (акт, накладная)', kind: 'Накладная', partnerLabel: 'Контрагент' },
  purchase: { list: 'Поступление (акты, накладные)', one: 'Поступление (акт, накладная)', kind: 'Накладная', partnerLabel: 'Контрагент' },
  bank: { list: 'Банковские выписки', one: 'Поступление на расчетный счет', kind: 'Платеж', partnerLabel: 'Плательщик' },
};

export function docTotal(doc) {
  if (doc.type === 'bank') return doc.sum || 0;
  return doc.rows.reduce((s, r) => s + (r.qty || 0) * (r.price || 0), 0);
}
const vatOf = (sum) => Math.round((sum * 20 / 120) * 100) / 100;

// ---------- сумма прописью ----------
function plural(n, forms) {
  const a = n % 100, b = n % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b === 1) return forms[0];
  if (b >= 2 && b <= 4) return forms[1];
  return forms[2];
}
function tripletWords(n, fem) {
  const h = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
  const t = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
  const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
  const o = fem
    ? ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
    : ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
  const w = [h[Math.floor(n / 100)]];
  const r = n % 100;
  if (r >= 10 && r < 20) w.push(teens[r - 10]);
  else w.push(t[Math.floor(r / 10)], o[r % 10]);
  return w.filter(Boolean).join(' ');
}
export function sumInWords(sum) {
  const rub = Math.floor(sum + 1e-9);
  const kop = Math.round((sum - rub) * 100);
  const groups = [
    { forms: ['рубль', 'рубля', 'рублей'], fem: false },
    { forms: ['тысяча', 'тысячи', 'тысяч'], fem: true },
    { forms: ['миллион', 'миллиона', 'миллионов'], fem: false },
  ];
  let n = rub, i = 0;
  const parts = [];
  if (n === 0) parts.push('ноль рублей');
  while (n > 0 && i < groups.length) {
    const tri = n % 1000;
    if (tri || i === 0) parts.unshift(`${tripletWords(tri, groups[i].fem)} ${plural(tri, groups[i].forms)}`.trim());
    n = Math.floor(n / 1000);
    i++;
  }
  const s = parts.join(' ').replace(/\s+/g, ' ');
  return `${s.charAt(0).toUpperCase()}${s.slice(1)} ${pad(kop)} ${plural(kop, ['копейка', 'копейки', 'копеек'])}`;
}

// ---------- sample data ----------
function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleDocs() {
  const rnd = mulberry(1957);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const docs = [];
  const today = new Date();
  const counters = { sale: 97, purchase: 41, bank: 63 };
  const stock = Object.fromEntries(PRODUCTS.map((p) => [p.id, p.stock]));
  const buyers = PARTNERS.filter((p) => p.role === 'Покупатель').map((p) => p.id);
  const sellers = ['technosnab', 'kancmir'];
  for (let back = 26; back >= 1; back--) {
    const d = new Date(today); d.setDate(today.getDate() - back);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const mk = (type, extra) => {
      const date = new Date(d); date.setHours(9 + Math.floor(rnd() * 8), Math.floor(rnd() * 60), Math.floor(rnd() * 60));
      counters[type]++;
      docs.push({ id: `${type}${counters[type]}`, type, num: `ВЕ00-${pad(counters[type], 6)}`, date, posted: true, comment: '', rows: [], ...extra });
    };
    if (rnd() < 0.45) {
      const items = ['paper', 'binder', 'clips', 'pen', 'cart', 'stapler'];
      const rows = [{ product: pick(items), qty: 10 + Math.floor(rnd() * 40), price: 0 }];
      rows.forEach((r) => (r.price = product(r.product).price));
      rows.forEach((r) => (stock[r.product] += r.qty));
      mk('purchase', { partner: pick(sellers), rows: rows.map((r) => ({ ...r, price: Math.round(r.price * 0.7) })) });
    }
    const nSales = 1 + Math.floor(rnd() * 2.2);
    for (let i = 0; i < nSales; i++) {
      const rows = [];
      const nRows = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < nRows; k++) {
        const p = pick(PRODUCTS);
        if (rows.some((r) => r.product === p.id)) continue;
        let qty = p.service ? 1 : Math.max(1, Math.floor(rnd() * (p.price > 5000 ? 2 : p.price > 1000 ? 4 : 25)));
        // keep enough on hand for the tasks the player gets over the phone
        const reserve = { stapler: 20, paper: 60, calc: 4 }[p.id] || 2;
        if (!p.service) { qty = Math.min(qty, stock[p.id] - reserve); if (qty < 1) continue; stock[p.id] -= qty; }
        rows.push({ product: p.id, qty, price: p.price });
      }
      if (!rows.length) continue;
      mk('sale', { partner: pick(buyers), rows });
    }
    if (rnd() < 0.5) {
      const sum = Math.round((5 + rnd() * 60)) * 1000;
      const pid = pick(buyers);
      mk('bank', { partner: pid, sum, purpose: `Оплата по счету № ${Math.floor(rnd() * 300) + 1} от ${fmtDate(d)}. В т.ч. НДС (20%) ${fmt(vatOf(sum))} руб.` });
    }
  }
  docs.sort((a, b) => a.date - b.date);
  return { docs, counters };
}

// ---------- sections ----------
const SECTIONS = [
  { key: 'main', name: 'Главное', color: '#d9534f', glyph: 'home', groups: [
    { title: 'Главное', items: [['Начальная страница', 'home'], ['Монитор руководителя', 'home'], ['Календарь бухгалтера', 'msg:Календарь бухгалтера: ближайший срок — 25-е число, расчет по страховым взносам. Не забудьте!']] },
    { title: 'Предприятие', items: [['Организации', 'cat:orgs'], ['Сотрудники', 'cat:employees']] }] },
  { key: 'boss', name: 'Руководителю', color: '#8a5cc8', glyph: 'chart', groups: [
    { title: 'Отчеты руководителю', items: [['Анализ продаж', 'rep:sales'], ['Оборотно-сальдовая ведомость', 'rep:osv'], ['Остатки товаров', 'rep:stock']] }] },
  { key: 'bank', name: 'Банк и касса', color: '#26917f', glyph: 'coin', groups: [
    { title: 'Банк', items: [['Банковские выписки', 'list:bank'], ['Платежные поручения', 'msg:Клиент-банк недоступен: истек срок действия сертификата электронной подписи.']] },
    { title: 'Касса', items: [['Кассовые документы', 'msg:Касса закрыта. Кассир ушел на обед.'], ['Авансовые отчеты', 'msg:Авансовые отчеты за сентябрь еще не сданы. Никем.']] }] },
  { key: 'sales', name: 'Продажи', color: '#3b78d0', glyph: 'cart', groups: [
    { title: 'Продажи', items: [['Реализация (акты, накладные)', 'list:sale'], ['Счета покупателям', 'msg:Раздел «Счета покупателям» отключен в настройках функциональности.']] },
    { title: 'Справочники', items: [['Контрагенты', 'cat:partners'], ['Номенклатура', 'cat:products']] },
    { title: 'Отчеты', items: [['Анализ продаж', 'rep:sales']] }] },
  { key: 'purch', name: 'Покупки', color: '#d68a1a', glyph: 'box', groups: [
    { title: 'Покупки', items: [['Поступление (акты, накладные)', 'list:purchase'], ['Счета от поставщиков', 'msg:Счета от поставщиков лежат в лотке на столе. Бумажные.']] },
    { title: 'Справочники', items: [['Контрагенты', 'cat:partners'], ['Номенклатура', 'cat:products']] }] },
  { key: 'stock', name: 'Склад', color: '#6a8a2c', glyph: 'box', groups: [
    { title: 'Склад', items: [['Инвентаризация товаров', 'msg:Инвентаризация назначена на пятницу. Приказ подписан.']] },
    { title: 'Справочники', items: [['Номенклатура', 'cat:products']] },
    { title: 'Отчеты', items: [['Остатки товаров', 'rep:stock']] }] },
  { key: 'prod', name: 'Производство', color: '#9a6a4c', glyph: 'gear', groups: [
    { title: 'Производство', items: [['Отчеты производства за смену', 'msg:Организация не ведет производственную деятельность. Мы продаем скрепки.']] }] },
  { key: 'os', name: 'ОС и НМА', color: '#5f7a88', glyph: 'gear', groups: [
    { title: 'Основные средства', items: [['Принятие к учету ОС', 'msg:Кофемашина уже принята к учету. Амортизация начисляется.']] }] },
  { key: 'zp', name: 'Зарплата и кадры', color: '#c2477a', glyph: 'person', groups: [
    { title: 'Кадры', items: [['Сотрудники', 'cat:employees']] },
    { title: 'Зарплата', items: [['Начисления зарплаты', 'msg:Начисление зарплаты за сентябрь будет доступно после закрытия месяца. То есть 5-го.']] }] },
  { key: 'ops', name: 'Операции', color: '#5566b0', glyph: 'gear', groups: [
    { title: 'Закрытие периода', items: [['Закрытие месяца', 'msg:Закрытие месяца: обнаружены ошибки (3). Не рассчитана себестоимость. Исправьте ошибки и повторите.'], ['Регламентные операции НДС', 'msg:Регламентные операции НДС выполняются после 20-го числа следующего месяца.']] }] },
  { key: 'rep', name: 'Отчеты', color: '#2a8bbf', glyph: 'chart', groups: [
    { title: 'Стандартные отчеты', items: [['Оборотно-сальдовая ведомость', 'rep:osv'], ['Анализ продаж', 'rep:sales'], ['Остатки товаров', 'rep:stock']] },
    { title: 'Регламентированные отчеты', items: [['Декларация по НДС', 'msg:Декларация по НДС за 3 квартал: срок сдачи 25.10. Черновик пуст.']] }] },
  { key: 'cat', name: 'Справочники', color: '#7a7a7a', glyph: 'book', groups: [
    { title: 'Покупки и продажи', items: [['Контрагенты', 'cat:partners'], ['Номенклатура', 'cat:products']] },
    { title: 'Предприятие', items: [['Организации', 'cat:orgs'], ['Сотрудники', 'cat:employees']] }] },
  { key: 'adm', name: 'Администрирование', color: '#4d4d4d', glyph: 'gear', groups: [
    { title: 'Сервис', items: [['О программе', 'about'], ['Обновление конфигурации', 'msg:Доступна новая версия 3.0.172.28. Установка запрещена главным бухгалтером до сдачи отчетности.']] }] },
];

const CATALOGS = {
  partners: {
    title: 'Контрагенты', rows: () => PARTNERS,
    cols: [['Наименование', 300, (p) => p.name], ['ИНН', 150, (p) => p.inn], ['Город', 180, (p) => p.city], ['Вид', 140, (p) => p.role], ['Телефон', 0, (p) => p.phone]],
  },
  products: {
    title: 'Номенклатура', rows: () => PRODUCTS,
    cols: [['Наименование', 380, (p) => p.name], ['Ед.', 70, (p) => p.unit], ['Цена продажи', 150, (p) => fmt(p.price), 'right'], ['Вид', 0, (p) => (p.service ? 'Услуга' : 'Товар')]],
  },
  employees: {
    title: 'Сотрудники', rows: () => EMPLOYEES,
    cols: [['ФИО', 330, (e) => e.name], ['Табельный номер', 170, (e) => e.tab], ['Должность', 260, (e) => e.pos], ['Дата приема', 0, (e) => e.since]],
  },
  orgs: {
    title: 'Организации', rows: () => [ORG],
    cols: [['Наименование', 260, (o) => o.name], ['ИНН', 150, (o) => o.inn], ['КПП', 130, (o) => o.kpp], ['Адрес', 0, (o) => o.addr]],
  },
};

const REPORTS = { sales: 'Анализ продаж', osv: 'Оборотно-сальдовая ведомость', stock: 'Остатки товаров' };

// ============================================================
export class OneC {
  constructor(W = 1600, H = 900) {
    this.W = W; this.H = H;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.g = this.canvas.getContext('2d');
    const { docs, counters } = sampleDocs();
    this.docs = docs; this.counters = counters;
    this.tabs = [{ id: 'home', kind: 'home', title: 'Начальная страница' }];
    this.active = 0;
    this.openList('sale');
    this.menu = null; this.popup = null; this.modal = null; this.edit = null;
    this.toasts = [];
    this.mouse = { x: -100, y: -100, inside: false };
    this.hover = null; this.lastClick = { id: null, t: 0 };
    this.hits = []; this.wheels = [];
    this.dirty = true;
    this.onEvent = () => {};
    this.blinkT = 0;
  }

  // ---------- public input API ----------
  pointerMove(x, y) {
    this.mouse = { x, y, inside: true };
    const h = this.hitAt(x, y);
    const id = h ? h.id : null;
    if (id !== this.hover) this.hover = id;
    this.dirty = true;
  }
  pointerLeave() { this.mouse.inside = false; this.hover = null; this.dirty = true; }
  click(x, y) {
    this.pointerMove(x, y);
    const h = this.hitAt(x, y);
    if (this.edit && (!h || h.id !== this.edit.id)) this.commitEdit();
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
  // returns true if the key was consumed
  key(e) {
    this.dirty = true;
    const k = e.key;
    if (this.modal) {
      if (k === 'Escape') { this.modal.cancel?.(); this.modal = null; return true; }
      if (k === 'Enter') { const b = this.modal.buttons.find((x) => x.primary) || this.modal.buttons[0]; this.modal = null; b.fn?.(); return true; }
      return true;
    }
    if (this.edit) {
      const ed = this.edit;
      if (k === 'Escape') { this.edit = null; return true; }
      if (k === 'Enter' || k === 'Tab') { this.commitEdit(); return true; }
      if (k === 'Backspace') { ed.value = ed.value.slice(0, -1); return true; }
      if (k.length === 1 && !e.ctrlKey && !e.metaKey) {
        if (ed.numeric && !/[0-9.,]/.test(k)) { this.onEvent('error'); return true; }
        if (ed.value.length < (ed.max || 120)) ed.value += k;
        if (ed.live) ed.live(ed.value);
        return true;
      }
      return true;
    }
    if (this.popup) {
      if (k === 'Escape') { this.popup = null; return true; }
      if (k === 'ArrowDown') { this.popup.sel = Math.min(this.popup.items.length - 1, (this.popup.sel ?? -1) + 1); return true; }
      if (k === 'ArrowUp') { this.popup.sel = Math.max(0, (this.popup.sel ?? 0) - 1); return true; }
      if (k === 'Enter' && this.popup.sel != null) { const p = this.popup; this.popup = null; p.onPick(p.sel); return true; }
      return true;
    }
    if (this.menu) { if (k === 'Escape') { this.menu = null; return true; } }
    const tab = this.tabs[this.active];
    if (tab.kind === 'doc') {
      if (e.ctrlKey && k === 'Enter') { this.postDoc(tab, true); return true; }
      if (e.ctrlKey && (k === 's' || k === 'ы' || k === 'S')) { this.saveDoc(tab, false); return true; }
      if (k === 'Insert') { this.addRow(tab); return true; }
    }
    if (tab.kind === 'list' || tab.kind === 'catalog') {
      const n = this.rowsOf(tab).length;
      if (k === 'ArrowDown') { tab.sel = Math.min(n - 1, tab.sel + 1); this.ensureVisible(tab); return true; }
      if (k === 'ArrowUp') { tab.sel = Math.max(0, tab.sel - 1); this.ensureVisible(tab); return true; }
      if (k === 'Enter') { this.openRow(tab, tab.sel); return true; }
      if (k === 'Insert' && tab.kind === 'list') { this.newDoc(tab.docType); return true; }
      if (k.length === 1 && !e.ctrlKey && !e.metaKey && k !== ' ') {
        this.startSearch(tab, k);
        return true;
      }
    }
    if (k === 'Escape') return false;
    return false;
  }
  needsAnim() {
    return this.toasts.length > 0 || !!this.edit || this.tabs.some((t) => t.kind === 'report' && t.state === 'busy');
  }

  // ---------- data helpers ----------
  rowsOf(tab) {
    if (tab.kind === 'list') {
      const s = (tab.search || '').toLowerCase();
      return this.docs.filter((d) => d.type === tab.docType && (!s || partner(d.partner)?.name.toLowerCase().includes(s) || d.num.toLowerCase().includes(s) || (d.comment || '').toLowerCase().includes(s)));
    }
    if (tab.kind === 'catalog') {
      const s = (tab.search || '').toLowerCase();
      const cat = CATALOGS[tab.cat];
      return cat.rows().filter((r) => !s || cat.cols.some((c) => String(c[2](r)).toLowerCase().includes(s)));
    }
    return [];
  }
  stockOf(pid, excludeDoc) {
    const p = product(pid);
    let s = p.stock;
    for (const d of this.docs) {
      if (!d.posted || d === excludeDoc) continue;
      for (const r of d.rows || []) if (r.product === pid) s += d.type === 'purchase' ? r.qty : d.type === 'sale' ? -r.qty : 0;
    }
    return s;
  }
  totals() {
    const posted = this.docs.filter((d) => d.posted);
    const sum = (t) => posted.filter((d) => d.type === t).reduce((s, d) => s + docTotal(d), 0);
    const sales = sum('sale'), purch = sum('purchase'), inc = sum('bank');
    return { sales, purch, inc, bank: 1245300 + inc - purch * 0.6, recv: 380000 + sales - inc, pay: 210000 + purch * 0.4 };
  }

  // ---------- tabs ----------
  openTab(spec, key) {
    const i = key ? this.tabs.findIndex((t) => t.key === key) : -1;
    if (i >= 0) { this.active = i; return this.tabs[i]; }
    const t = { key, ...spec };
    this.tabs.push(t);
    this.active = this.tabs.length - 1;
    return t;
  }
  openList(docType) {
    const t = this.openTab({ kind: 'list', docType, title: DOC_TYPES[docType].list, sel: 0, scroll: 0, search: '' }, `list:${docType}`);
    const n = this.rowsOf(t).length;
    if (t.sel === 0) t.sel = n - 1;
    this.ensureVisible(t);
  }
  openCatalog(cat) { this.openTab({ kind: 'catalog', cat, title: CATALOGS[cat].title, sel: 0, scroll: 0, search: '' }, `cat:${cat}`); }
  openReport(rep) { this.openTab({ kind: 'report', rep, title: REPORTS[rep], state: 'idle' }, `rep:${rep}`); }
  runCommand(cmd) {
    this.menu = null;
    const [kind, arg] = cmd.split(/:(.*)/s);
    if (kind === 'home') this.active = 0;
    else if (kind === 'list') this.openList(arg);
    else if (kind === 'cat') this.openCatalog(arg);
    else if (kind === 'rep') this.openReport(arg);
    else if (kind === 'msg') this.message(arg);
    else if (kind === 'about') this.about();
  }
  closeTab(i) {
    const t = this.tabs[i];
    if (!t || t.kind === 'home') return;
    const doClose = () => {
      const idx = this.tabs.indexOf(t);
      if (idx < 0) return;
      this.tabs.splice(idx, 1);
      if (this.active >= idx) this.active = Math.max(0, this.active - 1);
      if (t.returnTo) { const r = this.tabs.indexOf(t.returnTo); if (r >= 0) this.active = r; }
    };
    if (t.kind === 'doc' && t.modified) {
      this.modal = {
        title: '1Ц:Предприятие', text: ['Данные были изменены.', 'Сохранить изменения?'],
        buttons: [
          { label: 'Да', primary: true, fn: () => { if (this.saveDoc(t, false)) doClose(); } },
          { label: 'Нет', fn: doClose },
          { label: 'Отмена' },
        ],
      };
      return;
    }
    doClose();
  }

  // ---------- documents ----------
  newDoc(type) {
    const doc = { id: null, type, num: '', date: new Date(), partner: null, rows: [], comment: '', posted: false, sum: 0, purpose: '' };
    const from = this.tabs[this.active];
    const t = this.openTab({ kind: 'doc', doc, orig: null, modified: true, title: `${DOC_TYPES[type].one} (создание)`, rowSel: -1 });
    t.returnTo = from;
    if (type !== 'bank') this.addRow(t);
  }
  openDoc(d) {
    const key = `doc:${d.id}`;
    const from = this.tabs[this.active];
    const t = this.openTab({ kind: 'doc', doc: structuredClone(d), orig: d, modified: false, title: '', rowSel: -1 }, key);
    if (!t.returnTo) t.returnTo = from;
  }
  docTitle(t) {
    const d = t.doc, T = DOC_TYPES[d.type];
    if (!t.orig) return `${T.one} (создание)${t.modified ? ' *' : ''}`;
    const head = { sale: 'Реализация товаров: Накладная', purchase: 'Поступление товаров: Накладная', bank: 'Поступление на расчетный счет' }[d.type];
    return `${head} ${d.num} от ${fmtDT(d.date)}${t.modified ? ' *' : ''}`;
  }
  addRow(t) {
    t.doc.rows.push({ product: null, qty: 1, price: 0 });
    t.rowSel = t.doc.rows.length - 1;
    t.modified = true;
    t.pendingPick = t.rowSel; // open product chooser on next draw
  }
  validate(t, posting) {
    const d = t.doc;
    const errs = [];
    if (!d.partner) errs.push(`Поле «${DOC_TYPES[d.type].partnerLabel}» не заполнено`);
    if (d.type === 'bank') {
      if (!(d.sum > 0)) errs.push('Не указана сумма платежа');
    } else {
      d.rows = d.rows.filter((r) => r.product);
      if (!d.rows.length) errs.push('Не заполнена табличная часть «Товары»');
      d.rows.forEach((r, i) => { if (!(r.qty > 0)) errs.push(`Строка ${i + 1}: не заполнено количество`); });
      if (posting && d.type === 'sale') {
        const need = {};
        d.rows.forEach((r) => { if (!product(r.product).service) need[r.product] = (need[r.product] || 0) + r.qty; });
        for (const [pid, q] of Object.entries(need)) {
          const have = this.stockOf(pid, t.orig);
          if (have < q) {
            const p = product(pid);
            errs.push(`Товар «${p.name}»: недостаточно на складе «Основной склад».`);
            errs.push(`   Остаток: ${fmtQ(have)} ${p.unit}, требуется: ${fmtQ(q)} ${p.unit}, не хватает: ${fmtQ(q - have)} ${p.unit}`);
          }
        }
      }
    }
    if (errs.length) {
      this.modal = { title: posting ? 'Не удалось провести' : 'Не удалось записать', text: [`«${DOC_TYPES[d.type].one}»:`, ...errs], buttons: [{ label: 'OK', primary: true }], icon: 'err' };
      this.onEvent('error');
      return false;
    }
    return true;
  }
  commitDoc(t, posted) {
    const d = t.doc;
    d.posted = posted;
    if (!t.orig) {
      this.counters[d.type]++;
      d.id = `${d.type}${this.counters[d.type]}`;
      d.num = `ВЕ00-${pad(this.counters[d.type], 6)}`;
      d.date = new Date();
      const copy = structuredClone(d);
      this.docs.push(copy);
      t.orig = copy;
      t.key = `doc:${d.id}`;
    } else {
      Object.assign(t.orig, structuredClone(d));
    }
    t.modified = false;
    const list = this.tabs.find((x) => x.key === `list:${d.type}`);
    if (list) { list.sel = this.rowsOf(list).indexOf(t.orig); this.ensureVisible(list); }
  }
  saveDoc(t, posting) {
    if (!this.validate(t, posting)) return false;
    this.commitDoc(t, posting ? true : t.doc.posted);
    this.toast(posting ? 'Проведение:' : 'Изменение:', this.docTitle(t));
    if (posting) this.onEvent('posted', t.orig);
    return true;
  }
  postDoc(t, close) {
    if (this.saveDoc(t, true) && close) { t.modified = false; this.closeTab(this.tabs.indexOf(t)); }
  }
  postSelected(tab) {
    const d = this.rowsOf(tab)[tab.sel];
    if (!d) return;
    const tmp = { doc: structuredClone(d), orig: d };
    if (!this.validate(tmp, true)) return;
    d.posted = true;
    this.toast('Проведение:', `${DOC_TYPES[d.type].one} ${d.num} от ${fmtDT(d.date)}`);
    this.onEvent('posted', d);
  }
  openRow(tab, i) {
    const r = this.rowsOf(tab)[i];
    if (!r) return;
    if (tab.kind === 'list') this.openDoc(r);
    else this.catalogCard(tab.cat, r);
  }
  ensureVisible(tab) {
    const vis = tab.visRows || 24;
    if (tab.sel < tab.scroll) tab.scroll = tab.sel;
    if (tab.sel >= tab.scroll + vis) tab.scroll = tab.sel - vis + 1;
    tab.scroll = Math.max(0, tab.scroll);
  }
  startSearch(tab, ch) {
    tab.search = '';
    this.edit = { id: `search:${tab.key}`, value: ch, max: 40, live: (v) => { tab.search = v; tab.sel = 0; tab.scroll = 0; }, onCommit: (v) => { tab.search = v; } };
    tab.search = ch; tab.sel = 0; tab.scroll = 0;
  }

  // ---------- dialogs ----------
  message(text, title = '1Ц:Предприятие') {
    this.modal = { title, text: [text], buttons: [{ label: 'OK', primary: true }], icon: 'info' };
  }
  about() {
    this.modal = {
      title: 'О программе', icon: 'info',
      text: ['1Ц:Предприятие 8.3 (8.3.25.1286)', 'Конфигурация: Бухгалтерия предприятия, редакция 3.0 (3.0.171.9)', `Лицензия: однопользовательская, ${ORG.name}`, 'Пользователь: Бухгалтер', 'Компьютер: BUH-02', 'Режим: файловый, база «Вектор_рабочая_НЕ_УДАЛЯТЬ»'],
      buttons: [{ label: 'Закрыть', primary: true }],
    };
  }
  catalogCard(cat, r) {
    let text;
    if (cat === 'partners') text = [r.name, `ИНН: ${r.inn}`, `Город: ${r.city}`, `Вид: ${r.role}`, `Телефон: ${r.phone}`];
    else if (cat === 'products') text = [r.name, `Единица: ${r.unit}`, `Цена продажи: ${fmt(r.price)} руб.`, r.service ? 'Услуга, не учитывается на складе' : `Остаток на складе: ${fmtQ(this.stockOf(r.id))} ${r.unit}`];
    else if (cat === 'employees') text = [r.name, `Должность: ${r.pos}`, `Табельный номер: ${r.tab}`, `Дата приема: ${r.since}`];
    else text = [r.name, `ИНН/КПП: ${r.inn}/${r.kpp}`, r.addr, r.bank];
    this.modal = { title: CATALOGS[cat].title, text, buttons: [{ label: 'Закрыть', primary: true }], icon: 'info' };
  }
  toast(title, text) {
    this.toasts.push({ title, text, t0: performance.now() });
    if (this.toasts.length > 3) this.toasts.shift();
  }
  commitEdit() {
    const ed = this.edit;
    this.edit = null;
    if (ed?.onCommit) ed.onCommit(ed.value);
    this.dirty = true;
  }

  // ============================================================
  // drawing primitives
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
  button(x, y, label, o = {}) {
    const g = this.g;
    g.font = f(14, o.primary);
    const w = o.w || Math.ceil(g.measureText(label).width) + (o.drop ? 38 : 26);
    const h = o.h || 28;
    const hov = this.hover === o.id && !o.disabled;
    const grd = g.createLinearGradient(0, y, 0, y + h);
    if (o.primary) { grd.addColorStop(0, hov ? '#ffe98a' : '#ffe27a'); grd.addColorStop(1, hov ? '#f8cf3f' : '#f5c634'); }
    else { grd.addColorStop(0, hov ? '#ffffff' : '#fbfbfb'); grd.addColorStop(1, hov ? '#ececec' : '#e6e6e6'); }
    this.rr(x + 0.5, y + 0.5, w - 1, h - 1, 3);
    g.fillStyle = grd; g.fill();
    g.strokeStyle = o.primary ? '#c9a21e' : hov ? '#9a9a9a' : '#b9b9b9'; g.lineWidth = 1; g.stroke();
    this.text(label, x + (o.drop ? (w - 12) / 2 : w / 2), y + h / 2 + 1, { align: 'center', bold: o.primary, color: o.disabled ? '#a0a0a0' : '#2b2b2b' });
    if (o.drop) this.caret(x + w - 16, y + h / 2, o.disabled ? '#a0a0a0' : '#555');
    if (o.id && !o.disabled) this.hit(x, y, w, h, o.id, o.fn);
    return w;
  }
  caret(x, y, c) {
    const g = this.g;
    g.fillStyle = c; g.beginPath(); g.moveTo(x - 4, y - 2); g.lineTo(x + 4, y - 2); g.lineTo(x, y + 3); g.closePath(); g.fill();
  }
  link(x, y, label, id, fn, o = {}) {
    const w = this.text(label, x, y, { color: this.hover === id ? '#c0392b' : '#24569b', size: o.size || 15 });
    if (this.hover === id) { const g = this.g; g.fillStyle = '#c0392b'; g.fillRect(x, y + 9, w, 1); }
    this.hit(x - 2, y - 11, w + 4, 22, id, fn);
    return w;
  }
  field(x, y, w, value, o = {}) {
    const h = o.h || 28;
    const editing = this.edit && this.edit.id === o.id;
    const hov = this.hover === o.id;
    this.box(x, y, w, h, o.readonly ? '#f6f6f6' : '#ffffff', editing ? '#e0ac00' : o.invalid ? '#e0786c' : hov && !o.readonly ? '#8a8a8a' : '#b3b3b3');
    const dropW = o.drop ? 24 : 0;
    const shown = editing ? this.edit.value : value;
    const g = this.g;
    g.save(); g.beginPath(); g.rect(x + 2, y, w - 4 - dropW, h); g.clip();
    let tw;
    if (shown === '' || shown == null) { tw = 0; if (o.placeholder) this.text(o.placeholder, x + 7, y + h / 2 + 1, { color: o.invalid ? '#d0685c' : '#a5a5a5', size: 14 }); }
    else tw = this.text(shown, o.align === 'right' && !editing ? x + w - 8 - dropW : x + 7, y + h / 2 + 1, { align: o.align === 'right' && !editing ? 'right' : 'left', size: 14, color: o.color || '#222' });
    if (editing && Math.floor(performance.now() / 530) % 2 === 0) { g.fillStyle = '#111'; g.fillRect(x + 8 + tw, y + 5, 1.5, h - 10); }
    g.restore();
    if (o.drop) {
      this.box(x + w - dropW, y + 1, dropW - 1, h - 2, hov ? '#f2f2f2' : '#fafafa');
      this.caret(x + w - dropW / 2, y + h / 2, '#555');
    }
    if (o.id && !o.readonly) this.hit(x, y, w, h, o.id, o.fn, { cursor: o.edit ? 'text' : 'pointer' });
    return h;
  }
  label(x, y, s) { return this.text(s, x, y + 15, { color: '#555', size: 14 }); }

  // ---------- icons ----------
  glyph(kind, cx, cy, color) {
    const g = this.g;
    g.save();
    g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 2; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    switch (kind) {
      case 'home': g.moveTo(cx - 8, cy); g.lineTo(cx, cy - 7); g.lineTo(cx + 8, cy); g.moveTo(cx - 5, cy - 2); g.lineTo(cx - 5, cy + 7); g.lineTo(cx + 5, cy + 7); g.lineTo(cx + 5, cy - 2); g.stroke(); break;
      case 'chart': g.moveTo(cx - 7, cy + 7); g.lineTo(cx - 7, cy + 1); g.moveTo(cx - 2, cy + 7); g.lineTo(cx - 2, cy - 6); g.moveTo(cx + 3, cy + 7); g.lineTo(cx + 3, cy - 2); g.moveTo(cx + 8, cy + 7); g.lineTo(cx + 8, cy - 8); g.stroke(); break;
      case 'coin': g.arc(cx, cy, 7, 0, Math.PI * 2); g.stroke(); g.font = f(10, true); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('₽', cx, cy + 1); break;
      case 'cart': g.moveTo(cx - 9, cy - 6); g.lineTo(cx - 6, cy - 6); g.lineTo(cx - 3, cy + 4); g.lineTo(cx + 7, cy + 4); g.lineTo(cx + 9, cy - 3); g.lineTo(cx - 5, cy - 3); g.stroke(); g.beginPath(); g.arc(cx - 2, cy + 8, 1.6, 0, 7); g.arc(cx + 6, cy + 8, 1.6, 0, 7); g.fill(); break;
      case 'box': g.rect(cx - 7, cy - 5, 14, 12); g.moveTo(cx - 7, cy - 1); g.lineTo(cx + 7, cy - 1); g.moveTo(cx - 2, cy + 2); g.lineTo(cx + 2, cy + 2); g.stroke(); break;
      case 'gear': g.arc(cx, cy, 4, 0, 7); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; g.moveTo(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6); g.lineTo(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9); } g.stroke(); break;
      case 'person': g.arc(cx, cy - 4, 4, 0, 7); g.moveTo(cx - 7, cy + 8); g.quadraticCurveTo(cx, cy - 3, cx + 7, cy + 8); g.stroke(); break;
      case 'book': g.rect(cx - 7, cy - 7, 14, 15); g.moveTo(cx - 3, cy - 7); g.lineTo(cx - 3, cy + 8); g.stroke(); break;
    }
    g.restore();
  }
  docIcon(x, y, posted, deleted) {
    const g = this.g;
    g.fillStyle = '#fff'; g.strokeStyle = '#8a8a8a'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 9, y); g.lineTo(x + 13, y + 4); g.lineTo(x + 13, y + 16); g.lineTo(x, y + 16); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#b0b0b0'; g.fillRect(x + 3, y + 7, 7, 1); g.fillRect(x + 3, y + 10, 7, 1);
    if (posted) {
      g.strokeStyle = '#2e9e3e'; g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(x + 5, y + 11); g.lineTo(x + 9, y + 15); g.lineTo(x + 17, y + 5); g.stroke();
    }
    if (deleted) { g.strokeStyle = '#d33'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 1, y); g.lineTo(x + 14, y + 16); g.stroke(); }
  }

  // ============================================================
  draw() {
    const g = this.g, W = this.W, H = this.H;
    this.hits = []; this.wheels = [];
    const now = performance.now();
    this.toasts = this.toasts.filter((t) => now - t.t0 < 6000);

    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    this.drawHeader();
    this.drawSections();
    this.drawTabs();

    const tab = this.tabs[this.active];
    const C = { x: 212, y: 76, w: W - 212, h: H - 44 - 76 };
    g.save(); g.beginPath(); g.rect(C.x, C.y, C.w, C.h); g.clip();
    ({ home: this.drawHome, list: this.drawList, doc: this.drawDoc, catalog: this.drawCatalog, report: this.drawReport, print: this.drawPrint })[tab.kind].call(this, tab, C);
    g.restore();

    if (this.menu) this.drawMenu(C);
    if (this.popup) this.drawPopup();
    this.drawToasts(now);
    if (this.modal) this.drawModal();
    this.drawTaskbar();
    this.drawCursor();
    this.dirty = false;
  }

  drawHeader() {
    const g = this.g, W = this.W;
    const grd = g.createLinearGradient(0, 0, 0, 40);
    grd.addColorStop(0, '#fbe9a0'); grd.addColorStop(1, '#f2d874');
    g.fillStyle = grd; g.fillRect(0, 0, W, 40);
    g.fillStyle = '#d8bd55'; g.fillRect(0, 39, W, 1);
    // logo
    g.fillStyle = '#e1231b'; g.beginPath(); g.arc(22, 20, 13, 0, 7); g.fill();
    this.text('1Ц', 22, 21, { align: 'center', bold: true, color: '#ffd200', size: 13 });
    this.text('Бухгалтерия предприятия, редакция 3.0', 46, 20, { bold: true, color: '#3c3522', size: 15 });
    this.text(`/  ${ORG.name}   (1Ц:Предприятие)`, 340, 20, { color: '#5a5037', size: 14 });
    // search
    const sx = W - 560;
    this.box(sx, 7, 250, 26, '#fffdf3', '#d6c07a');
    this.text('Поиск (Ctrl+Shift+F)', sx + 10, 21, { color: '#9f9275', size: 13 });
    const lx = sx + 232; g.strokeStyle = '#8a7c55'; g.lineWidth = 2; g.beginPath(); g.arc(lx - 2, 18, 5, 0, 7); g.moveTo(lx + 2, 22); g.lineTo(lx + 6, 26); g.stroke();
    this.hit(sx, 7, 250, 26, 'hdr-search', () => this.message('Полнотекстовый поиск отключен. Индекс не обновлялся с 2019 года.'));
    // bell, history, user
    const bx = W - 290;
    g.strokeStyle = '#6d6243'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(bx - 6, 25); g.quadraticCurveTo(bx - 6, 12, bx, 12); g.quadraticCurveTo(bx + 6, 12, bx + 6, 25); g.closePath(); g.stroke();
    g.beginPath(); g.arc(bx, 27, 2, 0, 7); g.stroke();
    this.hit(bx - 12, 6, 24, 28, 'hdr-bell', () => this.message('Непрочитанных оповещений: 0. Обсуждения отключены.'));
    this.text('Бухгалтер', W - 250, 20, { color: '#3c3522', size: 14 });
    g.fillStyle = '#9b8a52'; g.beginPath(); g.arc(W - 262, 20, 6, 0, 7); g.fill();
    // window buttons
    const wb = [['–', '#3c3522'], ['□', '#3c3522'], ['×', '#3c3522']];
    wb.forEach(([s, c], i) => {
      const x = W - 138 + i * 46;
      const id = `win${i}`;
      if (this.hover === id) this.box(x, 0, 46, 39, i === 2 ? '#e0493a' : 'rgba(0,0,0,.08)');
      this.text(s, x + 23, 19, { align: 'center', size: i === 1 ? 16 : 20, color: this.hover === id && i === 2 ? '#fff' : c });
      this.hit(x, 0, 46, 39, id, () => {
        if (i === 2) this.modal = { title: '1Ц:Предприятие', icon: 'q', text: ['Завершить работу с программой?', 'Рабочий день еще не закончился.'], buttons: [{ label: 'Да', fn: () => this.message('Работу завершить нельзя: не проведены документы за сегодня. И вообще, еще не 18:00.') }, { label: 'Нет', primary: true }] };
        else this.message(i === 0 ? 'Свернуть окно нельзя: вас видит главный бухгалтер.' : 'Окно уже развернуто на весь экран.');
      });
    });
  }

  drawSections() {
    const g = this.g, H = this.H;
    g.fillStyle = '#f6f5f1'; g.fillRect(0, 40, 212, H - 84);
    g.fillStyle = '#dcdad2'; g.fillRect(211, 40, 1, H - 84);
    const tab = this.tabs[this.active];
    const cur = this.menu || this.sectionOfTab(tab);
    SECTIONS.forEach((s, i) => {
      const y = 46 + i * 44;
      const id = `sec:${s.key}`;
      const act = cur === s.key;
      if (act) { this.box(0, y, 211, 42, '#fff0bd'); g.fillStyle = '#e9b800'; g.fillRect(0, y, 4, 42); }
      else if (this.hover === id) this.box(0, y, 211, 42, '#ebe9e2');
      g.fillStyle = s.color; g.beginPath(); g.arc(30, y + 21, 14, 0, 7); g.fill();
      this.glyph(s.glyph, 30, y + 21, '#ffffff');
      this.text(s.name, 54, y + 22, { size: 15, color: act ? '#1f1f1f' : '#3a3a3a', bold: act, maxW: 150 });
      this.hit(0, y, 211, 42, id, () => { this.menu = this.menu === s.key ? null : s.key; });
    });
    this.text(`База: Вектор (файловая)`, 14, H - 62, { size: 12, color: '#9a978c' });
  }
  sectionOfTab(t) {
    if (t.kind === 'home') return 'main';
    if (t.kind === 'list' || t.kind === 'doc') { const ty = t.docType || t.doc.type; return ty === 'sale' ? 'sales' : ty === 'purchase' ? 'purch' : 'bank'; }
    if (t.kind === 'catalog') return 'cat';
    if (t.kind === 'report') return 'rep';
    if (t.kind === 'print') return 'sales';
    return null;
  }

  drawTabs() {
    const g = this.g, W = this.W;
    g.fillStyle = '#e8e7e2'; g.fillRect(212, 40, W - 212, 36);
    g.fillStyle = '#cfcdc4'; g.fillRect(212, 75, W - 212, 1);
    let x = 216;
    this.tabs.forEach((t, i) => {
      if (t.kind === 'doc') t.title = this.docTitle(t);
      const act = i === this.active;
      g.font = f(13, act);
      const tw = Math.min(230, Math.ceil(g.measureText(t.title).width) + (t.kind === 'home' ? 38 : 44));
      if (x + tw > W - 10) return;
      const id = `tab:${i}`;
      if (act) { this.box(x, 44, tw, 32, '#ffffff', '#cfcdc4'); g.fillStyle = '#ffffff'; g.fillRect(x + 1, 74, tw - 2, 3); g.fillStyle = '#e9b800'; g.fillRect(x, 44, tw, 3); }
      else if (this.hover === id || this.hover === `tabx:${i}`) this.box(x, 46, tw, 29, '#f3f2ee');
      if (t.kind === 'home') this.glyph('home', x + 16, 61, '#6a6a6a');
      this.text(t.title, x + (t.kind === 'home' ? 30 : 12), 61, { size: 13, bold: act, color: '#333', maxW: tw - (t.kind === 'home' ? 36 : 40) });
      this.hit(x, 44, tw, 32, id, () => { this.active = i; this.menu = null; });
      if (t.kind !== 'home') {
        const cx = x + tw - 16, xid = `tabx:${i}`;
        if (this.hover === xid) { g.fillStyle = '#dcdcdc'; g.beginPath(); g.arc(cx, 61, 9, 0, 7); g.fill(); }
        if (act || this.hover === id || this.hover === xid) this.text('×', cx, 60, { align: 'center', size: 17, color: '#666' });
        this.hit(cx - 10, 50, 20, 22, xid, () => this.closeTab(i));
      }
      x += tw + 3;
    });
  }

  formTitle(C, s) { this.text(s, C.x + 20, C.y + 28, { size: 22, color: '#4a4a4a', maxW: C.w - 40 }); }

  // ---------- home ----------
  drawHome(tab, C) {
    const g = this.g;
    this.formTitle(C, 'Начальная страница');
    const T = this.totals();
    const x0 = C.x + 20, y0 = C.y + 62;
    // left: tasks
    this.text('Задачи организации', x0, y0, { size: 17, bold: true, color: '#2f2f2f' });
    const today = new Date();
    const tasks = [
      ['Расчет по страховым взносам за 9 месяцев', '25.10', true],
      ['6-НДФЛ за 9 месяцев', '27.10', true],
      ['Декларация по НДС за 3 квартал', '25.10', true],
      ['Уплата НДС за 3 квартал (1/3)', '28.10', false],
      ['Налог на прибыль за 9 месяцев', '28.10', false],
      ['Закрытие месяца: сентябрь', `30.${pad(today.getMonth() + 1)}`, false],
    ];
    tasks.forEach(([t, d, hot], i) => {
      const y = y0 + 34 + i * 32;
      g.fillStyle = hot ? '#e25141' : '#e6b400'; g.beginPath(); g.arc(x0 + 6, y, 5, 0, 7); g.fill();
      this.link(x0 + 20, y, t, `task${i}`, () => this.message(`«${t}»: срок до ${d}. Статус: не начато.`));
      this.text(`до ${d}`, x0 + 520, y, { align: 'right', color: hot ? '#c0392b' : '#777', size: 14 });
    });
    // quick links
    const qy = y0 + 250;
    this.text('Часто используемые', x0, qy, { size: 17, bold: true, color: '#2f2f2f' });
    [['Реализация (акты, накладные)', 'list:sale'], ['Поступление (акты, накладные)', 'list:purchase'], ['Банковские выписки', 'list:bank'], ['Анализ продаж', 'rep:sales'], ['Оборотно-сальдовая ведомость', 'rep:osv'], ['Контрагенты', 'cat:partners']]
      .forEach(([t, cmd], i) => this.link(x0 + 4, qy + 34 + i * 28, t, `ql${i}`, () => this.runCommand(cmd)));
    // currency
    const cy = qy + 230;
    this.text(`Курсы валют на ${fmtDate(today)}`, x0, cy, { size: 17, bold: true, color: '#2f2f2f' });
    [['USD', 'Доллар США', 82.4512, +0.31], ['EUR', 'Евро', 90.1207, -0.12], ['CNY', 'Юань', 11.4735, +0.02]].forEach(([c, n, v, dv], i) => {
      const y = cy + 32 + i * 26;
      this.text(c, x0 + 4, y, { bold: true, size: 14 });
      this.text(n, x0 + 54, y, { size: 14, color: '#555' });
      this.text(v.toLocaleString('ru-RU', { minimumFractionDigits: 4 }), x0 + 300, y, { size: 14, align: 'right' });
      this.text(`${dv > 0 ? '▲' : '▼'} ${Math.abs(dv).toFixed(2).replace('.', ',')}`, x0 + 380, y, { size: 13, align: 'right', color: dv > 0 ? '#2e9e3e' : '#c0392b' });
    });

    // right: monitor
    const rx = C.x + 640, rw = C.w - 660;
    this.text('Монитор руководителя', rx, y0, { size: 17, bold: true, color: '#2f2f2f' });
    const tiles = [['Денежные средства', T.bank, '#26917f'], ['Нам должны покупатели', T.recv, '#3b78d0'], ['Мы должны поставщикам', T.pay, '#d68a1a'], ['Продажи за период', T.sales, '#8a5cc8']];
    const tw = (rw - 30) / 2;
    tiles.forEach(([t, v, c], i) => {
      const x = rx + (i % 2) * (tw + 30), y = y0 + 26 + Math.floor(i / 2) * 96;
      this.box(x, y, tw, 84, '#fbfbf8', '#e2e0d8');
      g.fillStyle = c; g.fillRect(x, y, tw, 3);
      this.text(t, x + 16, y + 26, { size: 14, color: '#666' });
      this.text(`${fmt(v)} ₽`, x + 16, y + 58, { size: 24, bold: true, color: '#2b2b2b' });
    });
    // sales per day chart
    const chy = y0 + 240, chh = 260;
    this.text('Продажи по дням, руб.', rx, chy, { size: 15, bold: true, color: '#444' });
    const days = {};
    this.docs.filter((d) => d.type === 'sale' && d.posted).forEach((d) => { const k = fmtDate(d.date); days[k] = (days[k] || 0) + docTotal(d); });
    const keys = [];
    for (let back = 20; back >= 0; back--) { const d = new Date(today); d.setDate(today.getDate() - back); keys.push(d); }
    const vals = keys.map((d) => days[fmtDate(d)] || 0);
    const max = Math.max(10000, ...vals) * 1.1;
    const px = rx + 60, py = chy + 24, pw = rw - 70, ph = chh - 50;
    const nice = Math.pow(10, Math.floor(Math.log10(max / 4)));
    const step = Math.ceil(max / 4 / nice) * nice;
    for (let v = 0; v <= max; v += step) {
      const y = py + ph - (v / max) * ph;
      g.fillStyle = '#eceae3'; g.fillRect(px, Math.round(y), pw, 1);
      this.text(v >= 1000 ? `${Math.round(v / 1000)} тыс` : '0', px - 8, y, { align: 'right', size: 11, color: '#888' });
    }
    const bw = pw / keys.length;
    keys.forEach((d, i) => {
      const v = vals[i];
      const h = (v / max) * ph;
      const x = px + i * bw + 3;
      const isToday = i === keys.length - 1;
      g.fillStyle = isToday ? '#e9b800' : d.getDay() % 6 === 0 ? '#d7d5cc' : '#6b8fc9';
      this.rr(x, py + ph - h, bw - 6, h, 2); if (h > 0) g.fill();
      if (i % 3 === 0 || isToday) this.text(`${pad(d.getDate())}.${pad(d.getMonth() + 1)}`, x + (bw - 6) / 2, py + ph + 13, { align: 'center', size: 11, color: isToday ? '#8a6d00' : '#888' });
    });
  }

  // ---------- journals ----------
  drawList(tab, C) {
    const dt = DOC_TYPES[tab.docType];
    this.formTitle(C, dt.list);
    let x = C.x + 20;
    const ty = C.y + 50;
    x += this.button(x, ty, 'Создать', { primary: true, id: 'l-new', fn: () => this.newDoc(tab.docType) }) + 8;
    x += this.button(x, ty, 'Провести', { id: 'l-post', fn: () => this.postSelected(tab) }) + 8;
    x += this.button(x, ty, 'Изменить', { id: 'l-open', fn: () => this.openRow(tab, tab.sel) }) + 8;
    if (tab.docType === 'sale') x += this.button(x, ty, 'Печать', { drop: true, id: 'l-print', fn: () => { const d = this.rowsOf(tab)[tab.sel]; if (d) this.openPrint(d); } }) + 8;
    this.button(x, ty, 'Создать на основании', { drop: true, disabled: true });
    const sid = `search:${tab.key}`;
    this.field(C.x + C.w - 330, ty, 250, tab.search || '', { id: sid, placeholder: 'Поиск (Ctrl+F)', fn: () => this.startEditSearch(tab) });
    this.button(C.x + C.w - 72, ty, 'Ещё', { drop: true, id: 'l-more', fn: () => this.message('Дополнительные команды недоступны в демо-режиме.') });
    if (tab.search) this.text(`Отбор: «${tab.search}»`, C.x + C.w - 330, ty + 42, { size: 12, color: '#8a6d00' });

    const cols = tab.docType === 'bank'
      ? [['', 34, () => ''], ['Дата', 170, (d) => fmtDT(d.date)], ['Номер', 130, (d) => d.num], ['Плательщик', 290, (d) => partner(d.partner)?.name || ''], ['Поступление', 150, (d) => fmt(docTotal(d)), 'right'], ['Вид операции', 210, () => 'Оплата от покупателя'], ['Назначение платежа', 0, (d) => d.purpose || '']]
      : [['', 34, () => ''], ['Дата', 170, (d) => fmtDT(d.date)], ['Номер', 130, (d) => d.num], ['Контрагент', 300, (d) => partner(d.partner)?.name || ''], ['Сумма', 150, (d) => fmt(docTotal(d)), 'right'], ['Валюта', 80, () => 'руб.'], ['Склад', 170, () => 'Основной склад'], ['Комментарий', 0, (d) => d.comment || '']];
    this.table(tab, C.x + 20, C.y + 96, C.w - 40, C.h - 110, cols, this.rowsOf(tab), (d, x, y) => this.docIcon(x + 10, y + 4, d.posted, false));
  }
  startEditSearch(tab) {
    this.edit = { id: `search:${tab.key}`, value: tab.search || '', max: 40, live: (v) => { tab.search = v; tab.sel = 0; tab.scroll = 0; }, onCommit: (v) => { tab.search = v; } };
  }
  table(tab, x, y, w, h, cols, rows, iconFn) {
    const g = this.g;
    const rh = 27, hh = 30;
    this.box(x, y, w, h, '#ffffff', '#c9c7bf');
    const grd = g.createLinearGradient(0, y, 0, y + hh);
    grd.addColorStop(0, '#f7f6f2'); grd.addColorStop(1, '#ebe9e2');
    g.fillStyle = grd; g.fillRect(x + 1, y + 1, w - 2, hh - 1);
    g.fillStyle = '#d6d4cb'; g.fillRect(x + 1, y + hh, w - 2, 1);
    const flex = w - cols.reduce((s, c) => s + c[1], 0) - 14;
    const widths = cols.map((c) => c[1] || Math.max(80, flex));
    let cx = x;
    cols.forEach((c, i) => {
      if (c[0]) this.text(c[0], c[3] === 'right' ? cx + widths[i] - 10 : cx + 10, y + hh / 2 + 1, { size: 13, color: '#555', align: c[3] === 'right' ? 'right' : 'left', maxW: widths[i] - 14 });
      cx += widths[i];
      g.fillStyle = '#dcdad2'; g.fillRect(cx, y + 6, 1, hh - 12);
    });
    const vis = Math.floor((h - hh - 2) / rh);
    tab.visRows = vis;
    tab.scroll = Math.max(0, Math.min(tab.scroll, rows.length - vis));
    g.save(); g.beginPath(); g.rect(x + 1, y + hh + 1, w - 2, h - hh - 2); g.clip();
    for (let r = 0; r < vis + 1; r++) {
      const i = tab.scroll + r;
      const ry = y + hh + 1 + r * rh;
      if (i >= rows.length) break;
      const row = rows[i];
      const id = `row:${tab.key}:${i}`;
      const sel = i === tab.sel;
      if (sel) this.box(x + 1, ry, w - 2, rh, '#fbe7a1');
      else if (this.hover === id) this.box(x + 1, ry, w - 2, rh, '#f6f3e7');
      else if (i % 2) this.box(x + 1, ry, w - 2, rh, '#fcfcfa');
      let cx2 = x;
      cols.forEach((c, k) => {
        const v = c[2](row);
        if (v !== '') this.text(v, c[3] === 'right' ? cx2 + widths[k] - 10 : cx2 + 10, ry + rh / 2 + 1, { size: 14, color: row.posted === false ? '#777' : '#222', align: c[3] === 'right' ? 'right' : 'left', maxW: widths[k] - 16 });
        cx2 += widths[k];
      });
      if (iconFn) iconFn(row, x, ry);
      this.hit(x + 1, ry, w - 16, rh, id, () => { tab.sel = i; }, { dbl: () => { tab.sel = i; this.openRow(tab, i); } });
    }
    g.restore();
    if (!rows.length) this.text(tab.search ? 'Ничего не найдено' : 'Список пуст', x + w / 2, y + hh + 40, { align: 'center', color: '#999' });
    // scrollbar
    if (rows.length > vis) {
      const sx = x + w - 12, sy = y + hh + 2, sh = h - hh - 4;
      this.box(sx, sy, 10, sh, '#f2f1ec');
      const th = Math.max(30, (sh * vis) / rows.length);
      const ty = sy + ((sh - th) * tab.scroll) / Math.max(1, rows.length - vis);
      this.rr(sx + 1, ty, 8, th, 4); g.fillStyle = '#c3c1b8'; g.fill();
    }
    this.wheels.push({ x, y, w, h, fn: (d) => { tab.scroll = Math.max(0, Math.min(rows.length - vis, tab.scroll + d)); } });
  }

  // ---------- document form ----------
  drawDoc(tab, C) {
    const g = this.g;
    const d = tab.doc;
    const T = DOC_TYPES[d.type];
    this.formTitle(C, this.docTitle(tab));
    let x = C.x + 20;
    const ty = C.y + 50;
    x += this.button(x, ty, 'Провести и закрыть', { primary: true, id: 'd-postclose', fn: () => this.postDoc(tab, true) }) + 8;
    x += this.button(x, ty, 'Записать', { id: 'd-save', fn: () => this.saveDoc(tab, false) }) + 8;
    x += this.button(x, ty, 'Провести', { id: 'd-post', fn: () => this.postDoc(tab, false) }) + 8;
    if (d.type === 'sale') x += this.button(x, ty, 'Печать', { drop: true, id: 'd-print', fn: () => { if (tab.orig && !tab.modified) this.openPrint(tab.orig); else this.message('Перед печатью документ необходимо записать.'); } }) + 8;
    this.button(x, ty, 'Создать на основании', { drop: true, disabled: true });
    const status = tab.orig ? (tab.orig.posted ? 'Проведен' : 'Не проведен') : 'Новый';
    this.text(status, C.x + C.w - 24, ty + 14, { align: 'right', size: 13, color: tab.orig?.posted ? '#2e9e3e' : '#999' });

    const fx = C.x + 20, fy = C.y + 98;
    const change = () => { tab.modified = true; };
    // row 1
    this.label(fx, fy, 'Номер:');
    this.field(fx + 110, fy, 150, d.num || '<Авто>', { readonly: true, color: d.num ? '#222' : '#999' });
    this.label(fx + 280, fy, 'от:');
    this.field(fx + 310, fy, 190, fmtDT(d.date), { readonly: true });
    // row 2
    this.label(fx, fy + 40, `${T.partnerLabel}:`);
    const pid = `f-partner:${tab.key || 'new'}`;
    this.field(fx + 110, fy + 40, 390, partner(d.partner)?.name || '', {
      id: pid, drop: true, placeholder: 'Поле не заполнено — выберите…', invalid: !d.partner,
      fn: () => this.openPopup(fx + 110, fy + 68, 390, PARTNERS.filter((p) => d.type === 'purchase' ? p.role === 'Поставщик' : p.role === 'Покупатель').map((p) => p.name), (i, name) => { d.partner = PARTNERS.find((p) => p.name === name).id; change(); }),
    });

    if (d.type === 'bank') {
      this.label(fx, fy + 80, 'Вид операции:');
      this.field(fx + 110, fy + 80, 390, 'Оплата от покупателя', { readonly: true });
      this.label(fx + 540, fy + 40, 'Сумма:');
      const sid = `f-sum:${tab.key || 'new'}`;
      this.field(fx + 610, fy + 40, 200, d.sum ? fmt(d.sum) : '', { id: sid, align: 'right', placeholder: '0,00', fn: () => { this.edit = { id: sid, value: d.sum ? String(d.sum).replace('.', ',') : '', numeric: true, max: 12, onCommit: (v) => { const n = parseFloat(v.replace(',', '.')); if (!isNaN(n)) { d.sum = Math.round(n * 100) / 100; change(); } } }; } });
      this.label(fx + 540, fy + 80, 'Счет учета:');
      this.field(fx + 640, fy + 80, 170, '62.01', { readonly: true });
      this.label(fx, fy + 130, 'Назначение платежа:');
      const nid = `f-purpose:${tab.key || 'new'}`;
      this.field(fx, fy + 158, 810, d.purpose || '', { id: nid, placeholder: 'Введите назначение платежа', fn: () => { this.edit = { id: nid, value: d.purpose || '', max: 110, onCommit: (v) => { d.purpose = v; change(); } }; } });
      if (d.sum > 0) this.text(`В т.ч. НДС (20%): ${fmt(vatOf(d.sum))} руб.`, fx, fy + 210, { size: 14, color: '#555' });
    } else {
      this.label(fx + 540, fy + 40, 'Договор:');
      this.field(fx + 610, fy + 40, 280, d.partner ? 'Основной договор' : '', { readonly: true });
      this.label(fx, fy + 80, 'Склад:');
      this.field(fx + 110, fy + 80, 390, 'Основной склад', { readonly: true });
      this.label(fx + 540, fy + 80, 'Цены:');
      this.field(fx + 610, fy + 80, 280, 'НДС в сумме', { readonly: true });

      // tabular section
      const tx = C.x + 20, tyy = fy + 130, tw = C.w - 40;
      g.fillStyle = '#e9b800'; g.fillRect(tx, tyy + 30, 150, 2);
      this.text(`Товары (${d.rows.length})`, tx + 8, tyy + 15, { size: 15, bold: true, color: '#333' });
      g.fillStyle = '#dcdad2'; g.fillRect(tx, tyy + 32, tw, 1);
      let bx = tx;
      const by = tyy + 42;
      bx += this.button(bx, by, 'Добавить', { id: 'r-add', fn: () => this.addRow(tab) }) + 6;
      bx += this.button(bx, by, 'Удалить', { id: 'r-del', fn: () => { if (tab.rowSel >= 0) { d.rows.splice(tab.rowSel, 1); tab.rowSel = Math.min(tab.rowSel, d.rows.length - 1); change(); } } }) + 6;
      bx += this.button(bx, by, 'Подбор', { id: 'r-pick', fn: () => this.message('Подбор недоступен: обработка «Подбор номенклатуры» заблокирована другим пользователем (Петрова Л. П.).') }) + 6;
      bx += this.button(bx, by, 'Изменить', { disabled: true, drop: true });

      const cols = [['N', 44], ['Номенклатура', 0], ['Количество', 120, 'right'], ['Ед.', 60], ['Цена', 130, 'right'], ['Сумма', 140, 'right'], ['% НДС', 80], ['НДС', 120, 'right']];
      const ttop = by + 40, th = C.y + C.h - 60 - ttop;
      this.box(tx, ttop, tw, th, '#ffffff', '#c9c7bf');
      const hh = 30, rh = 30;
      const grd = g.createLinearGradient(0, ttop, 0, ttop + hh);
      grd.addColorStop(0, '#f7f6f2'); grd.addColorStop(1, '#ebe9e2');
      g.fillStyle = grd; g.fillRect(tx + 1, ttop + 1, tw - 2, hh - 1);
      const flex = tw - cols.reduce((s, c) => s + c[1], 0);
      const widths = cols.map((c) => c[1] || flex);
      let cx = tx;
      cols.forEach((c, i) => { this.text(c[0], c[2] === 'right' ? cx + widths[i] - 10 : cx + 10, ttop + hh / 2 + 1, { size: 13, color: '#555', align: c[2] === 'right' ? 'right' : 'left' }); cx += widths[i]; g.fillStyle = '#dcdad2'; g.fillRect(cx, ttop + 6, 1, hh - 12); });
      d.rows.forEach((r, i) => {
        const ry = ttop + hh + 1 + i * rh;
        if (ry + rh > ttop + th) return;
        const p = product(r.product);
        const sum = (r.qty || 0) * (r.price || 0);
        const sel = i === tab.rowSel;
        if (sel) this.box(tx + 1, ry, tw - 2, rh, '#fdf0c2');
        const cellX = []; let ccx = tx; widths.forEach((w) => { cellX.push(ccx); ccx += w; });
        this.hit(tx + 1, ry, tw - 2, rh, `drow:${i}`, () => { tab.rowSel = i; });
        const vals = [String(i + 1), p ? p.name : '', fmtQ(r.qty || 0), p ? p.unit : '', fmt(r.price || 0), fmt(sum), '20%', fmt(vatOf(sum))];
        vals.forEach((v, k) => {
          const right = cols[k][2] === 'right';
          const cid = `dcell:${i}:${k}`;
          const editable = k === 1 || k === 2 || k === 4;
          const editing = this.edit && this.edit.id === cid;
          if (editable && (this.hover === cid || editing)) this.box(cellX[k] + 2, ry + 2, widths[k] - 4, rh - 4, '#ffffff', editing ? '#e0ac00' : '#b8b5aa');
          if (editing) {
            const tw2 = this.text(this.edit.value, cellX[k] + 10, ry + rh / 2 + 1, { size: 14 });
            if (Math.floor(performance.now() / 530) % 2 === 0) { g.fillStyle = '#111'; g.fillRect(cellX[k] + 11 + tw2, ry + 7, 1.5, rh - 14); }
          } else if (k === 1 && !p) this.text('<выберите номенклатуру>', cellX[k] + 10, ry + rh / 2 + 1, { size: 14, color: '#c0392b' });
          else this.text(v, right ? cellX[k] + widths[k] - 10 : cellX[k] + 10, ry + rh / 2 + 1, { size: 14, align: right ? 'right' : 'left', maxW: widths[k] - 16 });
          if (k === 1) this.hit(cellX[k], ry, widths[k], rh, cid, () => { tab.rowSel = i; this.pickProduct(tab, i, cellX[k], ry + rh, widths[k]); });
          if (k === 2 || k === 4) {
            const key = k === 2 ? 'qty' : 'price';
            this.hit(cellX[k], ry, widths[k], rh, cid, () => {
              tab.rowSel = i;
              this.edit = { id: cid, value: String(r[key] || '').replace('.', ','), numeric: true, max: 10, onCommit: (v) => { const n = parseFloat(v.replace(',', '.')); if (!isNaN(n) && n >= 0) { r[key] = Math.round(n * 1000) / 1000; change(); } } };
            }, { cursor: 'text' });
          }
        });
        g.fillStyle = '#efede6'; g.fillRect(tx + 1, ry + rh - 1, tw - 2, 1);
      });
      if (!d.rows.length) this.text('Нажмите «Добавить», чтобы добавить товар', tx + tw / 2, ttop + hh + 40, { align: 'center', color: '#999' });
      if (tab.pendingPick != null) {
        const i = tab.pendingPick; tab.pendingPick = null;
        const ry = ttop + hh + 1 + i * rh;
        this.pickProduct(tab, i, tx + 44, ry + rh, flex);
      }
      // totals
      const tot = docTotal(d);
      const fy2 = C.y + C.h - 48;
      this.text(`Всего:  ${fmt(tot)}`, C.x + C.w - 24, fy2 + 12, { align: 'right', bold: true, size: 17 });
      this.text(`НДС (в т. ч.):  ${fmt(vatOf(tot))}`, C.x + C.w - 24, fy2 + 36, { align: 'right', size: 14, color: '#555' });
      this.label(tx, fy2 + 4, 'Комментарий:');
      const cid = `f-comment:${tab.key || 'new'}`;
      this.field(tx + 110, fy2 + 4, 600, d.comment || '', { id: cid, fn: () => { this.edit = { id: cid, value: d.comment || '', max: 70, onCommit: (v) => { d.comment = v; change(); } }; } });
    }
  }
  pickProduct(tab, i, x, y, w) {
    const r = tab.doc.rows[i];
    this.openPopup(x, y, Math.max(w, 420), PRODUCTS.map((p) => `${p.name}   —   ${fmt(p.price)} ₽`), (k) => {
      const p = PRODUCTS[k];
      r.product = p.id;
      r.price = tab.doc.type === 'purchase' ? Math.round(p.price * 0.7) : p.price;
      if (!r.qty) r.qty = 1;
      tab.modified = true;
    });
  }
  openPopup(x, y, w, items, onPick) {
    const rh = 28;
    const h = Math.min(items.length, 12) * rh + 4;
    if (y + h > this.H - 50) y = Math.max(80, y - h - 30);
    if (x + w > this.W - 4) x = this.W - 4 - w;
    this.popup = { x, y, w, h, items, onPick: (i) => onPick(i, items[i]), sel: null, scroll: 0 };
  }
  drawPopup() {
    const p = this.popup, g = this.g;
    this.hit(0, 0, this.W, this.H, 'popup-block', () => { this.popup = null; });
    g.save(); g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = 12; g.shadowOffsetY = 3;
    this.box(p.x, p.y, p.w, p.h, '#ffffff'); g.restore();
    this.box(p.x, p.y, p.w, p.h, null, '#a7a497');
    p.items.slice(0, 12).forEach((it, i) => {
      const y = p.y + 2 + i * 28, id = `pop:${i}`;
      if (this.hover === id || p.sel === i) this.box(p.x + 2, y, p.w - 4, 28, '#fbe7a1');
      this.text(it, p.x + 12, y + 15, { size: 14, maxW: p.w - 24 });
      this.hit(p.x, y, p.w, 28, id, () => { this.popup = null; p.onPick(i); });
    });
  }

  // ---------- catalogs ----------
  drawCatalog(tab, C) {
    const cat = CATALOGS[tab.cat];
    this.formTitle(C, cat.title);
    let x = C.x + 20;
    const ty = C.y + 50;
    x += this.button(x, ty, 'Создать', { primary: true, id: 'c-new', fn: () => this.message('Недостаточно прав для добавления объекта.\nОбратитесь к главному бухгалтеру (Петрова Л. П.).', 'Нарушение прав доступа') }) + 8;
    x += this.button(x, ty, 'Создать группу', { id: 'c-grp', fn: () => this.message('Недостаточно прав для добавления объекта.', 'Нарушение прав доступа') }) + 8;
    this.button(x, ty, 'Открыть', { id: 'c-open', fn: () => this.openRow(tab, tab.sel) });
    this.field(C.x + C.w - 330, ty, 250, tab.search || '', { id: `search:${tab.key}`, placeholder: 'Поиск (Ctrl+F)', fn: () => this.startEditSearch(tab) });
    this.button(C.x + C.w - 72, ty, 'Ещё', { drop: true, id: 'c-more', fn: () => this.message('Дополнительные команды недоступны в демо-режиме.') });
    const cols = [['', 34, () => ''], ...cat.cols];
    this.table(tab, C.x + 20, C.y + 96, C.w - 40, C.h - 110, cols, this.rowsOf(tab), (r, x2, y2) => {
      const g = this.g;
      g.fillStyle = '#e6b400'; g.fillRect(x2 + 12, y2 + 9, 10, 10);
      g.fillStyle = '#fff'; g.fillRect(x2 + 14, y2 + 11, 6, 2); g.fillRect(x2 + 14, y2 + 15, 6, 2);
    });
  }

  // ---------- reports ----------
  drawReport(tab, C) {
    const g = this.g;
    this.formTitle(C, `${tab.title}`);
    const ty = C.y + 50;
    const today = new Date();
    const from = new Date(today); from.setDate(today.getDate() - 26);
    let x = C.x + 20;
    x += this.button(x, ty, 'Сформировать', { primary: true, id: 'r-run', fn: () => { tab.state = 'busy'; tab.t0 = performance.now(); } }) + 12;
    this.text('Период:', x, ty + 14, { color: '#555' });
    this.field(x + 64, ty, 120, fmtDate(from), { readonly: true });
    this.text('–', x + 196, ty + 14, { color: '#555' });
    this.field(x + 210, ty, 120, fmtDate(today), { readonly: true });
    this.button(x + 345, ty, 'Настройки…', { id: 'r-set', fn: () => this.message('Настройки отчета: вариант «Основной». Изменение вариантов доступно администратору.') });
    const ry = C.y + 96, rh = C.h - 110;
    this.box(C.x + 20, ry, C.w - 40, rh, '#ffffff', '#c9c7bf');
    if (tab.state === 'busy' && performance.now() - tab.t0 > 1100) { tab.state = 'done'; this.onEvent('report', tab.rep); }
    if (tab.state === 'idle') {
      this.text('Отчет не сформирован. Нажмите «Сформировать» для получения отчета.', C.x + C.w / 2, ry + rh / 2, { align: 'center', color: '#8c8c8c', size: 15 });
      return;
    }
    if (tab.state === 'busy') {
      const cx = C.x + C.w / 2, cy = ry + rh / 2 - 20;
      const a = performance.now() / 150;
      for (let i = 0; i < 12; i++) { g.fillStyle = `rgba(90,90,90,${((i + Math.floor(a)) % 12) / 12})`; g.beginPath(); g.arc(cx + Math.cos(i * Math.PI / 6) * 16, cy + Math.sin(i * Math.PI / 6) * 16, 3, 0, 7); g.fill(); }
      this.text('Отчет формируется…', cx, cy + 44, { align: 'center', color: '#666', size: 15 });
      return;
    }
    g.save(); g.beginPath(); g.rect(C.x + 21, ry + 1, C.w - 42, rh - 2); g.clip();
    const X = C.x + 40;
    let y = ry + 30;
    this.text(tab.title, X, y, { size: 19, bold: true, color: '#222' });
    this.text(`${ORG.name}  ·  Период: ${fmtDate(from)} – ${fmtDate(today)}`, X, y + 26, { size: 13, color: '#666' });
    y += 56;
    const hdr = (cols) => {
      let cx = X;
      this.box(X, y, cols.reduce((s, c) => s + c[1], 0), 30, '#f1ecd6', '#d6cfae');
      cols.forEach(([t, w, al]) => { this.text(t, al === 'right' ? cx + w - 8 : cx + 8, y + 16, { size: 13, bold: true, color: '#4a4535', align: al || 'left', maxW: w - 12 }); cx += w; });
      y += 30;
    };
    const row = (cols, vals, o = {}) => {
      let cx = X;
      const wsum = cols.reduce((s, c) => s + c[1], 0);
      if (o.total) this.box(X, y, wsum, 28, '#f7f4e6');
      cols.forEach(([, w, al], i) => { this.text(vals[i], al === 'right' ? cx + w - 8 : cx + 8, y + 15, { size: 14, bold: o.total, color: o.colors?.[i] || '#222', align: al || 'left', maxW: w - 12 }); cx += w; });
      g.fillStyle = '#e9e6da'; g.fillRect(X, y + 27, wsum, 1);
      y += 28;
    };
    if (tab.rep === 'sales') {
      const by = {};
      this.docs.filter((d) => d.type === 'sale' && d.posted).forEach((d) => {
        const e = (by[d.partner] ||= { n: 0, qty: 0, sum: 0 });
        e.n++; e.qty += d.rows.reduce((s, r) => s + r.qty, 0); e.sum += docTotal(d);
      });
      const list = Object.entries(by).sort((a, b) => b[1].sum - a[1].sum);
      const cols = [['Контрагент', 300], ['Документов', 120, 'right'], ['Количество', 130, 'right'], ['Выручка', 170, 'right'], ['НДС', 150, 'right'], ['Доля', 360]];
      hdr(cols);
      const total = list.reduce((s, e) => s + e[1].sum, 0) || 1;
      list.forEach(([pid, e]) => {
        const yy = y;
        row(cols, [partner(pid).name, String(e.n), fmtQ(e.qty), fmt(e.sum), fmt(vatOf(e.sum)), '']);
        const bw = (e.sum / total) * 260;
        g.fillStyle = '#6b8fc9'; g.fillRect(X + 870 + 8, yy + 8, bw, 12);
        this.text(`${((e.sum / total) * 100).toFixed(1).replace('.', ',')}%`, X + 870 + 16 + bw, yy + 15, { size: 12, color: '#555' });
      });
      row(cols, ['Итого', String(list.reduce((s, e) => s + e[1].n, 0)), fmtQ(list.reduce((s, e) => s + e[1].qty, 0)), fmt(total), fmt(vatOf(total)), ''], { total: true });
    } else if (tab.rep === 'stock') {
      const cols = [['Номенклатура', 380], ['Ед.', 70], ['Нач. остаток', 150, 'right'], ['Приход', 130, 'right'], ['Расход', 130, 'right'], ['Кон. остаток', 150, 'right']];
      hdr(cols);
      PRODUCTS.filter((p) => !p.service).forEach((p) => {
        let inc = 0, out = 0;
        this.docs.filter((d) => d.posted).forEach((d) => (d.rows || []).forEach((r) => { if (r.product === p.id) { if (d.type === 'purchase') inc += r.qty; if (d.type === 'sale') out += r.qty; } }));
        const end = p.stock + inc - out;
        row(cols, [p.name, p.unit, fmtQ(p.stock), inc ? fmtQ(inc) : '', out ? fmtQ(out) : '', fmtQ(end)], { colors: [null, null, null, null, null, end < 0 ? '#c0392b' : end < 5 ? '#c77d00' : '#222'] });
      });
    } else {
      const T = this.totals();
      const net = (v) => v - vatOf(v);
      const cols = [['Счет', 90], ['Наименование', 260], ['Сальдо нач. Дт', 150, 'right'], ['Сальдо нач. Кт', 150, 'right'], ['Оборот Дт', 150, 'right'], ['Оборот Кт', 150, 'right'], ['Сальдо кон. Дт', 150, 'right'], ['Сальдо кон. Кт', 150, 'right']];
      hdr(cols);
      const accts = [
        ['41.01', 'Товары на складах', 1820000, 0, net(T.purch), net(T.sales) * 0.62],
        ['51', 'Расчетные счета', 1245300, 0, T.inc, T.purch * 0.6],
        ['60.01', 'Расчеты с поставщиками', 0, 210000, T.purch * 0.6, T.purch],
        ['62.01', 'Расчеты с покупателями', 380000, 0, T.sales, T.inc],
        ['68.02', 'Налог на добавленную стоимость', 0, 96400, vatOf(T.purch), vatOf(T.sales)],
        ['90.01', 'Выручка', 0, 0, 0, net(T.sales)],
      ];
      const sums = [0, 0, 0, 0, 0, 0];
      accts.forEach(([a, n, sd, sk, od, ok]) => {
        let e = sd - sk + od - ok;
        const ed = e > 0 ? e : 0, ek = e < 0 ? -e : 0;
        const vals = [sd, sk, od, ok, ed, ek];
        vals.forEach((v, i) => (sums[i] += v));
        row(cols, [a, n, ...vals.map((v) => (v ? fmt(v) : ''))]);
      });
      row(cols, ['Итого', '', ...sums.map(fmt)], { total: true });
    }
    g.restore();
  }

  // ---------- print form ----------
  openPrint(d) {
    const from = this.tabs[this.active];
    const t = this.openTab({ kind: 'print', doc: d, title: `Накладная ${d.num}` }, `print:${d.id}`);
    t.returnTo = from;
  }
  drawPrint(tab, C) {
    const g = this.g, d = tab.doc;
    g.fillStyle = '#8f8f8a'; g.fillRect(C.x, C.y, C.w, C.h);
    let x = C.x + 20;
    const ty = C.y + 14;
    x += this.button(x, ty, 'Печать', { primary: true, id: 'p-print', fn: () => { this.toast('Печать', `Накладная ${d.num} отправлена на принтер «МФУ-коридор»`); this.onEvent('print', d); } }) + 8;
    x += this.button(x, ty, 'Копий: 1', { disabled: true }) + 8;
    this.button(x, ty, 'Закрыть', { id: 'p-close', fn: () => this.closeTab(this.active) });
    const px = C.x + (C.w - 900) / 2, py = C.y + 56, pw = 900, ph = C.h - 56;
    g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 16; this.box(px, py, pw, ph + 20, '#ffffff'); g.restore();
    const X = px + 50;
    let y = py + 50;
    const dd = d.date;
    this.text(`Расходная накладная № ${d.num} от ${dd.getDate()} ${MONTHS_GEN[dd.getMonth()]} ${dd.getFullYear()} г.`, X, y, { size: 20, bold: true, color: '#000' });
    g.fillStyle = '#000'; g.fillRect(X, y + 18, pw - 100, 2);
    y += 48;
    const p = partner(d.partner);
    this.text('Поставщик:', X, y, { size: 13, color: '#000' });
    this.text(`${ORG.name}, ИНН ${ORG.inn}, КПП ${ORG.kpp}, ${ORG.addr}`, X + 110, y, { size: 13, bold: true, color: '#000', maxW: pw - 210 });
    y += 26;
    this.text('Покупатель:', X, y, { size: 13, color: '#000' });
    this.text(`${p.name}, ИНН ${p.inn}, ${p.city}`, X + 110, y, { size: 13, bold: true, color: '#000', maxW: pw - 210 });
    y += 36;
    const cols = [['№', 36], ['Товар', 380], ['Кол-во', 80, 'right'], ['Ед.', 50], ['Цена', 110, 'right'], ['Сумма', 144, 'right']];
    const drawRow = (vals, bold, h = 26) => {
      let cx = X;
      cols.forEach(([, w, al], i) => {
        g.strokeStyle = '#000'; g.lineWidth = 1; g.strokeRect(cx + 0.5, y + 0.5, w, h);
        this.text(vals[i], al === 'right' ? cx + w - 6 : cx + 6, y + h / 2 + 1, { size: 13, bold, color: '#000', align: al || 'left', maxW: w - 10 });
        cx += w;
      });
      y += h;
    };
    drawRow(cols.map((c) => c[0]), true);
    d.rows.forEach((r, i) => { const pr = product(r.product); drawRow([String(i + 1), pr.name, fmtQ(r.qty), pr.unit, fmt(r.price), fmt(r.qty * r.price)], false); });
    const tot = docTotal(d);
    y += 12;
    this.text(`Итого:  ${fmt(tot)}`, X + 800, y, { align: 'right', size: 14, bold: true, color: '#000' });
    y += 22;
    this.text(`В том числе НДС:  ${fmt(vatOf(tot))}`, X + 800, y, { align: 'right', size: 14, bold: true, color: '#000' });
    y += 34;
    this.text(`Всего наименований ${d.rows.length}, на сумму ${fmt(tot)} руб.`, X, y, { size: 13, color: '#000' });
    y += 24;
    this.text(sumInWords(tot), X, y, { size: 14, bold: true, color: '#000', maxW: pw - 100 });
    g.fillStyle = '#000'; g.fillRect(X, y + 22, pw - 100, 2);
    y += 64;
    this.text('Отпустил  ______________  / Петрова Л. П. /', X, y, { size: 13, color: '#000' });
    this.text('Получил  ______________  /                           /', X + 440, y, { size: 13, color: '#000' });
    // stamp
    const sx = X + 250, sy = y + 10;
    g.save(); g.globalAlpha = 0.55; g.strokeStyle = '#2446b8'; g.lineWidth = 2.5;
    g.beginPath(); g.arc(sx, sy, 52, 0, 7); g.stroke(); g.beginPath(); g.arc(sx, sy, 36, 0, 7); g.stroke();
    g.fillStyle = '#2446b8'; g.font = f(10, true); g.textAlign = 'center'; g.textBaseline = 'middle';
    const ring = '* ООО «ВЕКТОР» * МОСКВА * ИНН 7714058312 ';
    for (let i = 0; i < ring.length; i++) { const a = (i / ring.length) * Math.PI * 2 - Math.PI / 2; g.save(); g.translate(sx + Math.cos(a) * 44, sy + Math.sin(a) * 44); g.rotate(a + Math.PI / 2); g.fillText(ring[i], 0, 0); g.restore(); }
    g.font = f(12, true); g.fillText('Для', sx, sy - 7); g.fillText('документов', sx, sy + 8);
    g.restore();
  }

  // ---------- section menu ----------
  drawMenu(C) {
    const g = this.g;
    const s = SECTIONS.find((x) => x.key === this.menu);
    this.hit(C.x, C.y - 36, C.w, C.h + 36, 'menu-block', () => { this.menu = null; });
    g.save(); g.shadowColor = 'rgba(0,0,0,.2)'; g.shadowBlur = 20; g.shadowOffsetX = 4;
    this.box(C.x, 40, Math.min(C.w, 980), C.h + 36, '#ffffff'); g.restore();
    this.hit(C.x, 40, Math.min(C.w, 980), C.h + 36, 'menu-panel', null);
    this.text(s.name, C.x + 30, 76, { size: 24, color: '#333' });
    this.text('×', C.x + 950, 70, { size: 24, color: this.hover === 'menu-x' ? '#c0392b' : '#888', align: 'center' });
    this.hit(C.x + 935, 55, 30, 30, 'menu-x', () => { this.menu = null; });
    s.groups.forEach((gr, gi) => {
      const x = C.x + 30 + gi * 310;
      let y = 124;
      this.text(gr.title, x, y, { size: 15, bold: true, color: '#8a8a8a' });
      y += 34;
      gr.items.forEach(([label, cmd], ii) => {
        this.link(x, y, label, `m:${gi}:${ii}`, () => this.runCommand(cmd), { size: 15 });
        y += 30;
      });
    });
    this.text('Сервис', C.x + 30, C.y + C.h - 30, { size: 13, color: '#aaa' });
  }

  // ---------- modal ----------
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
    this.box(x, y, w, h, '#ffffff'); g.restore();
    this.box(x, y, w, h, null, '#a7a497');
    this.box(x + 1, y + 1, w - 2, 36, '#f7f6f2');
    this.text(m.title, x + 16, y + 19, { size: 15, bold: true, color: '#333' });
    const ic = m.icon || 'info';
    const icx = x + 42, icy = y + 78;
    g.fillStyle = ic === 'err' ? '#d9453a' : ic === 'q' ? '#3b78d0' : '#e6b400';
    g.beginPath(); g.arc(icx, icy, 18, 0, 7); g.fill();
    this.text(ic === 'err' ? '!' : ic === 'q' ? '?' : 'i', icx, icy + 1, { align: 'center', size: 22, bold: true, color: '#fff' });
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
      const a = Math.min(1, age / 200, (6000 - age) / 600);
      const w = 440, h = 66;
      const x = this.W - w - 18, y = this.H - 44 - 16 - (h + 10) * (this.toasts.length - i);
      g.save(); g.globalAlpha = Math.max(0, a);
      g.shadowColor = 'rgba(0,0,0,.2)'; g.shadowBlur = 10;
      this.box(x, y, w, h, '#fffbe8'); g.restore();
      g.save(); g.globalAlpha = Math.max(0, a);
      this.box(x, y, w, h, null, '#dfcf86');
      this.text(t.title, x + 14, y + 20, { size: 14, bold: true, color: '#333' });
      this.text(t.text, x + 14, y + 44, { size: 13, color: '#24569b', maxW: w - 28 });
      g.restore();
    });
  }

  drawTaskbar() {
    const g = this.g, W = this.W, H = this.H;
    const y = H - 44;
    g.fillStyle = '#1d2530'; g.fillRect(0, y, W, 44);
    // start
    g.fillStyle = '#6fb7ff';
    [[16, 12], [27, 12], [16, 23], [27, 23]].forEach(([dx, dy]) => g.fillRect(dx, y + dy, 9, 9));
    this.hit(0, y, 50, 44, 'start', () => this.message('Меню «Пуск» заблокировано групповой политикой домена VECTOR.', 'Windows'));
    this.box(58, y + 8, 220, 28, '#2c3643');
    this.text('Поиск', 72, y + 22, { size: 13, color: '#9aa6b5' });
    // apps
    const apps = [['1Ц', '#ffd200', '#e1231b', true], ['', '#e8b64a', null, false], ['', '#3f8ce0', null, false], ['', '#5aa05a', null, false]];
    apps.forEach(([t, c, tc, act], i) => {
      const x = 296 + i * 50;
      if (act) { g.fillStyle = '#34404f'; g.fillRect(x, y, 50, 44); g.fillStyle = '#6fb7ff'; g.fillRect(x + 10, y + 41, 30, 3); }
      if (i === 0) { g.fillStyle = tc; g.beginPath(); g.arc(x + 25, y + 21, 13, 0, 7); g.fill(); this.text(t, x + 25, y + 22, { align: 'center', bold: true, size: 12, color: c }); }
      else if (i === 1) { g.fillStyle = c; g.fillRect(x + 13, y + 14, 24, 17); g.fillRect(x + 13, y + 11, 10, 5); }
      else if (i === 2) { g.strokeStyle = c; g.lineWidth = 3; g.beginPath(); g.arc(x + 25, y + 22, 10, 0, 7); g.stroke(); g.beginPath(); g.moveTo(x + 15, y + 22); g.lineTo(x + 35, y + 22); g.stroke(); }
      else { g.fillStyle = c; g.fillRect(x + 13, y + 13, 24, 18); g.strokeStyle = '#1d2530'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 13, y + 14); g.lineTo(x + 25, y + 24); g.lineTo(x + 37, y + 14); g.stroke(); }
      if (i > 0) this.hit(x, y, 50, 44, `app${i}`, () => this.message(['Проводник: сетевой диск Z:\\ недоступен.', 'Браузер: доступ к сайту ограничен политикой организации.', 'Почта: 214 непрочитанных. Лучше не открывать.'][i - 1], 'Windows'));
    });
    const now = new Date();
    this.text(`${pad(now.getHours())}:${pad(now.getMinutes())}`, W - 50, y + 14, { align: 'center', size: 13, color: '#e8edf3' });
    this.text(fmtDate(now), W - 50, y + 31, { align: 'center', size: 12, color: '#c3ccd8' });
    this.text('РУС', W - 118, y + 22, { align: 'center', size: 12, color: '#e8edf3' });
    // tray icons
    g.strokeStyle = '#c3ccd8'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(W - 176, y + 26); g.lineTo(W - 172, y + 26); g.lineTo(W - 166, y + 20); g.lineTo(W - 166, y + 32); g.lineTo(W - 172, y + 26); g.stroke();
    g.beginPath(); g.arc(W - 160, y + 26, 5, -0.8, 0.8); g.stroke();
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

export { fmt, fmtDate, PARTNERS as partners };
