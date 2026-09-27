// HTML for every paper that can lie on the desk. Inspectable values are wrapped
// in `.fld` spans carrying data-kind / data-val for the inspection mode.
import * as D from './data.js';
import { fmtDate } from './dates.js';
import { faceSVG, sealSVG } from './faces.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function fld(kind, val, text, cls = '') {
  return `<span class="fld ${cls}" data-kind="${kind}" data-val="${esc(val)}">${esc(text)}</span>`;
}

function photo(seed, sex, cls = '') {
  return `<div class="fld photo ${cls}" data-kind="face" data-val="${seed}|${sex}">${faceSVG(seed, sex)}</div>`;
}

function row(label, value) {
  return `<div class="row"><span class="lbl">${label}</span>${value}</div>`;
}

function makeDoc(type, html) {
  const el = document.createElement('div');
  el.className = `doc doc-${type}`;
  el.dataset.type = type;
  el.innerHTML = html;
  return el;
}

// photoSex is the real sex of the person pictured; p.sex may be falsified.
export function passportDoc(p, photoSex) {
  const info = D.countryInfo(p.country);
  const sexText = p.sex === 'M' ? 'М' : 'Ж';
  return makeDoc(
    'passport',
    `<div class="doc-head" style="background:${info.color}">ПАСПОРТ · ${fld('country', p.country, p.country.toUpperCase())}</div>
    <div class="passport-body">
      ${photo(p.photo, photoSex)}
      <div class="fields">
        ${row('Имя', fld('name', p.name, p.name))}
        ${row('Дата рожд.', fld('dob', p.dob, fmtDate(p.dob)))}
        ${row('Пол', fld('sex', p.sex, sexText))}
        ${row('Выдан', fld('city', `${p.country}|${p.city}`, p.city))}
        ${row('Действ. до', fld('expiry', p.expiry, fmtDate(p.expiry)))}
      </div>
    </div>
    <div class="doc-foot">${fld('number', p.number, p.number, 'mono')}</div>
    <div class="stamp-slot"></div>`,
  );
}

export function permitDoc(p) {
  return makeDoc(
    'permit',
    `<div class="doc-title">РАЗРЕШЕНИЕ НА ВЪЕЗД</div>
    <div class="doc-sub">Министерство миграции Кордонии</div>
    ${row('Имя', fld('name', p.name, p.name))}
    ${row('Паспорт №', fld('number', p.number, p.number, 'mono'))}
    ${row('Цель', fld('purpose', p.purpose, p.purpose))}
    ${row('Срок', fld('duration', p.duration, p.duration))}
    ${row('Въезд до', fld('expiry', p.expiry, fmtDate(p.expiry)))}
    <div class="seal fld" data-kind="seal" data-val="${p.seal}">${sealSVG(p.seal)}</div>`,
  );
}

export function idcardDoc(c) {
  return makeDoc(
    'idcard',
    `<div class="doc-head" style="background:#6a5b2e">УДОСТОВЕРЕНИЕ ЛИЧНОСТИ · КОРДОНИЯ</div>
    <div class="passport-body">
      ${photo(c.photo, c.photoSex)}
      <div class="fields">
        ${row('Имя', fld('name', c.name, c.name))}
        ${row('Дата рожд.', fld('dob', c.dob, fmtDate(c.dob)))}
        ${row('Район', fld('district', c.district, c.district))}
        ${row('Рост / вес', `<span>${c.height} см · ${c.weight} кг</span>`)}
      </div>
    </div>`,
  );
}

export function workpassDoc(w) {
  return makeDoc(
    'workpass',
    `<div class="doc-title">РАЗРЕШЕНИЕ НА РАБОТУ</div>
    <div class="doc-sub">Министерство труда Кордонии</div>
    ${row('Имя', fld('name', w.name, w.name))}
    ${row('Отрасль', `<span>${esc(w.field)}</span>`)}
    ${row('Действ. до', fld('expiry', w.expiry, fmtDate(w.expiry)))}`,
  );
}

export function vaccineDoc(v) {
  const list = v.vaccines
    .map((x) => `<li>${fld('vaccine', `${x.name}|${x.date}`, `${x.name} — ${fmtDate(x.date)}`)}</li>`)
    .join('');
  return makeDoc(
    'vaccine',
    `<div class="doc-title">СЕРТИФИКАТ ВАКЦИНАЦИИ</div>
    ${row('Имя', fld('name', v.name, v.name))}
    ${row('Паспорт №', fld('number', v.number, v.number, 'mono'))}
    <div class="lbl">Прививки:</div>
    <ul class="vax">${list}</ul>`,
  );
}

