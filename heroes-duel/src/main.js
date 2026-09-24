// Entry point: builds the duel scene and wires hover/selection to the UI.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ARMIES, OBSTACLES } from './data/duel.js';
import { buildBattlefield, buildObstacle, buildHero, cellToWorld } from './scene/battlefield.js';
import { createStack } from './scene/units.js';
import { createUI } from './ui/panels.js';

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
// Default view; portrait screens get a steeper, higher camera so the whole grid fits.
const homeView = () => (canvas.clientWidth < canvas.clientHeight
  ? { pos: new THREE.Vector3(0, 21, 10), target: new THREE.Vector3(0, 0, 1.2) }
  : { pos: new THREE.Vector3(0, 12.5, 13.5), target: new THREE.Vector3(0, 0, 0.6) });
const HOME = homeView();
camera.position.copy(HOME.pos);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(HOME.target);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 6;
controls.maxDistance = 30;
controls.maxPolarAngle = 1.25;
controls.screenSpacePanning = false;

// ── Lighting ──
scene.add(new THREE.HemisphereLight(0xdde9ff, 0x5b4a2e, 1.25));
const sun = new THREE.DirectionalLight(0xfff0d2, 2.4);
sun.position.set(-7, 14, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 40 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);

// ── Battlefield ──
const field = buildBattlefield(scene);
const obstacleCells = new Set();
for (const o of OBSTACLES) {
  const obj = buildObstacle(o.type);
  const p = cellToWorld(o.col, o.row);
  obj.position.set(p.x, p.y, p.z);
  obj.rotation.y = Math.random() * Math.PI * 2;
  field.root.add(obj);
  obstacleCells.add(`${o.col},${o.row}`);
}
for (const t of field.tiles) {
  if (obstacleCells.has(`${t.userData.col},${t.userData.row}`)) {
    t.material.color.offsetHSL(0.02, -0.15, -0.1);
    t.userData.baseColor.copy(t.material.color);
  }
}
const heroes = ARMIES.map((a) => buildHero(a.side, a.color));
heroes.forEach((h) => field.heroes.add(h));

// ── Units ──
const labelLayer = document.getElementById('labels');
const units = [];
ARMIES.forEach((army) => {
  army.stacks.forEach((stack, i) => {
    const u = createStack(army, stack, i);
    scene.add(u.group);
    labelLayer.appendChild(u.label);
    units.push(u);
  });
});
const cellOwner = new Map();
for (const u of units) for (const [c, r] of u.cells) cellOwner.set(`${c},${r}`, u);
const tileByCell = new Map(field.tiles.map((t) => [`${t.userData.col},${t.userData.row}`, t]));

// ── Interaction ──
let hovered = null;
let hoveredCell = null;
let selected = null;
let slotHover = null;
let gridOn = true;

const ui = createUI({
  units,
  onSelect: (u) => { selected = u; ui.showCard(u); refreshTiles(); },
  onHoverSlot: (u) => { slotHover = u; refreshTiles(); },
  onToggleGrid: () => {
    gridOn = !gridOn;
    for (const t of field.tiles) t.scale.set(gridOn ? 1 : 1.064, 1, gridOn ? 1 : 1.064);
    return gridOn;
  },
  onResetCamera: () => {
    const home = homeView();
    camera.position.copy(home.pos);
    controls.target.copy(home.target);
  },
});

const COL_HOVER = new THREE.Color(0xfff2b0);
const COL_SELECT = new THREE.Color(0xffc94a);

function refreshTiles() {
  for (const t of field.tiles) {
    t.material.color.copy(t.userData.baseColor);
    t.material.emissive.setHex(0x000000);
  }
  const tint = (u, color, amt, glow) => {
    if (!u) return;
    for (const [c, r] of u.cells) {
      const t = tileByCell.get(`${c},${r}`);
      t.material.color.lerp(color, amt);
      t.material.emissive.copy(color).multiplyScalar(glow);
    }
  };
  if (hoveredCell && !hovered) {
    const t = tileByCell.get(hoveredCell);
    if (t) {
      t.material.color.lerp(COL_HOVER, 0.35);
      t.material.emissive.copy(COL_HOVER).multiplyScalar(0.08);
    }
  }
  tint(hovered || slotHover, new THREE.Color(hovered?.army.color || slotHover?.army.color), 0.45, 0.12);
  tint(selected, COL_SELECT, 0.6, 0.18);
  for (const u of units) {
    const hot = u === selected || u === hovered || u === slotHover;
    u.label.classList.toggle('hot', hot);
    u.ring.material.opacity = hot ? 1 : 0.7;
  }
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pickables = [...field.tiles, ...units.map((u) => u.group)];
let lastPointer = null;

function pick(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pickables, true);
  for (const h of hits) {
    if (h.object.userData.unit) return { unit: h.object.userData.unit, cell: null };
    if (h.object.userData.col != null) {
      const key = `${h.object.userData.col},${h.object.userData.row}`;
      return { unit: cellOwner.get(key) || null, cell: key };
    }
  }
  return { unit: null, cell: null };
}

canvas.addEventListener('pointermove', (e) => {
  lastPointer = { x: e.clientX, y: e.clientY, type: e.pointerType };
  const { unit, cell } = pick(e.clientX, e.clientY);
  if (unit !== hovered || cell !== hoveredCell) {
    hovered = unit;
    hoveredCell = cell;
    refreshTiles();
  }
  canvas.style.cursor = unit ? 'pointer' : '';
  ui.showTooltip(e.pointerType === 'mouse' ? unit : null, e.clientX, e.clientY);
});
canvas.addEventListener('pointerleave', () => {
  hovered = null;
  hoveredCell = null;
  refreshTiles();
  ui.showTooltip(null);
});

let downAt = null;
canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return;
  const { unit } = pick(e.clientX, e.clientY);
  selected = unit === selected ? null : unit;
  ui.showCard(selected);
  refreshTiles();
});

// ── Resize & render loop ──
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Pull the camera back on portrait screens so the whole grid fits.
  camera.fov = w / h < 1 ? 50 : 38;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const tmp = new THREE.Vector3();
const clock = new THREE.Clock();

function frame() {
  const t = clock.getElapsedTime();
  controls.update();
  for (const u of units) u.model.userData.idle?.(t);
  for (const h of heroes) h.userData.idle?.(t);

  const w = canvas.clientWidth, h = canvas.clientHeight;
  for (const u of units) {
    tmp.copy(u.anchor);
    u.group.localToWorld(tmp);
    tmp.project(camera);
    const visible = tmp.z < 1;
    u.label.style.display = visible ? '' : 'none';
    if (visible) u.label.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * w}px, ${(-tmp.y * 0.5 + 0.5) * h}px) translate(-50%, -50%)`;
  }
  if (lastPointer && hovered && lastPointer.type === 'mouse') ui.showTooltip(hovered, lastPointer.x, lastPointer.y);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
refreshTiles();
requestAnimationFrame(frame);
document.body.classList.add('ready');
