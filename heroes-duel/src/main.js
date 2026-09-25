// Entry point: scene setup plus the deployment → battle controller.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GRID, DEPLOY_COLS, SIDES, ARMY_TEMPLATE, randomObstacles } from './data/duel.js';
import { TIERS, has } from './data/haven.js';
import { buildBattlefield, buildObstacle, buildHero, cellToWorld } from './scene/battlefield.js';
import { UnitView, projectile } from './scene/units.js';
import { updateTweens, wait } from './scene/tween.js';
import { Battle, makeUnit, key, totalHp, RANGE_PENALTY_DIST } from './game/battle.js';
import { decide } from './game/ai.js';
import { createUI, unitTooltip, esc } from './ui/panels.js';
import { cursors } from './ui/cursors.js';
import { sfx, unlockAudio, isMuted, setMuted } from './audio.js';

// ── Renderer, camera, lights ────────────────────────────────────────────────
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const SKY = 0xb9d3ea;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 24, 55);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
const homeView = () => (canvas.clientWidth < canvas.clientHeight
  ? { pos: new THREE.Vector3(0, 21, 10), target: new THREE.Vector3(0, 0, 1.2) }
  : { pos: new THREE.Vector3(0, 12.5, 12.5), target: new THREE.Vector3(0, 0, 1.0) });

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 6;
controls.maxDistance = 30;
controls.maxPolarAngle = 1.25;
controls.screenSpacePanning = false;
function resetCamera() {
  const h = homeView();
  camera.position.copy(h.pos);
  controls.target.copy(h.target);
}

scene.add(new THREE.HemisphereLight(0xdde9ff, 0x5b4a2e, 1.25));
const sun = new THREE.DirectionalLight(0xfff0d2, 2.4);
sun.position.set(-7, 14, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 40 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);

const field = buildBattlefield(scene);
const heroes = ['left', 'right'].map((s) => buildHero(s, SIDES[s].color));
heroes.forEach((h) => field.heroes.add(h));
const tileByCell = new Map(field.tiles.map((t) => [key(t.userData.col, t.userData.row), t]));
for (const t of field.tiles) t.userData.groundColor = t.userData.baseColor.clone();
const obstacleGroup = new THREE.Group();
field.root.add(obstacleGroup);

const labelLayer = document.getElementById('labels');

// ── Game state ──────────────────────────────────────────────────────────────
const state = {
  mode: 'ai', // 'ai' | 'hotseat'
  phase: 'deploy', // 'deploy' | 'battle' | 'over'
  deploySide: 'left',
  armies: { left: [], right: [] },
  obstacles: [],
  battle: null,
  views: new Map(), // uid → UnitView
  selected: null, // deployment selection
  actor: null,
  reach: null,
  preview: null,
  busy: false,
  hoverUid: null,
  gridOn: true,
};
let resolvePlayer = null;

const isAI = (side) => state.mode === 'ai' && side === 'right';
const allUnits = () => [...state.armies.left, ...state.armies.right];
const viewOf = (u) => state.views.get(u.uid);

function mirrorCol(col, size) {
  return GRID.cols - col - size;
}

function buildArmy(side) {
  return ARMY_TEMPLATE.map((t) => {
    const id = TIERS[t.tier - 1][1];
    const u = makeUnit(side, id, t.count, 0, t.row);
    u.col = side === 'left' ? t.col : mirrorCol(t.col, u.size);
    return u;
  });
}

function defaultFormation(side) {
  for (const u of state.armies[side]) {
    const t = ARMY_TEMPLATE.find((x) => x.tier === u.def.tier);
    u.row = t.row;
    u.col = side === 'left' ? t.col : mirrorCol(t.col, u.size);
    viewOf(u)?.placeAt(u.col, u.row);
  }
}

