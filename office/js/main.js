import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OneC } from './onec.js';
import { buildWorld } from './world.js';
import { Sfx } from './audio.js';
import { redraw, lcdState } from './textures.js';

const $ = (id) => document.getElementById(id);
const sfx = new Sfx();
const pad = (n) => String(n).padStart(2, '0');
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const isTouch = matchMedia('(pointer: coarse)').matches;

// ---------- renderer ----------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
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

// ---------- lights ----------
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
[[-1.75, -0.35], [1.75, -0.35], [0, 1.8]].forEach(([x, z]) => {
  const l = new THREE.PointLight(0xf2f5ff, 2.2, 0, 2);
  l.position.set(x, 2.55, z);
  scene.add(l);
});

// ---------- 1C on the monitor ----------
const onec = new OneC(1600, 900);
const screenTex = new THREE.CanvasTexture(onec.canvas);
screenTex.colorSpace = THREE.SRGBColorSpace;
screenTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

// handwriting on stickers/whiteboard uses a web font: give it a moment to load
try { await Promise.race([document.fonts.load('48px Caveat'), new Promise((r) => setTimeout(r, 2500))]); } catch { /* fall back to cursive */ }
const world = buildWorld(scene, { screenTex });
const { phone, mug, lamp, keyboard, colleagues } = world;
phone.handset.traverse((o) => { o.userData.interact = o === phone.handset ? 'phone' : undefined; });
phone.handset.userData.hint = 'Телефон';

// ---------- state ----------
const S = {
  mode: 'intro', yaw: 0, pitch: -0.28, locked: false,
  drag: null, pointer: null, hover: null,
  trans: null, premium: 0, coffee: 5,
};
const EYE = new THREE.Vector3(0, 1.2, 0.05);

function lookPose() {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(S.pitch, S.yaw, 0, 'YXZ'));
  const lean = Math.max(0, -S.pitch) * 0.08;
  const p = new THREE.Vector3(Math.sin(S.yaw) * 0.05, EYE.y - lean * 0.4, Math.cos(S.yaw) * 0.05);
  p.add(new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, S.yaw, 0))).multiplyScalar(lean));
  return { p, q };
}
function workPose() {
  const scr = world.screen;
  scr.updateMatrixWorld(true);
  const c = new THREE.Vector3().setFromMatrixPosition(scr.matrixWorld);
  const q = new THREE.Quaternion(); scr.getWorldQuaternion(q);
  const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  // frame the screen slightly below centre so the top band stays free for the HUD
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const viewH = Math.max(0.3206 / 0.78, 0.57 / 0.96 / camera.aspect);
  const dist = viewH / (2 * tanH);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const shift = Math.max(0, (viewH - 0.3206) / 2 - 0.004);
  return { p: c.clone().addScaledVector(n, dist).addScaledVector(up, Math.min(shift, viewH * 0.06)), q };
}

// ---------- HUD helpers ----------
const subsEl = $('subs');
const subQueue = [];
let subCurrent = null;
function say(who, text, { voice = 170, phoneVoice = false, dur, cls = '', onDone } = {}) {
  subQueue.push({ who, text, voice, phoneVoice, dur, cls, onDone });
  if (!subCurrent) nextSub();
}
function nextSub() {
  subCurrent = subQueue.shift() || null;
  if (!subCurrent) { if (!S.choices) subsEl.hidden = true; return; }
  const s = subCurrent;
  subsEl.hidden = false;
  subsEl.className = `subs ${s.cls}`;
  $('subs-who').textContent = s.who || '';
  $('subs-who').hidden = !s.who;
  $('subs-text').textContent = s.text;
  $('subs-choices').innerHTML = '';
  let d = s.dur;
  if (s.voice) { const v = sfx.babble(s.text, s.voice, s.phoneVoice); d = d || Math.max(2.2, v + 1.2); }
  d = d || Math.max(2.2, s.text.length * 0.055);
  s.timer = setTimeout(() => { s.onDone?.(); nextSub(); }, d * 1000);
}
function clearSubs() {
  subQueue.length = 0;
  if (subCurrent) clearTimeout(subCurrent.timer);
  subCurrent = null;
  subsEl.hidden = true;
}
function showChoices(options) {
  const box = $('subs-choices');
  box.innerHTML = '';
  subsEl.hidden = false;
  options.forEach(([label, fn], i) => {
    const b = document.createElement('button');
    b.className = 'choice';
    b.innerHTML = `<kbd>${i + 1}</kbd> ${label}`;
    b.onclick = (e) => { e.stopPropagation(); choose(i); };
    box.appendChild(b);
  });
  S.choices = options;
  if (S.locked) document.exitPointerLock?.();
}
function choose(i) {
  const c = S.choices?.[i];
  if (!c) return;
  S.choices = null;
  $('subs-choices').innerHTML = '';
  c[1]();
}

