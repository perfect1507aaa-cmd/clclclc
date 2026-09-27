// The rules engine: which entrants may pass, and what inspection mode reports
// when the inspector links two fields together.
import * as D from './data.js';
import { addYears } from './dates.js';

const smallpoxValid = (date, today) => addYears(date, 3) >= today;

export function violations(e, day, today) {
  const v = [];
  const { passport, permit, idcard, workpass, vaccine } = e.docs;
  const foreign = passport.country !== D.HOME;

  if (day === 1 && foreign) v.push('Въезд иностранцам запрещён');
  if (day >= 6 && passport.country === D.BANNED) v.push('Въезд гражданам Тиронии запрещён');
  if (passport.expiry < today) v.push('Паспорт просрочен');
  if (!D.countryInfo(passport.country).cities.includes(passport.city)) v.push('Недействительный город выдачи паспорта');
  if (passport.photo !== e.face) v.push('Фото в паспорте не совпадает');
  if (passport.sex !== e.sex) v.push('Пол в паспорте не совпадает');

  if (foreign && day >= 2) {
    if (!permit) {
      v.push('Нет разрешения на въезд');
    } else {
      if (permit.name !== passport.name) v.push('Имя в разрешении не совпадает');
      if (permit.number !== passport.number) v.push('№ паспорта в разрешении не совпадает');
      if (permit.expiry < today) v.push('Разрешение на въезд просрочено');
      if (!D.VALID_SEALS.includes(permit.seal)) v.push('Поддельная печать на разрешении');
      if (e.answers.purpose !== permit.purpose) v.push('Цель визита не совпадает с разрешением');
      if (e.answers.duration !== permit.duration) v.push('Срок визита не совпадает с разрешением');
    }
  }

  if (!foreign && day >= 3) {
    if (!idcard) {
      v.push('Нет удостоверения личности');
    } else {
      if (idcard.name !== passport.name) v.push('Имя в ID не совпадает');
      if (idcard.dob !== passport.dob) v.push('Дата рождения в ID не совпадает');
      if (!D.DISTRICTS.includes(idcard.district)) v.push('Недействительный район в ID');
      if (idcard.photo !== e.face) v.push('Фото в ID не совпадает');
    }
  }

  const purpose = permit ? permit.purpose : e.answers.purpose;
  if (foreign && day >= 4 && purpose === 'Работа') {
    if (!workpass) {
      v.push('Нет разрешения на работу');
    } else {
      if (workpass.name !== passport.name) v.push('Имя в разрешении на работу не совпадает');
      if (workpass.expiry < today) v.push('Разрешение на работу просрочено');
    }
  }

  if (foreign && day >= 5) {
    if (!vaccine) {
      v.push('Нет сертификата вакцинации');
    } else {
      if (vaccine.name !== passport.name) v.push('Имя в сертификате не совпадает');
      if (vaccine.number !== passport.number) v.push('№ паспорта в сертификате не совпадает');
      const pox = vaccine.vaccines.find((x) => x.name === D.REQUIRED_VACCINE);
      if (!pox) v.push('Нет прививки от оспы');
      else if (!smallpoxValid(pox.date, today)) v.push('Прививка от оспы просрочена');
    }
  }

  return v;
}

// Grade a decision. Returns { ok, reason, bonus }.
export function judge(e, action, day, today) {
  const v = violations(e, day, today);
  if (e.wanted) {
    if (action === 'detain') return { ok: true, bonus: D.WANTED_BONUS, reason: 'Разыскиваемый задержан' };
    return { ok: false, reason: 'Разыскиваемый преступник не задержан' };
  }
  if (action === 'approve') {
    return v.length ? { ok: false, reason: `Въезд разрешён с нарушением: ${v[0].toLowerCase()}` } : { ok: true };
  }
  if (v.length) return { ok: true };
  return { ok: false, reason: action === 'detain' ? 'Необоснованное задержание' : 'Необоснованный отказ во въезде' };
}

const SIMPLE = {
  name: 'Имена',
  number: 'Номера паспорта',
  dob: 'Даты рождения',
  sex: 'Пол',
  purpose: 'Цель визита',
  duration: 'Срок визита',
};

const match = (text) => ({ status: 'match', text });
const mismatch = (text, excuse) => ({ status: 'mismatch', text, excuse });
const unrelated = (text = 'Нет связи между этими данными') => ({ status: 'none', text });

// a, b: { kind, val } read from the selected elements' data attributes.
export function compareFields(a, b, today) {
  const pair = (x, y) => (a.kind === x && b.kind === y ? [a, b] : b.kind === x && a.kind === y ? [b, a] : null);
  let p;

  if (a.kind === b.kind && SIMPLE[a.kind]) {
    return a.val === b.val ? match(`${SIMPLE[a.kind]}: совпадает`) : mismatch(`${SIMPLE[a.kind]}: НЕ СОВПАДАЕТ`, a.kind);
  }
  if (a.kind === 'face' && b.kind === 'face') {
    return a.val.split('|')[0] === b.val.split('|')[0] ? match('Лица совпадают') : mismatch('Это разные люди!', 'face');
  }
  if ((p = pair('face', 'sex'))) {
    return p[0].val.split('|')[1] === p[1].val ? match('Пол соответствует') : mismatch('Пол НЕ соответствует', 'sex');
  }
  if ((p = pair('face', 'wanted'))) {
    return p[0].val.split('|')[0] === p[1].val ? { ...mismatch('РАЗЫСКИВАЕТСЯ! Задержите нарушителя.', 'wanted'), wanted: true } : match('Не похож на разыскиваемого');
  }
  if ((p = pair('expiry', 'today'))) {
    return Number(p[0].val) < Number(p[1].val) ? mismatch('Срок действия документа ИСТЁК', 'expiry') : match('Документ действителен');
  }
  if ((p = pair('vaccine', 'today')) || (p = pair('vaccine', 'rule-vax'))) {
    const [name, date] = p[0].val.split('|');
    if (name !== D.REQUIRED_VACCINE) return unrelated('Эта прививка не требуется');
    return smallpoxValid(Number(date), today) ? match('Прививка действительна') : mismatch('Прививка от оспы УСТАРЕЛА', 'vaccine');
  }
  if ((p = pair('city', 'rule-country'))) {
    const [country, city] = p[0].val.split('|');
    const [rc, cities] = p[1].val.split('|');
    if (country !== rc) return unrelated('Это другая страна — сверьтесь с её списком городов');
    return cities.split(',').includes(city) ? match('Город выдачи действителен') : mismatch('Такого города нет в списке', 'forgery');
  }
  if ((p = pair('seal', 'rule-seals'))) {
    return p[1].val.split(',').includes(p[0].val) ? match('Печать действительна') : mismatch('Печать ПОДДЕЛЬНАЯ', 'forgery');
  }
  if ((p = pair('district', 'rule-districts'))) {
    return p[1].val.split(',').includes(p[0].val) ? match('Район действителен') : mismatch('Такого района нет в списке', 'forgery');
  }
  if ((p = pair('country', 'rule-ban'))) {
    return p[0].val === p[1].val ? mismatch('Въезд гражданам этой страны ЗАПРЕЩЁН', 'ban') : match('Запрет не распространяется');
  }
  if ((p = pair('country', 'rule-citizens'))) {
    return p[0].val === p[1].val ? match('Гражданин Кордонии') : mismatch('Въезд только для граждан Кордонии', 'ban');
  }
  return unrelated();
}
