// Хлебзавод: products, clients and order generation for phone calls.

export const ORG = { name: 'ОАО «Хлебзавод №2»', dept: 'Отдел заявок', inn: '7719020518', addr: 'г. Москва, Хлебный проезд, д. 4' };

// nom — how a caller names it in the nominative ("чёрный 14"), gen — genitive plural ("десять белого")
export const PRODUCTS = [
  { code: '101', name: 'Хлеб белый формовой 0,6 кг', nom: 'белый', gen: 'белого', price: 46, unit: 'шт', kind: 'bread' },
  { code: '102', name: 'Хлеб ржаной «Чёрный» 0,7 кг', nom: 'чёрный', gen: 'чёрного', price: 52, unit: 'шт', kind: 'bread' },
  { code: '103', name: 'Батон нарезной 0,4 кг', nom: 'батоны', gen: 'батонов', price: 44, unit: 'шт', kind: 'bread' },
  { code: '104', name: 'Хлеб «Бородинский» 0,4 кг', nom: 'бородинский', gen: 'бородинского', price: 58, unit: 'шт', kind: 'bread' },
  { code: '105', name: 'Хлеб «Дарницкий» 0,7 кг', nom: 'дарницкий', gen: 'дарницкого', price: 50, unit: 'шт', kind: 'bread' },
  { code: '201', name: 'Булочка с маком 0,1 кг', nom: 'булочки с маком', gen: 'булочек с маком', price: 22, unit: 'шт', kind: 'bun' },
  { code: '202', name: 'Булочка сдобная 0,08 кг', nom: 'сдобные булочки', gen: 'сдобных булочек', price: 19, unit: 'шт', kind: 'bun' },
  { code: '203', name: 'Плюшка московская 0,1 кг', nom: 'плюшки', gen: 'плюшек', price: 27, unit: 'шт', kind: 'bun' },
  { code: '301', name: 'Лаваш армянский 0,25 кг', nom: 'лаваш', gen: 'лаваша', price: 36, unit: 'шт', kind: 'flat' },
  { code: '401', name: 'Сушки ванильные 0,3 кг', nom: 'сушки', gen: 'сушек', price: 62, unit: 'уп', kind: 'dry' },
];
export const productByCode = (c) => PRODUCTS.find((p) => p.code === c);

// f — female (voice pitch and grammar)
export const CLIENTS = [
  ['38203', 'Иванова Тамара Николаевна', 'магазин «Колосок»', 'ул. Ленина, 12', true],
  ['41577', 'Петренко Олег Степанович', 'минимаркет «У дома»', 'ул. Садовая, 3', false],
  ['29014', 'Сидорчук Валентина Ивановна', 'столовая школы №12', 'ул. Школьная, 8', true],
  ['50362', 'Кузнецова Ирина Петровна', 'детский сад №45 «Солнышко»', 'пр. Мира, 41', true],
  ['33871', 'Морозов Геннадий Павлович', 'кафе «Уют»', 'ул. Заводская, 17', false],
  ['47209', 'Волкова Наталья Сергеевна', 'магазин «Берёзка»', 'ул. Лесная, 5', true],
  ['21856', 'Лебедев Андрей Юрьевич', 'гастроном «На Мира»', 'пр. Мира, 102', false],
  ['39940', 'Соколова Любовь Андреевна', 'магазин «Каравай»', 'ул. Полевая, 21', true],
  ['45118', 'Никитин Сергей Олегович', 'продмаг №7', 'ул. Трудовая, 9', false],
  ['27633', 'Зайцева Ольга Викторовна', 'магазин «Лакомка»', 'ул. Гагарина, 33', true],
  ['52704', 'Павлова Галина Фёдоровна', 'пищеблок больницы №3', 'ул. Больничная, 1', true],
  ['36495', 'Семёнов Виктор Ильич', 'магазин «Семейный»', 'ул. Южная, 14', false],
  ['43062', 'Голубева Светлана Юрьевна', 'кафе «Родничок»', 'ул. Речная, 6', true],
  ['30781', 'Виноградов Максим Игоревич', 'минимаркет «Продукты 24»', 'ул. Вокзальная, 2', false],
  ['48836', 'Богданова Елена Михайловна', 'магазин «Надежда»', 'ул. Молодёжная, 11', true],
  ['25390', 'Воробьёв Алексей Николаевич', 'хлебная лавка «Горячий»', 'ул. Пекарская, 4', false],
  ['51247', 'Фёдорова Раиса Григорьевна', 'магазин «Весна»', 'ул. Весенняя, 19', true],
  ['34629', 'Михайлов Роман Дмитриевич', 'столовая автобазы', 'ул. Транспортная, 25', false],
  ['46983', 'Беляева Марина Олеговна', 'магазин «Дары полей»', 'ул. Колхозная, 7', true],
  ['22718', 'Тарасов Иван Петрович', 'магазин «Светлана»', 'ул. Светлая, 30', false],
  ['40356', 'Белова Нина Васильевна', 'столовая ПТУ №5', 'ул. Учебная, 2', true],
  ['53190', 'Комаров Денис Андреевич', 'кофейня «Зерно»', 'ул. Центральная, 1', false],
  ['31564', 'Орлова Вера Константиновна', 'магазин «Ромашка»', 'ул. Цветочная, 16', true],
  ['44421', 'Киселёв Пётр Семёнович', 'магазин «Гастроном №1»', 'пл. Победы, 3', false],
  ['37712', 'Гусева Анна Павловна', 'столовая завода «Прибор»', 'ул. Приборная, 9', true],
  ['28459', 'Ковалёв Игорь Васильевич', 'магазин «Хлеб да соль»', 'ул. Кирова, 44', false],
  ['49530', 'Лаврова Зинаида Петровна', 'детский сад №12 «Ёлочка»', 'ул. Хвойная, 3', true],
  ['35268', 'Ефимов Степан Аркадьевич', 'кафе «Пельменная №1»', 'ул. Советская, 15', false],
  ['42607', 'Жукова Тамара Ильинична', 'магазин «Уголок»', 'пер. Тихий, 2', true],
  ['26184', 'Андреев Павел Олегович', 'АЗС «Трасса» (буфет)', 'Шоссе, 18 км', false],
  ['50871', 'Макарова Людмила Сергеевна', 'магазин «Кулинария»', 'ул. Мира, 60', true],
  ['33045', 'Зуев Григорий Павлович', 'столовая колледжа', 'ул. Студенческая, 5', false],
  ['47796', 'Никифорова Ольга Дмитриевна', 'магазин «Добрый»', 'ул. Добрая, 1', true],
  ['24367', 'Кудрявцев Артём Сергеевич', 'кафе «Бублик»', 'ул. Бубличная, 8', false],
  ['39123', 'Соболева Екатерина Андреевна', 'магазин «Свежесть»', 'ул. Озёрная, 27', true],
  ['52988', 'Рябов Николай Фёдорович', 'магазин «Сельпо»', 'д. Васильево, 1', false],
].map(([code, fio, shop, addr, f], i) => ({ code, fio, surname: fio.split(' ')[0], shop, addr, female: f, route: 1 + (i % 6) }));
export const clientByCode = (c) => CLIENTS.find((k) => k.code === c);
export const shortFio = (fio) => { const [s, n, p] = fio.split(' '); return `${s} ${n[0]}. ${p[0]}.`; };