let notifyT;
function notify(text, good = true) {
  const el = $('notify');
  el.textContent = text;
  el.className = `notify ${good ? 'good' : 'bad'} show`;
  clearTimeout(notifyT);
  notifyT = setTimeout(() => (el.className = 'notify'), 3200);
}

// ---------- tasks ----------
const tasks = [];
const TASKS = {
  lutik: { text: '«Лютик»: реализация, степлеры ×5', reward: 500, check: (t, d) => t === 'posted' && d.type === 'sale' && d.partner === 'lutik' && d.rows.some((r) => r.product === 'stapler' && r.qty >= 5) },
  romashka: { text: '«Ромашка»: реализация, бумага А4 ×20', reward: 700, check: (t, d) => t === 'posted' && d.type === 'sale' && d.partner === 'romashka' && d.rows.some((r) => r.product === 'paper' && r.qty >= 20) },
  report: { text: 'Директору: сформировать «Анализ продаж»', reward: 400, check: (t, d) => t === 'report' && d === 'sales' },
  techno: { text: '«ТехноСнаб»: поступление, картриджи ×5', reward: 600, check: (t, d) => t === 'posted' && d.type === 'purchase' && d.partner === 'technosnab' && d.rows.some((r) => r.product === 'cart' && r.qty >= 5) },
  sidorov: { text: 'Выписка: оплата от ИП Сидоров 15 000 ₽', reward: 500, check: (t, d) => t === 'posted' && d.type === 'bank' && d.partner === 'sidorov' && d.sum >= 15000 },
  print: { text: 'Людмиле Петровне: распечатать накладную', reward: 300, check: (t) => t === 'print' },
};
function addTask(id) {
  if (tasks.some((t) => t.id === id && !t.done)) return;
  tasks.push({ id, ...TASKS[id], done: false });
  renderTasks();
  notify(`Новая задача: ${TASKS[id].text}`);
}
function renderTasks() {
  const ul = $('task-list');
  ul.innerHTML = '';
  const visible = tasks.filter((t) => !t.done || performance.now() - t.doneAt < 8000);
  $('tasks').hidden = !visible.length && !S.premium;
  visible.forEach((t) => {
    const li = document.createElement('li');
    li.className = t.done ? 'done' : '';
    li.innerHTML = `<span class="box" aria-hidden="true"></span><span>${t.text}</span>`;
    ul.appendChild(li);
  });
  $('premium').textContent = `${S.premium.toLocaleString('ru-RU')} ₽`;
}
function onAppEvent(type, data) {
  if (type === 'click') sfx.click();
  if (type === 'error') sfx.error();
  if (type === 'print') { sfx.printer(); world.printerPaper.visible = true; S.paperT = performance.now(); }
  let any = false;
  for (const t of tasks) {
    if (!t.done && t.check(type, data)) {
      t.done = true; t.doneAt = performance.now();
      S.premium += t.reward;
      any = true;
      notify(`Готово: ${t.text}   +${t.reward} ₽ к премии`);
      setTimeout(renderTasks, 8200);
    }
  }
  if (any) {
    renderTasks();
    setTimeout(() => lpSay(pick(['Вот, можешь, когда хочешь.', 'Молодец. Премию не обещаю, но запишу.', 'Ну хоть кто-то в этом отделе работает.'])), 1500);
  }
}
onec.onEvent = onAppEvent;

