// Builds entrants: first a fully valid set of papers for the day's rules,
// then optionally corrupts it. The rules engine (rules.js) is what decides
// whether an entrant is admissible, so mutations only need to be plausible.
import * as D from './data.js';
import { addYears } from './dates.js';
import { faceTraits, facesDistinct } from './faces.js';

let nextId = 1;

const PASS_CHARS = 'ABCDEFGHJKLMNPRSTVWXYZ0123456789';
const SIMILAR_CHARS = { 0: '8', 8: '0', 1: '7', 7: '1', 3: '8', 5: '6', 6: '5', B: '8', S: '5', Z: '2', E: 'F', F: 'E', P: 'R', R: 'P', M: 'N', N: 'M' };
const SIMILAR_LETTERS = { а: 'о', о: 'а', е: 'и', и: 'е', ы: 'и', у: 'ю', ю: 'у', я: 'а', ё: 'е', в: 'ф', ф: 'в', д: 'т', т: 'д', з: 'с', с: 'з', б: 'п', п: 'б', г: 'к', к: 'г', л: 'н', н: 'л', р: 'л', м: 'н' };

function passportNumber(rng) {
  let s = '';
  for (let i = 0; i < 10; i++) {
    if (i === 5) s += '-';
    s += rng.pick(PASS_CHARS.split(''));
  }
  return s;
}

function feminize(last) {
  if (/(ов|ев|ёв|ин|ын)$/.test(last)) return last + 'а';
  if (/ский$/.test(last)) return last.replace(/ский$/, 'ская');
  return last;
}

function makeName(rng, country, sex, forcedLast) {
  const pool = D.NAMES[country];
  const first = rng.pick(sex === 'M' ? pool.m : pool.f);
  let last = forcedLast || rng.pick(pool.last);
  if (sex === 'F' && pool.slavic) last = feminize(last);
  return `${last}, ${first}`;
}

// Change one letter of the surname to a look-alike, e.g. Ковалёв → Ковалев / Кавалёв.
export function nameTypo(rng, name) {
  const [last, first] = name.split(', ');
  const idx = [];
  for (let i = 1; i < last.length; i++) if (SIMILAR_LETTERS[last[i]]) idx.push(i);
  let out;
  if (idx.length) {
    const i = rng.pick(idx);
    out = last.slice(0, i) + SIMILAR_LETTERS[last[i]] + last.slice(i + 1);
  } else {
    out = last.slice(0, -2) + last.slice(-1) + last.slice(-2, -1);
  }
  return `${out}, ${first}`;
}

function numberTypo(rng, num) {
  const idx = [];
  for (let i = 0; i < num.length; i++) if (num[i] !== '-') idx.push(i);
  const i = rng.pick(idx);
  let c = SIMILAR_CHARS[num[i]];
  while (!c || c === num[i]) c = rng.pick(PASS_CHARS.split(''));
  return num.slice(0, i) + c + num.slice(i + 1);
}

function differentFace(rng, seed, sex) {
  const base = faceTraits(seed, sex);
  for (let i = 0; i < 50; i++) {
    const s = rng.seed();
    if (facesDistinct(base, faceTraits(s, sex))) return s;
  }
  return seed + 1;
}

function pickCountry(rng, day) {
  if (day >= 6 && rng.chance(0.14)) return D.BANNED;
  if (rng.chance(day === 1 ? 0.6 : 0.34)) return D.HOME;
  const others = D.COUNTRIES.map((c) => c.name).filter((n) => n !== D.HOME && (day < 6 || n !== D.BANNED));
  return rng.pick(others);
}

function vaccineList(rng, today) {
  const list = [{ name: D.REQUIRED_VACCINE, date: today - rng.int(20, 3 * 365 - 20) }];
  const extra = [...D.OTHER_VACCINES].sort(() => rng.float() - 0.5).slice(0, rng.int(1, 2));
  for (const name of extra) list.push({ name, date: today - rng.int(20, 2500) });
  return list.sort(() => rng.float() - 0.5);
}

