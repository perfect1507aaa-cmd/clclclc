import { CFG, SNAKE_COLORS, EMOTES } from './config.js';
import { World } from './world.js';
import { OnlineSim, ROOM_CAP } from './online.js';
import { Population } from './population.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Hud } from './hud.js';
import { escapeHtml, pick, chance, rand } from './util.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, def) {
    try {
      const v = localStorage.getItem(k);
      return v === null ? def : v;
    } catch {
      return def;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

const canvas = $('game');
const renderer = new Renderer(canvas);
const hud = new Hud();
const sound = new Sound();
const online = new OnlineSim();

let world = null;
let pop = null;
let room = null;
let player = null;
let state = 'menu'; // menu | playing | dead
let spectate = null;
let deathAt = 0;
let lastInput = 'key';
let lastEmoteAt = -10;
let selectedRoomId = 'auto';
let color = store.get('pl.color', pick(SNAKE_COLORS));
let controlMode = store.get('pl.control', 'keys');
let lastInfo = null;

// ---------- world lifecycle ----------

function enterRoom(r) {
  room = r;
  world = new World();
  pop = new Population(world, online);
  pop.setRoom(r);
  // let the arena "have been running" for a while before anyone looks at it
  for (let i = 0; i < 20 * 30; i++) stepWorld(1 / 30, true);
  renderer.particles.length = 0;
  renderer.ghosts.length = 0;
  const k = world.king;
  if (k) renderer.updateCamera(k.head.x, k.head.y, renderer.baseZoom() * 0.6, 0, true);
}

function stepWorld(dt, silent) {
  world.step(dt);
  for (const ev of world.events) handleEvent(ev, silent);
  world.events.length = 0;
  pop.update(dt, state !== 'menu');
}

function handleEvent(ev, silent) {
  if (ev.type === 'death' || ev.type === 'leave') {
    if (!silent) renderer.onDeath(ev.snake);
    if (ev.type === 'death') pop.onDeath(ev);
    else if (ev.snake.owner) pop.onDeath(ev);
  }
  if (silent) return;
  if (ev.type === 'eat') sound.eat();
  if (ev.type !== 'death') return;
  const s = ev.snake;
  const k = ev.killer;
  if (s.isPlayer) {
    onPlayerDeath(ev);
  } else if (k && k.isPlayer) {
    sound.kill();
    hud.showNotice(`Вы уничтожили ${s.name}!`, world.time);
  }
  // kill feed: anything involving you or the top of the leaderboard
  const big = s.score > 250 || (k && world.rankOf(k) <= 3);
  if (k && (s.isPlayer || k.isPlayer || big)) {
    hud.addFeed(`<b style="color:${k.color}">${escapeHtml(k.name)}</b> <span class="bolt">⚡</span> <b style="color:${s.color}">${escapeHtml(s.name)}</b> <span class="dim">${Math.floor(s.score)}</span>`);
  }
}

// ---------- player ----------

function play() {
  sound.unlock();
  const name = ($('nick').value.trim() || 'Unnamed').slice(0, 16);
  store.set('pl.nick', name);
  const want = selectedRoomId === 'auto' ? online.bestRoom() : online.rooms.find((r) => r.id === selectedRoomId) || online.bestRoom();
  if (!world || want !== room) enterRoom(want);
  player = world.addSnake({ name, color, isPlayer: true });
  state = 'playing';
  spectate = null;
  $('menu').classList.add('hidden');
  $('death').classList.add('hidden');
  hud.show(true);
  renderer.updateCamera(player.head.x, player.head.y, zoomFor(player), 0, true);
}

function onPlayerDeath(ev) {
  sound.death();
  sound.setCharge(0);
  state = 'dead';
  deathAt = world.time;
  const s = ev.snake;
  spectate = ev.killer && ev.killer.alive ? ev.killer : null;
  const best = Math.max(+store.get('pl.best', 0), Math.floor(s.maxScore));
  store.set('pl.best', best);
  lastInfo = {
    title: ev.killer ? `Вас уничтожил ${ev.killer.name}` : ev.reason === 'wall' ? 'Вы врезались в стену' : 'Вы врезались в себя',
    score: Math.floor(s.score),
    max: Math.floor(s.maxScore),
    kills: s.kills,
    time: world.time - s.born,
    rank: s.bestRank === 999 ? '—' : s.bestRank,
    best,
  };
  setTimeout(showDeathScreen, 1400);
}

function showDeathScreen() {
  if (state !== 'dead' || !lastInfo) return;
  const i = lastInfo;
  const m = Math.floor(i.time / 60);
  const sec = Math.floor(i.time % 60);
  $('death-title').textContent = i.title;
  $('d-score').textContent = i.max;
  $('d-kills').textContent = i.kills;
  $('d-time').textContent = `${m}:${String(sec).padStart(2, '0')}`;
  $('d-rank').textContent = i.rank;
  $('d-best').textContent = i.best;
  $('death').classList.remove('hidden');
  hud.show(false);
}

function toMenu() {
  if (player && player.alive) world.removeSnake(player);
  player = null;
  state = 'menu';
  $('death').classList.add('hidden');
  $('menu').classList.remove('hidden');
  hud.show(false);
  refreshMenu();
}

function turn(d, source) {
  if (state !== 'playing' || !player || !player.alive) return;
  lastInput = source;
  player.queueTurn(d);
}

function emote(i) {
  if (state !== 'playing' || !player || !player.alive) return;
  if (world.time - lastEmoteAt < 1) return;
  lastEmoteAt = world.time;
  const text = EMOTES[i];
  player.say(text, world.time);
  // chatty bots nearby sometimes answer
  const h = player.head;
  for (const s of world.snakesNear(h.x, h.y, 700)) {
    if (s === player || !s.owner) continue;
    const p = s.owner.persona;
    if (!chance(p.chatty * 0.35)) continue;
    const reply = text === 'Hi!' ? pick(['Hi!', 'hello', 'hey', 'привет', 'o/']) : text === 'gg' ? pick(['gg', 'gg wp']) : text === 'ez' ? pick(['?', 'lol', 'noob', 'ok']) : pick(['LOL', 'lol', '?', ':)', 'xD']);
    const who = s;
    setTimeout(() => who.alive && who.say(reply, world.time), rand(500, 1800));
    break;
  }
}

const input = new Input(canvas, {
  onDir: turn,
  onEmote: emote,
  onMute: () => updateMuteBtn(sound.toggle()),
  onConfirm: (e) => {
    if (state === 'menu' && document.activeElement !== $('nick')) {
      e.preventDefault();
      play();
    } else if (state === 'dead' && !$('death').classList.contains('hidden')) {
      e.preventDefault();
      play();
    }
  },
  onEscape: () => {
    if (state === 'dead') toMenu();
  },
});

function zoomFor(s) {
  const growth = 1 + Math.sqrt(Math.max(0, s.score - CFG.START_SCORE)) * 0.02;
  return (renderer.baseZoom() / growth) * (1 - s.charge * 0.1);
}

// ---------- menu ----------

function buildMenu() {
  $('nick').value = store.get('pl.nick', '');
  const sw = $('colors');
  sw.innerHTML = '';
  for (const c of SNAKE_COLORS) {
    const b = document.createElement('button');
    b.className = 'swatch' + (c === color ? ' on' : '');
    b.style.setProperty('--c', c);
    b.title = c;
    b.addEventListener('click', () => {
      color = c;
      store.set('pl.color', c);
      sw.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('on', x === b));
    });
    sw.appendChild(b);
  }
  document.querySelectorAll('[data-control]').forEach((b) => {
    b.classList.toggle('on', b.dataset.control === controlMode);
    b.addEventListener('click', () => {
      controlMode = b.dataset.control;
      store.set('pl.control', controlMode);
      document.querySelectorAll('[data-control]').forEach((x) => x.classList.toggle('on', x === b));
    });
  });
  $('play').addEventListener('click', play);
  $('again').addEventListener('click', play);
  $('to-menu').addEventListener('click', toMenu);
  $('mute').addEventListener('click', () => updateMuteBtn(sound.toggle()));
  $('servers').addEventListener('change', (e) => (selectedRoomId = e.target.value));
  document.querySelectorAll('.emote-bar button').forEach((b, i) => b.addEventListener('click', () => emote(i)));
  updateMuteBtn(sound.muted);
  refreshMenu();
}