function newDuel() {
  for (const v of state.views.values()) v.dispose();
  state.views.clear();
  obstacleGroup.clear();
  state.obstacles = randomObstacles();
  for (const o of state.obstacles) {
    const obj = buildObstacle(o.type);
    const p = cellToWorld(o.col, o.row);
    obj.position.set(p.x, p.y, p.z);
    obj.rotation.y = Math.random() * Math.PI * 2;
    obstacleGroup.add(obj);
  }
  const blocked = new Set(state.obstacles.map((o) => key(o.col, o.row)));
  for (const t of field.tiles) {
    t.userData.baseColor.copy(t.userData.groundColor);
    if (blocked.has(key(t.userData.col, t.userData.row))) t.userData.baseColor.offsetHSL(0.02, -0.15, -0.1);
  }

  state.armies.left = buildArmy('left');
  state.armies.right = buildArmy('right');
  for (const u of allUnits()) addView(u);
  state.battle = null;
  state.phase = 'deploy';
  state.deploySide = 'left';
  state.selected = null;
  state.actor = null;
  state.preview = null;
  ui.hideEnd();
  ui.hideCard();
  ui.clearLog();
  ui.setActive(null, {});
  refreshDeployUI();
}

function addView(u) {
  const v = new UnitView(u, SIDES[u.side].color, labelLayer);
  scene.add(v.group);
  state.views.set(u.uid, v);
}

// ── UI wiring ───────────────────────────────────────────────────────────────
const ui = createUI({
  onToggleGrid() {
    state.gridOn = !state.gridOn;
    for (const t of field.tiles) t.scale.set(state.gridOn ? 1 : 1.064, 1, state.gridOn ? 1 : 1.064);
    return state.gridOn;
  },
  onResetCamera: resetCamera,
  onToggleMode() {
    if (state.phase !== 'deploy') return;
    state.mode = state.mode === 'ai' ? 'hotseat' : 'ai';
    if (state.mode === 'ai' && state.deploySide === 'right') state.deploySide = 'left';
    refreshDeployUI();
  },
  onDeployDefault() {
    defaultFormation(state.deploySide);
    refreshDeployUI();
  },
  onFight() {
    if (state.mode === 'hotseat' && state.deploySide === 'left') {
      state.deploySide = 'right';
      state.selected = null;
      refreshDeployUI();
      return;
    }
    startBattle();
  },
  onTrayPick(uid) {
    state.selected = allUnits().find((u) => u.uid === uid) || null;
    refreshDeployUI();
  },
  onTraySwap(uid) {
    const u = allUnits().find((x) => x.uid === uid);
    const [base, up] = TIERS[u.def.tier - 1];
    const fresh = makeUnit(u.side, u.id === base ? up : base, u.count, u.col, u.row);
    const list = state.armies[u.side];
    list[list.indexOf(u)] = fresh;
    viewOf(u).dispose();
    state.views.delete(u.uid);
    addView(fresh);
    if (state.selected === u) state.selected = fresh;
    refreshDeployUI();
  },
  onWait() { playerAction({ type: 'wait' }); },
  onDefend() { playerAction({ type: 'defend' }); },
  onRestart() { newDuel(); },
  onInspect(uid) {
    const u = allUnits().find((x) => x.uid === uid);
    if (u) ui.showCard(u);
  },
  onHoverUid(uid) {
    state.hoverUid = uid;
    refreshTiles();
  },
});

function refreshDeployUI() {
  ui.setPhase({ phase: state.phase, side: state.deploySide, round: 1, mode: state.mode });
  ui.renderTray(state.armies[state.deploySide], state.deploySide, state.selected);
  refreshTiles();
}

// ── Deployment ──────────────────────────────────────────────────────────────
function deployCellClick(col, row) {
  const side = state.deploySide;
  const cols = DEPLOY_COLS[side];
  const own = state.armies[side];
  const other = own.find((u) => col >= u.col && col < u.col + u.size && row >= u.row && row < u.row + u.size);
  const sel = state.selected;

  if (!sel || (other && other !== sel && other.size !== sel.size)) {
    state.selected = other || null;
    return refreshDeployUI();
  }
  if (!cols.includes(col)) return;
  const tc = sel.size === 2 ? cols[0] : col;
  const tr = Math.min(row, GRID.rows - sel.size);
  if (other && other !== sel) {
    // Same-size units swap places.
    [other.col, other.row, sel.col, sel.row] = [sel.col, sel.row, other.col, other.row];
    viewOf(other).placeAt(other.col, other.row);
    viewOf(sel).placeAt(sel.col, sel.row);
    return refreshDeployUI();
  }
  const blocked = new Set(state.obstacles.map((o) => key(o.col, o.row)));
  for (let dc = 0; dc < sel.size; dc++) {
    for (let dr = 0; dr < sel.size; dr++) {
      const c = tc + dc, r = tr + dr;
      if (blocked.has(key(c, r))) return;
      const occ = own.find((u) => u !== sel && c >= u.col && c < u.col + u.size && r >= u.row && r < u.row + u.size);
      if (occ) return;
    }
  }
  sel.col = tc;
  sel.row = tr;
  viewOf(sel).placeAt(tc, tr);
  refreshDeployUI();
}