export function makeEntrant(ctx) {
  const { rng, day, today } = ctx;
  const country = ctx.country || pickCountry(rng, day);
  const sex = ctx.sex || (rng.chance(0.5) ? 'M' : 'F');
  const face = ctx.face || rng.seed();
  const name = makeName(rng, country, sex, ctx.last);
  const age = rng.int(19, 72);
  const dob = today - age * 365 - rng.int(0, 364);
  const foreign = country !== D.HOME;
  const passport = {
    country,
    name,
    dob,
    sex,
    city: rng.pick(D.countryInfo(country).cities),
    expiry: today + rng.int(15, 1600),
    number: passportNumber(rng),
    photo: face,
  };
  const e = {
    id: nextId++,
    country,
    sex,
    face,
    foreign,
    docs: { passport },
    answers: { ...D.LINES.homeAnswers },
    lines: {},
    wanted: false,
    bribe: 0,
  };

  if (foreign) {
    const purpose = rng.pick(D.PURPOSES);
    const duration = rng.pick(D.DURATIONS[purpose]);
    e.answers = { purpose, duration };
    if (day >= 2) {
      e.docs.permit = { name, number: passport.number, purpose, duration, expiry: today + rng.int(2, 120), seal: rng.pick(D.VALID_SEALS) };
    }
    if (day >= 4 && purpose === 'Работа') {
      e.docs.workpass = { name, field: rng.pick(D.WORK_FIELDS), expiry: today + rng.int(40, 700) };
    }
    if (day >= 5) {
      e.docs.vaccine = { name, number: passport.number, vaccines: vaccineList(rng, today) };
    }
  } else if (day >= 3) {
    e.docs.idcard = {
      name,
      dob,
      district: rng.pick(D.DISTRICTS),
      photo: face,
      height: rng.int(150, 196),
      weight: rng.int(46, 112),
    };
  }
  return e;
}

// Each mutation breaks exactly one rule. `day` is when that rule appears.
const hasSmallpox = (e) => e.docs.vaccine && e.docs.vaccine.vaccines.some((x) => x.name === D.REQUIRED_VACCINE);

