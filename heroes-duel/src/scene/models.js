// Procedural low-poly creature models. Every builder returns a THREE.Group that
// faces +Z, stands on y = 0, and exposes userData.idle(t) for idle animation.
import * as THREE from 'three';

const SKIN = 0xe2b48c;
const DARK = 0x2a2420;
const WOOD = 0x6b4a2b;
const STEEL = 0xb8c0c8;

// ── Materials & helpers ─────────────────────────────────────────────────────
const matCache = new Map();

export function mat(color, kind = 'matte') {
  const key = `${color}:${kind}`;
  if (matCache.has(key)) return matCache.get(key);
  let m;
  if (kind === 'metal') {
    m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.38, metalness: 0.55 });
  } else if (kind === 'glow') {
    m = new THREE.MeshStandardMaterial({ color, flatShading: true, emissive: color, emissiveIntensity: 0.9, roughness: 0.5 });
  } else if (kind === 'double') {
    m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, side: THREE.DoubleSide });
  } else {
    m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 });
  }
  matCache.set(key, m);
  return m;
}

function add(parent, geo, material, pos = [0, 0, 0], rot = [0, 0, 0], scl) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(pos[0], pos[1], pos[2]);
  m.rotation.set(rot[0], rot[1], rot[2]);
  if (scl) m.scale.set(scl[0], scl[1], scl[2]);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function group(parent, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const g = new THREE.Group();
  g.position.set(pos[0], pos[1], pos[2]);
  g.rotation.set(rot[0], rot[1], rot[2]);
  if (parent) parent.add(g);
  return g;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 6) => new THREE.CylinderGeometry(rt, rb, h, s);
const cone = (r, h, s = 6) => new THREE.ConeGeometry(r, h, s);
const ico = (r) => new THREE.IcosahedronGeometry(r, 0);
const dome = (r, s = 7) => new THREE.SphereGeometry(r, s, 3, 0, Math.PI * 2, 0, Math.PI / 2);

function extrude(points, depth) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return g;
}

const WING_PTS = [
  [0, 0], [0.22, 0.16], [0.55, 0.36], [0.9, 0.56], [1.12, 0.5], [0.96, 0.36],
  [1.0, 0.24], [0.8, 0.16], [0.82, 0.04], [0.6, 0.0], [0.58, -0.12], [0.36, -0.1],
  [0.3, -0.2], [0.12, -0.12],
];
const WING_TIP_PTS = [
  [0.55, 0.36], [0.9, 0.56], [1.12, 0.5], [0.96, 0.36], [1.0, 0.24], [0.8, 0.16],
  [0.82, 0.04], [0.6, 0.0], [0.58, -0.12], [0.5, 0.1],
];

// A wing pair. Returns [leftPivot, rightPivot]; animate by rotating pivot.rotation.z.
function wings(parent, { at, size, color, tipColor, sweep = 0.55, lift = 0.35 }) {
  const out = [];
  for (const side of [1, -1]) {
    const mirror = group(parent, at);
    mirror.scale.x = side;
    const pivot = group(mirror, [0.06, 0, 0], [0, sweep, lift]);
    const wingGeo = extrude(WING_PTS, 0.03);
    add(pivot, wingGeo, mat(color, 'double'), [0, 0, 0], [0, 0, 0], [size, size, 1]);
    if (tipColor != null) {
      add(pivot, extrude(WING_TIP_PTS, 0.035), mat(tipColor, 'double'), [0, 0, 0.004], [0, 0, 0], [size, size, 1]);
    }
    pivot.userData.baseLift = lift;
    out.push(pivot);
  }
  return out;
}

