import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PC, fmt } from './pc.js';
import { buildWorld } from './world.js';
import { loadModelBoss, makeModelBoss } from './boss.js';
import { Sfx } from './audio.js';
import { redraw, lcdState, standingSheetTex } from './textures.js';
import { CLIENTS, productByCode, makeOrder, sayItem, orderTotal, digitsWords, shortFio, makeStandingOrders, phoneClients, STANDING_COUNT } from './data.js';

const $ = (id) => document.getElementById(id);
const sfx = new Sfx();
const pad = (n) => String(n).padStart(2, '0');
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
const isTouch = matchMedia('(pointer: coarse)').matches;
const rub = (n) => `${fmt(n).replace(',00', '')} ₽`;
const DAY_ORDERS = 10;

// ---------- renderer ----------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe6ea);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const fovFor = (aspect) => (aspect < 1 ? 78 : 62);
const camera = new THREE.PerspectiveCamera(fovFor(innerWidth / innerHeight), innerWidth / innerHeight, 0.03, 80);
camera.rotation.order = 'YXZ';
scene.add(camera);

scene.add(new THREE.HemisphereLight(0xf4f6ff, 0x6f675c, 0.55));
const sun = new THREE.DirectionalLight(0xfff0d6, 2.6);
sun.position.set(-7.5, 4.0, 2.2);
sun.target.position.set(0, 0.7, -0.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -4.5, right: 4.5, top: 4.5, bottom: -4.5, near: 1, far: 20 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

// ---------- PC ----------
const pc = new PC();
const screenTex = new THREE.CanvasTexture(pc.canvas);
screenTex.colorSpace = THREE.SRGBColorSpace;
screenTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

try { await Promise.race([document.fonts.load('48px Caveat'), new Promise((r) => setTimeout(r, 2500))]); } catch { /* fall back */ }
const world = buildWorld(scene, { screenTex });
const { phone, mug, lamp, keyboard, bossPhone } = world;
let boss = world.boss;
// a real rigged model in office/models/ replaces the built-in one (see boss.js)
loadModelBoss(['models/alena.glb', 'models/alena.fbx']).then((obj) => {
  if (!obj) return;
  const mb = makeModelBoss(obj, world.bossStation);
  if (!mb) return;
  world.boss.group.visible = false;
  world.interactables.splice(world.interactables.indexOf(world.boss.group), 1);
  mb.group.userData.interact = 'boss';
  mb.group.userData.hint = 'Алёна Владимировна';
  world.interactables.push(mb.group);
  boss = mb;
});
[[-1.75, -0.35], [1.75, -0.35], [0, 1.8], [-0.2, 4.02], [-1.3, 6.6]].forEach(([x, z]) => {
  const l = new THREE.PointLight(0xf2f5ff, 2.2, 0, 2);
  l.position.set(x, 2.55, z);
  scene.add(l);
});
phone.handset.userData.interact = 'phone';
Object.values(world.held).forEach((m) => { m.visible = false; camera.add(m); });
world.held.coffee.position.set(0.2, -0.24, -0.45);
world.held.broom.position.set(0.32, -1.25, -0.55); world.held.broom.rotation.set(0.35, 0, -0.25);
world.held.report.position.set(0.16, -0.2, -0.4); world.held.report.rotation.set(-0.5, -0.2, 0.05);

// ---------- state ----------
const S = {
  mode: 'intro', yaw: 0, pitch: -0.28, locked: false,
  drag: null, pointer: null, hover: null, trans: null,
  pos: new THREE.Vector3(0, 0, 0.6), keys: new Set(), joy: { x: 0, y: 0 }, bob: 0,
  carry: null, coffee: 5, seat: 'own', tts: false,
};
const day = {
  phase: 'boot', generated: 0, done: 0, correct: 0, errors: 0, reprimands: 0, missed: 0,
  bossDone: 0, bossFailed: 0, calls: [], missedList: [], reportCount: -1, used: new Set(),
  standing: makeStandingOrders(), standingReviewed: false, forgiven: 0,
};
// where you can sit: your own chair and the visitor chair at the boss's desk
const SEATS = { own: { x: 0, z: 0, yaw0: 0, standAt: [0, 0.62] }, visit: { x: -2.05, z: 0.88, yaw0: 0.6, standAt: [-1.55, 1.32] } };
const seatChair = () => (S.seat === 'visit' ? world.visitChair : world.playerChair);
const EYE_SEATED = 1.2, EYE_STAND = 1.62;

function seatedPose() {
  const c = SEATS[S.seat];
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(S.pitch, S.yaw, 0, 'YXZ'));
  const lean = Math.max(0, -S.pitch) * 0.08;
  const p = new THREE.Vector3(c.x + Math.sin(S.yaw) * 0.05, EYE_SEATED - lean * 0.4, c.z + Math.cos(S.yaw) * 0.05);
  p.add(new THREE.Vector3(-Math.sin(S.yaw), 0, -Math.cos(S.yaw)).multiplyScalar(lean));
  return { p, q };
}
function standPose() {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(S.pitch, S.yaw, 0, 'YXZ'));
  return { p: new THREE.Vector3(S.pos.x, EYE_STAND + Math.sin(S.bob) * 0.025, S.pos.z), q };
}
function workPose() {
  const scr = world.screen;
  scr.updateMatrixWorld(true);
  const c = new THREE.Vector3().setFromMatrixPosition(scr.matrixWorld);
  const q = new THREE.Quaternion(); scr.getWorldQuaternion(q);
  const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const wide = camera.aspect > 1.3;
  // leave a right-hand column free for the call log and tasks
  const colFrac = wide ? Math.min(0.3, 300 / innerWidth) : 0;
  const viewH = Math.max(0.3206 / 0.74, 0.57 / (0.97 - colFrac) / camera.aspect);
  const dist = viewH / (2 * tanH);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  const p = c.clone().addScaledVector(n, dist).addScaledVector(up, Math.min(Math.max(0, (viewH - 0.3206) / 2 - 0.004), viewH * 0.08));
  p.addScaledVector(right, (colFrac / 2) * viewH * camera.aspect);
  return { p, q };
}
function startTrans(to, dur, done) {
  S.trans = { t: 0, from: { p: camera.position.clone(), q: camera.quaternion.clone() }, to, dur, done };
}

// ---------- speech synthesis (optional, browser voices) ----------
const tts = {
  voices: [],
  load() { try { this.voices = speechSynthesis.getVoices().filter((v) => /^ru/i.test(v.lang)); } catch { this.voices = []; } },
  available() { return typeof speechSynthesis !== 'undefined' && this.voices.length > 0; },
  speak(text, pitchHz, onEnd) {
    if (!this.available()) return false;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ru-RU';
      // pick a voice per speaker so the boss and clients sound different
      u.voice = this.voices[Math.round(pitchHz) % this.voices.length];
      u.pitch = Math.max(0.3, Math.min(2, pitchHz / 170));
      u.rate = 1.08;
      u.onend = onEnd; u.onerror = onEnd;
      speechSynthesis.speak(u);
      return true;
    } catch { return false; }
  },
  stop() { try { speechSynthesis?.cancel(); } catch { /* no speech */ } },
};
if (typeof speechSynthesis !== 'undefined') { tts.load(); speechSynthesis.onvoiceschanged = () => tts.load(); }

// ---------- subtitles / choices / call log ----------
const subsEl = $('subs');
const subQueue = [];
let subCurrent = null;
function say(who, text, o = {}) {
  return new Promise((resolve) => {
    subQueue.push({ who, text, ...o, resolve });
    if (!subCurrent) nextSub();
  });
}
function nextSub() {
  subCurrent = subQueue.shift() || null;
  if (!subCurrent) { if (!S.choices) subsEl.hidden = true; return; }
  const s = subCurrent;
  subsEl.hidden = false;
  subsEl.className = `subs ${s.cls || ''}`;
  $('subs-who').textContent = s.who || '';
  $('subs-who').hidden = !s.who;
  $('subs-text').textContent = s.text;
  if (!S.choices) $('subs-choices').innerHTML = '';
  let d = s.dur;
  const done = () => { if (s.finished) return; s.finished = true; clearTimeout(s.timer); s.onDone?.(); s.resolve(); nextSub(); };
  if (S.tts && s.voice && tts.speak(s.text, s.voice, done)) {
    // the line ends when the voice finishes; the timer is only a safety net
    s.timer = setTimeout(done, (4 + s.text.length * 0.12) * 1000);
    return;
  }
  if (s.voice) { const v = sfx.babble(s.text, s.voice, s.phoneVoice); d = d || Math.max(2, v + 0.9); }
  d = d || Math.max(2.2, s.text.length * 0.055);
  s.timer = setTimeout(done, d * 1000);
}
function clearSubs() {
  subQueue.splice(0).forEach((s) => s.resolve());
  tts.stop();
  if (subCurrent) { clearTimeout(subCurrent.timer); subCurrent.finished = true; subCurrent.resolve(); }
  subCurrent = null;
  subsEl.hidden = true;
}
// choices: labels may be functions (re-evaluated while waiting). Resolves with the index or -1 on timeout.
function ask(options, { timeout } = {}) {
  return new Promise((resolve) => {
    const box = $('subs-choices');
    box.innerHTML = '';
    subsEl.hidden = false;
    if (!subCurrent) { $('subs-who').hidden = true; $('subs-text').textContent = 'Ваша реплика:'; }
    const btns = options.map((label, i) => {
      const b = document.createElement('button');
      b.className = 'choice';
      b.onclick = (e) => { e.stopPropagation(); finish(i); };
      box.appendChild(b);
      return b;
    });
    // in 1C the digit keys type into fields, so replies there go on F1–F4
    const render = () => btns.forEach((b, i) => { const l = options[i]; b.innerHTML = `<kbd>${S.mode === 'work' ? 'F' : ''}${i + 1}</kbd> ${typeof l === 'function' ? l() : l}`; });
    render();
    const iv = setInterval(render, 300);
    let to = null;
    if (timeout) {
      const bar = document.createElement('div'); bar.className = 'choice-timer'; bar.style.animationDuration = `${timeout}s`; box.appendChild(bar);
      to = setTimeout(() => finish(-1), timeout * 1000);
    }
    const finish = (i) => {
      clearInterval(iv); clearTimeout(to);
      S.choices = null; box.innerHTML = '';
      const label = i >= 0 ? options[i] : null;
      resolve({ i, text: typeof label === 'function' ? label() : label });
    };
    S.choices = { options, finish };
  });
}
function choose(i) { if (S.choices && i < S.choices.options.length) S.choices.finish(i); }

let notifyT;
function notify(text, kind = 'good') {
  const el = $('notify');
  el.textContent = text;
  el.className = `notify ${kind} show`;
  clearTimeout(notifyT);
  notifyT = setTimeout(() => (el.className = 'notify'), 3600);
}