const MUTATIONS = [
  { day: 1, ok: () => true, apply: (e, c) => (e.docs.passport.expiry = c.today - c.rng.int(1, 300)) },
  {
    day: 1,
    ok: () => true,
    apply: (e, c) => {
      const p = e.docs.passport;
      const foreignCities = D.COUNTRIES.filter((x) => x.name !== p.country).flatMap((x) => x.cities);
      p.city = c.rng.chance(0.5) ? c.rng.pick(D.FAKE_CITIES) : c.rng.pick(foreignCities);
    },
  },
  { day: 1, ok: () => true, apply: (e, c) => (e.docs.passport.photo = differentFace(c.rng, e.face, e.sex)) },
  { day: 1, ok: () => true, apply: (e) => (e.docs.passport.sex = e.sex === 'M' ? 'F' : 'M') },
  { day: 2, ok: (e) => e.docs.permit, apply: (e) => delete e.docs.permit },
  { day: 2, ok: (e) => e.docs.permit, apply: (e, c) => (e.docs.permit.name = nameTypo(c.rng, e.docs.permit.name)) },
  { day: 2, ok: (e) => e.docs.permit, apply: (e, c) => (e.docs.permit.number = numberTypo(c.rng, e.docs.permit.number)) },
  { day: 2, ok: (e) => e.docs.permit, apply: (e, c) => (e.docs.permit.expiry = c.today - c.rng.int(1, 40)) },
  { day: 2, ok: (e) => e.docs.permit, apply: (e, c) => (e.docs.permit.seal = c.rng.pick(D.FAKE_SEALS)) },
  {
    day: 2,
    ok: (e) => e.docs.permit,
    apply: (e, c) => (e.answers.purpose = c.rng.pick(D.PURPOSES.filter((p) => p !== e.docs.permit.purpose))),
  },
  {
    day: 2,
    ok: (e) => e.docs.permit,
    apply: (e, c) => (e.answers.duration = c.rng.pick(D.ALL_DURATIONS.filter((d) => d !== e.docs.permit.duration))),
  },
  { day: 3, ok: (e) => e.docs.idcard, apply: (e) => delete e.docs.idcard },
  { day: 3, ok: (e) => e.docs.idcard, apply: (e, c) => (e.docs.idcard.name = nameTypo(c.rng, e.docs.idcard.name)) },
  {
    day: 3,
    ok: (e) => e.docs.idcard,
    apply: (e, c) => (e.docs.idcard.dob += c.rng.chance(0.5) ? c.rng.pick([-365, 365, -730]) : c.rng.pick([-3, -1, 1, 2, 30])),
  },
  { day: 3, ok: (e) => e.docs.idcard, apply: (e, c) => (e.docs.idcard.district = c.rng.pick(D.FAKE_DISTRICTS)) },
  { day: 3, ok: (e) => e.docs.idcard, apply: (e, c) => (e.docs.idcard.photo = differentFace(c.rng, e.face, e.sex)) },
  { day: 4, ok: (e) => e.docs.workpass, apply: (e) => delete e.docs.workpass },
  { day: 4, ok: (e) => e.docs.workpass, apply: (e, c) => (e.docs.workpass.name = nameTypo(c.rng, e.docs.workpass.name)) },
  { day: 4, ok: (e) => e.docs.workpass, apply: (e, c) => (e.docs.workpass.expiry = c.today - c.rng.int(1, 60)) },
  { day: 5, ok: (e) => e.docs.vaccine, apply: (e) => delete e.docs.vaccine },
  {
    day: 5,
    ok: hasSmallpox,
    apply: (e, c) => {
      const v = e.docs.vaccine.vaccines.find((x) => x.name === D.REQUIRED_VACCINE);
      v.date = addYears(c.today, -3) - c.rng.int(3, 400);
    },
  },
  {
    day: 5,
    ok: hasSmallpox,
    apply: (e) => (e.docs.vaccine.vaccines = e.docs.vaccine.vaccines.filter((x) => x.name !== D.REQUIRED_VACCINE)),
  },
  { day: 5, ok: (e) => e.docs.vaccine, apply: (e, c) => (e.docs.vaccine.number = numberTypo(c.rng, e.docs.vaccine.number)) },
];

function mutate(e, c) {
  const options = MUTATIONS.filter((m) => m.day <= c.day && m.ok(e));
  const fresh = options.filter((m) => m.day === c.day);
  const m = fresh.length && c.rng.chance(0.5) ? c.rng.pick(fresh) : c.rng.pick(options);
  m.apply(e, c);
}

function randomLine(rng, e) {
  return rng.pick(e.foreign ? D.LINES.greetForeign : D.LINES.greetHome);
}

