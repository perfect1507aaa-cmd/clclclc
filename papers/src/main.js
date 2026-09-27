import * as D from './data.js';
import { Rng } from './rng.js';
import { dateForShift, fmtDate, fmtClock } from './dates.js';
import { faceSVG, silhouetteSVG } from './faces.js';
import { EntrantFactory } from './generator.js';
import { judge, compareFields } from './rules.js';
import { entrantDocs, rulebookDoc, transcriptDoc, transcriptLine, citationDoc } from './docs.js';
import { Desk } from './desk.js';
import { newFamily, memberStatus, bills, passNight } from './family.js';
import { Save } from './save.js';
import { sfx } from './audio.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const ui = {
  deskEl: $('#desk'),
  entrant: $('#entrant'),
  speech: $('#speech'),
  boothMsg: $('#booth-msg'),
  queue: $('#queue'),
  queueCount: $('#queue-count'),
  inspectBar: $('#inspect-bar'),
  overlay: $('#inspect-overlay'),
  toast: $('#toast'),
  btn: {
    next: $('#btn-next'),
    purpose: $('#btn-purpose'),
    duration: $('#btn-duration'),
    inspect: $('#btn-inspect'),
    approve: $('#btn-approve'),
    deny: $('#btn-deny'),
    detain: $('#btn-detain'),
    ret: $('#btn-return'),
  },
};

// Dev shortcuts: ?fast shortens shifts to 20 s, ?day=N starts a new game on day N.
const params = new URLSearchParams(location.search);
const FAST = params.has('fast');
const START_AT = Math.min(D.LAST_DAY, Math.max(1, Number(params.get('day')) || 1));

// Persistent campaign state (saved at the start of each day).
const G = {
  day: 1,
  money: 0,
  family: newFamily(),
  stats: { processed: 0, citations: 0, detained: 0 },
};

// Per-shift state.
let S = null;

const desk = new Desk(ui.deskEl, { canDrag: (ev) => !(S && S.inspect && ev.target.closest('.fld')) });

// ---------- screens ----------

function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
}

function toast(text, ms = 2200) {
  ui.toast.textContent = text;
  ui.toast.classList.remove('hidden');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => ui.toast.classList.add('hidden'), ms);
}

function showTitle() {
  S = null;
  const saved = Save.load();
  const cont = $('#btn-continue');
  cont.classList.toggle('hidden', !saved);
  if (saved) cont.textContent = `Продолжить (день ${saved.day})`;
  showScreen('title-screen');
}

function newGame() {
  Save.clear();
  G.day = START_AT;
  G.money = (START_AT - 1) * 30;
  G.family = newFamily();
  G.stats = { processed: 0, citations: 0, detained: 0 };
  showNews([]);
}

function continueGame() {
  const saved = Save.load();
  if (!saved) return newGame();
  Object.assign(G, saved);
  showNews([]);
}

function persist() {
  Save.write({ day: G.day, money: G.money, family: G.family, stats: G.stats });
}

function showNews(homeNews) {
  const n = D.NEWS[G.day];
  const today = dateForShift(G.day);
  const home = homeNews.length
    ? `<div class="home-news"><b>Дома:</b> ${homeNews.map(esc).join(' ')}</div>`
    : '';
  $('#newspaper').innerHTML = `
    ${home}
    <div class="np-mast">ГОЛОС КОРДОНИИ <span>${fmtDate(today)} · 2 кр.</span></div>
    <h2 class="np-head">${n.headline}</h2>
    <div class="np-sub">${n.sub}</div>
    <p class="np-body">${n.body}</p>
    <div class="np-rules"><b>ДЕНЬ ${G.day}. НОВЫЕ УКАЗАНИЯ:</b><ul>${n.rules.map((r) => `<li>${r}</li>`).join('')}</ul></div>`;
  showScreen('news-screen');
}

// ---------- shift ----------