// ---------- tasks ----------
const tasks = [];
function addTask(id, text, seconds, onFail) {
  removeTask(id);
  tasks.push({ id, text, deadline: seconds ? performance.now() + seconds * 1000 : null, onFail });
  renderTasks();
}
function removeTask(id) { const i = tasks.findIndex((t) => t.id === id); if (i >= 0) tasks.splice(i, 1); renderTasks(); }
const hasTask = (id) => tasks.some((t) => t.id === id);
function renderTasks() {
  const ul = $('task-list');
  ul.innerHTML = '';
  $('tasks').hidden = !tasks.length;
  const now = performance.now();
  tasks.forEach((t) => {
    const li = document.createElement('li');
    let timer = '';
    if (t.deadline) {
      const left = Math.max(0, Math.ceil((t.deadline - now) / 1000));
      timer = `<span class="timer ${left <= 15 ? 'hot' : ''}">${Math.floor(left / 60)}:${pad(left % 60)}</span>`;
    }
    li.innerHTML = `<span class="box" aria-hidden="true"></span><span>${t.text}</span>${timer}`;
    ul.appendChild(li);
  });
}
function renderStats() {
  $('st-orders').textContent = `${day.done}/${DAY_ORDERS}`;
  $('st-standing').textContent = `${STANDING_COUNT - day.standing.filter((st) => !st.entered).length}/${STANDING_COUNT}`;
  $('st-err').textContent = String(day.errors);
  $('st-rep').textContent = String(day.reprimands);
}

// ---------- boss ----------
// head turn (in her local frame) that points her face at the camera
const _v = new THREE.Vector3();
function lookYaw() {
  _v.copy(camera.position);
  boss.group.worldToLocal(_v);
  return THREE.MathUtils.clamp(Math.atan2(-_v.x, -(_v.z - 0.05)), -1.15, 1.15);
}
const bossS = { wave: 0, waveT: 0, phone: 0, onPhone: false, summon: null, task: null, typing: true, pause: 0, nextCall: 0, lookUntil: 0, clients: new Set() };
const bossSayReal = (...a) => bossSay(...a);
function bossSay(text, o = {}) {
  bossS.lookUntil = performance.now() + 6000;
  bossS.pause = performance.now() + 5000;
  return say('Алёна Владимировна', text, { voice: 225, ...o, onDone: () => { bossS.lookUntil = performance.now() + 800; o.onDone?.(); } });
}
function reprimand(reason) {
  day.reprimands++;
  renderStats();
  notify(`Выговор: ${reason}`, 'bad');
}
function summon(errors, call) {
  bossS.summon = { kind: 'scold', errors, call };
  bossS.wave = 1; bossS.waveT = performance.now() + 4000;
  bossSay(pick(['Так. А ну-ка подойди ко мне. Садись на стул.', 'Подойди ко мне, пожалуйста. Сейчас. Стул у стола.', 'Иди-ка сюда, присаживайся. Поговорим.']));
  addTask('summon', 'Сесть на стул у стола Алёны Владимировны', 60, () => {
    bossSay('Я долго ждать буду?! Ладно, потом поговорим.');
    reprimand('не подошёл к начальнице');
    bossS.summon = null;
  });
}

// ---------- the dressing-down: she talks, you pick replies, the tone decides the outcome ----------
const SCOLD = {
  open: ['Садись. Разговор есть.', 'Ну что, рассказывай, как так вышло.', 'Сядь. И не смотри на меня так.', 'Я тебя долго не задержу. Наверное.', 'Так. Посмотри мне в глаза.', 'Садись-садись. Сейчас будем разбираться.', 'Ну здравствуй. Опять ты.'],
  kinds: {
    surname: { says: ['Ты клиента чужой фамилией назвал. Люди обижаются!', 'Сверка фамилии — это не формальность. А ты её провалил.', 'Человек двадцать лет у нас заказывает, а ты его перепутал.'],
      replies: [['Перепутал строчки в справочнике.', 'excuse'], ['Извините, буду внимательнее.', 'sorry'], ['Фамилии у них все похожие!', 'blame'], ['Буду читать фамилию прямо с экрана.', 'fix'], ['Я проверял, честно.', 'excuse']] },
    qty: { says: ['Количество не то. Магазин получит не столько, сколько просил.', 'Цифры! Ты путаешь цифры. Это хлеб, а не лотерея.', 'Там не хватит хлеба на полдня. Или останется гора. Оба варианта плохие.'],
      replies: [['Клиент быстро диктовал.', 'excuse'], ['Виноват, не перепроверил.', 'sorry'], ['Это 1Ц само поменяло!', 'blame'], ['Буду говорить «угу» только когда записал.', 'fix'], ['Клавиатура залипает.', 'blame']] },
    missing: { says: ['Ты позицию потерял. Машина уедет без неё.', 'Клиент заказывал, а в заявке этого нет. Как так?', 'Мне уже звонили: где их булочки?'],
      replies: [['Не расслышал эту позицию.', 'excuse'], ['Простите, моя ошибка.', 'sorry'], ['Может, клиент и не заказывал?', 'blame'], ['Буду переспрашивать, если не расслышал.', 'fix']] },
    extra: { says: ['В заявке лишнее. Клиент этого не заказывал — и не оплатит.', 'Откуда там взялась лишняя строка?', 'Магазин вернёт товар, а списывать кто будет?'],
      replies: [['Рука дрогнула.', 'joke'], ['Извините, уберу.', 'sorry'], ['Клиент сказал, потом передумал.', 'excuse'], ['Буду проверять таблицу перед записью.', 'fix']] },
    sum: { says: ['Сумму ты назвал неправильную. Клиент потом со мной спорил.', 'Сумма заказа — это то, что клиент запоминает. А ты её перепутал.', 'Клиент пересчитал на калькуляторе. У него вышло по-другому. У него — правильно.'],
      replies: [['Я назвал сумму до того, как всё ввёл.', 'excuse'], ['Виноват.', 'sorry'], ['Калькулятор врёт!', 'blame'], ['Буду называть сумму, когда всё записано.', 'fix']] },
    silent: { says: ['Клиент тебе «алло-алло», а ты молчишь. Это что было?', 'Ты молчал в трубку. Клиент решил, что связь оборвалась.', 'Надо отвечать клиенту. Хотя бы «угу».'],
      replies: [['Я вводил и не успел ответить.', 'excuse'], ['Простите, задумался.', 'sorry'], ['Там связь плохая.', 'blame'], ['Буду отвечать сразу, даже если ещё пишу.', 'fix']] },
    hangup: { says: ['Ты бросил трубку посреди разговора!', 'Кто же кладёт трубку, пока клиент диктует?', 'Клиент перезвонил мне. Злой.'],
      replies: [['Трубка выскользнула.', 'excuse'], ['Извините, больше не повторится.', 'sorry'], ['Он сам бросил!', 'blame'], ['Перезвоню ему и извинюсь.', 'fix']] },
    code: { says: ['Ты записал заявку не на того клиента. Код не тот!', 'Заявка ушла в чужой магазин. Код клиента проверять надо.'],
      replies: [['Цифры перепутал.', 'excuse'], ['Простите, исправлю.', 'sorry'], ['У них коды одинаковые!', 'blame'], ['Буду повторять код вслух.', 'fix']] },
    generic: { says: ['В заявке ошибки. Опять.', 'Так работать нельзя.'],
      replies: [['Извините.', 'sorry'], ['Так получилось.', 'excuse'], ['Это не я.', 'blame'], ['Исправлюсь.', 'fix']] },
  },
  react: {
    sorry: ['Извинения принимаются. Ошибки — нет.', 'Ну хоть признаёшь.', 'Хорошо, что понимаешь.', 'Ладно, вижу, что стыдно.'],
    excuse: ['Всегда у тебя причина.', 'Клиенту всё равно почему. Ему нужен хлеб.', 'Это не оправдание, это описание проблемы.', 'У всех клиенты быстро диктуют. Все успевают.'],
    blame: ['Не надо валить на других. Отвечаешь ты.', 'Ах, программа виновата? А меня кто спросит?', 'Интересно. А кроме тебя тут точно никто не виноват?'],
    joke: ['Смешно. Мне не смешно.', 'Шутить будешь на корпоративе.', 'Очень остроумно. Запишу в характеристику.'],
    fix: ['Вот это правильный разговор.', 'Посмотрим. Я запомню.', 'Хорошо. Проверю.', 'Вот. Можешь же думать головой.'],
    silent: ['Молчишь? Ну молчи.', 'Молчание — знак согласия.', 'Язык проглотил?'],
  },
  q2: [
    ['А если клиент завтра позвонит ругаться — что скажешь?', [['Извинюсь и всё исправлю.', 'fix'], ['Переключу на вас.', 'blame'], ['Скажу, что связь плохая была.', 'excuse'], ['Предложу скидку.', 'joke']]],
    ['Ты понимаешь, что машина уже грузится по твоей заявке?', [['Понимаю. Сейчас всё перепроверю.', 'fix'], ['Может, водитель заметит?', 'blame'], ['Можно я позвоню на склад?', 'fix'], ['Ну… хлеб всё равно съедят.', 'joke']]],
    ['И что мне с тобой делать?', [['Дать ещё шанс.', 'sorry'], ['Не лишать премии.', 'joke'], ['Показать, как правильно.', 'fix'], ['Ничего не делать.', 'blame']]],
    ['Сколько раз я говорила: проверяй перед записью?', [['Много. Буду проверять.', 'fix'], ['Ни разу, если честно.', 'blame'], ['Запишу себе на стикер.', 'fix'], ['Я думал, это совет.', 'joke']]],
    ['Ты вообще хочешь здесь работать?', [['Хочу. Правда.', 'sorry'], ['Смотря какая премия.', 'joke'], ['Хочу и буду стараться.', 'fix'], ['А есть варианты?', 'blame']]],
  ],
  close: {
    forgive: ['Ладно. На первый раз без выговора. Иди работай.', 'Хорошо, прощаю. Но я слежу.'],
    normal: ['Выговор. Иди работай.', 'Запишу замечание. Всё, свободен.', 'Иди. И чтобы больше такого не было.'],
    harsh: ['Два замечания. За ошибку и за отговорки.', 'Вот тебе выговор. И ещё один — за «это не я».'],
  },
};
const TONE_SCORE = { sorry: 1, fix: 2, excuse: 0, joke: -1, blame: -2, silent: -1 };
function classify(e) {
  if (/фамили/i.test(e)) return 'surname';
  if (/записано/i.test(e)) return 'qty';
  if (/Нет позиции/i.test(e)) return 'missing';
  if (/Лишняя/i.test(e)) return 'extra';
  if (/сумм/i.test(e)) return 'sum';
  if (/Не ответил|Молчал/i.test(e)) return 'silent';
  if (/Бросил/i.test(e)) return 'hangup';
  if (/код/i.test(e)) return 'code';
  return 'generic';
}
async function scold() {
  const { errors, call } = bossS.summon;
  bossS.summon = null;
  removeTask('summon');
  S.scolding = true;
  try {
    await bossSay(pick(SCOLD.open));
    if (call?.repeats >= 2) await bossSay('И ещё ты всё время переспрашиваешь. Слушай внимательнее.');
    await bossSay(call ? `Звонил клиент ${call.client.code}, ${shortFio(call.client.fio)}.` : `Проверила утренние заказы с листа. Ошибок: ${errors.length}.`);
    const K = SCOLD.kinds[classify(errors[0])];
    await bossSay(`${errors[0]}.`);
    await bossSay(pick(K.says));
    if (errors.length > 1) await bossSay(`И это не всё: ${errors[1].charAt(0).toLowerCase()}${errors[1].slice(1)}.`);
    let score = 0;
    const round = async (opts) => {
      const list = [...shuffle(opts).slice(0, 3), ['(промолчать)', 'silent']];
      const r = await ask(list.map((o) => o[0]), { timeout: 15 });
      const [text, tone] = r.i < 0 ? ['', 'silent'] : list[r.i];
      if (tone !== 'silent') await say('Вы', text, { voice: 165, cls: 'me', dur: Math.max(1.4, text.length * 0.05) });
      score += TONE_SCORE[tone];
      await bossSay(pick(SCOLD.react[tone]));
    };
    await round(K.replies);
    const [q, opts] = pick(SCOLD.q2);
    await bossSay(q);
    await round(opts);
    if (score >= 3 && day.forgiven < 1) { day.forgiven++; await bossSay(pick(SCOLD.close.forgive)); notify('Начальница простила — без выговора'); }
    else if (score < 0) { await bossSay(pick(SCOLD.close.harsh)); reprimand('ошибка в заявке'); reprimand('отговорки'); await punishChore(); }
    else { await bossSay(pick(SCOLD.close.normal)); reprimand('ошибка в заявке'); if (Math.random() < 0.6) await punishChore(); }
  } finally { S.scolding = false; }
}
// too many «повторите» in one call: a talk without a reprimand, sometimes a chore
function summonEducate(call) {
  if (bossS.summon) return;
  bossS.summon = { kind: 'educate', call };
  bossS.wave = 1; bossS.waveT = performance.now() + 4000;
  bossSay(pick(['Подойди-ка ко мне на минутку. Садись на стул.', 'Зайди ко мне, поговорим. Стул сбоку.']));
  addTask('summon', 'Сесть на стул к Алёне Владимировне', 60, () => {
    bossSay('Не пришёл? Ну ладно. Я запомнила.');
    reprimand('не подошёл к начальнице');
    bossS.summon = null;
  });
}
const EDU = {
  open: ['Садись. Я слышала твой разговор.', 'Садись. Давай про телефон поговорим.', 'Присядь. Ты клиента заставил повторять.'],
  point: [`Клиент диктовал тебе два раза. Он занятой человек.`, 'Когда переспрашиваешь постоянно, клиент думает, что мы тут спим.', 'Переспросить можно. Но не на каждой строчке.'],
  replies: [['Понятно, Алёна Владимировна.', 'sorry'], ['Они очень быстро диктуют.', 'excuse'], ['Связь плохая, не слышно.', 'blame'], ['Буду вводить быстрее.', 'fix']],
  tips: ['Вводи код товара: сто один — белый, сто два — чёрный. Так быстрее, чем искать по названию.', 'Сначала дослушай строчку, потом вводи. И говори «угу», только когда записал.', 'Держи руку на Enter: товар, Enter, количество, Enter. Не надо мышкой.'],
  chores: [['coffee', 'А чтобы проснуться — сделай-ка мне кофе. Капучино. Кухня по коридору налево.'], ['sweep', 'А в наказание иди подмети крошки в коридоре. Веник в конце коридора.'], ['window', 'И открой окно у меня за спиной — тебе проветриться не помешает.']],
};
// chores are only ever a punishment for careless listening or typing
async function punishChore() {
  if (bossS.task) return;
  const [kind, line] = pick(EDU.chores.filter(([k]) => k !== day.lastChore));
  day.lastChore = kind;
  await bossSay(kind === 'window' && world.window.open ? 'А в наказание — закрой окно, дует.' : line);
  giveBossTask(kind, true);
  await ask(['Понятно, Алёна Владимировна.'], { timeout: 12 });
  await say('Вы', 'Понятно, Алёна Владимировна.', { voice: 165, cls: 'me', dur: 1.6 });
}
async function educate() {
  const { call } = bossS.summon;
  bossS.summon = null;
  removeTask('summon');
  S.scolding = true;
  try {
    await bossSay(pick(EDU.open));
    await bossSay(pick(EDU.point));
    const list = [...shuffle(EDU.replies).slice(0, 3)];
    const r = await ask(list.map((o) => o[0]), { timeout: 15 });
    const [text, tone] = r.i < 0 ? ['', 'silent'] : list[r.i];
    if (tone !== 'silent') await say('Вы', text, { voice: 165, cls: 'me', dur: 1.6 });
    await bossSay(pick(SCOLD.react[tone]));
    if (tone === 'blame') { await bossSay('Связь у всех одинаковая. Выговор за отговорки.'); reprimand('отговорки'); }
    await bossSay(pick(EDU.tips));
    await ask(['Понятно, Алёна Владимировна.'], { timeout: 12 });
    await say('Вы', 'Понятно, Алёна Владимировна.', { voice: 165, cls: 'me', dur: 1.6 });
    if (Math.random() < 0.5) await punishChore();
    await bossSay(pick(['Всё, иди работай.', 'Иди. И внимательнее.']));
  } finally { S.scolding = false; }
  void call;
}
// morning: she gives the plan for the day
async function briefing() {
  S.scolding = true;
  bossS.summon = null;
  removeTask('brief');
  const ok = async () => { await ask(['Понятно, Алёна Владимировна.'], { timeout: 20 }); await say('Вы', 'Понятно, Алёна Владимировна.', { voice: 165, cls: 'me', dur: 1.6 }); };
  try {
    await bossSay('Доброе утро. Садись.');
    const r = await ask(['Доброе утро, Алёна Владимировна.', 'Здравствуйте.'], { timeout: 20 });
    await say('Вы', r.i === 1 ? 'Здравствуйте.' : 'Доброе утро, Алёна Владимировна.', { voice: 165, cls: 'me', dur: 1.6 });
    await bossSay('Сегодня двадцать постоянных заказов — лист у тебя на столе. Вводишь их первыми.');
    await ok();
    await bossSay('Потом пойдут звонки. Твои — десять. Код клиента, сверяешь фамилию, записываешь, в конце называешь сумму.');
    const q = await ask(['Понятно, Алёна Владимировна.', 'А если не расслышу?'], { timeout: 20 });
    if (q.i === 1) {
      await say('Вы', 'А если не расслышу?', { voice: 165, cls: 'me', dur: 1.4 });
      await bossSay('Переспроси: «повторите, пожалуйста». Но не злоупотребляй — клиенты этого не любят.');
      await ok();
    } else await say('Вы', 'Понятно, Алёна Владимировна.', { voice: 165, cls: 'me', dur: 1.6 });
    await bossSay('Всё. Иди работай. Пароль от 1Ц — на стикере.');
    day.briefed = true;
    addTask('standing', `Утренние заказы с листа: ${STANDING_COUNT - standingLeft()}/${STANDING_COUNT}`, 0);
    $('sheet').hidden = false; $('sheet').classList.remove('collapsed');
    if (day.phase === 'calls') phoneS.nextRing = performance.now() + 150000;
  } finally { S.scolding = false; }
}
function talkAtDesk() {
  if (bossS.summon?.kind === 'scold') scold();
  else if (bossS.summon?.kind === 'educate') educate();
  else if (!day.briefed) briefing();
  else chatAtDesk();
}
async function chatAtDesk() {
  S.scolding = true;
  try {
    await bossSay(pick(['Что-то хотел?', 'Слушаю тебя.', 'Ну? Садись, раз пришёл.']));
    const opts = [['Когда премия?', 'Когда заявки будут без ошибок.'], ['Можно пораньше уйти?', 'Можно. Завтра. Если сводку сдашь.'], ['Как у вас дела?', 'Дела — у прокурора. У меня заявки.'], ['Просто присел отдохнуть.', 'Отдыхать будешь в обед. Иди на место.']];
    const r = await ask([...opts.map((o) => o[0]), 'Ничего, извините.'], { timeout: 12 });
    if (r.i >= 0 && r.i < opts.length) { await say('Вы', opts[r.i][0], { voice: 165, cls: 'me', dur: 1.6 }); await bossSay(opts[r.i][1]); }
    else await bossSay('Тогда иди работай.');
  } finally { S.scolding = false; }
}