// ── Humanoid (tiers 1, 2, 3, 5) ─────────────────────────────────────────────
export function buildHumanoid(o) {
  const root = new THREE.Group();
  const body = group(root);
  const k = o.bulk || 1;
  const torsoMat = o.armor ? mat(o.tunic, 'metal') : mat(o.tunic);
  const trim = o.trim != null ? mat(o.trim, 'metal') : null;

  if (o.robe) {
    add(body, cyl(0.16, 0.3, 0.74, 8), mat(o.tunic), [0, 0.37, 0]);
    if (trim) add(body, cyl(0.305, 0.305, 0.04, 8), trim, [0, 0.03, 0]);
    if (trim) add(body, box(0.07, 0.6, 0.02), trim, [0, 0.4, 0.22], [-0.2, 0, 0]);
  } else {
    const pants = mat(o.pants ?? DARK);
    for (const x of [-0.085, 0.085]) {
      add(body, box(0.11 * k, 0.34, 0.13 * k), pants, [x * k, 0.19, 0]);
      add(body, box(0.12 * k, 0.07, 0.17 * k), mat(DARK), [x * k, 0.035, 0.02]);
    }
    add(body, cyl(0.17 * k, 0.19 * k, 0.4, 7), torsoMat, [0, 0.55, 0]);
    add(body, cyl(0.195 * k, 0.195 * k, 0.05, 7), mat(o.armor ? 0x4b3a2a : 0x3b2e22), [0, 0.4, 0]);
    if (trim) add(body, box(0.08, 0.32, 0.03), trim, [0, 0.56, 0.17 * k]);
  }

  if (o.armor) {
    for (const x of [-1, 1]) add(body, ico(0.1 * k), mat(o.tunic, 'metal'), [x * 0.2 * k, 0.72, 0], [0, 0, 0], [1.1, 0.7, 1]);
  }

  // Head & headgear
  const headY = 0.86;
  add(body, ico(0.12), mat(SKIN), [0, headY, 0.01]);
  const hc = o.headColor ?? DARK;
  switch (o.head) {
    case 'cap':
      add(body, cone(0.14, 0.16, 6), mat(hc), [0, headY + 0.12, -0.01], [-0.15, 0, 0]);
      break;
    case 'kettle':
      add(body, dome(0.13), mat(hc, 'metal'), [0, headY + 0.03, 0]);
      add(body, cyl(0.21, 0.21, 0.02, 8), mat(hc, 'metal'), [0, headY + 0.04, 0]);
      break;
    case 'helm':
      add(body, dome(0.135), mat(hc, 'metal'), [0, headY + 0.01, 0], [0, 0, 0], [1, 1.25, 1]);
      add(body, box(0.025, 0.1, 0.02), mat(hc, 'metal'), [0, headY - 0.01, 0.13]);
      break;
    case 'greathelm':
      add(body, cyl(0.135, 0.13, 0.25, 8), mat(hc, 'metal'), [0, headY + 0.02, 0]);
      add(body, dome(0.135, 8), mat(hc, 'metal'), [0, headY + 0.14, 0], [0, 0, 0], [1, 0.5, 1]);
      add(body, box(0.18, 0.025, 0.02), mat(0x111111), [0, headY + 0.03, 0.128]);
      if (trim) add(body, box(0.03, 0.08, 0.2), trim, [0, headY + 0.2, 0]);
      break;
    case 'hood':
      add(body, cone(0.17, 0.36, 7), mat(hc), [0, headY + 0.08, -0.03]);
      add(body, cyl(0.2, 0.26, 0.12, 7), mat(hc), [0, headY - 0.12, -0.01]);
      break;
    case 'mitre':
      add(body, cyl(0.065, 0.11, 0.24, 4), mat(hc), [0, headY + 0.2, 0], [0, Math.PI / 4, 0]);
      if (trim) add(body, box(0.025, 0.24, 0.13), trim, [0, headY + 0.2, 0.0]);
      break;
    default: // bare
      add(body, dome(0.125), mat(0x4a3322), [0, headY + 0.02, -0.01]);
      break;
  }

  // Arms (pivot at the shoulder so weapons can hang off them)
  const armMat = o.armor ? mat(o.tunic, 'metal') : mat(o.tunic);
  const armL = group(body, [0.23 * k, 0.72, 0], [-0.25, 0, -0.08]);
  const armR = group(body, [-0.23 * k, 0.72, 0], [-0.5, 0, 0.08]);
  for (const a of [armL, armR]) {
    add(a, box(0.085 * k, 0.32, 0.09 * k), armMat, [0, -0.16, 0]);
    add(a, ico(0.05), mat(SKIN), [0, -0.34, 0]);
  }

  if (o.cape != null) add(body, box(0.4 * k, 0.62, 0.03), mat(o.cape, 'double'), [0, 0.42, -0.19 * k], [0.12, 0, 0]);
  if (o.quiver) {
    add(body, cyl(0.05, 0.045, 0.34, 6), mat(WOOD), [0.1, 0.62, -0.2], [0.35, 0, -0.3]);
    for (let i = 0; i < 3; i++) add(body, box(0.015, 0.12, 0.015), mat(0xe8e0d0), [0.14 + i * 0.02, 0.83, -0.27 + i * 0.01], [0.35, 0, -0.3]);
  }

  addWeapon(o, body, armL, armR, k);
  addShield(o, body, armL, k);

  const phase = Math.random() * Math.PI * 2;
  root.userData.idle = (t) => {
    body.position.y = Math.sin(t * 2 + phase) * 0.012;
    armR.rotation.x = armR.userData.baseX + Math.sin(t * 1.4 + phase) * 0.05;
  };
  armR.userData.baseX = armR.rotation.x;
  return root;
}