function beginShift() {
  const today = dateForShift(G.day);
  const rng = new Rng((Date.now() ^ (G.day * 104729)) >>> 0);
  S = {
    rng,
    today,
    factory: new EntrantFactory(rng, G.day, today),
    elapsed: 0,
    length: FAST ? 20 : D.SHIFT_SECONDS[G.day],
    timeUp: false,
    paused: false,
    current: null,
    stamp: null,
    decided: false,
    docsReady: false,
    processed: 0,
    citations: 0,
    penalty: 0,
    extra: 0,
    mistakes: [],
    queue: rng.int(12, 18),
    inspect: false,
    sel: [],
    transcript: null,
    passport: null,
  };

  showScreen('game-screen');
  desk.remove();
  clearEntrant();
  setInspect(false);
  $('#hud-day').textContent = G.day;
  const dateEl = $('#hud-date');
  dateEl.textContent = fmtDate(today);
  dateEl.dataset.val = today;
  ui.btn.detain.classList.toggle('hidden', G.day < 7);

  const rb = rulebookDoc(G.day, S.factory.wanted);
  desk.add(rb, 0, 0);
  rb.style.left = `${Math.max(0, ui.deskEl.clientWidth - rb.offsetWidth - 8)}px`;
  rb.style.top = '8px';
  desk.clamp(rb);

  ui.boothMsg.textContent = 'Нажмите «Следующий!», чтобы вызвать въезжающего.';
  renderQueue();
  updateHud();
  updateButtons();
  last = performance.now();
}

function renderQueue() {
  const n = Math.min(S.queue, 16);
  let html = '';
  for (let i = 0; i < n; i++) html += `<div class="person" style="--i:${i}">${silhouetteSVG(S.factory.day * 1000 + S.factory.index + i)}</div>`;
  ui.queue.innerHTML = html;
  ui.queueCount.textContent = `в очереди: ${S.queue}`;
}

function earnedToday() {
  return S.processed * D.WAGE_PER_ENTRANT + S.extra - S.penalty;
}

function updateHud() {
  $('#hud-money').textContent = `${G.money} кр.`;
  $('#hud-earn').textContent = `${earnedToday()} кр.`;
  $('#hud-cit').textContent = S.citations;
  const minutes = 360 + Math.min(1, S.elapsed / S.length) * 720;
  $('#hud-clock').textContent = fmtClock(minutes);
}

function updateButtons() {
  const b = ui.btn;
  const active = S.current && S.docsReady && !S.decided;
  b.next.disabled = !!S.current;
  b.next.textContent = S.timeUp ? '🏁 Завершить смену' : '📢 Следующий!';
  b.purpose.disabled = !active;
  b.duration.disabled = !active;
  b.approve.disabled = !active || !!S.stamp;
  b.deny.disabled = !active || !!S.stamp;
  b.detain.disabled = !active;
  b.ret.disabled = !active || !S.stamp;
}

function say(text) {
  ui.speech.textContent = text;
  ui.speech.classList.remove('hidden');
  ui.speech.classList.remove('pop');
  void ui.speech.offsetWidth;
  ui.speech.classList.add('pop');
}

function clearEntrant() {
  ui.entrant.innerHTML = '';
  ui.entrant.dataset.val = '';
  ui.entrant.className = 'fld';
  ui.speech.classList.add('hidden');
}

function callNext() {
  if (!S || S.current) return;
  if (S.timeUp) return endShift();
  sfx.horn();
  const e = S.factory.next();
  S.current = e;
  S.stamp = null;
  S.decided = false;
  S.docsReady = false;
  S.queue = Math.max(3, S.queue - 1 + (S.rng.chance(0.45) ? 1 : 0));
  renderQueue();
  clearSelection();
  ui.boothMsg.textContent = '';
  ui.btn.detain.classList.remove('pulse');

  ui.entrant.innerHTML = faceSVG(e.face, e.sex);
  ui.entrant.dataset.val = `${e.face}|${e.sex}`;
  ui.entrant.className = 'fld enter';
  updateButtons();

  setTimeout(() => {
    if (!S || S.current !== e) return;
    say(e.lines.greet);
    spawnDocs(e);
    S.docsReady = true;
    updateButtons();
  }, 700);
}

