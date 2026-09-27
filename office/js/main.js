import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PC, fmt } from './pc.js';
import { buildWorld } from './world.js';
import { Sfx } from './audio.js';
import { redraw, lcdState } from './textures.js';
import { CLIENTS, productByCode, makeOrder, sayItem, orderTotal, digitsWords, shortFio } from './data.js';

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
const { phone, mug, lamp, keyboard, boss, bossPhone } = world;
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
  carry: null, coffee: 5,
};
const day = {
  phase: 'boot', generated: 0, done: 0, correct: 0, errors: 0, reprimands: 0, missed: 0,
  bossDone: 0, bossFailed: 0, calls: [], missedList: [], reportCount: -1, used: new Set(),
};
const EYE_SEATED = 1.2, EYE_STAND = 1.62;

function seatedPose() {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(S.pitch, S.yaw, 0, 'YXZ'));
  const lean = Math.max(0, -S.pitch) * 0.08;
  const p = new THREE.Vector3(Math.sin(S.yaw) * 0.05, EYE_SEATED - lean * 0.4, Math.cos(S.yaw) * 0.05);
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
  if (s.voice) { const v = sfx.babble(s.text, s.voice, s.phoneVoice); d = d || Math.max(2, v + 0.9); }
  d = d || Math.max(2.2, s.text.length * 0.055);
  if (s.log) logLine(s.who, s.text, s.logCls);
  s.timer = setTimeout(() => { s.onDone?.(); s.resolve(); nextSub(); }, d * 1000);
}
function clearSubs() {
  subQueue.splice(0).forEach((s) => s.resolve());
  if (subCurrent) { clearTimeout(subCurrent.timer); subCurrent.resolve(); }
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
    const render = () => btns.forEach((b, i) => { const l = options[i]; b.innerHTML = `<kbd>${i + 1}</kbd> ${typeof l === 'function' ? l() : l}`; });
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
    if (S.locked) document.exitPointerLock?.();
  });
}
function choose(i) { if (S.choices && i < S.choices.options.length) S.choices.finish(i); }

function logLine(who, text, cls = '') {
  const ul = $('log-list');
  const li = document.createElement('li');
  li.className = cls;
  li.innerHTML = `<b>${who}</b> ${text}`;
  ul.appendChild(li);
  ul.scrollTop = ul.scrollHeight;
}
function showLog(title) { $('log-title').textContent = title; $('log-list').innerHTML = ''; $('call-log').hidden = false; }

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
  $('st-err').textContent = String(day.errors);
  $('st-rep').textContent = String(day.reprimands);
}