// Scripted visitors, keyed by shift and position in the queue.
const SCRIPTS = {
  1: {
    0: (c) => {
      const e = makeEntrant({ ...c, country: D.HOME });
      e.lines.greet = 'Доброе утро! Первый день на посту? Удачи, инспектор. Слава Кордонии!';
      return e;
    },
    3: (c) => {
      const e = makeEntrant({ ...c, country: 'Остгард', sex: 'M' });
      e.lines.greet = 'Я слышал, граница открыта! Вы же пропустите меня, правда?';
      e.lines.deny = 'Как это «только граждане»?! Я проехал полстраны!';
      return e;
    },
  },
  2: {
    1: (c) => {
      const e = makeEntrant({ ...c, country: 'Вельмария' });
      delete e.docs.permit;
      e.lines.greet = 'Вот мой паспорт. Разрешение? Мне никто не говорил ни о каком разрешении!';
      e.lines.deny = 'Но... я ехал три дня!';
      return e;
    },
  },
  3: {
    2: (c) => {
      const e = makeEntrant({ ...c, country: 'Нордвик', sex: 'M' });
      c.memory.husband = e.docs.passport.name.split(', ')[0];
      e.lines.greet = 'Здравствуйте. Моя жена стоит следом за мной. Прошу, будьте к ней снисходительны.';
      return e;
    },
    3: (c) => {
      const e = makeEntrant({ ...c, country: 'Нордвик', sex: 'F', last: c.memory.husband });
      delete e.docs.permit;
      e.lines.greet = 'Мой муж только что прошёл... Разрешение мне не успели выдать. Пожалуйста, я не могу без него!';
      e.lines.deny = 'Нет... что же мне теперь делать?';
      e.lines.approve = 'Спасибо! Спасибо вам! Я никогда этого не забуду.';
      return e;
    },
  },
  4: {
    2: (c) => {
      const e = makeEntrant({ ...c, country: 'Сальвен', sex: 'M' });
      e.docs.permit.expiry = c.today - 2;
      e.bribe = 15;
      e.lines.greet = 'Разрешение чуть просрочено — пустяк. В конверте кое-что за ваше понимание.';
      e.lines.approve = 'Приятно иметь дело с разумным человеком.';
      e.lines.deny = 'Какая глупая принципиальность.';
      return e;
    },
  },
  5: {
    1: (c) => {
      const e = makeEntrant({ ...c, country: D.HOME, sex: 'M' });
      e.docs.passport.dob = c.today - 78 * 365;
      e.docs.idcard.dob = e.docs.passport.dob;
      e.docs.passport.expiry = c.today - 900;
      e.lines.greet = 'Сорок лет я не был дома. Паспорт старый, но я же кордонец, сынок!';
      e.lines.deny = 'Значит, умру на чужбине...';
      return e;
    },
  },
  6: {
    0: (c) => {
      const e = makeEntrant({ ...c, country: D.BANNED });
      e.docs.permit.purpose = 'Работа';
      e.answers.purpose = 'Работа';
      e.docs.workpass = { name: e.docs.passport.name, field: 'Строительство', expiry: c.today + 200 };
      e.lines.greet = 'Я не имею отношения к взрыву! У меня все бумаги в порядке, я просто хочу работать.';
      return e;
    },
  },
};

export class EntrantFactory {
  constructor(rng, day, today) {
    this.rng = rng;
    this.day = day;
    this.today = today;
    this.index = 0;
    this.memory = {};
    this.wanted = [];
    this.wantedAt = new Map();
    if (day >= 7) {
      for (let i = 0; i < 3; i++) {
        const sex = rng.chance(0.7) ? 'M' : 'F';
        this.wanted.push({ face: rng.seed(), sex });
      }
      // Two of the three fugitives show up during the shift.
      this.wantedAt.set(rng.int(2, 5), this.wanted[0]);
      this.wantedAt.set(rng.int(7, 11), this.wanted[1]);
    }
  }

  next() {
    const c = { rng: this.rng, day: this.day, today: this.today, memory: this.memory };
    const i = this.index++;
    const script = SCRIPTS[this.day] && SCRIPTS[this.day][i];
    let e;
    if (script) {
      e = script(c);
    } else if (this.wantedAt.has(i)) {
      const w = this.wantedAt.get(i);
      e = makeEntrant({ ...c, face: w.face, sex: w.sex, country: this.rng.pick(D.COUNTRIES.filter((x) => x.name !== D.BANNED)).name });
      e.wanted = true;
    } else {
      e = makeEntrant(c);
      const p = this.day === 1 ? 0.3 : 0.45;
      if (this.rng.chance(p)) {
        mutate(e, c);
        if (this.day >= 3 && this.rng.chance(0.12)) mutate(e, c);
      }
    }
    e.lines.greet = e.lines.greet || randomLine(this.rng, e);
    return e;
  }
}