function addWeapon(o, body, armL, armR, k) {
  const hand = [0, -0.34, 0];
  switch (o.weapon) {
    case 'pitchfork': {
      const g = group(armR, hand, [1.2, 0, 0]);
      add(g, cyl(0.016, 0.016, 1.1, 5), mat(WOOD), [0, 0.25, 0]);
      add(g, box(0.16, 0.02, 0.02), mat(STEEL, 'metal'), [0, 0.8, 0]);
      for (const x of [-0.07, 0, 0.07]) add(g, cyl(0.008, 0.008, 0.18, 4), mat(STEEL, 'metal'), [x, 0.89, 0]);
      break;
    }
    case 'flail': {
      const g = group(armR, hand, [1.0, 0, 0]);
      add(g, cyl(0.02, 0.02, 0.4, 5), mat(WOOD), [0, 0.12, 0]);
      for (let i = 0; i < 3; i++) add(g, ico(0.018), mat(0x777777, 'metal'), [0, 0.34 + i * 0.04, 0.02 * i]);
      add(g, new THREE.OctahedronGeometry(0.07, 0), mat(0x6f7780, 'metal'), [0, 0.5, 0.08]);
      break;
    }
    case 'club': {
      const g = group(armR, hand, [1.1, 0, 0]);
      add(g, cyl(0.075, 0.025, 0.55, 6), mat(WOOD), [0, 0.2, 0]);
      for (const a of [0, 2.1, 4.2]) add(g, cone(0.02, 0.06, 4), mat(0x999999, 'metal'), [Math.cos(a) * 0.07, 0.38, Math.sin(a) * 0.07], [0, 0, -Math.cos(a) * 1.4]);
      break;
    }
    case 'bow': {
      armL.rotation.set(-1.35, 0, -0.1);
      const g = group(armL, hand, [0, 0, 0]);
      add(g, new THREE.TorusGeometry(0.34, 0.016, 4, 10, Math.PI * 0.9), mat(WOOD), [0, 0, 0], [0, Math.PI / 2, Math.PI / 2 + 0.16]);
      add(g, cyl(0.004, 0.004, 0.66, 3), mat(0xeeeeee), [0, 0, -0.1], [0, 0, 0]);
      armR.rotation.set(-1.25, 0, 0.35);
      break;
    }
    case 'crossbow': {
      armL.rotation.set(-1.2, 0, 0.3);
      armR.rotation.set(-1.2, 0, -0.3);
      const g = group(body, [0, 0.6, 0.28]);
      add(g, box(0.06, 0.06, 0.46), mat(WOOD), [0, 0, 0]);
      add(g, box(0.5, 0.03, 0.04), mat(0x5a4a3a), [0, 0.02, 0.2], [0, 0, 0]);
      add(g, cyl(0.004, 0.004, 0.46, 3), mat(0xeeeeee), [0, 0.03, 0.14], [0, 0, Math.PI / 2]);
      add(g, box(0.02, 0.02, 0.3), mat(STEEL, 'metal'), [0, 0.045, 0.1]);
      break;
    }
    case 'sword': {
      const g = group(armR, hand, [1.25, 0, 0]);
      add(g, box(0.045, 0.5, 0.012), mat(0xdfe5ea, 'metal'), [0, 0.32, 0]);
      add(g, box(0.18, 0.03, 0.03), mat(0x8a6a2a, 'metal'), [0, 0.06, 0]);
      add(g, ico(0.03), mat(0x8a6a2a, 'metal'), [0, -0.06, 0]);
      break;
    }
    case 'greatsword': {
      armL.rotation.set(-0.9, 0, 0.55);
      armR.rotation.set(-0.9, 0, -0.55);
      const g = group(body, [0, 0.46, 0.3], [0.35, 0, 0]);
      add(g, box(0.06, 0.95, 0.016), mat(0xdfe5ea, 'metal'), [0, 0.6, 0]);
      add(g, box(0.28, 0.035, 0.04), mat(o.trim ?? 0x8a6a2a, 'metal'), [0, 0.12, 0]);
      add(g, cyl(0.02, 0.02, 0.2, 5), mat(0x3a2a1a), [0, 0.0, 0]);
      break;
    }
    case 'staff': {
      armR.rotation.set(-0.35, 0, 0.1);
      const g = group(armR, hand, [0.35, 0, 0]);
      add(g, cyl(0.02, 0.02, 1.25, 5), mat(0xf0e6c8), [0, 0.28, 0]);
      add(g, new THREE.TorusGeometry(0.07, 0.014, 4, 8), mat(o.trim ?? 0xc9a44a, 'metal'), [0, 0.95, 0]);
      add(g, ico(0.05), mat(o.orb ?? 0xfff0a0, 'glow'), [0, 0.95, 0]);
      break;
    }
  }
}