// ── Battle flow ─────────────────────────────────────────────────────────────
function startBattle() {
  state.phase = 'battle';
  state.selected = null;
  state.battle = new Battle(allUnits(), state.obstacles);
  ui.log('<i>Бой начался.</i>');
  runBattle();
}

async function runBattle() {
  const b = state.battle;
  while (!b.winner()) {
    const actor = b.next();
    state.actor = actor;
    state.reach = b.reachable(actor);
    state.preview = null;
    ui.setPhase({ phase: 'battle', round: b.round, mode: state.mode });
    ui.renderATB(b.forecast(14), b.round);
    ui.setActive(actor, { playerTurn: !isAI(actor.side), canWait: !actor.waited });
    refreshTiles();

    let action;
    if (isAI(actor.side)) {
      await wait(0.45);
      action = decide(b, actor);
    } else {
      action = await new Promise((res) => { resolvePlayer = res; });
      resolvePlayer = null;
    }
    state.busy = true;
    state.preview = null;
    refreshTiles();
    ui.showTooltip(null);
    await execute(actor, action);
    state.busy = false;
  }
  state.phase = 'over';
  state.actor = null;
  state.reach = null;
  ui.setPhase({ phase: 'over', mode: state.mode });
  ui.setActive(null, {});
  ui.renderATB([], b.round);
  refreshTiles();
  ui.showEnd(b.winner(), state.mode);
}

function playerAction(action) {
  if (!resolvePlayer || state.busy) return;
  if (action.type === 'wait' && state.actor.waited) return;
  resolvePlayer(action);
}

const nameOf = (u) => `<b style="color:${SIDES[u.side].color}">${esc(u.def.name)}</b>`;

async function execute(actor, action) {
  const b = state.battle;
  const av = viewOf(actor);
  switch (action.type) {
    case 'wait':
      ui.log(`${nameOf(actor)} ждёт.`);
      b.endTurn(actor, { wait: true });
      return;
    case 'defend':
      ui.log(`${nameOf(actor)} в защите.`);
      b.endTurn(actor, { defend: true });
      return;
    case 'move':
      await moveUnit(actor, action.path);
      b.endTurn(actor);
      return;
    case 'melee': {
      const moved = action.path.length;
      await moveUnit(actor, action.path);
      await strike(actor, action.target, { ranged: false, moved });
      if (actor.alive && b.canRetaliate(action.target)) {
        action.target.retaliated = true;
        await wait(0.1);
        await strike(action.target, actor, { ranged: false, moved: 0, retaliation: true });
      }
      av.faceDefault();
      if (action.target.alive) viewOf(action.target).faceDefault();
      b.endTurn(actor);
      return;
    }
    case 'shoot':
      await strike(actor, action.target, { ranged: true });
      av.faceDefault();
      b.endTurn(actor);
  }
}

async function moveUnit(u, path) {
  if (!path.length) return;
  await viewOf(u).moveAlong(path);
  const end = path[path.length - 1];
  u.col = end.col;
  u.row = end.row;
  viewOf(u).placeAt(u.col, u.row);
}