const BOSS_CHAT = [
  ['Отдел заявок, Алёна Владимировна.', 'Да, Виктор Павлович… Да, все заявки примем до двух.', 'Хорошо. До свидания.'],
  ['Алёна Владимировна слушает.', 'Нет, машина на Ленина задерживается, я предупредила.', 'Да. Всё. Пока.'],
  ['Отдел заявок.', 'Светочка, привет! Нет, сейчас не могу, у нас звонки.', 'Вечером наберу. Целую.'],
];
let bossChatIdx = 0;
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
function freePhoneClient() {
  const busy = new Set([...day.calls.map((c) => c.client), ...bossS.clients]);
  const free = phoneClients().filter((c) => !busy.has(c));
  return free.length ? pick(free) : pick(phoneClients());
}
// she takes orders too: they land in the same 1C base and in the evening report
async function bossPhoneCall() {
  bossS.onPhone = true;
  for (let i = 0; i < 2; i++) { sfx.ringOnce(0.02, 900, 1100); await wait(2600); }
  bossS.phoneTarget = 1;
  sfx.pickup();
  const who = 'Алёна Владимировна (по телефону)';
  const line = async (l) => { bossS.pause = performance.now() + 4000; await say(who, l, { voice: 225, cls: 'dim' }); };
  if (day.phase === 'calls' && Math.random() < 0.7) {
    const client = freePhoneClient();
    bossS.clients.add(client);
    const items = makeOrder().slice(0, 3);
    await line('Хлебзавод, отдел заявок.');
    await line(`Да, слушаю… ${client.code}. ${client.surname}? Добрый день.`);
    for (const it of items) { await line(`${cap(productByCode(it.code).gen)} ${it.qty} — угу.`); bossS.typeT = performance.now() + 2500; }
    await line(`Сумма заказа составляет ${rub(orderTotal(items))}. До свидания!`);
    pc.addExternalOrder(client.code, items, 'Алёна В.');
    day.bossOrders = (day.bossOrders || 0) + 1;
  } else {
    for (const l of BOSS_CHAT[bossChatIdx++ % BOSS_CHAT.length]) await line(l);
  }
  bossS.phoneTarget = 0;
  await wait(600);
  sfx.hangup();
  bossS.onPhone = false;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// boss chores with timers
function giveBossTask(forced, quiet = false) {
  const opts = ['coffee', 'sweep', 'window'].filter((t) => !(t !== 'window' && day.used.has(t)));
  const kind = forced || pick(opts);
  const bossSay = quiet ? () => {} : bossSayReal;
  day.used.add(kind);
  bossS.task = kind;
  const fail = (why) => () => { bossS.task = null; day.bossFailed++; bossSayReal(why); reprimand('не выполнено поручение'); if (kind === 'sweep') cleanupSweep(false); };
  if (kind === 'window') {
    const open = world.window.open;
    bossS.windowWant = !open;
    bossSay(open ? 'Дует! Закрой окно, пожалуйста.' : 'Душно. Открой окно, пожалуйста — то, что у меня за спиной.');
    addTask('boss', open ? 'Закрыть окно' : 'Открыть окно', 45, fail('Окно так и не сделал. Всё сама, всё сама…'));
  } else if (kind === 'coffee') {
    bossSay('Сделай мне кофе, пожалуйста. Кофемашина на кухне, по коридору налево. Капучино.');
    addTask('boss', 'Сделать кофе Алёне Владимировне', 150, fail('Где мой кофе? Всё, уже не надо.'));
  } else {
    bossSay('В коридоре крошки — опять пекари натаскали. Подмети, пожалуйста, скоро директор пойдёт. Веник в конце коридора.');
    world.crumbs.forEach((c) => (c.visible = true));
    addTask('boss', 'Подмести крошки в коридоре (5)', 150, fail('Директор прошёл по крошкам. Спасибо тебе огромное.'));
  }
}
function bossTaskDone(text) {
  removeTask('boss');
  bossS.task = null;
  day.bossDone++;
  notify(`Поручение выполнено: ${text}`);
}
function cleanupSweep(done) {
  world.crumbs.forEach((c) => (c.visible = false));
  if (S.carry === 'broom') setCarry(null);
  world.broomInStand.visible = true;
  if (done) bossTaskDone('пол подметён');
}

// ---------- carrying ----------
function setCarry(what) {
  S.carry = what;
  Object.entries(world.held).forEach(([k, m]) => (m.visible = k === what));
  $('carry').hidden = !what;
  $('carry').textContent = what ? `В руках: ${{ coffee: 'кофе для начальницы', broom: 'веник', report: 'сводка заявок' }[what]}` : '';
}

// ---------- phone & calls ----------
const phoneS = { state: 'idle', ringStart: 0, lastRing: 0, call: null, holding: false, anim: null, nextRing: 0 };
function updateLcd(extra = {}) {
  const now = new Date();
  const st = { line1: `${pad(now.getHours())}:${pad(now.getMinutes())}   ${pad(now.getDate())}.${pad(now.getMonth() + 1)}`, line2: day.missedList.length ? `Пропущ.: ${day.missedList.length}` : 'Отдел заявок', ...extra };
  if (phoneS.state === 'ringing') { st.line2 = 'Вх. вызов…'; st.backlight = true; }
  if (phoneS.state === 'call') { st.line2 = phoneS.call ? `Разговор ${phoneS.call.client.code}` : 'Разговор'; st.backlight = true; }
  if (phoneS.state === 'offhook') { st.line2 = 'Набор номера'; st.backlight = true; }
  lcdState(phone.topTex, st);
}
function newCall() {
  const client = freePhoneClient();
  day.generated++;
  const call = { id: day.generated, client, items: makeOrder(), askConfirm: day.generated % 5 === 3 || Math.random() < 0.12, errors: [], ended: false, savedOrder: null, evaluated: false, spokenSum: null };
  call.expected = orderTotal(call.items);
  day.calls.push(call);
  return call;
}
function startRinging(call) {
  phoneS.state = 'ringing';
  phoneS.call = call;
  phoneS.ringStart = performance.now();
  phoneS.lastRing = 0;
  $('ring').hidden = false;
  updateLcd();
}
function missCall() {
  const call = phoneS.call;
  phoneS.state = 'idle'; phoneS.call = null;
  $('ring').hidden = true;
  phone.handset.position.copy(phone.rest.pos);
  call.missed = true;
  day.missed++;
  day.missedList.push(call);
  updateLcd();
  scheduleRing();
  bossSay(pick(['У тебя пропущенный! Перезвони клиенту, быстро.', 'Телефон звонил — ты где ходишь? Перезвони!']));
  addTask('callback', 'Перезвонить на пропущенный', 120, () => { reprimand('не перезвонил клиенту'); bossSay('Клиент дозвонился мне. Мне! Перезвони наконец.'); addTask('callback', 'Перезвонить на пропущенный', 0); });
}
function scheduleRing() { phoneS.nextRing = performance.now() + rand(22, 45) * 1000; }

const ABORT = Symbol('abort');
const guard = (call) => { if (call.aborted) throw ABORT; };
function callerSay(call, text, o = {}) {
  guard(call);
  const who = call.verifiedName ? `${call.client.surname} (${call.client.code})` : `Клиент ${call.client.code}`;
  return say(who, text, { voice: call.client.female ? 205 : 120, phoneVoice: true, cls: 'phone', log: true, ...o }).then(() => guard(call));
}
function meSay(call, text, dur) {
  guard(call);
  return say('Вы', text, { voice: 165, dur: dur || Math.max(1.4, text.length * 0.045), cls: 'me', log: true, logCls: 'me' }).then(() => guard(call));
}
function currentSum(call) {
  if (pc.form.rows.length) return pc.formTotal();
  if (call.savedOrder) return call.savedOrder.total;
  return 0;
}
async function runCall(call, callback) {
  const c = call.client;
  if (callback) {
    sfx.dtmf(6); sfx.ringback();
    await wait(4200); guard(call);
    await callerSay(call, 'Алло?');
    await ask(['Хлебзавод, отдел заявок. Вы нам звонили?']);
    await meSay(call, 'Хлебзавод, отдел заявок. Вы нам звонили?');
    await callerSay(call, `Да-да, звонили! Это ${c.code}.`);
  } else {
    await ask(['Хлебзавод.']);
    await meSay(call, 'Хлебзавод.');
    await callerSay(call, pick([`Добрый день, ${c.code}.`, `Здравствуйте, ${c.code}.`, `Алло, хлебзавод? Добрый день, ${c.code}.`]));
  }
  // verification: the caller's surname is only in 1C
  const others = shuffle(CLIENTS.filter((k) => k !== c && k.female === c.female)).slice(0, 2);
  const names = shuffle([c, ...others]);
  for (;;) {
    const r = await ask([...names.map((k) => `${k.surname}?`), 'Повторите код, пожалуйста.']);
    guard(call);
    if (r.i === names.length || r.i < 0) {
      call.repeats = (call.repeats || 0) + 1;
      await meSay(call, 'Повторите код, пожалуйста.');
      await callerSay(call, `${digitsWords(c.code)}. ${c.code}.`);
      continue;
    }
    await meSay(call, r.text);
    call.verifiedName = true;
    if (names[r.i] === c) await callerSay(call, pick(['Да, это я.', 'Да-да.', 'Верно.', `Да, ${c.surname}.`]));
    else {
      call.errors.push(`При сверке назвал фамилию «${names[r.i].surname}», а это ${c.surname}`);
      await callerSay(call, `Какая ${names[r.i].surname}? Я ${c.surname}! Вы там проснитесь.`);
    }
    break;
  }
  // dictation: the caller waits for your «угу» before the next line
  await callerSay(call, pick(['Записывайте.', 'Пишите заявку на завтра.', 'Так, записывайте.']));
  const ack = async (i, repeatLine) => {
    let nudged = false;
    for (;;) {
      const r = await ask(['Угу.', 'Так, записал.', 'Повторите, пожалуйста.'], { timeout: 14 });
      guard(call);
      if (r.i === 2) { call.repeats = (call.repeats || 0) + 1; await meSay(call, r.text, 0.9); await callerSay(call, repeatLine(), { dur: 2.8 }); continue; }
      if (r.i < 0) {
        if (!nudged) { nudged = true; await callerSay(call, pick(['Алло? Вы записываете?', 'Алло, вы там?', 'Успеваете?'])); continue; }
        call.errors.push('Молчал в трубку, пока клиент диктовал');
        await callerSay(call, 'Ладно, диктую дальше, как хотите.');
        return;
      }
      await meSay(call, r.text, 0.8);
      return;
    }
  };
  for (let i = 0; i < call.items.length; i++) {
    const line = sayItem(call.items[i]);
    await callerSay(call, line, { dur: 2.8 });
    await ack(i, () => pick([`Повторяю: ${line.charAt(0).toLowerCase()}${line.slice(1)}`, line]));
  }
  // about one call in five also asks for a final check
  if (call.askConfirm) {
    await callerSay(call, 'Всё записали?');
    const r = await ask(['Да, всё записал.', 'Повторите всё, пожалуйста.'], { timeout: 8 });
    guard(call);
    if (r.i < 0) {
      call.errors.push('Не ответил клиенту на вопрос «Записали?»');
      await callerSay(call, 'Алло! Вы меня слышите вообще? Ладно.');
    } else if (r.i === 1) {
      call.repeats = (call.repeats || 0) + 1;
      await meSay(call, r.text);
      await callerSay(call, 'Повторяю.');
      for (const it of call.items) await callerSay(call, sayItem(it), { dur: 2.8 });
    } else await meSay(call, r.text);
  }
  await callerSay(call, pick(['Всё. Сколько получается?', 'Это всё. На какую сумму?', 'Всё на завтра. Сумму скажите.']));
  // the sum is read from the order form as it is right now
  for (;;) {
    const r = await ask([() => `Сумма заказа составляет ${rub(currentSum(call))}.`, 'Секунду, проверяю…']);
    guard(call);
    if (r.i === 1) { await meSay(call, 'Секунду, проверяю…'); await wait(2500); guard(call); await callerSay(call, 'Жду.'); continue; }
    call.spokenSum = currentSum(call);
    await meSay(call, `Сумма заказа составляет ${rub(call.spokenSum)}.`);
    break;
  }
  if (call.spokenSum === call.expected) await callerSay(call, pick(['Да, всё верно. До свидания!', 'Правильно, у меня так же. Спасибо, до свидания!']));
  else if (call.spokenSum === 0) { call.errors.push('Не назвал сумму заказа'); await callerSay(call, 'Ноль?! Вы ничего не записали? Ну… до свидания.'); }
  else { call.errors.push(`Назвал сумму ${rub(call.spokenSum)}, а по заявке выходит ${rub(call.expected)}`); await callerSay(call, 'Хм… у меня по прайсу по-другому выходит. Ладно, до свидания.'); }
  await ask(['До свидания!']);
  await meSay(call, 'До свидания!');
  call.ended = true;
  hangUp(true);
  afterCall(call);
  if (call.savedOrder) evaluate(call);
  else addTask(`save${call.id}`, `Записать заявку ${c.code} в 1Ц (Ctrl+Enter)`, 0);
}
// how she reacts to «повторите» after a call
function afterCall(call) {
  const n = call.repeats || 0;
  if (n === 1) setTimeout(() => { if (!bossS.summon) bossSay(pick(['Будь внимательнее — клиенты не любят повторять.', 'Слушай внимательнее, пожалуйста.', 'Переспросил — ладно. Но старайся с первого раза.'])); }, 3500);
  else if (n >= 2) setTimeout(() => summonEducate(call), 3500);
}
function answer() {
  const call = phoneS.call;
  phoneS.state = 'call';
  $('ring').hidden = true;
  liftHandset(true);
  sfx.pickup();
  clearSubs();
  updateLcd();
  runCall(call, false).catch((e) => { if (e !== ABORT) console.error(e); });
}
function callBack() {
  const call = day.missedList.shift();
  removeTask('callback');
  phoneS.state = 'call'; phoneS.call = call;
  call.missed = false;
  liftHandset(true); sfx.pickup();
  updateLcd();
  runCall(call, true).catch((e) => { if (e !== ABORT) console.error(e); });
}
function hangUp(auto) {
  if (phoneS.state === 'offhook') sfx.dialTone(false);
  const call = phoneS.call;
  if (phoneS.state === 'call' && call && !auto) {
    call.aborted = true;
    clearSubs();
    S.choices?.finish(-1);
    if (!call.ended) { call.ended = true; call.errors.push('Бросил трубку посреди разговора'); if (call.savedOrder) evaluate(call); else addTask(`save${call.id}`, `Записать заявку ${call.client.code} в 1Ц`, 0); }
  }
  phoneS.state = 'idle'; phoneS.call = null;
  liftHandset(false);
  sfx.hangup();
  updateLcd();
  scheduleRing();
}
function phoneClick() {
  if (phoneS.state === 'call' && phoneS.call && !phoneS.call.ended) { notify('Идёт разговор. Ответы — клавиши 1–4 (в 1Ц — F1–F4)'); return; }
  if (phoneS.state === 'ringing') answer();
  else if (phoneS.state === 'idle') {
    if (day.missedList.length) { callBack(); return; }
    phoneS.state = 'offhook';
    liftHandset(true); sfx.pickup(); sfx.dialTone(true);
    updateLcd();
    say('', 'Длинный гудок: 425 Гц. Пропущенных нет — звонить некуда.', { dur: 3 });
  } else hangUp();
}
// handset animation
const handsetOffset = new THREE.Vector3(-0.25, -0.1, -0.27);
const handsetWork = new THREE.Vector3(-0.42, -0.3, 0.08); // tucked against the shoulder, out of the screen's way
const handsetRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.35, -Math.PI / 2 + 0.5, 0.2, 'YXZ'));
function liftHandset(up) {
  phoneS.holding = up;
  phoneS.anim = { t: 0, from: { p: phone.handset.getWorldPosition(new THREE.Vector3()), q: phone.handset.getWorldQuaternion(new THREE.Quaternion()) } };
  if (up && phone.handset.parent !== scene) scene.attach(phone.handset);
}
function updateHandset(dt) {
  const a = phoneS.anim;
  if (!a && !phoneS.holding) return;
  const hs = phone.handset;
  let tp, tq;
  if (phoneS.holding) { tp = (S.mode === 'work' || S.mode === 'toWork' ? handsetWork : handsetOffset).clone().applyMatrix4(camera.matrixWorld); tq = camera.quaternion.clone().multiply(handsetRot); }
  else { phone.group.updateMatrixWorld(true); tp = phone.rest.pos.clone().applyMatrix4(phone.group.matrixWorld); tq = phone.group.getWorldQuaternion(new THREE.Quaternion()).multiply(phone.rest.quat); }
  if (a) {
    a.t = Math.min(1, a.t + dt / 0.45);
    const e = a.t * a.t * (3 - 2 * a.t);
    hs.position.lerpVectors(a.from.p, tp, e);
    hs.quaternion.slerpQuaternions(a.from.q, tq, e);
    if (a.t >= 1) { phoneS.anim = null; if (!phoneS.holding) { phone.group.attach(hs); hs.position.copy(phone.rest.pos); hs.quaternion.copy(phone.rest.quat); } }
  } else { hs.position.copy(tp); hs.quaternion.copy(tq); }
  phone.updateCord();
}
// the boss's handset follows her left hand
function updateBossHandset() {
  const k = bossS.phone;
  const hs = bossPhone.handset;
  if (k <= 0.001) {
    if (hs.parent !== bossPhone.group) { bossPhone.group.attach(hs); hs.position.copy(bossPhone.rest.pos); hs.quaternion.copy(bossPhone.rest.quat); bossPhone.updateCord(); }
    return;
  }
  if (hs.parent !== scene) scene.attach(hs);
  bossPhone.group.updateMatrixWorld(true);
  const rest = bossPhone.rest.pos.clone().applyMatrix4(bossPhone.group.matrixWorld);
  const restQ = bossPhone.group.getWorldQuaternion(new THREE.Quaternion()).multiply(bossPhone.rest.quat);
  const ear = new THREE.Vector3(), earQ = new THREE.Quaternion();
  boss.ear(ear, earQ);
  hs.position.lerpVectors(rest, ear, k);
  hs.quaternion.slerpQuaternions(restQ, earQ, k);
  bossPhone.updateCord();
}