const KITE_PTS = [[0, 0.22], [0.16, 0.14], [0.13, -0.08], [0, -0.3], [-0.13, -0.08], [-0.16, 0.14]];

function addShield(o, body, armL, k) {
  if (!o.shield) return;
  const c = o.shieldColor ?? 0x355c9e;
  if (o.shield === 'pavise') {
    const g = group(body, [0, 0.55, -0.24], [0.1, 0, 0]);
    add(g, box(0.44, 0.7, 0.04), mat(c), [0, 0, 0]);
    add(g, box(0.06, 0.66, 0.05), mat(0xe8e0c8), [0, 0, 0]);
    return;
  }
  armL.rotation.set(-0.6, 0, -0.2);
  if (o.shield === 'kite') {
    const g = group(armL, [0.06, -0.24, 0.1], [0.6, 0.35, 0]);
    add(g, extrude(KITE_PTS, 0.03), mat(c), [0, 0, 0]);
    add(g, box(0.035, 0.36, 0.035), mat(0xe8e0c8), [0, -0.03, 0.01]);
    add(g, box(0.22, 0.035, 0.035), mat(0xe8e0c8), [0, 0.07, 0.01]);
  } else if (o.shield === 'tower') {
    const g = group(armL, [0.08, -0.22, 0.12], [0.6, 0.3, 0]);
    add(g, box(0.38, 0.62, 0.04), mat(c), [0, 0, 0]);
    const t = mat(o.trim ?? 0xd8b95a, 'metal');
    add(g, box(0.4, 0.035, 0.05), t, [0, 0.3, 0]);
    add(g, box(0.4, 0.035, 0.05), t, [0, -0.3, 0]);
    add(g, box(0.05, 0.3, 0.05), t, [0, 0.02, 0.01]);
    add(g, box(0.2, 0.05, 0.05), t, [0, 0.08, 0.01]);
  }
}