// ---------- colleagues ----------
const [LP, SG] = colleagues;
LP.lookAtPlayer = -0.95; SG.lookAtPlayer = 0.95;
function lpSay(text, o = {}) { speak(LP, text, { voice: 230, ...o }); }
function sgSay(text, o = {}) { speak(SG, text, { voice: 125, ...o }); }
function speak(c, text, o) {
  say(c === LP ? 'Людмила Петровна' : 'Серёга', text, {
    ...o,
    onDone: () => { c.lookTarget = 0; o.onDone?.(); },
  });
  c.lookTarget = c.lookAtPlayer;
  c.typingPause = performance.now() + 4000;
}
const CHATTER = [
  [LP, 'Кто опять брал мой степлер? Верните на место.'],
  [LP, 'Серёжа, ты работаешь или в косынку играешь?'],
  [SG, 'Я работаю. Косынка — это для концентрации.'],
  [LP, 'Опять 1Ц обновление просит… Не нажимайте ничего!'],
  [LP, 'Закройте кто-нибудь окно, дует.'],
  [LP, 'В пятницу инвентаризация. Никто не уходит в пять.'],
  [SG, 'Слушай, а как в 1Ц отчёт в эксель выгрузить? Ладно, сам разберусь.'],
  [SG, 'Кофемашина опять сломалась. Живём на кулере.'],
  [SG, 'Опять у меня отрицательные остатки. Это не я.'],
  [LP, 'Я в двухтысячном вообще в ДОСе проводки делала. И ничего.'],
  [SG, 'До пятницы продержаться бы.'],
  [LP, 'Акты сверки с «Горизонтом» кто-нибудь видел?'],
];
let chatterIdx = 0;
function scheduleChatter() {
  setTimeout(() => {
    if (S.mode !== 'intro' && !subCurrent && phoneS.state === 'idle') {
      const [c, t] = CHATTER[chatterIdx++ % CHATTER.length];
      (c === LP ? lpSay : sgSay)(t);
    }
    scheduleChatter();
  }, rand(38, 75) * 1000);
}
const POKE = {
  'Людмила Петровна': ['Что? Работай давай, отчётность сама себя не сдаст.', 'Если про отпуск — график на перегородке. Там всё занято.', 'Ты накладную для «Лютика» провёл? Я проверю.', 'Не отвлекай, у меня сверка не сходится на три рубля.'],
  'Серёга': ['А? Я не играю. Это… отчёт такой.', 'Хочешь, научу пасьянс раскладывать? Шучу. Почти.', 'Слушай, не в курсе, премию в этом квартале дадут?', 'Если что, я на встрече. Внутренней.'],
};

// ---------- phone ----------
const phoneS = { state: 'idle', nextRing: 0, ringStart: 0, lastRing: 0, missed: 0, holding: false, script: null };
const CALLS = [
  {
    who: 'ООО «Ромашка»', lines: ['Добрый день! Это «Ромашка», отдел снабжения.', 'Нам срочно нужна накладная на бумагу А4, двадцать пачек. Оформите?'],
    choices: [['Сейчас оформлю', () => { callSay('Отлично, ждём! Спасибо.'); addTask('romashka'); }], ['Позвоните завтра', () => callSay('Завтра? Ну… хорошо. Мы запомним.')]],
  },
  {
    who: 'Директор', voice: 110, lines: ['Это Громов. Зайди ко мне… а, нет, сиди.', 'Мне к вечеру нужен анализ продаж. Сформируй в 1Ц, я посмотрю.'],
    choices: [['Сделаю, Виктор Павлович', () => { callSay('Вот и хорошо.'); addTask('report'); }], ['А можно завтра?', () => { callSay('Можно. Но не нужно. Жду сегодня.'); addTask('report'); }]],
  },
  {
    who: 'ООО «ТехноСнаб»', lines: ['Здравствуйте, «ТехноСнаб». Мы вам картриджи отгрузили, пять штук.', 'Оприходуйте, пожалуйста, чтобы акт сверки сошёлся.'],
    choices: [['Оприходую', () => { callSay('Спасибо, всего доброго!'); addTask('techno'); }], ['Какие картриджи?', () => { callSay('Восемьдесят пятые. Пять штук. Они у вас у принтера стоят.'); addTask('techno'); }]],
  },
  {
    who: 'Банк', voice: 200, lines: ['Добрый день, это ваш менеджер из банка.', 'Поступила оплата от ИП Сидоров, пятнадцать тысяч рублей. Отразите выписку.'],
    choices: [['Спасибо, отражу', () => { callSay('Хорошего дня!'); addTask('sidorov'); }]],
  },
  {
    who: 'Налоговая инспекция', voice: 150, lines: ['Вас беспокоит налоговая инспекция.', 'Направлено требование о представлении пояснений по НДС. Срок — пять рабочих дней.'],
    choices: [['Направим в срок', () => callSay('Ждём. До свидания.')], ['Бухгалтер вышел', () => callSay('Мы перезвоним. Мы всегда перезваниваем.')]],
  },
  {
    who: 'Неизвестный номер', voice: 140, lines: ['Алло! Это пиццерия? Одну «Четыре сыра» и две колы.'],
    choices: [['Вы ошиблись номером', () => callSay('Ой. А пиццу вы тоже не делаете?')], ['Уже везём', () => callSay('Отлично! Адрес вы знаете?')]],
  },
  {
    who: 'Робот', voice: 260, lines: ['Здравствуйте! Вам предварительно одобрен кредит на выгодных условиях! Оставайтесь на линии…'],
    choices: [['Положить трубку', () => hangUp()]],
  },
  {
    who: 'Мама', voice: 210, lines: ['Алло, это мама. Ты там поел? Шапку надел?'],
    choices: [['Мам, я на работе', () => callSay('Ну работай, работай. Вечером позвони!')], ['Поел', () => callSay('Молодец. Не сиди долго за компьютером, глаза испортишь.')]],
  },
];
let callOrder = [0, 1, 2, 3, 4, 5, 6, 7];
function nextCall() {
  if (!callOrder.length) callOrder = [0, 1, 2, 3, 4, 5, 6, 7].sort(() => Math.random() - 0.5);
  return CALLS[callOrder.shift()];
}
function callSay(text, end = true) {
  const c = phoneS.script;
  say(c.who, text, { voice: c.voice || 180, phoneVoice: true, cls: 'phone', onDone: end ? () => setTimeout(() => { if (phoneS.state === 'call') hangUp(true); }, 500) : undefined });
}
function updateLcd(extra = {}) {
  const now = new Date();
  const st = { line1: `${pad(now.getHours())}:${pad(now.getMinutes())}   ${pad(now.getDate())}.${pad(now.getMonth() + 1)}`, line2: phoneS.missed ? `Пропущ.: ${phoneS.missed}` : 'Вн. 214', ...extra };
  if (phoneS.state === 'ringing') { st.line2 = 'Вх. вызов…'; st.backlight = true; }
  if (phoneS.state === 'call') { st.line2 = phoneS.script ? phoneS.script.who.slice(0, 14) : 'Разговор'; st.backlight = true; }
  if (phoneS.state === 'offhook') { st.line2 = 'Набор номера'; st.backlight = true; }
  lcdState(phone.topTex, st);
}
function startRinging() {
  phoneS.state = 'ringing';
  phoneS.ringStart = performance.now();
  phoneS.lastRing = 0;
  phoneS.script = nextCall();
  $('ring').hidden = false;
  updateLcd();
}
function answer() {
  phoneS.state = 'call';
  $('ring').hidden = true;
  liftHandset(true);
  sfx.pickup();
  clearSubs();
  const c = phoneS.script;
  updateLcd();
  c.lines.forEach((l, i) => say(c.who, l, { voice: c.voice || 180, phoneVoice: true, cls: 'phone', onDone: i === c.lines.length - 1 ? () => { if (phoneS.state === 'call') showChoices(c.choices); } : undefined }));
}
function hangUp(auto) {
  if (phoneS.state === 'offhook') sfx.dialTone(false);
  if (phoneS.state === 'call' && !auto) clearSubs();
  phoneS.state = 'idle';
  phoneS.script = null;
  S.choices = null;
  $('subs-choices').innerHTML = '';
  liftHandset(false);
  sfx.hangup();
  phoneS.nextRing = performance.now() + rand(45, 95) * 1000;
  updateLcd();
}
function phoneClick() {
  if (phoneS.state === 'ringing') answer();
  else if (phoneS.state === 'idle') {
    phoneS.state = 'offhook';
    liftHandset(true); sfx.pickup(); sfx.dialTone(true);
    updateLcd();
    say('', 'Длинный гудок. Звонить некому — все и так рядом сидят.', { voice: 0, dur: 3 });
  } else hangUp();
}