// ---------- orders from 1C ----------
function evaluate(call) {
  if (call.evaluated) return;
  call.evaluated = true;
  removeTask(`save${call.id}`);
  const o = call.savedOrder;
  const errs = [...call.errors];
  if (o.code !== call.client.code) errs.push(`В заявке код ${o.code}, а звонил ${call.client.code}`);
  errs.push(...compareItems(call.items, o.rows));
  day.done++;
  if (errs.length) { day.errors++; setTimeout(() => summon(errs, call), 2500); }
  else {
    day.correct++;
    notify(`Заявка ${call.client.code} принята без ошибок`);
    if (Math.random() < 0.35) setTimeout(() => bossSay(pick(['Молодец, так держать.', 'Хорошо. Следующая.', 'Вот, можешь, когда хочешь.'])), 1800);
  }
  renderStats();
  checkDayEnd();
}
function compareItems(expected, rows) {
  const errs = [];
  const got = Object.fromEntries(rows.map((r) => [r.code, r.qty]));
  expected.forEach((it) => {
    const p = productByCode(it.code);
    if (!got[it.code]) errs.push(`Нет позиции «${p.name}», заказывали ${it.qty}`);
    else if (got[it.code] !== it.qty) errs.push(`«${p.name}»: записано ${got[it.code]}, а заказывали ${it.qty}`);
  });
  rows.forEach((r) => { if (!expected.some((it) => it.code === r.code)) errs.push(`Лишняя позиция «${productByCode(r.code).name}»`); });
  return errs;
}
// ---------- morning standing orders from the A4 sheet ----------
const standingLeft = () => day.standing.filter((st) => !st.entered).length;
function onStandingSaved(st, order) {
  st.entered = true;
  st.errors = compareItems(st.items, order.rows);
  renderSheet();
  const done = STANDING_COUNT - standingLeft();
  const t = tasks.find((x) => x.id === 'standing');
  if (t) { t.text = `Утренние заказы с листа: ${done}/${STANDING_COUNT}`; renderTasks(); }
  renderStats();
  if (!standingLeft()) {
    removeTask('standing');
    phoneS.nextRing = Math.min(phoneS.nextRing || Infinity, performance.now() + 12000);
    setTimeout(reviewStanding, 3000);
  }
}
function reviewStanding() {
  if (day.standingReviewed) return;
  day.standingReviewed = true;
  const errs = day.standing.flatMap((st) => st.errors.map((e) => `У ${st.client.code} ${e.charAt(0).toLowerCase()}${e.slice(1)}`));
  if (errs.length) { day.errors++; renderStats(); summon(errs, null); }
  else bossSay('Утренние все без ошибок. Молодец. Теперь телефон.');
  checkDayEnd();
}
function renderSheet() {
  const ul = $('sheet-list');
  ul.innerHTML = day.standing.map((st) => `<li class="${st.entered ? 'done' : ''}"><b>${st.client.code}</b> ${shortFio(st.client.fio)}<br><span>${st.items.map((it) => `${productByCode(it.code).nom} ${it.qty}`).join(', ')}</span></li>`).join('');
  $('sheet-count').textContent = `${STANDING_COUNT - standingLeft()}/${STANDING_COUNT}`;
}
function checkDayEnd() {
  if (day.done >= DAY_ORDERS && !standingLeft() && day.phase === 'calls') {
    day.phase = 'report';
    setTimeout(() => {
      bossSay('Всё, заявки на сегодня приняты. Сформируй сводку за день, распечатай и принеси мне.');
      addTask('report', 'Сводка: 1Ц → Отчеты → Сформировать → Печать', 0);
    }, 5000);
  }
}
pc.onEvent = (type, data) => {
  if (type === 'click') sfx.click();
  else if (type === 'error') sfx.error();
  else if (type === 'm3pop') sfx.pop();
  else if (type === 'pcOn') {
    removeTask('pc');
    addTask('launch', 'Запустить 1Ц: двойной щелчок по ярлыку на экране', 0);
  } else if (type === 'appReady') {
    removeTask('launch');
    if (day.phase === 'arrive' || day.phase === 'boot') {
      day.phase = 'calls';
      if (!day.briefed) setTimeout(() => bossSay('1Ц запустил? Хорошо. А теперь подойди ко мне — стул сбоку от моего стола.'), 1500);
      phoneS.nextRing = performance.now() + 150000;
      bossS.nextCall = performance.now() + rand(50, 80) * 1000;
    }
  } else if (type === 'appClosed') {
    if (day.phase !== 'boot') setTimeout(() => bossSay('Зачем ты закрыл 1Ц? Запускай обратно, звонки идут!'), 800);
  } else if (type === 'orderSaved') {
    const active = phoneS.call && !phoneS.call.ended ? phoneS.call : null;
    let call = day.calls.find((c) => !c.evaluated && c.client.code === data.code && (c === active || c.ended));
    const st = day.standing.find((x) => x.client.code === data.code);
    if (!call && st) { if (!st.entered) onStandingSaved(st, data); return; }
    if (!call) {
      const waiting = day.calls.filter((c) => c.ended && !c.evaluated && !c.savedOrder);
      if (waiting.length === 1) call = waiting[0];
      else if (active && !active.savedOrder) call = active;
    }
    if (!call) { day.errors++; renderStats(); bossSay('Это что за заявка? Никто такой не звонил. Удали её потом.'); return; }
    call.savedOrder = data;
    if (call.ended) evaluate(call);
  } else if (type === 'print') {
    day.reportCount = data.orders;
    sfx.printer();
    setTimeout(() => { world.printerPaper.visible = true; if (day.phase === 'report') { removeTask('report'); addTask('take', 'Забрать сводку с принтера', 0); } }, 2600);
  } else if (type === 'match3') {
    if (day.phase === 'calls' && Math.random() < 0.5) setTimeout(() => bossSay('Я всё вижу. Играть будешь дома.'), 2500);
  }
};