// ── Griffin (tier 4) ────────────────────────────────────────────────────────
export function buildGriffin(o) {
  const root = new THREE.Group();
  const body = group(root);
  const fur = mat(o.body);
  const feathers = mat(o.head);
  const s = o.scale || 1;
  body.scale.setScalar(s);

  add(body, cyl(0.27, 0.32, 0.95, 7), fur, [0, 0.72, -0.1], [Math.PI / 2 - 0.12, 0, 0]);
  add(body, ico(0.34), feathers, [0, 0.82, 0.32], [0, 0, 0], [0.95, 1.05, 1]);
  add(body, ico(0.3), fur, [0, 0.72, -0.52]);

  // Lion hind legs
  for (const x of [-0.19, 0.19]) {
    add(body, box(0.16, 0.34, 0.26), fur, [x, 0.5, -0.5], [0.3, 0, 0]);
    add(body, box(0.11, 0.36, 0.12), fur, [x, 0.2, -0.56], [-0.15, 0, 0]);
    add(body, box(0.14, 0.06, 0.18), fur, [x, 0.03, -0.52]);
  }
  // Eagle forelegs
  for (const x of [-0.17, 0.17]) {
    add(body, cyl(0.06, 0.045, 0.52, 5), feathers, [x, 0.4, 0.36]);
    add(body, cyl(0.03, 0.03, 0.2, 5), mat(o.beak), [x, 0.1, 0.38]);
    for (const a of [-0.4, 0, 0.4]) add(body, cone(0.02, 0.12, 4), mat(DARK), [x + a * 0.08, 0.02, 0.46], [Math.PI / 2, 0, 0]);
  }

  // Neck & head
  const headG = group(body, [0, 1.1, 0.52]);
  add(headG, cyl(0.14, 0.2, 0.36, 6), feathers, [0, -0.08, -0.04], [0.5, 0, 0]);
  add(headG, ico(0.19), feathers, [0, 0.14, 0.06], [0, 0, 0], [0.9, 0.95, 1.15]);
  add(headG, cone(0.075, 0.22, 4), mat(o.beak), [0, 0.1, 0.3], [Math.PI / 2 + 0.25, Math.PI / 4, 0]);
  for (const x of [-0.09, 0.09]) {
    add(headG, box(0.03, 0.03, 0.03), mat(0x111111), [x, 0.18, 0.17]);
    add(headG, cone(0.04, 0.14, 4), feathers, [x * 0.8, 0.32, -0.02], [-0.5, 0, x > 0 ? -0.3 : 0.3]);
  }
  if (o.crest != null) add(headG, cone(0.05, 0.28, 4), mat(o.crest), [0, 0.36, -0.1], [-0.7, 0, 0]);

  // Tail
  add(body, cyl(0.025, 0.04, 0.6, 5), fur, [0, 0.62, -0.95], [-1.1, 0, 0]);
  add(body, cone(0.07, 0.18, 5), mat(o.wing), [0, 0.42, -1.2], [-2.4, 0, 0]);

  if (o.barding != null) {
    add(body, box(0.66, 0.3, 0.6), mat(o.barding), [0, 0.74, -0.1]);
    add(body, box(0.68, 0.05, 0.62), mat(0xc9a44a, 'metal'), [0, 0.6, -0.1]);
    add(headG, box(0.2, 0.08, 0.2), mat(STEEL, 'metal'), [0, 0.26, 0.08]);
  }

  const [wl, wr] = wings(body, { at: [0.16, 1.0, 0.05], size: 0.92, color: o.wing, tipColor: o.head, sweep: 0.75, lift: 0.5 });

  const phase = Math.random() * Math.PI * 2;
  root.userData.idle = (t) => {
    const f = Math.sin(t * 1.7 + phase);
    wl.rotation.z = wl.userData.baseLift + f * 0.14;
    wr.rotation.z = wr.userData.baseLift + f * 0.14;
    body.position.y = Math.sin(t * 1.7 + phase + 0.6) * 0.02;
    headG.rotation.y = Math.sin(t * 0.6 + phase) * 0.18;
  };
  return root;
}