// handset / mug animation towards the face
const handsetOffset = new THREE.Vector3(-0.25, -0.1, -0.27);
const handsetRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.35, -Math.PI / 2 + 0.5, 0.2, 'YXZ'));
function liftHandset(up) {
  phoneS.holding = up;
  phoneS.anim = { t: 0, from: { p: new THREE.Vector3(), q: new THREE.Quaternion() } };
  phone.handset.getWorldPosition(phoneS.anim.from.p);
  phone.handset.getWorldQuaternion(phoneS.anim.from.q);
  if (up && phone.handset.parent !== scene) scene.attach(phone.handset);
}
function updateHandset(dt) {
  const a = phoneS.anim;
  if (!a && !phoneS.holding) return;
  const hs = phone.handset;
  let tp, tq;
  if (phoneS.holding) {
    tp = handsetOffset.clone().applyMatrix4(camera.matrixWorld);
    tq = camera.quaternion.clone().multiply(handsetRot);
  } else {
    phone.group.updateMatrixWorld(true);
    tp = phone.rest.pos.clone().applyMatrix4(phone.group.matrixWorld);
    tq = phone.group.getWorldQuaternion(new THREE.Quaternion()).multiply(phone.rest.quat);
  }
  if (a) {
    a.t = Math.min(1, a.t + dt / 0.45);
    const e = a.t * a.t * (3 - 2 * a.t);
    hs.position.lerpVectors(a.from.p, tp, e);
    hs.quaternion.slerpQuaternions(a.from.q, tq, e);
    if (a.t >= 1) {
      phoneS.anim = null;
      if (!phoneS.holding) { phone.group.attach(hs); hs.position.copy(phone.rest.pos); hs.quaternion.copy(phone.rest.quat); }
    }
  } else { hs.position.copy(tp); hs.quaternion.copy(tq); }
  phone.updateCord();
}