async function strike(att, target, opts) {
  const av = viewOf(att), tv = viewOf(target);
  let res, reaction;
  const land = () => {
    res = state.battle.strike(att, target, opts);
    tv.updateLabel();
    floatText(tv, `-${res.dmg}${res.kills ? `  †${res.kills}` : ''}`);
    if (res.died) {
      sfx.die(target.id);
      reaction = tv.die();
    } else {
      sfx.hurt(target.id);
      reaction = tv.hurt();
    }
  };
  if (opts.ranged) {
    let flight;
    await av.shootAnim(tv.group.position, () => {
      sfx.shoot(att.id);
      const kind = att.def.model.weapon === 'staff' ? 'magic' : 'arrow';
      flight = projectile(scene, av.group.position, tv.group.position, kind);
    });
    await flight;
    sfx.impact(att.id);
    land();
  } else {
    tv.faceTowards(av.group.position);
    await av.strikeAnim(tv.group.position, () => {
      sfx.attack(att.id);
      land();
    });
  }
  await reaction;
  const verb = opts.retaliation ? 'отвечает' : opts.ranged ? 'стреляет в' : 'атакует';
  ui.log(`${nameOf(att)} ${verb}${opts.retaliation ? ':' : ` ${nameOf(target)}:`} ${res.dmg} урона, погибло ${res.kills}.${res.died ? ' Отряд уничтожен.' : ''}`);
}

// ── Floating combat text ────────────────────────────────────────────────────
const floaters = [];
function floatText(view, text) {
  const el = document.createElement('div');
  el.className = 'floater';
  el.textContent = text;
  labelLayer.appendChild(el);
  floaters.push({ el, pos: view.group.position.clone().setY(1.4), start: performance.now() });
}

// ── Picking & hover ─────────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function pick(x, y) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const targets = [...field.tiles];
  for (const v of state.views.values()) if (v.group.visible) targets.push(v.group);
  const battle = state.phase === 'battle' && state.actor;
  let first = null;
  for (const h of raycaster.intersectObjects(targets, true)) {
    const view = h.object.userData.view;
    let hit = null;
    if (view) {
      // Look through the active unit's own model so big wings don't block clicks.
      if (battle && view.unit === state.actor) continue;
      hit = { unit: view.unit, point: h.point };
    } else if (h.object.userData.col != null) {
      const { col, row } = h.object.userData;
      hit = { unit: unitAtCell(col, row), col, row, point: h.point };
    }
    if (!hit) continue;
    if (!first) first = hit;
    // In battle, an enemy standing behind a friendly model is the more likely target.
    if (!battle || !first.unit || first.unit.side !== state.actor.side) return first;
    if (hit.unit && hit.unit.side !== state.actor.side) return hit;
    if (!view) return first;
  }
  return first || {};
}

function unitAtCell(col, row) {
  if (state.battle) return state.battle.unitAt(col, row);
  return allUnits().find((u) => col >= u.col && col < u.col + u.size && row >= u.row && row < u.row + u.size) || null;
}

// Screen position of a footprint's centre (a little above the ground).
function screenOfFootprint(col, row, size) {
  const p = cellToWorld(col, row);
  const off = (size - 1) / 2;
  const r = canvas.getBoundingClientRect();
  const s = project(new THREE.Vector3(p.x + off, 0.3, p.z + off), canvas.clientWidth, canvas.clientHeight);
  return { x: s.x + r.left, y: s.y + r.top };
}

const angleBetween = (ax, ay, bx, by) => {
  const d = Math.abs(Math.atan2(ay, ax) - Math.atan2(by, bx));
  return d > Math.PI ? 2 * Math.PI - d : d;
};
// Cursor angle in degrees for an icon pointing along screen vector (dx, dy).
const iconAngle = (dx, dy) => (Math.atan2(dx, -dy) * 180) / Math.PI;