function spawnDocs(e) {
  sfx.paper();
  const w = ui.deskEl.clientWidth;
  const h = ui.deskEl.clientHeight;
  const narrow = w < 560;
  const docs = entrantDocs(e);
  docs.forEach((doc, i) => {
    doc.classList.add('incoming', 'entrant-doc');
    doc.style.animationDelay = `${i * 90}ms`;
    const x = narrow ? 6 + i * 16 : 10 + i * (w > 900 ? 64 : 34);
    const y = narrow ? 6 + i * 26 : 12 + i * 32;
    desk.add(doc, x, y);
  });
  S.passport = docs[0];

  const tr = transcriptDoc();
  tr.classList.add('entrant-doc');
  transcriptLine(tr, 'Инспектор', 'Документы, пожалуйста.');
  transcriptLine(tr, 'Въезжающий', e.lines.greet);
  desk.add(tr, 0, 0);
  tr.style.left = narrow ? `${Math.max(0, w - tr.offsetWidth - 6)}px` : `${Math.max(0, w * 0.42)}px`;
  tr.style.top = `${Math.max(0, h - tr.offsetHeight - 8)}px`;
  desk.clamp(tr);
  S.transcript = tr;
}

function ask(what) {
  const e = S && S.current;
  if (!e || !S.docsReady || S.decided) return;
  const q = what === 'purpose' ? 'Цель визита?' : 'Срок пребывания?';
  const a = e.answers[what];
  transcriptLine(S.transcript, 'Инспектор', q);
  transcriptLine(S.transcript, 'Въезжающий', a, what);
  desk.front(S.transcript);
  say(a + '.');
}

function applyStamp(kind) {
  if (!S || !S.current || !S.docsReady || S.stamp || S.decided) return;
  S.stamp = kind;
  sfx.stamp();
  const slot = S.passport.querySelector('.stamp-slot');
  const st = document.createElement('div');
  st.className = `stamp ${kind}`;
  st.style.setProperty('--rot', `${S.rng.int(-14, 10)}deg`);
  st.innerHTML = `${kind === 'approve' ? 'ВЪЕЗД РАЗРЕШЁН' : 'ВЪЕЗД ЗАПРЕЩЁН'}<small>${fmtDate(S.today)} · КПП «Восточный»</small>`;
  slot.appendChild(st);
  desk.front(S.passport);
  updateButtons();
  toast('Штамп поставлен. Верните документы.');
}

function returnDocs() {
  if (!S || !S.current || S.decided) return;
  if (!S.stamp) return toast('Сначала поставьте штамп в паспорт.');
  finish(S.stamp);
}

function detain() {
  if (!S || !S.current || !S.docsReady || S.decided) return;
  sfx.alarm();
  finish('detain');
}

function finish(action) {
  const e = S.current;
  S.decided = true;
  setInspect(false);
  const r = judge(e, action, G.day, S.today);
  S.processed++;
  G.stats.processed++;
  if (action === 'approve' && e.bribe) S.extra += e.bribe;
  if (r.bonus) S.extra += r.bonus;
  if (action === 'detain' && e.wanted) G.stats.detained++;

  say(e.lines[action] || S.rng.pick(D.LINES[action]));
  updateButtons();

  for (const d of ui.deskEl.querySelectorAll('.entrant-doc')) d.classList.add('outgoing');
  sfx.paper();

  const shift = S;
  setTimeout(() => {
    if (S !== shift) return;
    desk.remove((d) => d.classList.contains('entrant-doc'));
    ui.entrant.classList.remove('enter');
    ui.entrant.classList.add(action === 'detain' ? 'taken' : action === 'approve' ? 'leave' : 'back');
  }, 700);

  setTimeout(() => {
    if (S !== shift) return;
    clearEntrant();
    S.current = null;
    S.passport = null;
    S.transcript = null;
    if (!r.ok) cite(r.reason);
    if (r.bonus) toast(`Премия: +${r.bonus} кр.`);
    updateHud();
    updateButtons();
    if (S.timeUp) ui.boothMsg.textContent = 'Смена окончена. Нажмите «Завершить смену».';
  }, 1300);
}