function updateMuteBtn(muted) {
  $('mute').textContent = muted ? '🔇' : '🔊';
}

function refreshMenu() {
  const rooms = online.rooms;
  const sel = $('servers');
  const opts = [`<option value="auto">Авто — лучший сервер</option>`].concat(
    rooms.map((r) => {
      const p = Math.round(r.players);
      const full = p >= ROOM_CAP;
      return `<option value="${r.id}" ${full ? 'disabled' : ''}>${escapeHtml(r.name)} — ${p}/${ROOM_CAP} · ${r.region.basePing} мс${r === room ? ' ●' : ''}</option>`;
    }),
  );
  const html = opts.join('');
  if (sel._html !== html) {
    sel.innerHTML = html;
    sel._html = html;
    sel.value = rooms.some((r) => r.id === selectedRoomId) ? selectedRoomId : 'auto';
  }
  $('online').innerHTML = `<b>${online.total.toLocaleString('ru-RU')}</b> игроков онлайн · ${rooms.length} серверов`;
  $('best').textContent = store.get('pl.best', 0);
}

// ---------- loop ----------

let lastTs = performance.now();
let menuTimer = 0;

function frame(ts) {
  const dt = Math.min(0.1, (ts - lastTs) / 1000);
  lastTs = ts;

  let rem = dt;
  while (rem > 1e-6) {
    const h = Math.min(CFG.MAX_STEP, rem);
    if (state === 'playing' && player && player.alive && controlMode === 'mouse' && lastInput !== 'touch') {
      const [sx, sy] = renderer.worldToScreen(player.head.x, player.head.y);
      const d = input.mouseDir(sx, sy, player.plannedDir);
      if (d !== null && d !== player.plannedDir) player.queueTurn(d);
    }
    stepWorld(h, false);
    rem -= h;
  }
  online.update(dt);

  // camera
  let focus = null;
  let zoom = renderer.baseZoom() * 0.55;
  if (state === 'playing' && player) {
    focus = player;
    zoom = zoomFor(player);
  } else if (state === 'dead') {
    if (spectate && !spectate.alive) spectate = null;
    focus = spectate || (world.time - deathAt > 1.5 ? world.king : null);
    zoom = renderer.baseZoom() * 0.7;
  } else {
    focus = world.king;
  }
  let tx = focus ? focus.head.x : renderer.cam.x;
  let ty = focus ? focus.head.y : renderer.cam.y;
  if (state !== 'playing') {
    // spectating: keep most of the screen on the arena
    const mx = Math.min(world.size / 2, (renderer.cw / 2 / zoom) * 0.7);
    const my = Math.min(world.size / 2, (renderer.ch / 2 / zoom) * 0.7);
    tx = Math.max(mx, Math.min(world.size - mx, tx));
    ty = Math.max(my, Math.min(world.size - my, ty));
  }
  renderer.updateCamera(tx, ty, zoom, dt, false);

  for (const s of world.snakes) {
    const h = s.head;
    if (Math.abs(h.x - renderer.cam.x) * renderer.cam.z < renderer.cw && Math.abs(h.y - renderer.cam.y) * renderer.cam.z < renderer.ch) {
      renderer.emitSparks(s, dt);
    }
  }
  renderer.render(world, dt, { names: true, hideOwnName: false });

  if (state === 'playing' && player) {
    sound.setCharge(player.charge);
    hud.update(dt, world, player, room, online.ping(room, world.time), world.time);
  }
  if (state === 'dead' && world.time - deathAt > 6 && $('death').classList.contains('hidden')) showDeathScreen();

  menuTimer -= dt;
  if (state === 'menu' && menuTimer <= 0) {
    menuTimer = 1;
    refreshMenu();
  }
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => renderer.resize());

buildMenu();
enterRoom(online.bestRoom());
refreshMenu();
requestAnimationFrame(frame);

// handy for tinkering from the console
window.pl = { get world() { return world; }, get player() { return player; }, online, renderer };