// Work out what a click at this spot would do for the active unit.
function computePreview(hit, sx, sy) {
  const b = state.battle, a = state.actor;
  if (!b || !a || state.busy || isAI(a.side) || !hit.point) return null;
  const u = hit.unit;
  if (u && u.side !== a.side) {
    const tc = screenOfFootprint(u.col, u.row, u.size);
    if (b.canShoot(a)) {
      const r = b.damageRange(a, u, { ranged: true });
      const from = screenOfFootprint(a.col, a.row, a.size);
      return { type: 'shoot', target: u, range: r, far: b.distance(a, u) > RANGE_PENALTY_DIST, angle: iconAngle(tc.x - from.x, tc.y - from.y) };
    }
    const opts = b.meleeOptions(a, u, state.reach);
    if (!opts.length) return { type: 'none', target: u };
    // The side of the target under the cursor picks where we strike from:
    // compare the cursor's offset from the target centre with each option's direction.
    const dx = (sx ?? tc.x) - tc.x, dy = (sy ?? tc.y) - tc.y;
    const centred = Math.hypot(dx, dy) < 6;
    let best = null;
    for (const n of opts) {
      const oc = screenOfFootprint(n.col, n.row, a.size);
      const score = centred ? n.cost : angleBetween(dx, dy, oc.x - tc.x, oc.y - tc.y) + n.cost * 0.03;
      if (!best || score < best.score) best = { score, n, oc };
    }
    const path = Battle.path(best.n);
    return {
      type: 'melee', target: u, node: best.n, path,
      range: b.damageRange(a, u, { ranged: false, moved: path.length }),
      angle: iconAngle(tc.x - best.oc.x, tc.y - best.oc.y),
    };
  }
  if (u === a) return null;
  if (hit.col == null || u) return null;
  // Move: pick the cheapest reachable anchor whose footprint covers the hovered cell.
  let best = null;
  for (const n of state.reach.values()) {
    if (n.steps === 0) continue;
    if (hit.col >= n.col && hit.col < n.col + a.size && hit.row >= n.row && hit.row < n.row + a.size) {
      if (!best || n.cost < best.cost) best = n;
    }
  }
  return best ? { type: 'move', node: best, path: Battle.path(best) } : null;
}

function previewTooltip(p) {
  const a = state.actor, t = p.target;
  if (p.type === 'move') return null;
  const head = `<div class="cap-head"><b>${esc(t.def.name)}</b> × ${t.count}<span class="cap-hp">❤ ${totalHp(t)}</span></div>`;
  if (p.type === 'none') return `${head}<div class="cap-line muted">Не дотянуться в этот ход</div>`;
  const r = p.range;
  const kills = r.killsMin === r.killsMax ? r.killsMin : `${r.killsMin}–${r.killsMax}`;
  const dmg = r.min === r.max ? r.min : `${r.min}–${r.max}`;
  const notes = [];
  if (p.type === 'shoot' && p.far) notes.push('далеко: урон ×½');
  if (p.type === 'shoot' && has(t.def, 'large_shield')) notes.push('щит: урон ×½');
  if (p.type === 'melee' && has(a.def, 'shooter') && !has(a.def, 'no_melee_penalty')) notes.push('рукопашная: урон ×½');
  if (p.type === 'melee' && has(a.def, 'jousting') && p.path.length) notes.push(`разгон +${p.path.length * 5}%`);
  let ret;
  if (p.type === 'shoot') ret = '<div class="cap-ret no">Без ответа</div>';
  else if (r.killsMin >= t.count) ret = '<div class="cap-ret no">Отряд будет уничтожен</div>';
  else if (state.battle.canRetaliate(t)) ret = `<div class="cap-ret yes">Ответит ударом${r.killsMax >= t.count ? ', если выживет' : ''}</div>`;
  else ret = '<div class="cap-ret no">Без ответа: уже отвечал</div>';
  return `${head}
    <div class="cap-line">Урон <b>${dmg}</b> · погибнет <b>${kills}</b></div>
    ${ret}${notes.length ? `<div class="cap-line muted">${notes.join(' · ')}</div>` : ''}`;
}

function cursorFor(p, hoverUnit) {
  if (!p) return hoverUnit ? 'help' : '';
  if (p.type === 'none') return cursors.no();
  if (p.type === 'move') return has(state.actor.def, 'flyer') ? cursors.fly() : cursors.move();
  if (p.type === 'shoot') return p.far ? cursors.broken(p.angle) : cursors.arrow(p.angle);
  return cursors.sword(p.angle);
}

let hover = {};
let lastTouchPreviewKey = null;

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  handleHover(e.clientX, e.clientY);
});