const mugAnim = { t: -1 };
function drink() {
  if (mugAnim.t >= 0) return;
  if (S.coffee <= 0) { say('', 'Кружка пуста. Кофемашина сломана, кулер за спиной — а вставать нельзя.', { voice: 0, dur: 3.5 }); return; }
  mugAnim.t = 0;
  mugAnim.home = { p: mug.group.position.clone(), q: mug.group.quaternion.clone() };
  sfx.sip();
  S.coffee--;
  setTimeout(() => {
    mug.coffee.position.y = 0.02 + 0.065 * (S.coffee / 5);
    mug.coffee.visible = S.coffee > 0;
    say('', ['Кофе. Остывший, но свой.', 'Ещё глоток — и за накладные.', 'Растворимый. Зато бодрит.', 'Последние капли…', 'Всё. Кружка пуста.'][4 - S.coffee], { voice: 0, dur: 2.5 });
  }, 900);
}
function updateMug(dt) {
  if (mugAnim.t < 0) return;
  mugAnim.t += dt;
  const T = mugAnim.t;
  const k = T < 0.5 ? T / 0.5 : T < 1.6 ? 1 : Math.max(0, 1 - (T - 1.6) / 0.5);
  const e = k * k * (3 - 2 * k);
  const g = mug.group;
  const target = new THREE.Vector3(0.02, -0.14, -0.2).applyMatrix4(camera.matrixWorld);
  const home = mugAnim.home;
  const tq = camera.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.9, -2.2, 0)));
  g.position.lerpVectors(home.p, target, e);
  g.quaternion.slerpQuaternions(home.q, tq, e);
  if (T > 2.1) { g.position.copy(home.p); g.quaternion.copy(home.q); mugAnim.t = -1; }
}

// ---------- interactions ----------
const INTERACT = {
  monitor: () => enterWork(),
  phone: () => phoneClick(),
  mug: () => drink(),
  lamp: () => {
    lamp.on = !lamp.on;
    lamp.light.intensity = lamp.on ? 0.9 : 0;
    lamp.bulb.material.emissiveIntensity = lamp.on ? 3 : 0;
    sfx.lampSwitch();
  },
  stapler: () => { sfx.stapler(); S.stapleT = 0; },
  clock: () => {
    const now = new Date();
    const end = new Date(now); end.setHours(18, 0, 0, 0);
    const left = end - now;
    const txt = left > 0 ? `Сейчас ${pad(now.getHours())}:${pad(now.getMinutes())}. До конца рабочего дня ${Math.floor(left / 3600000)} ч ${Math.floor((left % 3600000) / 60000)} мин.` : `Уже ${pad(now.getHours())}:${pad(now.getMinutes())}. Рабочий день закончился, а вы всё ещё сидите.`;
    say('', txt, { voice: 0, dur: 3.5 });
  },
  calendar: () => {
    const now = new Date();
    const d25 = new Date(now.getFullYear(), now.getMonth() + (now.getDate() > 25 ? 1 : 0), 25);
    const days = Math.ceil((d25 - now) / 86400000);
    say('', `Сегодня ${now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })}. До 25-го числа — ${days} дн. Отчётность ждёт.`, { voice: 0, dur: 3.8 });
  },
  whiteboard: () => say('', 'На доске сроки на октябрь. Внизу красным обведено «НЕ ТРОГАТЬ».', { voice: 0, dur: 3.2 }),
  printer: () => say('', 'МФУ стоит у стены за спиной. Отсюда не дотянуться, а вставать нельзя.', { voice: 0, dur: 3.2 }),
  cooler: () => say('', 'Кулер. Близко, но недостижимо: вы же сидите.', { voice: 0, dur: 3 }),
  calc: () => say('', `Калькулятор показывает 1 245 300. Что это было — уже никто не помнит.`, { voice: 0, dur: 3.2 }),
  papers: () => say('', 'Лоток с первичкой. Верхний лист — счёт от «Канцмира» за прошлый квартал.', { voice: 0, dur: 3.4 }),
  cactus: () => say('', 'Кактус поглощает излучение монитора. Так сказала Людмила Петровна.', { voice: 0, dur: 3.2 }),
  colleague: (obj) => {
    const name = obj.userData.person;
    const lines = POKE[name];
    (name === 'Серёга' ? sgSay : lpSay)(pick(lines));
  },
};
function findInteract(obj) {
  while (obj) { if (obj.userData?.interact) return obj; obj = obj.parent; }
  return null;
}
const raycaster = new THREE.Raycaster();
raycaster.far = 6;
function rayAt(ndcX, ndcY) {
  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  // first solid surface along the ray (skip window glass)
  const first = hits.find((h) => h.object.visible && !(h.object.material?.transparent && h.object.material.opacity < 0.3));
  return first ? findInteract(first.object) : null;
}
function pointerNdc(e) {
  return [(e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1];
}
function doInteract(obj) {
  if (!obj) return;
  INTERACT[obj.userData.interact]?.(obj);
}

// ---------- work mode ----------
function enterWork() {
  if (S.mode !== 'look') return;
  S.yaw = Math.atan2(Math.sin(S.yaw), Math.cos(S.yaw));
  world.playerChair.rotation.y = S.yaw;
  const from = { p: camera.position.clone(), q: camera.quaternion.clone() };
  S.mode = 'toWork';
  S.trans = { t: 0, from };
  if (S.locked) document.exitPointerLock?.();
  $('hint').hidden = true;
  document.body.classList.add('working');
  $('crosshair').hidden = true;
}
function leaveWork() {
  if (S.mode !== 'work') return;
  onec.pointerLeave();
  if (onec.edit) onec.commitEdit();
  S.mode = 'toLook';
  S.trans = { t: 0, from: { p: camera.position.clone(), q: camera.quaternion.clone() } };
  document.body.classList.remove('working');
  $('numpad').hidden = true;
}
$('leave').onclick = (e) => { e.stopPropagation(); leaveWork(); if (!isTouch) setTimeout(tryLock, 50); };

function screenUV(e) {
  const [x, y] = pointerNdc(e);
  raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
  const hit = raycaster.intersectObject(world.screen, false)[0];
  return hit ? hit.uv : null;
}
function moveDeskMouse(uv) {
  const m = world.mouse.mouse;
  m.position.x = (uv.x - 0.5) * 0.09;
  m.position.z = 0.01 - (uv.y - 0.5) * 0.07;
}

// ---------- pointer handling ----------
function tryLock() {
  if (isTouch || !(S.mode === 'look' || S.mode === 'toLook') || !canvas.requestPointerLock) return;
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => { S.noLock = true; });
  } catch { S.noLock = true; }
}
document.addEventListener('pointerlockchange', () => {
  S.locked = document.pointerLockElement === canvas;
  $('crosshair').hidden = !S.locked || S.mode !== 'look';
  if (!S.locked && S.mode === 'look') $('hint').hidden = true;
  updateHelp();
});
document.addEventListener('pointerlockerror', () => { S.noLock = true; updateHelp(); });