function cite(reason) {
  S.citations++;
  G.stats.citations++;
  const penalty = S.citations > D.FREE_CITATIONS ? D.CITATION_PENALTY : 0;
  S.penalty += penalty;
  S.mistakes.push(reason);
  sfx.citation();
  const doc = citationDoc(reason, penalty);
  doc.classList.add('incoming');
  desk.add(doc, Math.max(0, ui.deskEl.clientWidth / 2 - 110), 20);
  doc.addEventListener('click', () => doc.remove());
  setTimeout(() => doc.remove(), 9000);
}

// ---------- inspection ----------

function setInspect(on) {
  if (!S) return;
  S.inspect = on;
  document.body.classList.toggle('inspecting', on);
  ui.btn.inspect.classList.toggle('on', on);
  clearSelection();
  if (on) {
    ui.inspectBar.className = '';
    ui.inspectBar.textContent = 'ПРОВЕРКА: выберите два связанных поля (Пробел — выход)';
  } else {
    ui.inspectBar.className = 'hidden';
  }
}

function clearSelection() {
  if (!S) return;
  for (const el of S.sel) el.classList.remove('sel', 'res-match', 'res-mismatch', 'res-none');
  S.sel = [];
  ui.overlay.innerHTML = '';
}

function fieldData(el) {
  return { kind: el.dataset.kind, val: el.dataset.val };
}

function selectField(el) {
  if (!el.dataset.val) return;
  if (S.sel.length === 2) clearSelection();
  if (S.sel.includes(el)) {
    el.classList.remove('sel');
    S.sel = S.sel.filter((x) => x !== el);
    return;
  }
  sfx.select();
  el.classList.add('sel');
  S.sel.push(el);
  if (S.sel.length < 2) {
    ui.inspectBar.className = '';
    ui.inspectBar.textContent = 'Выберите второе поле...';
    return;
  }
  const res = compareFields(fieldData(S.sel[0]), fieldData(S.sel[1]), S.today);
  for (const s of S.sel) s.classList.add(`res-${res.status}`);
  ui.inspectBar.className = `res-${res.status}`;
  ui.inspectBar.textContent = res.text;
  if (res.status === 'mismatch') {
    sfx.mismatch();
    const e = S.current;
    if (e && S.transcript && !S.decided) {
      const excuse = S.rng.pick(D.EXCUSES[res.excuse] || D.EXCUSES.forgery);
      transcriptLine(S.transcript, 'Инспектор', res.text.replace(/!$/, '') + '.');
      transcriptLine(S.transcript, 'Въезжающий', excuse);
      say(excuse);
    }
    if (res.wanted) ui.btn.detain.classList.add('pulse');
  } else if (res.status === 'match') {
    sfx.match();
  }
}

function drawSelectionLine() {
  if (!S || S.sel.length !== 2) return;
  const [a, b] = S.sel.map((el) => el.getBoundingClientRect());
  const status = S.sel[0].classList.contains('res-mismatch') ? 'mismatch' : S.sel[0].classList.contains('res-match') ? 'match' : 'none';
  ui.overlay.innerHTML = `<line class="${status}" x1="${a.left + a.width / 2}" y1="${a.top + a.height / 2}" x2="${b.left + b.width / 2}" y2="${b.top + b.height / 2}"/>`;
}

// ---------- end of day ----------