// ── Cavalry (tier 6) & hero mount ───────────────────────────────────────────
export function buildCavalry(o) {
  const root = new THREE.Group();
  const body = group(root);
  const hide = mat(o.horse);
  const mane = mat(o.mane);

  add(body, cyl(0.25, 0.25, 0.95, 7), hide, [0, 0.8, 0], [Math.PI / 2, 0, 0]);
  add(body, ico(0.27), hide, [0, 0.82, 0.42]);
  add(body, ico(0.27), hide, [0, 0.82, -0.42]);
  for (const [x, z] of [[-0.14, 0.4], [0.14, 0.4], [-0.14, -0.4], [0.14, -0.4]]) {
    add(body, box(0.1, 0.62, 0.12), hide, [x, 0.33, z]);
    add(body, box(0.12, 0.07, 0.14), mat(DARK), [x, 0.035, z + 0.01]);
  }
  const headG = group(body, [0, 1.05, 0.55]);
  add(headG, box(0.17, 0.5, 0.24), hide, [0, 0.08, 0.02], [0.55, 0, 0]);
  add(headG, box(0.16, 0.18, 0.4), hide, [0, 0.3, 0.24], [0.45, 0, 0]);
  add(headG, box(0.04, 0.34, 0.14), mane, [0, 0.14, -0.1], [0.55, 0, 0]);
  for (const x of [-0.05, 0.05]) add(headG, cone(0.03, 0.1, 4), hide, [x, 0.48, 0.12], [-0.2, 0, 0]);
  add(body, cone(0.08, 0.5, 5), mane, [0, 0.62, -0.72], [-2.6, 0, 0]);

  // Caparison / barding
  const cloth = mat(o.cloth);
  add(body, box(0.56, 0.3, 1.02), cloth, [0, 0.66, 0]);
  add(body, box(0.58, 0.04, 1.04), mat(o.trim ?? 0xe8e0c8, o.trim ? 'metal' : 'matte'), [0, 0.51, 0]);
  if (o.barded) {
    add(headG, box(0.18, 0.2, 0.36), mat(o.armor, 'metal'), [0, 0.36, 0.26], [0.45, 0, 0]);
    add(headG, box(0.2, 0.42, 0.26), mat(o.armor, 'metal'), [0, 0.08, 0.04], [0.55, 0, 0]);
    add(headG, cone(0.025, 0.14, 4), mat(o.trim ?? STEEL, 'metal'), [0, 0.46, 0.34], [0.2, 0, 0]);
  }
  add(body, box(0.4, 0.08, 0.34), mat(0x4a2e1c), [0, 1.07, -0.02]);

  // Rider
  const rider = group(body, [0, 1.1, -0.02]);
  const arm = mat(o.armor, 'metal');
  for (const x of [-0.17, 0.17]) add(rider, box(0.1, 0.36, 0.14), arm, [x, -0.06, 0.06], [-0.3, 0, x > 0 ? 0.25 : -0.25]);
  add(rider, cyl(0.16, 0.18, 0.4, 7), arm, [0, 0.28, 0]);
  add(rider, box(0.34, 0.26, 0.03), cloth, [0, 0.26, 0.17]);
  for (const x of [-1, 1]) add(rider, ico(0.09), arm, [x * 0.2, 0.44, 0], [0, 0, 0], [1.1, 0.7, 1]);
  add(rider, cyl(0.12, 0.12, 0.22, 8), arm, [0, 0.6, 0]);
  add(rider, dome(0.12, 8), arm, [0, 0.71, 0], [0, 0, 0], [1, 0.6, 1]);
  add(rider, box(0.16, 0.022, 0.02), mat(0x111111), [0, 0.62, 0.118]);
  add(rider, cone(0.05, 0.3, 4), mat(o.plume), [0, 0.86, -0.06], [-0.5, 0, 0]);
  add(rider, box(0.3, 0.5, 0.03), cloth, [0, 0.2, -0.17], [0.15, 0, 0]);

  const armR = group(rider, [-0.21, 0.43, 0], [-1.0, 0, 0]);
  add(armR, box(0.08, 0.3, 0.09), arm, [0, -0.15, 0]);
  if (o.banner != null) {
    const pole = group(armR, [0, -0.3, 0], [1.0, 0, 0]);
    add(pole, cyl(0.015, 0.015, 1.8, 5), mat(WOOD), [0, 0.5, 0]);
    add(pole, box(0.02, 0.5, 0.42), mat(o.banner, 'double'), [0, 1.14, -0.22]);
    add(pole, cone(0.035, 0.1, 4), mat(0xd8b95a, 'metal'), [0, 1.44, 0]);
  } else {
    const lance = group(armR, [0, -0.3, 0], [0.75, 0, 0]);
    add(lance, cone(0.045, 1.5, 6), mat(0xe8e2d0), [0, 0.8, 0]);
    add(lance, cyl(0.07, 0.03, 0.14, 6), mat(o.trim ?? 0x8a6a2a, 'metal'), [0, 0.05, 0]);
  }
  const armL = group(rider, [0.21, 0.43, 0], [-0.4, 0, -0.2]);
  add(armL, box(0.08, 0.3, 0.09), arm, [0, -0.15, 0]);
  const shield = group(armL, [0.06, -0.24, 0.02], [0.4, 0.5, 0]);
  add(shield, extrude(KITE_PTS, 0.03), cloth, [0, 0, 0], [0, 0, 0], [0.9, 0.9, 1]);
  add(shield, box(0.03, 0.3, 0.035), mat(o.trim ?? 0xe8e0c8, 'metal'), [0, -0.03, 0.01]);

  const phase = Math.random() * Math.PI * 2;
  root.userData.idle = (t) => {
    body.position.y = Math.sin(t * 1.5 + phase) * 0.012;
    headG.rotation.x = Math.sin(t * 1.1 + phase) * 0.07;
  };
  return root;
}