// ---------- interactions ----------
const FAR_OK = new Set(['clock', 'calendar', 'whiteboard', 'notice']);
function reachOf(name) { return FAR_OK.has(name) ? 6 : name === 'boss' ? 2.5 : S.mode === 'standing' ? 2.2 : 1.9; }
const INTERACT = {
  pc: () => {
    if (pc.powerOn()) { sfx.click(); sfx.tone(880, 0.12, { vol: 0.05, at: 0.2 }); sfx.tone(60, 3, { type: 'sawtooth', vol: 0.015, attack: 0.5, release: 1 }); say('', 'Компьютер загружается…', { dur: 2 }); }
    else say('', 'Компьютер уже включён.', { dur: 1.5 });
  },
  monitor: () => {
    if (pc.power === 'off') { say('', 'Монитор тёмный: «Нет сигнала». Включите компьютер — кнопка на системном блоке под столом.', { dur: 3.2 }); return; }
    if (S.mode === 'seated' && S.seat === 'own') enterWork();
    else if (S.mode === 'seated') say('', 'Сначала вернитесь на своё место.', { dur: 1.8 });
    else sitDown('own', true);
  },
  chair: () => sitDown('own'),
  visitchair: () => sitDown('visit'),
  door: (obj) => toggleDoor(world.doors.find((d) => d.pivot === obj)),
  sheet: () => { $('sheet').hidden = false; $('sheet').classList.toggle('collapsed'); },
  phone: () => phoneClick(),
  mug: () => drink(),
  lamp: () => { lamp.on = !lamp.on; lamp.light.intensity = lamp.on ? 0.9 : 0; lamp.bulb.material.emissiveIntensity = lamp.on ? 3 : 0; sfx.lampSwitch(); },
  stapler: () => { sfx.stapler(); S.stapleT = 0; },
  clock: () => { const n = new Date(); say('', `Сейчас ${pad(n.getHours())}:${pad(n.getMinutes())}. Заявок принято: ${day.done} из ${DAY_ORDERS}.`, { dur: 3 }); },
  calendar: () => say('', `Сегодня ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })}. Заявки принимаются на завтра.`, { dur: 3.4 }),
  whiteboard: () => say('', 'На доске сроки и «НЕ ТРОГАТЬ». Кто-то дописал: «ЗАЯВКИ ДО 14:00».', { dur: 3.2 }),
  printer: () => {
    if (world.printerPaper.visible) {
      world.printerPaper.visible = false;
      setCarry('report');
      removeTask('take');
      if (day.phase === 'report') addTask('bring', 'Отнести сводку Алёне Владимировне', 0);
      sfx.click();
    } else say('', 'Принтер. Лоток пуст — сначала отправьте документ на печать из 1Ц.', { dur: 3 });
  },
  cooler: () => say('', 'Кулер. Вода есть, стаканчиков нет.', { dur: 2.5 }),
  calc: () => say('', 'Калькулятор. Но 1Ц и так считает сумму заказа.', { dur: 2.8 }),
  papers: () => say('', 'Старые заявки на бумаге. С тех пор, как «сломалась 1Ц» в 2019-м.', { dur: 3 }),
  cactus: () => say('', 'Кактус. Единственный, кто не звонит.', { dur: 2.5 }),
  window: () => {
    const w = world.window;
    w.open = !w.open;
    sfx.creak(); sfx.street(w.open);
    if (bossS.task === 'window' && w.open === bossS.windowWant) { bossTaskDone(w.open ? 'окно открыто' : 'окно закрыто'); setTimeout(() => bossSay(w.open ? 'Ох, хорошо, свежо.' : 'Спасибо, а то продует.'), 900); }
  },
  coffee: () => {
    const cm = world.coffee;
    if (cm.state === 'brew') { say('', 'Кофе готовится…', { dur: 1.5 }); return; }
    if (cm.state === 'ready') {
      if (S.carry && S.carry !== 'coffee') { say('', 'Руки заняты.', { dur: 1.5 }); return; }
      cm.state = null; cm.cup.visible = false; redraw(cm.screenTex, 'idle');
      setCarry('coffee'); sfx.click();
      return;
    }
    cm.state = 'brew'; redraw(cm.screenTex, 'brew'); sfx.coffee();
    setTimeout(() => { cm.state = 'ready'; cm.cup.visible = true; redraw(cm.screenTex, 'ready'); sfx.tone(880, 0.15, { vol: 0.05 }); }, 5500);
  },
  coffee2: () => say('', 'Капсульная кофемашина. «НЕ РАБОТАЕТ, ждём мастера». С весны.', { dur: 3 }),
  kettle: () => say('', 'Чайник. Накипь можно продавать как стройматериал.', { dur: 2.8 }),
  microwave: () => say('', 'Микроволновка. Внутри чей-то суп с 2023 года.', { dur: 2.6 }),
  fridge: () => say('', 'Холодильник. На каждой банке подписано имя.', { dur: 2.6 }),
  bread: () => say('', 'Свежий хлеб с производства. Пахнет так, что хочется работать. Немного.', { dur: 3 }),
  notice: () => say('', 'Доска объявлений: приказ №14 — брать трубку не позднее третьего гудка.', { dur: 3.4 }),
  exit: () => say('', day.phase === 'done' ? 'Смена окончена. Можно идти домой.' : 'Рабочий день ещё не закончился. Сдайте сводку начальнице.', { dur: 3 }),
  broom: () => {
    if (S.carry === 'broom') { setCarry(null); world.broomInStand.visible = true; return; }
    if (S.carry) { say('', 'Руки заняты.', { dur: 1.5 }); return; }
    setCarry('broom'); world.broomInStand.visible = false;
  },
  crumbs: (obj) => {
    if (S.carry !== 'broom') { say('', 'Нужен веник — он в конце коридора.', { dur: 2.4 }); return; }
    obj.visible = false; sfx.sweep();
    const left = world.crumbs.filter((c) => c.visible).length;
    const t = tasks.find((x) => x.id === 'boss');
    if (t) { t.text = `Подмести крошки в коридоре (${left})`; renderTasks(); }
    if (!left && bossS.task === 'sweep') cleanupSweep(true);
  },
  boss: () => talkToBoss(),
};
function talkToBoss() {
  const atDesk = S.mode === 'seated' && S.seat === 'visit';
  const near = atDesk || (S.mode === 'standing' && Math.hypot(S.pos.x + 2.75, S.pos.z + 0.25) < 2.0);
  if (S.scolding) return;
  if (S.carry === 'coffee') {
    if (!near) { bossSay('Неси сюда, я не дотянусь.'); return; }
    setCarry(null);
    world.bossCup.visible = true;
    setTimeout(() => (world.bossCup.visible = false), 90000);
    if (bossS.task === 'coffee') { bossTaskDone('кофе доставлен'); bossSay('О, спасибо! Как раз вовремя.'); }
    else bossSay('Кофе? Мне? Спасибо, неожиданно.');
    return;
  }
  if (S.carry === 'report') {
    if (!near) { bossSay('Подойди, дай сюда.'); return; }
    if (day.phase !== 'report') { bossSay('Это что? Рано ещё, звонки идут. Потом перепечатаешь.'); setCarry(null); return; }
    if (day.reportCount < pc.orders.length) { setCarry(null); bossSay('Тут не все заявки! Сформируй заново и перепечатай.'); addTask('report', 'Сводка: сформировать заново и распечатать', 0); removeTask('bring'); return; }
    setCarry(null); removeTask('bring');
    endDay();
    return;
  }
  if (bossS.summon || !day.briefed) {
    if (atDesk) talkAtDesk();
    else bossSay(near ? 'Садись на стул, не стой над душой.' : 'Встань и подойди. Садись на стул у моего стола.');
    return;
  }
  if (atDesk) { talkAtDesk(); return; }
  bossSay(pick(['Что такое? Работай, звонки же.', 'Если про обед — с часу до двух. По очереди.', 'Фамилию клиента всегда сверяй, понял?', 'Сумму вслух — обязательно. Клиенты любят цифры.', day.phase === 'boot' ? 'Запускай 1Ц. Пароль на стикере.' : 'Не отвлекайся.']));
}
async function endDay() {
  day.phase = 'done';
  await bossSay('Так, посмотрим сводку…');
  const good = day.reprimands === 0 && day.errors === 0;
  await bossSay(good ? 'Ни одной ошибки. Молодец! Премию выпишу.' : day.reprimands > 3 ? 'Ну… Завтра будет лучше. Должно быть.' : 'Неплохо, но есть над чем работать. На сегодня всё.');
  sfx.fanfare();
  const grade = day.reprimands === 0 && day.errors === 0 ? 'Премия 100%' : day.reprimands <= 2 ? 'Премия 50%' : 'Без премии';
  $('end-stats').innerHTML = [
    ['Утренних заказов', `${STANDING_COUNT - day.standing.filter((st) => !st.entered).length} из ${STANDING_COUNT}`], ['Звонков принято', `${day.done} из ${DAY_ORDERS}`], ['Заявок принято начальницей', String(day.bossOrders || 0)], ['Без ошибок', String(day.correct)], ['С ошибками', String(day.errors)],
    ['Пропущено звонков', String(day.missed)], ['Поручений выполнено', `${day.bossDone} (провалено ${day.bossFailed})`], ['Выговоров', String(day.reprimands)],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  $('end-grade').textContent = grade;
  $('end').hidden = false;
  S.mode = 'end'; S.keys.clear();
  document.body.classList.remove('working');
  if (S.locked) document.exitPointerLock?.();
}
$('end-restart').onclick = () => location.reload();

function findInteract(obj) { while (obj) { if (obj.userData?.interact) return obj; obj = obj.parent; } return null; }
const raycaster = new THREE.Raycaster();
raycaster.far = 7;
function rayAt(nx, ny) {
  raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  const first = hits.find((h) => h.object.visible && isVisibleChain(h.object) && !(h.object.material?.transparent && h.object.material.opacity < 0.3) && !isHeld(h.object));
  if (!first) return null;
  const obj = findInteract(first.object);
  if (!obj) return null;
  return { obj, far: first.distance > reachOf(obj.userData.interact) };
}
function isVisibleChain(o) { while (o) { if (!o.visible) return false; o = o.parent; } return true; }
function isHeld(o) { while (o) { if (o === camera) return true; o = o.parent; } return false; }
const pointerNdc = (e) => [(e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1];
function doInteract(h) {
  if (!h) return;
  if (h.far) { say('', 'Слишком далеко — подойдите ближе.', { dur: 1.6 }); return; }
  INTERACT[h.obj.userData.interact]?.(h.obj);
}

// ---------- mug ----------
const mugAnim = { t: -1 };
function drink() {
  if (mugAnim.t >= 0) return;
  if (S.mode !== 'seated') { say('', 'Кружку лучше пить сидя. Так спокойнее.', { dur: 2 }); return; }
  if (S.coffee <= 0) { say('', 'Кружка пуста. Кофемашина на кухне — но там кофе только для начальницы.', { dur: 3.2 }); return; }
  mugAnim.t = 0;
  mugAnim.home = { p: mug.group.position.clone(), q: mug.group.quaternion.clone() };
  sfx.sip();
  S.coffee--;
  setTimeout(() => { mug.coffee.position.y = 0.02 + 0.065 * (S.coffee / 5); mug.coffee.visible = S.coffee > 0; }, 900);
}
function updateMug(dt) {
  if (mugAnim.t < 0) return;
  mugAnim.t += dt;
  const T = mugAnim.t, k = T < 0.5 ? T / 0.5 : T < 1.6 ? 1 : Math.max(0, 1 - (T - 1.6) / 0.5), e = k * k * (3 - 2 * k);
  const target = new THREE.Vector3(0.02, -0.14, -0.2).applyMatrix4(camera.matrixWorld);
  const tq = camera.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.9, -2.2, 0)));
  mug.group.position.lerpVectors(mugAnim.home.p, target, e);
  mug.group.quaternion.slerpQuaternions(mugAnim.home.q, tq, e);
  if (T > 2.1) { mug.group.position.copy(mugAnim.home.p); mug.group.quaternion.copy(mugAnim.home.q); mugAnim.t = -1; }
}