// ---------- numbers in words (for dictation) ----------
const ONES = ['ноль', 'одну', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const ONES_M = ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
export function numWords(n, fem = false) {
  const ones = fem ? ONES : ONES_M;
  if (n < 10) return ones[n];
  if (n < 20) return TEENS[n - 10];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  return String(n);
}
export function digitsWords(code) {
  return code.split('').map((d) => ONES_M[+d]).join('-');
}

// ---------- order generation ----------
export function makeOrder(rnd = Math.random) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const n = 3 + Math.floor(rnd() * 3);
  const pool = [...PRODUCTS].sort(() => rnd() - 0.5);
  // almost every shop wants white and black bread
  const first = PRODUCTS.filter((p) => p.code === '101' || p.code === '102');
  const chosen = [...first, ...pool.filter((p) => !first.includes(p))].slice(0, n);
  const items = chosen.map((p) => {
    let qty;
    if (p.kind === 'bread') qty = 4 + Math.floor(rnd() * 24);
    else if (p.kind === 'bun') qty = 5 * (2 + Math.floor(rnd() * 7));
    else qty = 2 + Math.floor(rnd() * 10);
    return { code: p.code, qty };
  });
  return items.sort(() => rnd() - 0.5);
}

// How a caller says one line of an order
export function sayItem(item, rnd = Math.random) {
  const p = productByCode(item.code);
  const q = rnd() < 0.55 ? numWords(item.qty) : String(item.qty);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const forms = [
    () => `${cap(p.gen)} — ${q}.`,
    () => `${cap(q)} ${p.gen}.`,
    () => `${cap(p.nom)} — ${q}.`,
    () => `Так, ${p.gen} ${q}.`,
    () => `И ${p.gen} — ${q}${p.unit === 'уп' ? ' пачек' : ''}.`,
  ];
  return pick(forms, rnd)();
}
function pick(a, rnd) { return a[Math.floor(rnd() * a.length)]; }

export const orderTotal = (items) => items.reduce((s, it) => s + it.qty * (productByCode(it.code)?.price || 0), 0);

// ---------- morning standing orders (one A4 sheet) ----------
export const STANDING_COUNT = 20;
export const standingClients = () => CLIENTS.slice(0, STANDING_COUNT);
export const phoneClients = () => CLIENTS.slice(STANDING_COUNT);
export function makeStandingOrders(seed = 7) {
  let t = seed;
  const rnd = () => { t = (t * 16807) % 2147483647; return (t - 1) / 2147483646; };
  const pool = ['101', '102', '103', '105', '201', '202', '203'];
  return standingClients().map((client) => {
    const n = 2 + Math.floor(rnd() * 2);
    const codes = ['101', '102', ...pool.slice(2).sort(() => rnd() - 0.5)].slice(0, n);
    const items = codes.map((code) => {
      const kind = productByCode(code).kind;
      return { code, qty: kind === 'bun' ? 5 * (2 + Math.floor(rnd() * 5)) : 4 + Math.floor(rnd() * 20) };
    });
    return { client, items, entered: false, errors: [] };
  });
}