function previewKey(p) {
  return p ? `${p.type}:${p.target?.uid ?? ''}:${p.node ? key(p.node.col, p.node.row) : ''}` : null;
}

function handleHover(x, y) {
  hover = pick(x, y);
  hover.sx = x;
  hover.sy = y;
  const prevKey = previewKey(state.preview);
  state.preview = state.phase === 'battle' ? computePreview(hover, x, y) : null;
  if (previewKey(state.preview) !== prevKey) refreshTiles();
  let html = null, caption = false;
  if (state.preview && state.preview.type !== 'move') {
    html = previewTooltip(state.preview);
    caption = true;
  } else if (hover.unit) html = unitTooltip(hover.unit);
  ui.showTooltip(html, x, y, hover.unit ? SIDES[hover.unit.side].color : null, caption);
  canvas.style.cursor = cursorFor(state.preview, hover.unit);
}

canvas.addEventListener('pointerleave', () => {
  hover = {};
  state.preview = null;
  refreshTiles();
  ui.showTooltip(null);
});

let downAt = null;
canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 8) return;
  const longPress = performance.now() - downAt.t > 500;
  downAt = null;
  if (e.button === 2) return;
  const touch = e.pointerType !== 'mouse';
  if (touch) handleHover(e.clientX, e.clientY);
  const hit = touch ? hover : pick(e.clientX, e.clientY);

  if (longPress && hit.unit) return ui.showCard(hit.unit);
  if (state.phase === 'deploy') {
    if (hit.col != null || hit.unit) {
      const col = hit.col ?? hit.unit.col, row = hit.row ?? hit.unit.row;
      if (hit.unit && hit.unit.side !== state.deploySide) return ui.showCard(hit.unit);
      deployCellClick(col, row);
    }
    return;
  }
  if (state.phase !== 'battle') return;
  const p = touch ? state.preview : computePreview(hit, e.clientX, e.clientY);
  if (!p || p.type === 'none') {
    if (hit.unit) ui.showCard(hit.unit);
    return;
  }
  // On touch screens the first tap previews, the second tap on the same target confirms.
  if (touch && previewKey(p) !== lastTouchPreviewKey) {
    lastTouchPreviewKey = previewKey(p);
    return;
  }
  lastTouchPreviewKey = null;
  playerAction(p.type === 'shoot' ? { type: 'shoot', target: p.target } : p);
});
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const hit = pick(e.clientX, e.clientY);
  if (hit.unit) ui.showCard(hit.unit);
});

window.addEventListener('keydown', (e) => {
  if (state.phase !== 'battle') return;
  if (e.key === 'w' || e.key === 'W' || e.key === 'ц' || e.key === 'Ц') playerAction({ type: 'wait' });
  if (e.key === 'd' || e.key === 'D' || e.key === 'в' || e.key === 'В') playerAction({ type: 'defend' });
});

// ── Tile highlighting ───────────────────────────────────────────────────────
const C = {
  deploy: new THREE.Color(0x9fc4ff),
  deployRed: new THREE.Color(0xffb3a6),
  reach: new THREE.Color(0xe8f3c0),
  path: new THREE.Color(0xfff4b8),
  active: new THREE.Color(0xffc94a),
  target: new THREE.Color(0xff5a3c),
  hover: new THREE.Color(0xffffff),
};

