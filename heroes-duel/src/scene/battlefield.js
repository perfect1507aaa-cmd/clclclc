// Battlefield: low-poly terrain, the square combat grid, obstacles and decor.
import * as THREE from 'three';
import { GRID } from '../data/duel.js';
import { mat, buildCavalry } from './models.js';

export const TILE = 1;
const TILE_Y = 0.06;

// Cell (col,row) → world position of the cell centre. Grid is centred on origin;
// columns run along +X (left army → right army), rows along +Z.
export function cellToWorld(col, row) {
  return new THREE.Vector3(
    (col - (GRID.cols - 1) / 2) * TILE,
    TILE_Y,
    (row - (GRID.rows - 1) / 2) * TILE,
  );
}

// Seeded RNG so the terrain looks the same on every load.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function buildBattlefield(scene) {
  const rand = rng(1507);
  const root = new THREE.Group();
  scene.add(root);

  // ── Terrain ──
  const size = 60;
  const terrainGeo = new THREE.PlaneGeometry(size, size, 48, 48);
  terrainGeo.rotateX(-Math.PI / 2);
  const pos = terrainGeo.attributes.position;
  const halfW = GRID.cols / 2 + 2.5;
  const halfD = GRID.rows / 2 + 1.5;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const dx = Math.max(0, Math.abs(x) - halfW);
    const dz = Math.max(0, Math.abs(z) - halfD);
    const d = Math.hypot(dx, dz);
    const hills = Math.sin(x * 0.35) * Math.cos(z * 0.3) * 0.6 + Math.sin(x * 0.12 + z * 0.2) * 1.2;
    const h = d > 0 ? Math.min(1, d / 6) * (hills + 1.4 + d * 0.18) + (rand() - 0.5) * 0.25 * Math.min(1, d) : (rand() - 0.5) * 0.03 - 0.04;
    pos.setY(i, h);
  }
  const terrainNi = terrainGeo.toNonIndexed();
  terrainNi.computeVertexNormals();
  const colors = [];
  const tp = terrainNi.attributes.position;
  const c = new THREE.Color();
  for (let i = 0; i < tp.count; i += 3) {
    const y = (tp.getY(i) + tp.getY(i + 1) + tp.getY(i + 2)) / 3;
    if (y > 2.6) c.setHex(0x8f8a78);
    else if (y > 1.4) c.setHex(0x5f7d3a);
    else c.setHex(0x6d8f3f);
    c.offsetHSL((rand() - 0.5) * 0.02, 0, (rand() - 0.5) * 0.05);
    for (let k = 0; k < 3; k++) colors.push(c.r, c.g, c.b);
  }
  terrainNi.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const terrain = new THREE.Mesh(terrainNi, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  terrain.receiveShadow = true;
  root.add(terrain);

  // Earthy board under the grid
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(GRID.cols * TILE + 0.5, 0.1, GRID.rows * TILE + 0.5),
    mat(0x5d4a31),
  );
  board.position.y = -0.03;
  board.receiveShadow = true;
  root.add(board);

  // ── Grid tiles ──
  const tiles = [];
  const tileGeo = new THREE.BoxGeometry(TILE * 0.94, 0.08, TILE * 0.94);
  for (let row = 0; row < GRID.rows; row++) {
    for (let col = 0; col < GRID.cols; col++) {
      const base = new THREE.Color((col + row) % 2 ? 0x7c9a48 : 0x86a24f);
      base.offsetHSL((rand() - 0.5) * 0.015, 0, (rand() - 0.5) * 0.04);
      const m = new THREE.MeshStandardMaterial({ color: base, flatShading: true, roughness: 0.95, emissive: 0x000000 });
      const t = new THREE.Mesh(tileGeo, m);
      const p = cellToWorld(col, row);
      t.position.set(p.x, 0.0 + rand() * 0.012, p.z);
      t.receiveShadow = true;
      t.userData = { col, row, baseColor: base.clone() };
      root.add(t);
      tiles.push(t);
    }
  }

  buildDecor(root, rand);
  const heroes = new THREE.Group();
  root.add(heroes);
  return { root, tiles, heroes };
}

// ── Obstacles (on the grid) ──
export function buildObstacle(type, rand = Math.random) {
  const g = new THREE.Group();
  if (type === 'rock') {
    for (let i = 0; i < 3; i++) {
      const r = 0.22 + rand() * 0.14;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat(i ? 0x8a8a84 : 0x77776f));
      m.position.set((rand() - 0.5) * 0.4, r * 0.7, (rand() - 0.5) * 0.4);
      m.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      m.scale.y = 0.8;
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
  } else if (type === 'tree') {
    g.add(tree(0.9, rand));
  } else if (type === 'stump') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.26, 7), mat(0x6b4a2b));
    m.position.y = 0.13;
    m.castShadow = true;
    g.add(m);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 7), mat(0xc8a878));
    top.position.y = 0.27;
    g.add(top);
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.7, 6), mat(0x5e4126));
    log.rotation.set(0, 0.6, Math.PI / 2);
    log.position.set(0.1, 0.1, 0.25);
    log.castShadow = true;
    g.add(log);
  }
  return g;
}