// ── Angel (tier 7) ──────────────────────────────────────────────────────────
export function buildAngel(o) {
  const root = new THREE.Group();
  const s = o.scale || 1;
  const hover = group(root, [0, 0.28, 0]);
  const body = group(hover);
  body.scale.setScalar(1.55 * s);

  add(body, cyl(0.15, 0.27, 0.66, 8), mat(o.robe), [0, 0.36, 0]);
  add(body, cone(0.27, 0.12, 8), mat(o.robe), [0, 0.0, 0], [Math.PI, 0, 0]);
  add(body, cyl(0.17, 0.16, 0.3, 7), mat(o.armor, 'metal'), [0, 0.68, 0]);
  add(body, cyl(0.18, 0.18, 0.04, 8), mat(o.armor, 'metal'), [0, 0.54, 0]);
  for (const x of [-1, 1]) add(body, ico(0.09), mat(o.armor, 'metal'), [x * 0.2, 0.78, 0], [0, 0, 0], [1.1, 0.7, 1]);
  add(body, ico(0.11), mat(SKIN), [0, 0.93, 0.01]);
  add(body, dome(0.12), mat(o.hair), [0, 0.94, -0.015], [-0.1, 0, 0]);
  add(body, box(0.2, 0.2, 0.06), mat(o.hair), [0, 0.86, -0.08]);
  add(body, new THREE.TorusGeometry(0.1, 0.012, 4, 12), mat(o.halo, 'glow'), [0, 1.1, -0.03], [Math.PI / 2 - 0.25, 0, 0]);
  if (o.cape != null) add(body, box(0.36, 0.72, 0.02), mat(o.cape, 'double'), [0, 0.46, -0.16], [0.12, 0, 0]);

  const armL = group(body, [0.22, 0.8, 0], [-0.3, 0, -0.15]);
  add(armL, box(0.075, 0.3, 0.08), mat(o.robe), [0, -0.15, 0]);
  add(armL, ico(0.045), mat(SKIN), [0, -0.32, 0]);
  const armR = group(body, [-0.22, 0.8, 0], [-1.1, 0, 0.1]);
  add(armR, box(0.075, 0.3, 0.08), mat(o.robe), [0, -0.15, 0]);
  add(armR, ico(0.045), mat(SKIN), [0, -0.32, 0]);
  const sword = group(armR, [0, -0.33, 0], [1.6, 0, 0]);
  add(sword, box(0.05, 0.7, 0.014), mat(o.weapon, 'glow'), [0, 0.45, 0]);
  add(sword, box(0.2, 0.03, 0.035), mat(o.armor, 'metal'), [0, 0.08, 0]);
  add(sword, ico(0.03), mat(o.armor, 'metal'), [0, -0.04, 0]);

  const pairs = [wings(body, { at: [0.1, 0.8, -0.1], size: 1.05, color: o.wing, tipColor: o.wing, sweep: 0.55, lift: 0.55 })];
  if (o.sixWings) {
    pairs.push(wings(body, { at: [0.1, 0.9, -0.12], size: 0.6, color: o.wing, sweep: 0.7, lift: 1.15 }));
    pairs.push(wings(body, { at: [0.1, 0.62, -0.12], size: 0.55, color: o.wing, sweep: 0.8, lift: -0.35 }));
  }

  const phase = Math.random() * Math.PI * 2;
  root.userData.idle = (t) => {
    const f = Math.sin(t * 1.3 + phase);
    for (const [l, r] of pairs) {
      l.rotation.z = l.userData.baseLift + f * 0.18;
      r.rotation.z = r.userData.baseLift + f * 0.18;
    }
    hover.position.y = 0.28 + Math.sin(t * 1.3 + phase - 0.8) * 0.05;
  };
  return root;
}

export function buildCreatureModel(def) {
  const m = def.model;
  switch (m.kind) {
    case 'griffin': return buildGriffin(m);
    case 'cavalry': return buildCavalry(m);
    case 'angel': return buildAngel(m);
    default: return buildHumanoid(m);
  }
}