// ---------- sitting, standing, walking ----------
function standUp() {
  if (S.mode !== 'seated') return;
  if (S.scolding) { say('', 'Разговор с начальницей ещё не закончен.', { dur: 1.8 }); return; }
  S.mode = 'rising';
  const [sx, sz] = SEATS[S.seat].standAt;
  S.pos.set(sx, 0, sz);
  startTrans(standPose, 0.5, () => { S.mode = 'standing'; updateHelp(); });
  $('hint').hidden = true;
}
function sitDown(seat = 'own', thenWork = false) {
  if (S.mode !== 'standing') return;
  const c = SEATS[seat];
  if (Math.hypot(S.pos.x - c.x, S.pos.z - c.z) > 1.6) { say('', seat === 'own' ? 'Подойдите к своему креслу.' : 'Подойдите к стулу.', { dur: 1.6 }); return; }
  S.mode = 'sitting';
  S.seat = seat;
  S.yaw = c.yaw0; S.pitch = -0.15;
  startTrans(seatedPose, 0.55, () => {
    S.mode = 'seated'; updateHelp();
    if (thenWork) enterWork();
    if (seat === 'visit') talkAtDesk();
  });
}
// ---------- doors ----------
function toggleDoor(d) {
  if (!d) return;
  if (d.open && Math.abs(S.pos.x - d.x) < 0.65 && Math.abs(S.pos.z - d.z) < 0.4 && S.mode === 'standing') { say('', 'Отойдите из проёма.', { dur: 1.4 }); return; }
  d.open = !d.open;
  d.lastNear = performance.now();
  sfx.creak();
  if (!d.open) {
    setTimeout(() => sfx.noise(0.08, { freq: 300, q: 1, vol: 0.35 }), 350);
    d.warned = false;
    removeTask(`door${world.doors.indexOf(d)}`);
  }
}
function updateDoors(dt, now) {
  world.doors.forEach((d, i) => {
    d.angle += ((d.open ? d.openAngle : 0) - d.angle) * Math.min(1, dt * 5);
    d.pivot.rotation.y = d.angle;
    if (!d.open) return;
    if (S.mode === 'standing' && Math.hypot(S.pos.x - d.x, S.pos.z - d.z) < 2.2) d.lastNear = now;
    // a door left open behind you: the boss notices after a while
    if (!d.warned && now - d.lastNear > 9000 && day.phase !== 'boot' && day.phase !== 'done') {
      d.warned = true;
      bossSay(pick(['Дверь за собой закрывай! Сквозняк по всему отделу.', 'Кто опять дверь не закрыл? Закрой!', 'Двери! Закрываем двери!']));
      addTask(`door${i}`, `Закрыть: ${d.name.toLowerCase()}`, 25, () => { reprimand('дверь нараспашку'); d.warned = false; d.lastNear = performance.now(); });
    }
  });
}
const R = 0.22;
function walkable(x, z) {
  const inArea = world.walk.some((a) => x >= a.x0 + R && x <= a.x1 - R && (a.door !== undefined ? world.doors[a.door].open && z >= a.z0 && z <= a.z1 : z >= a.z0 + R && z <= a.z1 - R));
  if (!inArea) return false;
  return !world.colliders.some((c) => x > c.x0 - R && x < c.x1 + R && z > c.z0 - R && z < c.z1 + R);
}
function move(dt) {
  let f = 0, s = 0;
  if (S.keys.has('KeyW') || S.keys.has('ArrowUp')) f += 1;
  if (S.keys.has('KeyS') || S.keys.has('ArrowDown')) f -= 1;
  if (S.keys.has('KeyD') || S.keys.has('ArrowRight')) s += 1;
  if (S.keys.has('KeyA') || S.keys.has('ArrowLeft')) s -= 1;
  f += -S.joy.y; s += S.joy.x;
  const len = Math.hypot(f, s);
  if (len < 0.05) return;
  if (len > 1) { f /= len; s /= len; }
  const speed = (S.keys.has('ShiftLeft') || S.keys.has('ShiftRight') ? 3.1 : 1.9) * dt;
  const fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw), rx = Math.cos(S.yaw), rz = -Math.sin(S.yaw);
  const dx = (fx * f + rx * s) * speed, dz = (fz * f + rz * s) * speed;
  if (walkable(S.pos.x + dx, S.pos.z)) S.pos.x += dx;
  if (walkable(S.pos.x, S.pos.z + dz)) S.pos.z += dz;
  const before = Math.floor(S.bob / Math.PI);
  S.bob += speed * 5.5;
  if (Math.floor(S.bob / Math.PI) !== before) sfx.step();
}