function tree(scale, rand) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.6, 6), mat(0x5e4126));
  trunk.position.y = 0.3;
  trunk.castShadow = true;
  g.add(trunk);
  const greens = [0x3f6b2a, 0x4a7a30, 0x365f25];
  for (let i = 0; i < 3; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.5 - i * 0.12, 0.6, 7), mat(greens[i]));
    cone.position.y = 0.65 + i * 0.3;
    cone.rotation.y = rand() * 3;
    cone.castShadow = true;
    g.add(cone);
  }
  g.scale.setScalar(scale);
  return g;
}

function roundTree(scale, rand) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.7, 6), mat(0x5e4126));
  trunk.position.y = 0.35;
  trunk.castShadow = true;
  g.add(trunk);
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), mat(rand() > 0.5 ? 0x557f2e : 0x4b7429));
  crown.position.y = 1.05;
  crown.scale.y = 0.85;
  crown.castShadow = true;
  g.add(crown);
  g.scale.setScalar(scale);
  return g;
}

function buildDecor(root, rand) {
  const halfW = GRID.cols / 2 + 1.2;
  const halfD = GRID.rows / 2 + 0.8;
  const place = (obj, x, z) => {
    obj.position.set(x, 0, z);
    root.add(obj);
  };
  // Trees & rocks in a ring around the field
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2;
    const r = 1 + rand() * 14;
    let x = Math.cos(a) * (halfW + r);
    let z = Math.sin(a) * (halfD + r);
    if (Math.abs(x) < halfW + 0.6 && Math.abs(z) < halfD + 0.6) continue;
    // keep the hero spots clear
    if (Math.abs(z) < 2 && Math.abs(Math.abs(x) - (halfW + 1.3)) < 1.6) continue;
    const kind = rand();
    const obj = kind < 0.45 ? tree(0.9 + rand() * 0.9, rand) : kind < 0.8 ? roundTree(0.9 + rand() * 0.8, rand) : buildObstacle('rock', rand);
    obj.rotation.y = rand() * Math.PI * 2;
    place(obj, x, z);
    obj.position.y = terrainHeightGuess(x, z, halfW, halfD);
  }
  // Grass tufts & flowers near the board edge
  const tuftGeo = new THREE.ConeGeometry(0.05, 0.18, 3);
  for (let i = 0; i < 160; i++) {
    const x = (rand() - 0.5) * (GRID.cols + 5);
    const z = (rand() - 0.5) * (GRID.rows + 4);
    if (Math.abs(x) < GRID.cols / 2 + 0.3 && Math.abs(z) < GRID.rows / 2 + 0.3) continue;
    const t = new THREE.Mesh(tuftGeo, mat(rand() > 0.85 ? 0xd9c94a : 0x5a8a34));
    t.position.set(x, 0.05, z);
    t.rotation.z = (rand() - 0.5) * 0.4;
    root.add(t);
  }
}

// Rough match to the terrain displacement so decor sits on the hills.
function terrainHeightGuess(x, z, halfW, halfD) {
  const dx = Math.max(0, Math.abs(x) - (GRID.cols / 2 + 2.5));
  const dz = Math.max(0, Math.abs(z) - (GRID.rows / 2 + 1.5));
  const d = Math.hypot(dx, dz);
  if (d <= 0) return 0;
  const hills = Math.sin(x * 0.35) * Math.cos(z * 0.3) * 0.6 + Math.sin(x * 0.12 + z * 0.2) * 1.2;
  return Math.min(1, d / 6) * (hills + 1.4 + d * 0.18) - 0.15;
}

// Hero on horseback with a banner, standing just outside the grid.
export function buildHero(side, color) {
  const hero = buildCavalry({
    horse: side === 'left' ? 0xefeae0 : 0x3a2b22,
    mane: side === 'left' ? 0xd8d0c0 : 0x1a1410,
    cloth: new THREE.Color(color).getHex(),
    armor: 0xc8ced4,
    plume: 0xf0e8d0,
    trim: 0xd8b95a,
    banner: new THREE.Color(color).getHex(),
  });
  hero.scale.setScalar(1.25);
  const x = (GRID.cols / 2 + 1.4) * (side === 'left' ? -1 : 1);
  hero.position.set(x, 0, 0);
  hero.rotation.y = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
  return hero;
}