canvas.addEventListener('pointerdown', (e) => {
  if (S.mode === 'intro') return;
  sfx.init();
  if (S.mode === 'work') {
    if (e.button === 2) { leaveWork(); return; }
    const uv = screenUV(e);
    if (uv) { onec.click(uv.x * onec.W, (1 - uv.y) * onec.H); moveDeskMouse(uv); }
    else if (!isTouch) leaveWork();
    return;
  }
  if (S.mode !== 'look') return;
  if (S.locked) { doInteract(S.hover); return; }
  S.drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId };
  canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  S.pointer = e;
  if (S.mode === 'work') {
    const uv = screenUV(e);
    if (uv) { onec.pointerMove(uv.x * onec.W, (1 - uv.y) * onec.H); moveDeskMouse(uv); canvas.style.cursor = 'none'; }
    else { onec.pointerLeave(); canvas.style.cursor = 'default'; }
    return;
  }
  if (S.mode !== 'look') return;
  if (S.locked) { rotate(e.movementX, e.movementY, 0.0022); return; }
  if (S.drag) {
    const dx = e.clientX - S.drag.x, dy = e.clientY - S.drag.y;
    S.drag.moved += Math.abs(dx) + Math.abs(dy);
    S.drag.x = e.clientX; S.drag.y = e.clientY;
    rotate(dx, dy, isTouch ? 0.006 : 0.004);
  }
});
canvas.addEventListener('pointerup', (e) => {
  if (S.mode !== 'look' || !S.drag) return;
  const tap = S.drag.moved < 8;
  S.drag = null;
  if (tap) {
    const [x, y] = pointerNdc(e);
    const obj = rayAt(x, y);
    if (obj) doInteract(obj);
    else if (!S.noLock) tryLock();
  }
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => {
  if (S.mode !== 'work') return;
  e.preventDefault();
  const uv = screenUV(e);
  if (uv) onec.wheel(uv.x * onec.W, (1 - uv.y) * onec.H, e.deltaY);
}, { passive: false });
function rotate(dx, dy, k) {
  S.yaw -= dx * k;
  S.pitch = THREE.MathUtils.clamp(S.pitch - dy * k, -1.25, 1.1);
}

window.addEventListener('keydown', (e) => {
  if (S.mode === 'intro') return;
  if (S.choices && /^[1-9]$/.test(e.key) && !(S.mode === 'work' && onec.edit)) { choose(+e.key - 1); e.preventDefault(); return; }
  if (S.mode === 'work') {
    const k = keyboard.keys[e.code];
    if (k) { k.position.y = k.userData.baseY - 0.004; setTimeout(() => (k.position.y = k.userData.baseY), 90); }
    sfx.key();
    const used = onec.key(e);
    if (!used && e.key === 'Escape') leaveWork();
    if (used || ['Tab', 'Backspace', ' ', 'ArrowUp', 'ArrowDown', 'Enter'].includes(e.key) || (e.ctrlKey && /^[sfnSFN]$/.test(e.key))) e.preventDefault();
    return;
  }
  if (S.mode === 'look') {
    if (e.code === 'KeyE' || e.code === 'Space') { doInteract(S.hover); e.preventDefault(); }
    if (e.code === 'KeyF') enterWork();
  }
});

// touch numpad for editing numbers on phones
$('numpad').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  e.stopPropagation();
  const key = b.dataset.k;
  onec.key({ key, ctrlKey: false, metaKey: false });
});