function refreshTiles() {
  for (const t of field.tiles) {
    t.material.color.copy(t.userData.baseColor);
    t.material.emissive.setHex(0);
  }
  const paint = (c, r, color, amt, glow = 0) => {
    const t = tileByCell.get(key(c, r));
    if (!t) return;
    t.material.color.lerp(color, amt);
    if (glow) t.material.emissive.copy(color).multiplyScalar(glow);
  };
  const paintUnit = (u, col, row, color, amt, glow) => {
    for (let dc = 0; dc < u.size; dc++) for (let dr = 0; dr < u.size; dr++) paint(col + dc, row + dr, color, amt, glow);
  };

  if (state.phase === 'deploy') {
    const cols = DEPLOY_COLS[state.deploySide];
    for (const c of cols) for (let r = 0; r < GRID.rows; r++) paint(c, r, state.deploySide === 'left' ? C.deploy : C.deployRed, 0.35);
    if (state.selected) paintUnit(state.selected, state.selected.col, state.selected.row, C.active, 0.6, 0.2);
  }

  if (state.phase === 'battle' && state.actor) {
    const a = state.actor;
    if (!isAI(a.side) && !state.busy && state.reach) {
      for (const n of state.reach.values()) paintUnit(a, n.col, n.row, C.reach, 0.22);
      for (const e of state.battle.enemiesOf(a)) {
        const hittable = state.battle.canShoot(a) || state.battle.meleeOptions(a, e, state.reach).length;
        if (hittable) paintUnit(e, e.col, e.row, C.target, 0.25, 0.05);
      }
    }
    paintUnit(a, a.col, a.row, C.active, 0.6, 0.2);
    const p = state.preview;
    if (p?.path) for (const s of p.path) paintUnit(a, s.col, s.row, C.path, 0.55, 0.12);
    if (p?.target && p.type !== 'none') paintUnit(p.target, p.target.col, p.target.row, C.target, 0.6, 0.2);
  }

  const hu = state.hoverUid && allUnits().find((u) => u.uid === state.hoverUid && u.alive);
  if (hu) paintUnit(hu, hu.col, hu.row, new THREE.Color(SIDES[hu.side].color), 0.5, 0.12);

  for (const v of state.views.values()) {
    const hot = v.unit === state.actor || v.unit === state.selected || v.unit.uid === state.hoverUid;
    v.label.classList.toggle('hot', hot);
    v.ring.material.opacity = hot ? 1 : 0.7;
  }
}

// ── Sound ───────────────────────────────────────────────────────────────────
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);
const soundBtn = document.getElementById('btn-sound');
const syncSound = () => {
  soundBtn.textContent = isMuted() ? 'Звук: выкл' : 'Звук: вкл';
  soundBtn.classList.toggle('on', !isMuted());
};
soundBtn.addEventListener('click', () => {
  setMuted(!isMuted());
  syncSound();
  sfx.click();
});
syncSound();

// ── Resize & loop ───────────────────────────────────────────────────────────
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w / h < 1 ? 50 : 38;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
resetCamera();

const tmp = new THREE.Vector3();
const clock = new THREE.Clock();

function project(v3, w, h) {
  tmp.copy(v3).project(camera);
  return { x: (tmp.x * 0.5 + 0.5) * w, y: (-tmp.y * 0.5 + 0.5) * h, visible: tmp.z < 1 };
}

function frame() {
  const t = clock.getElapsedTime();
  updateTweens();
  controls.update();
  for (const v of state.views.values()) if (v.group.visible) v.model.userData.idle?.(t);
  for (const h of heroes) h.userData.idle?.(t);

  const w = canvas.clientWidth, h = canvas.clientHeight;
  for (const v of state.views.values()) {
    if (!v.label.isConnected) continue;
    const p = project(v.labelAnchor(), w, h);
    v.label.style.display = p.visible ? '' : 'none';
    v.label.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
  }
  const now = performance.now();
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    const k = (now - f.start) / 1400;
    if (k >= 1) {
      f.el.remove();
      floaters.splice(i, 1);
      continue;
    }
    const p = project(f.pos, w, h);
    f.el.style.transform = `translate(${p.x}px, ${p.y - k * 40}px) translate(-50%, -50%)`;
    f.el.style.opacity = String(k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

newDuel();
requestAnimationFrame(frame);
document.body.classList.add('ready');

// Test hook: ?debug exposes internals for automated checks.
if (location.search.includes('debug')) {
  window.__duel = {
    state,
    screenOf(u) {
      const v = viewOf(u);
      const p = project(v.group.position.clone().setY(0.5), canvas.clientWidth, canvas.clientHeight);
      return { x: p.x, y: p.y };
    },
    screenOfCell(col, row) {
      const p = project(cellToWorld(col, row), canvas.clientWidth, canvas.clientHeight);
      return { x: p.x, y: p.y };
    },
  };
}
