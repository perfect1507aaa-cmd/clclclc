// The inspector's family and the nightly bills.

export function newFamily() {
  return [
    { id: 'wife', name: 'Жена', f: true },
    { id: 'son', name: 'Сын', f: false },
    { id: 'mil', name: 'Тёща', f: true },
    { id: 'uncle', name: 'Дядя', f: false },
  ].map((m) => ({ ...m, hunger: 0, cold: 0, sick: false, sickDays: 0, alive: true }));
}

const word = (m, male, female) => (m.f ? female : male);

export function memberStatus(m) {
  if (!m.alive) return [word(m, 'умер', 'умерла')];
  const s = [];
  if (m.sick) s.push(word(m, 'болен', 'больна'));
  if (m.hunger >= 2) s.push(word(m, 'очень голоден', 'очень голодна'));
  else if (m.hunger === 1) s.push(word(m, 'голоден', 'голодна'));
  if (m.cold >= 1) s.push(word(m, 'замёрз', 'замёрзла'));
  return s.length ? s : ['в порядке'];
}

export function bills(day, family) {
  const list = [
    { id: 'rent', label: 'Аренда', cost: day >= 5 ? 25 : 20, required: true },
    { id: 'food', label: 'Еда', cost: 10 },
    { id: 'heat', label: 'Отопление', cost: 5 },
  ];
  if (family.some((m) => m.alive && m.sick)) list.push({ id: 'meds', label: 'Лекарства', cost: 10 });
  return list;
}

// Apply one night to the family. Returns news lines for the next morning.
export function passNight(family, paid) {
  const news = [];
  for (const m of family) {
    if (!m.alive) continue;
    m.hunger = paid.food ? 0 : m.hunger + 1;
    m.cold = paid.heat ? 0 : m.cold + 1;

    if (m.sick) {
      if (paid.meds) {
        m.sick = false;
        m.sickDays = 0;
        news.push(`${m.name}: ${word(m, 'выздоровел', 'выздоровела')}.`);
      } else {
        m.sickDays++;
      }
    } else if (m.cold >= 2 || m.hunger >= 2) {
      m.sick = true;
      m.sickDays = 0;
      news.push(`${m.name}: ${word(m, 'заболел', 'заболела')}.`);
    }

    if (m.hunger >= 3 || m.sickDays >= 2) {
      m.alive = false;
      news.push(`${m.name}: ${word(m, 'умер', 'умерла')}.`);
    }
  }
  return news;
}