// ---------- work mode ----------
function enterWork() {
  if (S.mode !== 'seated') return;
  S.yaw = Math.atan2(Math.sin(S.yaw), Math.cos(S.yaw));
  world.playerChair.rotation.y = S.yaw;
  S.mode = 'toWork';
  startTrans(workPose, 0.6, () => {
    S.mode = 'work';
    if (S.locked) { S.vc = { x: pc.W / 2, y: pc.H / 2 }; pc.pointerMove(S.vc.x, S.vc.y); }
    else if (S.pointer) { const uv = screenUV(S.pointer); if (uv) pc.pointerMove(uv.x * pc.W, (1 - uv.y) * pc.H); }
  });
  $('hint').hidden = true;
  document.body.classList.add('working');
}
function leaveWork() {
  if (S.mode !== 'work' && S.mode !== 'toWork') return;
  S.vc = null;
  pc.pointerLeave();
  if (pc.edit) pc.commitEdit();
  S.mode = 'toSeat';
  startTrans(seatedPose, 0.6, () => { S.mode = 'seated'; });
  document.body.classList.remove('working');
}
$('leave').onclick = (e) => { e.stopPropagation(); leaveWork(); if (!isTouch) setTimeout(tryLock, 50); };
$('ring').onclick = (e) => {
  e.stopPropagation();
  if (phoneS.state !== 'ringing') return;
  if (S.mode === 'standing' && Math.hypot(S.pos.x + 0.5, S.pos.z + 0.62) > 2.0) { notify('Телефон далеко — вернитесь к столу', 'bad'); return; }
  answer();
};
$('stand').onclick = (e) => { e.stopPropagation(); if (S.mode === 'seated') standUp(); else if (S.mode === 'standing') sitDown(nearestSeat()); };
const nearestSeat = () => (Math.hypot(S.pos.x - SEATS.visit.x, S.pos.z - SEATS.visit.z) < Math.hypot(S.pos.x, S.pos.z) ? 'visit' : 'own');
function screenUV(e) {
  const [x, y] = pointerNdc(e);
  raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
  const hit = raycaster.intersectObject(world.screen, false)[0];
  return hit ? hit.uv : null;
}
function moveDeskMouse(uv) { const m = world.mouse.mouse; m.position.x = (uv.x - 0.5) * 0.09; m.position.z = 0.01 - (uv.y - 0.5) * 0.07; }

// ---------- pointer & keys ----------
const lookModes = new Set(['seated', 'standing']);
function tryLock() {
  if (isTouch || !canvas.requestPointerLock || S.mode === 'intro' || S.mode === 'work' || S.mode === 'toWork') return;
  try { const p = canvas.requestPointerLock(); if (p?.catch) p.catch(() => { S.noLock = true; }); } catch { S.noLock = true; }
}
document.addEventListener('pointerlockchange', () => {
  S.locked = document.pointerLockElement === canvas;
  // Esc at the PC releases the mouse: treat it as leaning back
  if (!S.locked && (S.mode === 'work' || S.mode === 'toWork') && S.vc) leaveWork();
  $('crosshair').hidden = !S.locked;
  updateHelp();
});
document.addEventListener('pointerlockerror', () => { S.noLock = true; updateHelp(); });
canvas.addEventListener('pointerdown', (e) => {
  if (S.mode === 'intro' || S.mode === 'end') return;
  sfx.init();
  if (S.mode === 'work') {
    if (e.button === 2) { leaveWork(); return; }
    if (S.locked) { pc.click(S.vc.x, S.vc.y); moveDeskMouse({ x: S.vc.x / pc.W, y: 1 - S.vc.y / pc.H }); return; }
    const uv = screenUV(e);
    if (uv) { pc.click(uv.x * pc.W, (1 - uv.y) * pc.H); moveDeskMouse(uv); } else if (!isTouch) leaveWork();
    return;
  }
  if (!lookModes.has(S.mode)) return;
  if (S.locked) { doInteract(S.hover); return; }
  S.drag = { x: e.clientX, y: e.clientY, moved: 0 };
  canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  S.pointer = e;
  if (S.mode === 'work') {
    if (S.locked) {
      // the monitor shows ~70% of the window width: move the on-screen cursor at roughly 1:1
      const k = pc.W / (innerWidth * 0.72);
      S.vc = { x: THREE.MathUtils.clamp((S.vc?.x ?? pc.W / 2) + e.movementX * k, 0, pc.W - 1), y: THREE.MathUtils.clamp((S.vc?.y ?? pc.H / 2) + e.movementY * k, 0, pc.H - 1) };
      pc.pointerMove(S.vc.x, S.vc.y);
      moveDeskMouse({ x: S.vc.x / pc.W, y: 1 - S.vc.y / pc.H });
      return;
    }
    const uv = screenUV(e);
    if (uv) { pc.pointerMove(uv.x * pc.W, (1 - uv.y) * pc.H); moveDeskMouse(uv); canvas.style.cursor = 'none'; }
    else { pc.pointerLeave(); canvas.style.cursor = 'default'; }
    return;
  }
  if (!lookModes.has(S.mode)) return;
  if (S.locked) { rotate(e.movementX, e.movementY, 0.0022); return; }
  if (S.drag) {
    const dx = e.clientX - S.drag.x, dy = e.clientY - S.drag.y;
    S.drag.moved += Math.abs(dx) + Math.abs(dy);
    S.drag.x = e.clientX; S.drag.y = e.clientY;
    rotate(dx, dy, isTouch ? 0.006 : 0.004);
  }
});
canvas.addEventListener('pointerup', (e) => {
  if (!lookModes.has(S.mode) || !S.drag) return;
  const tap = S.drag.moved < 8;
  S.drag = null;
  if (tap) { const h = rayAt(...pointerNdc(e)); if (h) doInteract(h); else if (!S.noLock) tryLock(); }
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => {
  if (S.mode !== 'work') return;
  e.preventDefault();
  if (S.locked && S.vc) { pc.wheel(S.vc.x, S.vc.y, e.deltaY); return; }
  const uv = screenUV(e);
  if (uv) pc.wheel(uv.x * pc.W, (1 - uv.y) * pc.H, e.deltaY);
}, { passive: false });
function rotate(dx, dy, k) { S.yaw -= dx * k; S.pitch = THREE.MathUtils.clamp(S.pitch - dy * k, -1.25, 1.1); }

window.addEventListener('keydown', (e) => {
  if (S.mode === 'intro' || S.mode === 'end') return;
  // replies: F1–F4 always, 1–4 when not typing in 1C
  const fk = /^F([1-4])$/.exec(e.key);
  if (e.key === 'F1' && phoneS.state === 'ringing' && S.mode === 'work') { e.preventDefault(); answer(); return; }
  if (S.choices && (fk || (/^[1-9]$/.test(e.key) && !(S.mode === 'work' && pc.edit)))) { choose((fk ? +fk[1] : +e.key) - 1); e.preventDefault(); return; }
  if (S.mode === 'work' || S.mode === 'toWork') {
    const k = keyboard.keys[e.code];
    if (k) { k.position.y = k.userData.baseY - 0.004; setTimeout(() => (k.position.y = k.userData.baseY), 90); }
    sfx.key();
    const used = pc.key(e);
    if (!used && e.key === 'Escape') leaveWork();
    if (used || ['Tab', 'Backspace', ' ', 'ArrowUp', 'ArrowDown', 'Enter'].includes(e.key) || (e.ctrlKey && /^[sfnSFN]$/.test(e.key))) e.preventDefault();
    return;
  }
  S.keys.add(e.code);
  if (e.code === 'KeyE') doInteract(S.hover);
  if (e.code === 'KeyF' && S.mode === 'seated' && S.seat === 'own') enterWork();
  if (e.code === 'Space') { e.preventDefault(); if (S.mode === 'seated') standUp(); else if (S.mode === 'standing') sitDown(nearestSeat()); }
  if (e.code.startsWith('Arrow')) e.preventDefault();
});
window.addEventListener('keyup', (e) => S.keys.delete(e.code));
window.addEventListener('blur', () => S.keys.clear());

// touch joystick (standing only)
const joy = $('joy');
joy.addEventListener('pointerdown', (e) => { e.stopPropagation(); joy.setPointerCapture(e.pointerId); joy.dataset.on = '1'; setJoy(e); });
joy.addEventListener('pointermove', (e) => { if (joy.dataset.on) setJoy(e); });
joy.addEventListener('pointerup', () => { joy.dataset.on = ''; S.joy = { x: 0, y: 0 }; $('joy-knob').style.transform = ''; });
function setJoy(e) {
  const r = joy.getBoundingClientRect();
  let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
  const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
  S.joy = { x, y };
  $('joy-knob').style.transform = `translate(${x * 34}px, ${y * 34}px)`;
}
$('numpad').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  e.stopPropagation();
  pc.key({ key: b.dataset.k, ctrlKey: false, metaKey: false });
});