function endShift() {
  if (!S || S.current) return;
  setInspect(false);
  const earned = earnedToday();
  const available = G.money + earned;
  const list = bills(G.day, G.family);
  const rent = list.find((b) => b.required).cost;

  const mistakes = S.mistakes.length
    ? `<ul class="mistakes">${S.mistakes.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`
    : '<p class="small">Нарушений нет. Министерство довольно.</p>';

  const billRows = list
    .map(
      (b) => `<label class="bill"><input type="checkbox" data-id="${b.id}" data-cost="${b.cost}" ${b.required ? 'checked disabled' : 'checked'}>
        <span>${b.label}</span><span class="cost">−${b.cost}</span></label>`,
    )
    .join('');

  const fam = G.family
    .map((m) => `<li class="${m.alive ? '' : 'dead'}"><span>${m.name}</span><span>${memberStatus(m).join(', ')}</span></li>`)
    .join('');

  $('#summary').innerHTML = `
    <h2>ИТОГИ СМЕНЫ · ДЕНЬ ${G.day}</h2>
    <table class="ledger">
      <tr><td>Обработано: ${S.processed} × ${D.WAGE_PER_ENTRANT}</td><td>+${S.processed * D.WAGE_PER_ENTRANT}</td></tr>
      ${S.extra ? `<tr><td>Премии и «подарки»</td><td>+${S.extra}</td></tr>` : ''}
      <tr><td>Нарушения: ${S.citations} (${D.FREE_CITATIONS} без удержания)</td><td>${S.penalty ? `−${S.penalty}` : 0}</td></tr>
      <tr class="sum"><td>Итого за смену</td><td>${earned}</td></tr>
      <tr><td>Сбережения</td><td>${G.money}</td></tr>
      <tr class="sum"><td>Доступно</td><td>${available}</td></tr>
    </table>
    ${mistakes}
    <h3>Расходы</h3>
    <div class="bills">${billRows}</div>
    <div id="remain" class="remain"></div>
    <h3>Семья</h3>
    <ul class="family">${fam}</ul>
    <button id="btn-night" class="btn primary">Следующий день</button>`;

  const btn = $('#btn-night');
  const boxes = [...document.querySelectorAll('#summary .bill input')];
  const calc = () => boxes.reduce((s, b) => s - (b.checked ? Number(b.dataset.cost) : 0), available);
  const refresh = () => {
    const left = calc();
    $('#remain').textContent = `Остаток: ${left} кр.`;
    $('#remain').classList.toggle('neg', left < 0);
    if (available < rent) {
      btn.textContent = 'Нечем платить за жильё...';
      btn.disabled = false;
    } else {
      btn.disabled = left < 0;
      btn.textContent = left < 0 ? 'Не хватает денег' : 'Следующий день';
    }
  };
  boxes.forEach((b) => b.addEventListener('change', refresh));
  refresh();

  btn.addEventListener('click', () => {
    if (available < rent) return gameOver('debt');
    const paid = Object.fromEntries(boxes.map((b) => [b.dataset.id, b.checked]));
    G.money = calc();
    const news = passNight(G.family, paid);
    if (!G.family.some((m) => m.alive)) return gameOver('family');
    G.day++;
    if (G.day > D.LAST_DAY) return ending();
    persist();
    showNews(news);
  });

  S = null;
  showScreen('summary-screen');
}

function statsHtml() {
  const s = G.stats;
  return `<p class="small">Обработано: ${s.processed} · Нарушений: ${s.citations} · Задержано преступников: ${s.detained} · В кассе: ${G.money} кр.</p>`;
}

function gameOver(kind) {
  Save.clear();
  const text = {
    debt: 'Вам нечем платить за жильё. Семью выселили на улицу, а вас арестовали за долги перед государством.',
    family: 'Вы остались один. Пустая квартира, холодная плита и смены на КПП, потерявшие всякий смысл.',
  }[kind];
  $('#end').innerHTML = `<h2>КОНЕЦ</h2><p>${text}</p>${statsHtml()}<button id="btn-end" class="btn primary">В меню</button>`;
  $('#btn-end').addEventListener('click', showTitle);
  showScreen('end-screen');
}