// ---------- boss ----------
boss.lookAt = -0.95;
const bossS = { wave: 0, waveT: 0, phone: 0, onPhone: false, summon: null, task: null, typing: true, pause: 0, nextTask: 0, nextCall: 0 };
function bossSay(text, o = {}) {
  boss.lookTarget = boss.lookAt;
  bossS.pause = performance.now() + 5000;
  return say('Алёна Владимировна', text, { voice: 225, ...o, onDone: () => { boss.lookTarget = 0; o.onDone?.(); } });
}
function reprimand(reason) {
  day.reprimands++;
  renderStats();
  notify(`Выговор: ${reason}`, 'bad');
}
function summon(errors, call) {
  bossS.summon = { errors, call };
  bossS.wave = 1; bossS.waveT = performance.now() + 4000;
  bossSay(pick(['Так. А ну-ка подойди ко мне.', 'Подойди ко мне, пожалуйста. Сейчас.', 'Иди-ка сюда. Поговорим.']));
  addTask('summon', 'Подойти к Алёне Владимировне', 60, () => {
    bossSay('Я долго ждать буду?! Ладно, потом поговорим.');
    reprimand('не подошёл к начальнице');
    bossS.summon = null;
  });
}
async function scold() {
  const { errors, call } = bossS.summon;
  bossS.summon = null;
  removeTask('summon');
  await bossSay(`Звонил клиент ${call.client.code}, ${shortFio(call.client.fio)}.`);
  for (const e of errors.slice(0, 3)) await bossSay(`${e}.`);
  await bossSay(pick(['Клиент потом звонит мне, а не тебе! Внимательнее.', 'Машина уедет с неправильной заявкой — кто отвечать будет? Внимательнее!', 'Ещё раз такое — останешься без премии.']));
  reprimand('ошибка в заявке');
}
const BOSS_CALLS = [
  ['Отдел заявок, Алёна Владимировна.', 'Да, Виктор Павлович… Да, все заявки примем до двух.', 'Хорошо. До свидания.'],
  ['Алёна Владимировна слушает.', 'Нет, машина на Ленина задерживается, я предупредила.', 'Да. Всё. Пока.'],
  ['Отдел заявок.', 'Ой, Светочка, привет! Нет, сейчас не могу, у нас звонки.', 'Вечером наберу. Целую.'],
  ['Алёна Владимировна.', 'Да, по «Колоску» заявка будет, оператор примет.', 'Спасибо, до свидания.'],
];
let bossCallIdx = 0;
async function bossPhoneCall() {
  bossS.onPhone = true;
  for (let i = 0; i < 2; i++) { sfx.ringOnce(0.02, 900, 1100); await wait(2600); }
  bossS.phoneTarget = 1;
  sfx.pickup();
  const lines = BOSS_CALLS[bossCallIdx++ % BOSS_CALLS.length];
  for (const l of lines) { bossS.pause = performance.now() + 4000; await say('Алёна Владимировна (по телефону)', l, { voice: 225, cls: 'dim' }); }
  bossS.phoneTarget = 0;
  await wait(600);
  sfx.hangup();
  bossS.onPhone = false;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// boss chores with timers
function giveBossTask(forced) {
  const opts = ['coffee', 'sweep', 'window'].filter((t) => !(t !== 'window' && day.used.has(t)));
  const kind = forced || pick(opts);
  day.used.add(kind);
  bossS.task = kind;
  const fail = (why) => () => { bossS.task = null; day.bossFailed++; bossS.nextTask = performance.now() + rand(110, 170) * 1000; bossSay(why); reprimand('не выполнено поручение'); if (kind === 'sweep') cleanupSweep(false); };
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
  bossS.nextTask = performance.now() + rand(110, 170) * 1000;
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
  const unused = CLIENTS.filter((c) => !day.calls.some((k) => k.client === c));
  const client = pick(unused.length ? unused : CLIENTS);
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
function meSay(call, text) {
  guard(call);
  return say('Вы', text, { voice: 165, dur: Math.max(1.4, text.length * 0.045), cls: 'me', log: true, logCls: 'me' }).then(() => guard(call));
}
function currentSum(call) {
  if (pc.form.rows.length) return pc.formTotal();
  if (call.savedOrder) return call.savedOrder.total;
  return 0;
}
async function runCall(call, callback) {
  const c = call.client;
  showLog(`Звонок: код ${c.code}`);
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
  // dictation
  await callerSay(call, pick(['Записывайте.', 'Пишите заявку на завтра.', 'Так, записывайте.']));
  const confirmAt = call.askConfirm ? Math.max(1, Math.floor(call.items.length / 2)) : -1;
  for (let i = 0; i < call.items.length; i++) {
    await callerSay(call, sayItem(call.items[i]), { dur: 3.4 });
    if (i === confirmAt) {
      await callerSay(call, 'Записали?');
      const r = await ask(['Да, записал(а).', 'Повторите, пожалуйста.'], { timeout: 8 });
      guard(call);
      if (r.i < 0) {
        call.errors.push('Не ответил клиенту на вопрос «Записали?»');
        await callerSay(call, 'Алло! Вы меня слышите вообще? Ладно, дальше.');
      } else if (r.i === 1) {
        await meSay(call, r.text);
        await callerSay(call, 'Повторяю.');
        for (let j = 0; j <= i; j++) await callerSay(call, sayItem(call.items[j]), { dur: 3.2 });
      } else await meSay(call, r.text);
    }
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
  if (call.savedOrder) evaluate(call);
  else addTask(`save${call.id}`, `Записать заявку ${c.code} в 1Ц (Ctrl+Enter)`, 0);
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
  boss.head.updateMatrixWorld(true);
  const ear = new THREE.Vector3(-0.11, 0.09, 0.0).applyMatrix4(boss.head.matrixWorld);
  const earQ = boss.head.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0.3)));
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
  const got = Object.fromEntries(o.rows.map((r) => [r.code, r.qty]));
  call.items.forEach((it) => {
    const p = productByCode(it.code);
    if (!got[it.code]) errs.push(`Нет позиции «${p.name}», заказывали ${it.qty}`);
    else if (got[it.code] !== it.qty) errs.push(`«${p.name}»: записано ${got[it.code]}, а заказывали ${it.qty}`);
  });
  o.rows.forEach((r) => { if (!call.items.some((it) => it.code === r.code)) errs.push(`Лишняя позиция «${productByCode(r.code).name}»`); });
  day.done++;
  if (errs.length) { day.errors++; setTimeout(() => summon(errs, call), 2500); }
  else {
    day.correct++;
    notify(`Заявка ${call.client.code} принята без ошибок`);
    if (Math.random() < 0.35) setTimeout(() => bossSay(pick(['Молодец, так держать.', 'Хорошо. Следующая.', 'Вот, можешь, когда хочешь.'])), 1800);
  }
  renderStats();
  if (day.done >= DAY_ORDERS && day.phase === 'calls') {
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
  else if (type === 'appReady') {
    removeTask('launch');
    if (day.phase === 'boot') {
      day.phase = 'calls';
      setTimeout(() => bossSay('Ну наконец-то. Сейчас пойдут звонки. Код клиента — в поле, фамилию сверяй обязательно.'), 1500);
      phoneS.nextRing = performance.now() + 14000;
      bossS.nextTask = performance.now() + rand(90, 130) * 1000;
      bossS.nextCall = performance.now() + rand(50, 80) * 1000;
    }
  } else if (type === 'appClosed') {
    if (day.phase !== 'boot') setTimeout(() => bossSay('Зачем ты закрыл 1Ц? Запускай обратно, звонки идут!'), 800);
  } else if (type === 'orderSaved') {
    const active = phoneS.call && !phoneS.call.ended ? phoneS.call : null;
    let call = day.calls.find((c) => !c.evaluated && c.client.code === data.code && (c === active || c.ended));
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
  monitor: () => { if (S.mode === 'seated') enterWork(); else sitDown(true); },
  chair: () => sitDown(false),
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
  emptydesk: () => say('', 'Место Серёги. Ушёл в отпуск и не вернулся. Теперь здесь пусто.', { dur: 3 }),
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
  const near = S.mode === 'standing' && Math.hypot(S.pos.x + 1.75, S.pos.z) < 1.7;
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
    if (day.reportCount < day.done) { setCarry(null); bossSay('Тут не все заявки! Сформируй заново и перепечатай.'); addTask('report', 'Сводка: сформировать заново и распечатать', 0); removeTask('bring'); return; }
    setCarry(null); removeTask('bring');
    endDay();
    return;
  }
  if (bossS.summon) {
    if (!near) { bossSay('Встань и подойди. Я не буду кричать через весь офис.'); return; }
    scold();
    return;
  }
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
    ['Заявок принято', `${day.done} из ${DAY_ORDERS}`], ['Без ошибок', String(day.correct)], ['С ошибками', String(day.errors)],
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
  S.mode = 'rising';
  S.pos.set(0, 0, 0.62);
  startTrans(standPose, 0.5, () => { S.mode = 'standing'; updateHelp(); });
  $('hint').hidden = true;
}
function sitDown(thenWork) {
  if (S.mode !== 'standing') return;
  if (Math.hypot(S.pos.x, S.pos.z) > 1.6) { say('', 'Подойдите к своему креслу.', { dur: 1.6 }); return; }
  S.mode = 'sitting';
  S.yaw = Math.atan2(Math.sin(S.yaw), Math.cos(S.yaw));
  S.yaw = Math.abs(S.yaw) > 1.2 ? 0 : S.yaw;
  startTrans(seatedPose, 0.55, () => { S.mode = 'seated'; updateHelp(); if (thenWork) enterWork(); });
}
const R = 0.22;
function walkable(x, z) {
  const inArea = world.walk.some((a) => x >= a.x0 + R && x <= a.x1 - R && (a.door ? z >= a.z0 && z <= a.z1 : z >= a.z0 + R && z <= a.z1 - R));
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
    if (S.pointer) { const uv = screenUV(S.pointer); if (uv) pc.pointerMove(uv.x * pc.W, (1 - uv.y) * pc.H); }
  });
  if (S.locked) document.exitPointerLock?.();
  $('hint').hidden = true;
  document.body.classList.add('working');
}
function leaveWork() {
  if (S.mode !== 'work' && S.mode !== 'toWork') return;
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
$('stand').onclick = (e) => { e.stopPropagation(); if (S.mode === 'seated') standUp(); else if (S.mode === 'standing') sitDown(false); };
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
  $('crosshair').hidden = !S.locked;
  updateHelp();
});
document.addEventListener('pointerlockerror', () => { S.noLock = true; updateHelp(); });
canvas.addEventListener('pointerdown', (e) => {
  if (S.mode === 'intro' || S.mode === 'end') return;
  sfx.init();
  if (S.mode === 'work') {
    if (e.button === 2) { leaveWork(); return; }
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
  const uv = screenUV(e);
  if (uv) pc.wheel(uv.x * pc.W, (1 - uv.y) * pc.H, e.deltaY);
}, { passive: false });
function rotate(dx, dy, k) { S.yaw -= dx * k; S.pitch = THREE.MathUtils.clamp(S.pitch - dy * k, -1.25, 1.1); }

window.addEventListener('keydown', (e) => {
  if (S.mode === 'intro' || S.mode === 'end') return;
  // replies: F1–F4 always, 1–4 when not typing in 1C
  const fk = /^F([1-4])$/.exec(e.key);
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
  if (e.code === 'KeyF' && S.mode === 'seated') enterWork();
  if (e.code === 'Space') { e.preventDefault(); if (S.mode === 'seated') standUp(); else if (S.mode === 'standing') sitDown(false); }
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
  S.mode = 'seated'; S.yaw = 0;
  tryLock();
  updateHelp();
  addTask('launch', 'Запустить 1Ц: двойной щелчок по ярлыку на экране', 0);
  setTimeout(() => bossSay('Доброе утро! Я Алёна Владимировна, начальник отдела заявок. Запускай 1Ц — база «Хлебзавод — Заявки», пароль на стикере.'), 1800);
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
  const chair = world.playerChair;
  const seatedish = ['seated', 'intro', 'end', 'toSeat', 'sitting', 'toWork', 'work'].includes(S.mode);
  world.playerLegs.visible = seatedish;
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
      if (n === 'phone') label = phoneS.state === 'ringing' ? 'Ответить на звонок' : phoneS.state !== 'idle' ? 'Положить трубку' : day.missedList.length ? 'Перезвонить на пропущенный' : 'Снять трубку';
      if (n === 'lamp') label = lamp.on ? 'Выключить лампу' : 'Включить лампу';
      if (n === 'window') label = world.window.open ? 'Закрыть окно' : 'Открыть окно';
      if (n === 'boss') label = S.carry === 'coffee' ? 'Отдать кофе' : S.carry === 'report' ? 'Отдать сводку' : bossS.summon ? 'Подойти на разговор' : 'Поговорить с Алёной Владимировной';
      if (n === 'coffee') label = world.coffee.state === 'ready' ? 'Забрать кофе' : world.coffee.state === 'brew' ? 'Готовится…' : 'Сделать капучино';
      if (n === 'broom') label = S.carry === 'broom' ? 'Поставить веник' : 'Взять веник';
      if (n === 'crumbs') label = 'Подмести';
      if (n === 'printer' && world.printerPaper.visible) label = 'Забрать распечатку';
      if (n === 'chair') { if (S.mode !== 'standing') { h.obj = null; } label = 'Сесть'; }
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
  }

  // phone
  const canRing = day.phase === 'calls' && phoneS.state === 'idle' && !day.missedList.length && day.generated < DAY_ORDERS && phoneS.nextRing && now > phoneS.nextRing;
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
    if (!bossS.task && !bossS.summon && bossS.nextTask && now > bossS.nextTask && !subCurrent && day.phase === 'calls') { giveBossTask(); bossS.nextTask = 0; }
    if (!bossS.onPhone && bossS.nextCall && now > bossS.nextCall && !subCurrent && phoneS.state !== 'call') { bossS.nextCall = now + rand(80, 140) * 1000; bossPhoneCall(); }
  }
  bossS.phone += ((bossS.phoneTarget || 0) - bossS.phone) * Math.min(1, dt * 4);
  if (bossS.waveT && now > bossS.waveT) bossS.wave = 0;
  bossS.waveK = (bossS.waveK || 0) + ((bossS.wave || 0) - (bossS.waveK || 0)) * Math.min(1, dt * 5);
  boss.look += (boss.lookTarget - boss.look) * Math.min(1, dt * 4);
  boss.head.rotation.y = boss.look;
  boss.head.rotation.x = boss.look ? -0.05 : 0.1;
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
  world.pcLed.material.color.setHex(Math.random() < 0.08 ? 0x0a3a66 : 0x3cb0ff);

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

updateLcd();
updateHelp();
renderTasks();
renderStats();
requestAnimationFrame(frame);

// handy for poking at the scene from the devtools console
window.office = { S, day, pc, world, tasks, INTERACT, talkToBoss, enterWork, leaveWork, standUp, sitDown, startRinging, newCall, answer, phoneS, bossS, giveBossTask, choose, summon, endDay };