function updateHelp() {
  const el = $('help-look');
  const standing = S.mode === 'standing';
  $('stand').textContent = standing ? 'Сесть [Пробел]' : 'Встать [Пробел]';
  if (isTouch) el.textContent = standing ? 'Джойстик — ходить, палец по экрану — осмотреться, нажмите на предмет — действие.' : 'Палец по экрану — осмотреться, нажмите на предмет — действие.';
  else if (!S.locked) el.textContent = 'Кликните по сцене, чтобы управлять взглядом мышью (или тяните мышью)';
  else el.textContent = standing ? 'WASD — ходить · Shift — быстрее · ЛКМ/E — действие · Пробел — сесть в кресло' : 'Мышь — осмотреться · ЛКМ/E — действие · F — за компьютер · Пробел — встать';
}
$('tts').onclick = (e) => {
  e.stopPropagation();
  tts.load();
  if (!tts.available()) { notify('В этом браузере нет русского голоса для синтеза речи', 'bad'); return; }
  S.tts = !S.tts;
  if (!S.tts) tts.stop();
  $('tts').setAttribute('aria-pressed', String(S.tts));
  $('tts').textContent = S.tts ? 'Озвучка: вкл.' : 'Озвучка: выкл.';
};
$('sheet-head').onclick = (e) => { e.stopPropagation(); $('sheet').classList.toggle('collapsed'); };
$('mute').onclick = (e) => {
  e.stopPropagation();
  sfx.init(); sfx.setMuted(!sfx.muted);
  $('mute').setAttribute('aria-pressed', String(sfx.muted));
  $('mute').textContent = sfx.muted ? 'Звук выкл.' : 'Звук вкл.';
};
$('start').onclick = () => {
  sfx.init();
  $('intro').hidden = true;
  document.body.classList.add('started');
  // you arrive in the corridor, outside the office door
  S.mode = 'standing'; S.seat = 'own';
  S.pos.set(2.2, 0, 4.4); S.yaw = 0; S.pitch = -0.05;
  day.phase = 'arrive';
  tryLock();
  updateHelp();
  addTask('pc', 'Включить компьютер: кнопка на системном блоке под столом', 0);
  addTask('brief', 'Подойти к Алёне Владимировне: стул сбоку от её стола', 0);
  setTimeout(() => bossSay('Доброе утро! Заходи, дверь за собой закрывай. Включай компьютер и подойди ко мне.'), 2200);
};

// ---------- main loop ----------
const clock = new THREE.Clock();
let lastSec = -1;
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const now = performance.now();
  const t = now / 1000;

  // camera
  if (S.trans) {
    S.trans.t = Math.min(1, S.trans.t + dt / S.trans.dur);
    const e = 1 - Math.pow(1 - S.trans.t, 3);
    const to = S.trans.to();
    camera.position.lerpVectors(S.trans.from.p, to.p, e);
    camera.quaternion.slerpQuaternions(S.trans.from.q, to.q, e);
    if (S.trans.t >= 1) { const d = S.trans.done; S.trans = null; d?.(); }
  } else if (S.mode === 'seated' || S.mode === 'intro') {
    if (S.mode === 'intro') S.yaw = Math.sin(t * 0.12) * 0.35;
    const { p, q } = seatedPose();
    camera.position.copy(p); camera.quaternion.copy(q);
    camera.position.y += Math.sin(t * 1.6) * 0.002;
  } else if (S.mode === 'standing') {
    move(dt);
    const { p, q } = standPose();
    camera.position.copy(p); camera.quaternion.copy(q);
  } else if (S.mode === 'work') {
    const { p, q } = workPose();
    camera.position.copy(p); camera.quaternion.copy(q);
  }
  const chair = seatChair();
  const seatedish = ['seated', 'intro', 'end', 'toSeat', 'sitting', 'toWork', 'work'].includes(S.mode);
  world.playerLegs.visible = seatedish && S.seat === 'own';
  if (S.mode === 'seated' || S.mode === 'intro') chair.rotation.y = S.yaw;
  else if (S.mode === 'work' || S.mode === 'toWork') chair.rotation.y += (0 - chair.rotation.y) * Math.min(1, dt * 8);
  else if (S.mode === 'toSeat' || S.mode === 'sitting') chair.rotation.y += (S.yaw - chair.rotation.y) * Math.min(1, dt * 8);
  camera.updateMatrixWorld();

  // hover hint
  if (lookModes.has(S.mode)) {
    let h = null;
    if (S.locked) h = rayAt(0, 0);
    else if (S.pointer && !S.drag && !isTouch) h = rayAt(...pointerNdc(S.pointer));
    S.hover = h;
    const hint = $('hint');
    if (h) {
      const o = h.obj, n = o.userData.interact;
      let label = o.userData.hint;
      if (n === 'phone') label = phoneS.state === 'ringing' ? 'Ответить на звонок' : phoneS.state === 'call' && phoneS.call && !phoneS.call.ended ? 'Идёт разговор' : phoneS.state !== 'idle' ? 'Положить трубку' : day.missedList.length ? 'Перезвонить на пропущенный' : 'Снять трубку';
      if (n === 'lamp') label = lamp.on ? 'Выключить лампу' : 'Включить лампу';
      if (n === 'window') label = world.window.open ? 'Закрыть окно' : 'Открыть окно';
      if (n === 'boss') label = S.carry === 'coffee' ? 'Отдать кофе' : S.carry === 'report' ? 'Отдать сводку' : bossS.summon ? 'Зовёт — сесть на стул у её стола' : 'Поговорить с Алёной Владимировной';
      if (n === 'coffee') label = world.coffee.state === 'ready' ? 'Забрать кофе' : world.coffee.state === 'brew' ? 'Готовится…' : 'Сделать капучино';
      if (n === 'broom') label = S.carry === 'broom' ? 'Поставить веник' : 'Взять веник';
      if (n === 'crumbs') label = 'Подмести';
      if (n === 'printer' && world.printerPaper.visible) label = 'Забрать распечатку';
      if (n === 'chair' || n === 'visitchair') { if (S.mode !== 'standing') { h.obj = null; } label = n === 'chair' ? 'Сесть на своё место' : bossS.summon ? 'Сесть на разговор' : 'Сесть к начальнице'; }
      if (n === 'door') { const d = world.doors.find((x) => x.pivot === o); label = `${d.open ? 'Закрыть' : 'Открыть'}: ${d.name.toLowerCase()}`; }
      if (n === 'sheet') label = 'Лист постоянных заказов (показать/скрыть)';
      if (n === 'monitor' && S.mode === 'standing') label = 'Сесть за компьютер';
      if (h.obj) {
        hint.textContent = h.far ? `${label} — подойдите ближе` : label;
        hint.classList.toggle('far', h.far);
        hint.hidden = false;
        if (!S.locked && S.pointer) { hint.style.left = `${S.pointer.clientX}px`; hint.style.top = `${S.pointer.clientY + 22}px`; } else { hint.style.left = ''; hint.style.top = ''; }
      } else { S.hover = null; hint.hidden = true; }
    } else hint.hidden = true;
    $('crosshair').classList.toggle('active', !!S.hover && !S.hover.far);
    if (!S.locked) canvas.style.cursor = S.hover ? 'pointer' : 'grab';
  } else { S.hover = null; $('hint').hidden = true; }

  // phone
  updateDoors(dt, now);
  const canRing = day.phase === 'calls' && day.briefed && !S.scolding && phoneS.state === 'idle' && !day.missedList.length && day.generated < DAY_ORDERS && phoneS.nextRing && now > phoneS.nextRing;
  if (canRing) startRinging(newCall());
  if (phoneS.state === 'ringing') {
    if (now - phoneS.lastRing > 3000) { phoneS.lastRing = now; sfx.ringOnce(); }
    const led = Math.floor(now / 250) % 2 === 0;
    if (led !== phoneS.led) { phoneS.led = led; updateLcd({ led }); }
    phone.handset.position.y = phone.rest.pos.y + (now - phoneS.lastRing < 1000 ? Math.sin(now * 0.12) * 0.0012 : 0);
    if (now - phoneS.ringStart > 20000) missCall();
  }
  updateHandset(dt);
  updateMug(dt);
  if (phoneS.holding && S.mode === 'standing' && Math.hypot(S.pos.x + 0.5, S.pos.z + 0.62) > 2.0) {
    say('', 'Провод у трубки короткий — трубка упала на рычаг.', { dur: 2.5 });
    hangUp();
  }

  // boss
  if (day.phase === 'calls' || day.phase === 'report') {
    if (!bossS.onPhone && bossS.nextCall && now > bossS.nextCall && !subCurrent && phoneS.state !== 'call') { bossS.nextCall = now + rand(80, 140) * 1000; bossPhoneCall(); }
  }
  bossS.phone += ((bossS.phoneTarget || 0) - bossS.phone) * Math.min(1, dt * 4);
  if (bossS.waveT && now > bossS.waveT) bossS.wave = 0;
  bossS.waveK = (bossS.waveK || 0) + ((bossS.wave || 0) - (bossS.waveK || 0)) * Math.min(1, dt * 5);
  boss.lookTarget = now < bossS.lookUntil ? lookYaw() : 0;
  boss.look += (boss.lookTarget - boss.look) * Math.min(1, dt * 4);
  boss.setLook(boss.look, now < bossS.lookUntil);
  boss.setPose(t, bossS.phone, bossS.waveK, now > bossS.pause && Math.sin(t * 0.3 + boss.phase) > -0.3);
  updateBossHandset();
  if (now > bossS.pause && Math.random() < dt * 5 && S.mode !== 'intro') sfx.colleagueKey();

  // window sash
  const w = world.window;
  w.angle += ((w.open ? -1.15 : 0) - w.angle) * Math.min(1, dt * 3);
  w.sash.rotation.y = w.angle;

  // stapler
  if (S.stapleT != null) {
    S.stapleT += dt;
    world.staplerTop.position.y = 0.028 - Math.sin(Math.min(1, S.stapleT / 0.2) * Math.PI) * 0.01;
    if (S.stapleT > 0.2) { world.staplerTop.position.y = 0.028; S.stapleT = null; }
  }
  // held broom sways while walking
  world.held.broom.rotation.z = -0.25 + Math.sin(S.bob) * 0.05;

  // timers
  for (const tk of [...tasks]) {
    if (tk.deadline && now > tk.deadline) { removeTask(tk.id); tk.onFail?.(); }
  }
  const sec = Math.floor(t);
  if (sec !== lastSec) {
    lastSec = sec;
    redraw(world.clockTex);
    pc.dirty = true;
    $('hud-time').textContent = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (tasks.some((x) => x.deadline)) renderTasks();
    if (sec % 30 === 0 && phoneS.state === 'idle') updateLcd();
  }
  world.pcLed.material.color.setHex(pc.power === 'off' ? 0x0a1a28 : Math.random() < 0.08 ? 0x0a3a66 : 0x3cb0ff);

  if (pc.dirty || pc.needsAnim()) { pc.draw(); screenTex.needsUpdate = true; }
  $('numpad').hidden = !(isTouch && S.mode === 'work' && pc.edit);
  $('joy').hidden = !(isTouch && S.mode === 'standing');
  $('stand').hidden = !(S.mode === 'seated' || S.mode === 'standing');

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.fov = fovFor(camera.aspect);
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

world.sheet.material.map = standingSheetTex(day.standing.map((st) => [st.client.code, st.items.map((it) => `${productByCode(it.code).nom} ${it.qty}`).join(', ')]));
world.sheet.material.needsUpdate = true;
updateLcd();
updateHelp();
renderSheet();
renderTasks();
renderStats();
requestAnimationFrame(frame);

// handy for poking at the scene from the devtools console
window.office = { S, day, pc, world, tasks, INTERACT, talkToBoss, summonEducate, afterCall, walkable, toggleDoor, onStandingSaved, reviewStanding, bossPhoneCall, enterWork, leaveWork, standUp, sitDown, startRinging, newCall, answer, phoneS, bossS, giveBossTask, choose, summon, endDay };