// ---------- help / HUD ----------
function updateHelp() {
  const el = $('help-look');
  if (isTouch) el.textContent = 'Проведите пальцем — осмотреться. Нажмите на предмет — действие.';
  else if (S.locked) el.textContent = 'Мышь — осмотреться · ЛКМ / E — действие · F — за компьютер · Esc — отпустить курсор';
  else el.textContent = 'Кликните по сцене, чтобы управлять взглядом мышью (или тяните мышью)';
}
$('mute').onclick = (e) => {
  e.stopPropagation();
  sfx.init();
  sfx.setMuted(!sfx.muted);
  $('mute').setAttribute('aria-pressed', String(sfx.muted));
  $('mute').textContent = sfx.muted ? 'Звук выкл.' : 'Звук вкл.';
};
$('start').onclick = () => {
  sfx.init();
  $('intro').hidden = true;
  document.body.classList.add('started');
  S.mode = 'look';
  S.yaw = 0;
  tryLock();
  updateHelp();
  phoneS.nextRing = performance.now() + 26000;
  setTimeout(() => lpSay('Новенький? Я Людмила Петровна, главбух. Для начала проведи реализацию для «Лютика»: пять степлеров.', {
    onDone: () => { addTask('lutik'); say('', 'Подсказка: кликните по монитору → раздел «Продажи» → «Реализация» → «Создать».', { voice: 0, dur: 5.5, cls: 'tip' }); },
  }), 2500);
  setTimeout(() => sgSay('Привет. Я Серёга. Если что — я очень занят.'), 16000);
  scheduleChatter();
  setTimeout(() => { if (!tasks.some((t) => t.id === 'print')) lpSay('И распечатай мне потом любую накладную. Из формы документа, кнопка «Печать».', { onDone: () => addTask('print') }); }, 140000);
};