export function bribeDoc(amount) {
  return makeDoc(
    'bribe',
    `<div class="doc-title">КОНВЕРТ</div>
    <p>Внутри ${amount} кредитов.</p>
    <p class="small">Если въезд будет разрешён — деньги ваши.</p>`,
  );
}

export function transcriptDoc() {
  return makeDoc('transcript', `<div class="doc-title">ПРОТОКОЛ</div><div class="lines"></div>`);
}

export function transcriptLine(el, who, text, kind) {
  const line = document.createElement('div');
  line.className = `tline ${who === 'Инспектор' ? 'insp' : 'ent'}`;
  const body = kind ? fld(kind, text, text) : esc(text);
  line.innerHTML = `<b>${who}:</b> ${body}`;
  const lines = el.querySelector('.lines');
  lines.appendChild(line);
  while (lines.children.length > 8) lines.firstChild.remove();
}

export function citationDoc(reason, penalty) {
  return makeDoc(
    'citation',
    `<div class="doc-title">${penalty ? 'ШТРАФ' : 'ПРЕДУПРЕЖДЕНИЕ'}</div>
    <p>${esc(reason)}</p>
    <p class="small">${penalty ? `Удержано: ${penalty} кр.` : 'Без удержания.'} (нажмите, чтобы убрать)</p>`,
  );
}

export function rulebookDoc(day, wanted) {
  const rules = D.rulesFor(day)
    .map((r) => `<li>${r.kind ? fld(r.kind, r.val, r.text) : esc(r.text)}</li>`)
    .join('');
  const countries = D.COUNTRIES.map(
    (c) => `<div class="country">${fld('rule-country', `${c.name}|${c.cities.join(',')}`, `${c.name}: ${c.cities.join(', ')}`)}</div>`,
  ).join('');
  const pages = [
    { id: 'rules', title: 'Правила', html: `<ol class="rules">${rules}</ol>` },
    { id: 'countries', title: 'Страны', html: `<div class="small">Города, выдающие паспорта:</div>${countries}` },
  ];
  if (day >= 2) {
    pages.push({
      id: 'seals',
      title: 'Печати',
      html: `<div class="small">Действующие печати министерства:</div>
        <div class="fld seals" data-kind="rule-seals" data-val="${D.VALID_SEALS.join(',')}">
          ${D.VALID_SEALS.map((s) => `<div class="seal">${sealSVG(s)}</div>`).join('')}
        </div>`,
    });
  }
  if (day >= 3) {
    pages.push({
      id: 'districts',
      title: 'Районы',
      html: `<div class="small">Районы Кордонии:</div>${fld('rule-districts', D.DISTRICTS.join(','), D.DISTRICTS.join(', '), 'block')}`,
    });
  }
  if (wanted && wanted.length) {
    pages.push({
      id: 'wanted',
      title: 'Розыск',
      html: `<div class="small">Разыскиваются. При обнаружении — задержать:</div>
        <div class="wanted">${wanted.map((w) => `<div class="fld photo" data-kind="wanted" data-val="${w.face}">${faceSVG(w.face, w.sex)}</div>`).join('')}</div>`,
    });
  }
  const tabs = pages.map((p, i) => `<button class="tab${i === 0 ? ' on' : ''}" data-page="${p.id}">${p.title}</button>`).join('');
  const bodies = pages.map((p, i) => `<div class="page${i === 0 ? '' : ' hidden'}" data-page="${p.id}">${p.html}</div>`).join('');
  const el = makeDoc('rulebook', `<div class="doc-title">СВОД ПРАВИЛ</div><div class="tabs">${tabs}</div>${bodies}`);
  el.addEventListener('click', (ev) => {
    const tab = ev.target.closest('.tab');
    if (!tab) return;
    el.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t === tab));
    el.querySelectorAll('.page').forEach((pg) => pg.classList.toggle('hidden', pg.dataset.page !== tab.dataset.page));
  });
  return el;
}

export function entrantDocs(e) {
  const d = e.docs;
  const out = [passportDoc(d.passport, e.sex)];
  if (d.permit) out.push(permitDoc(d.permit));
  if (d.idcard) out.push(idcardDoc({ ...d.idcard, photoSex: e.sex }));
  if (d.workpass) out.push(workpassDoc(d.workpass));
  if (d.vaccine) out.push(vaccineDoc(d.vaccine));
  if (e.bribe) out.push(bribeDoc(e.bribe));
  return out;
}