function ending() {
  Save.clear();
  const dead = G.family.filter((m) => !m.alive).map((m) => m.name.toLowerCase());
  const family = dead.length
    ? `Но дома стало тише: с вами больше нет — ${dead.join(', ')}.`
    : 'Вся семья жива и ждёт вас к ужину. Это главное.';
  const verdict = G.stats.citations <= 6
    ? 'Министерство отмечает вашу безупречную службу и продлевает контракт.'
    : 'Министерство недовольно количеством нарушений, но контракт всё же продлён — людей не хватает.';
  $('#end').innerHTML = `
    <h2>АТТЕСТАЦИЯ ПРОЙДЕНА</h2>
    <p>Семь дней на КПП «Восточный» позади. ${verdict}</p>
    <p>${family}</p>
    ${statsHtml()}
    <p class="glory">СЛАВА КОРДОНИИ</p>
    <button id="btn-end" class="btn primary">В меню</button>`;
  $('#btn-end').addEventListener('click', showTitle);
  sfx.bell();
  showScreen('end-screen');
}

// ---------- loop & input ----------

let last = performance.now();

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (S && !S.paused) {
    S.elapsed += dt;
    if (!S.timeUp && S.elapsed >= S.length) {
      S.timeUp = true;
      sfx.bell();
      ui.boothMsg.textContent = S.current ? 'Смена окончена. Закончите с текущим въезжающим.' : 'Смена окончена. Нажмите «Завершить смену».';
      updateButtons();
    }
    updateHud();
    drawSelectionLine();
  }
  requestAnimationFrame(frame);
}

function setPaused(on) {
  if (!S) return;
  S.paused = on;
  $('#pause-overlay').classList.toggle('hidden', !on);
}

$('#game-screen').addEventListener(
  'pointerdown',
  (ev) => {
    if (!S || !S.inspect) return;
    const el = ev.target.closest('.fld');
    if (!el) return;
    ev.preventDefault();
    ev.stopPropagation();
    selectField(el);
  },
  true,
);

document.addEventListener('keydown', (ev) => {
  if (!S) return;
  if (ev.code === 'Space') {
    ev.preventDefault();
    setInspect(!S.inspect);
  } else if (ev.code === 'Escape') {
    if (S.paused) setPaused(false);
    else if (S.sel.length) clearSelection();
    else setInspect(false);
  } else if (ev.code === 'KeyP') {
    setPaused(!S.paused);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && S) setPaused(true);
});

window.addEventListener('resize', () => desk.clampAll());

$('#btn-new').addEventListener('click', newGame);
$('#btn-continue').addEventListener('click', continueGame);
$('#btn-start-shift').addEventListener('click', beginShift);
ui.btn.next.addEventListener('click', callNext);
ui.btn.purpose.addEventListener('click', () => ask('purpose'));
ui.btn.duration.addEventListener('click', () => ask('duration'));
ui.btn.inspect.addEventListener('click', () => setInspect(!S.inspect));
ui.btn.approve.addEventListener('click', () => applyStamp('approve'));
ui.btn.deny.addEventListener('click', () => applyStamp('deny'));
ui.btn.detain.addEventListener('click', detain);
ui.btn.ret.addEventListener('click', returnDocs);
$('#btn-pause').addEventListener('click', () => setPaused(true));
$('#btn-resume').addEventListener('click', () => setPaused(false));
$('#btn-quit').addEventListener('click', () => {
  $('#pause-overlay').classList.add('hidden');
  showTitle();
});

const soundBtn = $('#btn-sound');
function applySound(on) {
  sfx.setEnabled(on);
  soundBtn.textContent = on ? '🔊' : '🔇';
}
applySound(Save.soundOn());
soundBtn.addEventListener('click', () => {
  const on = soundBtn.textContent !== '🔊';
  Save.setSound(on);
  applySound(on);
});

// Buttons shouldn't keep keyboard focus, or Space would re-trigger them.
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (b) b.blur();
});

showTitle();
requestAnimationFrame(frame);