// ---------- main loop ----------
const clock = new THREE.Clock();
let lastSec = -1;
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const now = performance.now();
  const t = now / 1000;

  // camera
  if (S.mode === 'look' || S.mode === 'intro') {
    if (S.mode === 'intro') S.yaw = Math.sin(t * 0.12) * 0.35;
    const { p, q } = lookPose();
    camera.position.copy(p); camera.quaternion.copy(q);
    camera.position.y += Math.sin(t * 1.6) * 0.002;
  } else if (S.trans) {
    const toWork = S.mode === 'toWork';
    S.trans.t = Math.min(1, S.trans.t + dt / 0.6);
    const e = 1 - Math.pow(1 - S.trans.t, 3);
    const target = toWork ? workPose() : lookPose();
    camera.position.lerpVectors(S.trans.from.p, target.p, e);
    camera.quaternion.slerpQuaternions(S.trans.from.q, target.q, e);
    if (S.trans.t >= 1) {
      S.mode = toWork ? 'work' : 'look';
      S.trans = null;
      if (S.mode === 'work' && S.pointer) {
        const uv = screenUV(S.pointer);
        if (uv) onec.pointerMove(uv.x * onec.W, (1 - uv.y) * onec.H);
      }
    }
  } else if (S.mode === 'work') {
    const { p, q } = workPose();
    camera.position.copy(p); camera.quaternion.copy(q);
  }
  const chair = world.playerChair;
  if (S.mode === 'look' || S.mode === 'intro') chair.rotation.y = S.yaw;
  else chair.rotation.y += ((S.mode === 'toLook' ? S.yaw : 0) - chair.rotation.y) * Math.min(1, dt * 8);
  camera.updateMatrixWorld();

  // hover hint
  if (S.mode === 'look') {
    let obj = null;
    if (S.locked) obj = rayAt(0, 0);
    else if (S.pointer && !S.drag && !isTouch) obj = rayAt(...pointerNdc(S.pointer));
    S.hover = obj;
    const hint = $('hint');
    if (obj) {
      let label = obj.userData.hint;
      if (obj.userData.interact === 'phone') label = phoneS.state === 'ringing' ? 'Ответить на звонок' : phoneS.state === 'idle' ? 'Снять трубку' : 'Положить трубку';
      if (obj.userData.interact === 'lamp') label = lamp.on ? 'Выключить лампу' : 'Включить лампу';
      if (obj.userData.interact === 'mug') label = S.coffee > 0 ? 'Отпить кофе' : 'Кружка пуста';
      if (obj.userData.interact === 'colleague') label = `Поговорить: ${obj.userData.hint}`;
      hint.textContent = label;
      hint.hidden = false;
      if (!S.locked && S.pointer) { hint.style.left = `${S.pointer.clientX}px`; hint.style.top = `${S.pointer.clientY + 22}px`; hint.classList.add('at-pointer'); }
      else { hint.style.left = ''; hint.style.top = ''; hint.classList.remove('at-pointer'); }
      canvas.style.cursor = S.locked ? 'none' : 'pointer';
    } else { hint.hidden = true; canvas.style.cursor = S.locked ? 'none' : 'grab'; }
    $('crosshair').classList.toggle('active', !!obj);
  }

  // phone
  if (S.mode !== 'intro' && phoneS.state === 'idle' && phoneS.nextRing && now > phoneS.nextRing && !subCurrent) startRinging();
  if (phoneS.state === 'ringing') {
    if (now - phoneS.lastRing > 3000) { phoneS.lastRing = now; sfx.ringOnce(); }
    const led = Math.floor(now / 250) % 2 === 0;
    if (led !== phoneS.led) { phoneS.led = led; updateLcd({ led }); }
    phone.handset.position.y = phone.rest.pos.y + (now - phoneS.lastRing < 1000 ? Math.sin(now * 0.12) * 0.0012 : 0);
    if (now - phoneS.ringStart > 24000) {
      phoneS.state = 'idle'; phoneS.missed++; phoneS.nextRing = now + rand(40, 80) * 1000;
      $('ring').hidden = true; updateLcd();
      phone.handset.position.copy(phone.rest.pos);
      lpSay(pick(['Трубку кто-нибудь возьмёт? Это же твой телефон.', 'Опять пропустил звонок. Потом не жалуйся.']));
    }
  }
  updateHandset(dt);
  updateMug(dt);

  // stapler press
  if (S.stapleT != null) {
    S.stapleT += dt;
    world.staplerTop.position.y = 0.028 - Math.sin(Math.min(1, S.stapleT / 0.2) * Math.PI) * 0.01;
    if (S.stapleT > 0.2) { world.staplerTop.position.y = 0.028; S.stapleT = null; }
  }
  if (S.paperT && now - S.paperT > 6000) { world.printerPaper.visible = false; S.paperT = 0; }

  // colleagues
  colleagues.forEach((c, i) => {
    c.look += (c.lookTarget - c.look) * Math.min(1, dt * 4);
    c.head.rotation.y = c.look;
    c.head.rotation.x = c.look ? -0.05 : 0.12;
    const busy = c.typingPause && now < c.typingPause;
    const typing = !busy && Math.sin(t * 0.3 + c.phase) > -0.3;
    c.arms.forEach((a, k) => {
      if (i === 1 && k === 1) { a.rotation.x = 0; a.rotation.y = typing ? Math.sin(t * 1.3 + c.phase) * 0.05 : 0; return; }
      a.rotation.x = typing ? Math.sin(t * 17 + k * 1.7 + c.phase) * 0.06 : 0;
    });
    if (typing && Math.random() < dt * (i === 0 ? 9 : 2) && S.mode !== 'intro') sfx.colleagueKey();
    if (!c.lookTarget && Math.random() < dt * 0.02) { c.lookTarget = c.lookAtPlayer * 0.5; setTimeout(() => (c.lookTarget = 0), 1500); }
  });

  // per-second updates
  const sec = Math.floor(t);
  if (sec !== lastSec) {
    lastSec = sec;
    redraw(world.clockTex);
    onec.dirty = true;
    $('hud-time').textContent = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (sec % 30 === 0 && phoneS.state === 'idle') updateLcd();
  }
  world.pcLed.material.color.setHex(Math.random() < 0.08 ? 0x0a3a66 : 0x3cb0ff);

  // screen
  if (onec.dirty || onec.needsAnim()) { onec.draw(); screenTex.needsUpdate = true; }
  $('numpad').hidden = !(isTouch && S.mode === 'work' && onec.edit);

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
requestAnimationFrame(frame);

// handy for poking at the scene from the devtools console
window.office = { S, onec, world, enterWork, leaveWork, startRinging, answer };
