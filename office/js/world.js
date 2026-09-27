import * as THREE from 'three';
import * as TX from './textures.js';

// Units are metres. The player's chair stands at the origin, facing -Z.
export const ROOM = { x0: -3.3, x1: 3.3, z0: -1.45, z1: 3.0, h: 2.8 };
const DESK_H = 0.75;

// ---------- helpers ----------
const std = (color, rough = 0.8, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

function add(parent, geo, mat, x = 0, y = 0, z = 0, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast; m.receiveShadow = receive;
  parent.add(m);
  return m;
}
const box = (parent, w, h, d, mat, x, y, z, o) => add(parent, new THREE.BoxGeometry(w, h, d), mat, x, y, z, o);
const cyl = (parent, rt, rb, h, mat, x, y, z, seg = 24, o) => add(parent, new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, o);

function roundedBoxGeo(w, h, d, r, seg = 3) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const s = new THREE.Shape();
  const x = -w / 2 + r, y = -h / 2 + r, ww = w - 2 * r, hh = h - 2 * r;
  s.moveTo(x, y); s.lineTo(x + ww, y); s.lineTo(x + ww, y + hh); s.lineTo(x, y + hh); s.lineTo(x, y);
  const geo = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: seg, curveSegments: seg });
  geo.translate(0, 0, -(d - 2 * r) / 2);
  geo.computeVertexNormals();
  return geo;
}
const rbox = (parent, w, h, d, r, mat, x, y, z, o) => add(parent, roundedBoxGeo(w, h, d, r), mat, x, y, z, o);

// a capsule stretched between two points
function limb(parent, a, b, radius, mat) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const m = add(parent, new THREE.CapsuleGeometry(radius, Math.max(0.001, len), 4, 10), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

function plane(parent, w, h, mat, x, y, z, ry = 0, o = { cast: false, receive: true }) {
  const m = add(parent, new THREE.PlaneGeometry(w, h), mat, x, y, z, o);
  m.rotation.y = ry;
  return m;
}

function interact(obj, name, hint) {
  obj.userData.interact = name;
  obj.userData.hint = hint;
  return obj;
}

// ============================================================

// plane whose UVs repeat every `tile` metres (so one texture serves any size)
function tiledPlane(w, d, tile) {
  const geo = new THREE.PlaneGeometry(w, d);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / tile), uv.getY(i) * (d / tile));
  return geo;
}
function repeatTex(t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 1); return t; }

export const CORR = { x0: -3.3, x1: 3.3, z0: 3.12, z1: 4.92 };
export const KITCH = { x0: -3.3, x1: 0.7, z0: 5.04, z1: 8.2 };
const DOOR1 = { x0: 1.75, x1: 2.65, h: 2.1 };
const DOOR2 = { x0: -2.0, x1: -1.1, h: 2.1 };

// ============================================================
export function buildWorld(scene, { screenTex }) {
  const refs = { interactables: [], colliders: [], crumbs: [] };
  const col = (x0, z0, x1, z1) => refs.colliders.push({ x0, z0, x1, z1 });
  const reg = (obj, name, hint) => { interact(obj, name, hint); refs.interactables.push(obj); return obj; };
  const M = {
    wall: std(0xffffff, 0.95, 0, { map: repeatTex(TX.plasterTex('#e7e3d9')) }),
    carpet: std(0xffffff, 0.98, 0, { map: repeatTex(TX.carpetTex()) }),
    linoleum: std(0xffffff, 0.7, 0, { map: repeatTex(TX.linoleumTex()) }),
    ktile: std(0xffffff, 0.35, 0, { map: repeatTex(TX.kitchenTileTex()) }),
    ceiling: std(0xffffff, 0.95, 0, { map: repeatTex(TX.ceilingTex()) }),
    desk: std(0xffffff, 0.55, 0, { map: TX.woodTex() }),
    deskEdge: std(0x6d6a64, 0.5),
    metal: std(0x8e949b, 0.35, 0.8),
    darkMetal: std(0x3a3d42, 0.45, 0.6),
    black: std(0x1b1c1f, 0.45),
    blackMatte: std(0x222326, 0.8),
    grey: std(0xb9bcbf, 0.55),
    white: std(0xf2f2ef, 0.5),
    pvc: std(0xf5f5f3, 0.35),
    partition: std(0xffffff, 1, 0, { map: TX.fabricTex('#6e7d8c') }),
    chair: std(0xffffff, 0.95, 0, { map: TX.fabricTex('#2c3139') }),
    paper: std(0xfbfbf7, 0.9),
    wood: std(0xffffff, 0.55, 0, { map: TX.woodTex() }),
  };
  const { x0, x1, z0, z1, h } = ROOM;

  // ---------- floors, ceilings ----------
  const area = (A, mat, tile) => {
    const w = A.x1 - A.x0, d = A.z1 - A.z0;
    const fl = add(scene, tiledPlane(w, d, tile), mat, (A.x0 + A.x1) / 2, 0, (A.z0 + A.z1) / 2, { cast: false });
    fl.rotation.x = -Math.PI / 2;
    const c = add(scene, tiledPlane(w, d, 1.2), M.ceiling, (A.x0 + A.x1) / 2, h, (A.z0 + A.z1) / 2, { cast: false });
    c.rotation.x = Math.PI / 2;
  };
  area(ROOM, M.carpet, 1);
  area(CORR, M.linoleum, 1.2);
  area(KITCH, M.ktile, 1.2);
  // door thresholds
  [[DOOR1, 3.06], [DOOR2, 4.98]].forEach(([D, z]) => {
    const th = add(scene, new THREE.PlaneGeometry(D.x1 - D.x0, 0.14), std(0x8a7a62, 0.6), (D.x0 + D.x1) / 2, 0.002, z, { cast: false });
    th.rotation.x = -Math.PI / 2;
  });

  // ---------- walls ----------
  const wallPlane = (w, x, z, ry) => add(scene, tiledPlane(w, h, 2), M.wall, x, h / 2, z, { cast: false }).rotation.y = ry;
  wallPlane(x1 - x0, 0, z0, 0);                                              // office front
  wallPlane(z1 - z0, x1, (z0 + z1) / 2, -Math.PI / 2);                       // office right
  wallPlane(CORR.z1 - CORR.z0 + 0.24, x1, (CORR.z0 + CORR.z1) / 2, -Math.PI / 2); // corridor end
  wallPlane(KITCH.z1 - KITCH.z0, KITCH.x1, (KITCH.z0 + KITCH.z1) / 2, -Math.PI / 2); // kitchen right
  wallPlane(KITCH.x1 - KITCH.x0, (KITCH.x0 + KITCH.x1) / 2, KITCH.z1, Math.PI);     // kitchen back
  // interior walls with doorways
  const inner = (zc, D) => {
    const t = 0.12;
    const seg = (a, b) => box(scene, b - a, h, t, M.wall, (a + b) / 2, h / 2, zc);
    seg(x0, D.x0); seg(D.x1, x1);
    box(scene, D.x1 - D.x0, h - D.h, t, M.wall, (D.x0 + D.x1) / 2, (h + D.h) / 2, zc);
    const trim = std(0xf4f2ec, 0.4);
    [D.x0 - 0.03, D.x1 + 0.03].forEach((x) => box(scene, 0.06, D.h + 0.03, t + 0.03, trim, x, (D.h + 0.03) / 2, zc));
    box(scene, D.x1 - D.x0 + 0.12, 0.06, t + 0.03, trim, (D.x0 + D.x1) / 2, D.h + 0.03, zc);
  };
  inner(3.06, DOOR1);
  inner(4.98, DOOR2);
  // door leaves: closed at start, main.js swings them open
  refs.doors = [];
  const leaf = (D, zc, openAngle, name) => {
    const g = new THREE.Group(); g.position.set(D.x1 - 0.02, 0, zc + 0.06); scene.add(g);
    box(g, D.x1 - D.x0 - 0.04, D.h - 0.02, 0.04, std(0x9b7b56, 0.55, 0, { map: TX.woodTex() }), -(D.x1 - D.x0) / 2, D.h / 2, 0.02);
    [-0.03, 0.07].forEach((z) => box(g, 0.12, 0.02, 0.03, M.metal, -(D.x1 - D.x0) + 0.1, 1.02, z));
    reg(g, 'door', name);
    refs.doors.push({ pivot: g, open: false, angle: 0, openAngle, name, x: (D.x0 + D.x1) / 2, z: zc, D });
  };
  leaf(DOOR1, 3.06, -1.75, 'Дверь офиса');
  leaf(DOOR2, 4.98, -1.6, 'Дверь кухни');
  // skirting
  const skirt = std(0x5a5550, 0.6);
  box(scene, x1 - x0, 0.08, 0.015, skirt, 0, 0.04, z0 + 0.008, { cast: false });
  box(scene, 0.015, 0.08, z1 - z0, skirt, x1 - 0.008, 0.04, (z0 + z1) / 2, { cast: false });

  // ---------- left exterior wall with windows ----------
  const LZ0 = z0, LZ1 = KITCH.z1;
  const wins = [{ z: -0.35, w: 1.5, open: true }, { z: 1.9, w: 1.5 }, { z: 6.6, w: 1.3 }];
  const wy0 = 0.85, wy1 = 2.35, wt = 0.24, wx = x0 - wt / 2;
  box(scene, wt, wy0, LZ1 - LZ0, M.wall, wx, wy0 / 2, (LZ0 + LZ1) / 2);
  box(scene, wt, h - wy1, LZ1 - LZ0, M.wall, wx, (h + wy1) / 2, (LZ0 + LZ1) / 2);
  let zPrev = LZ0;
  [...wins, { z: LZ1 + 0.75, w: 1.5 }].forEach((wd) => {
    const a = zPrev, b = wd.z - wd.w / 2;
    if (b > a) box(scene, wt, wy1 - wy0, b - a, M.wall, wx, (wy0 + wy1) / 2, (a + b) / 2);
    zPrev = wd.z + wd.w / 2;
  });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xdfeef5, roughness: 0.05, transparent: true, opacity: 0.12, depthWrite: false });
  const slatMat = std(0xeeeeea, 0.6);
  wins.forEach(({ z, w, open }) => {
    const fw = 0.06, fx = x0 - 0.1, wh = wy1 - wy0, wyc = (wy0 + wy1) / 2;
    box(scene, 0.07, fw, w, M.pvc, fx, wy0 + fw / 2, z);
    box(scene, 0.07, fw, w, M.pvc, fx, wy1 - fw / 2, z);
    box(scene, 0.07, wh, fw, M.pvc, fx, wyc, z - w / 2 + fw / 2);
    box(scene, 0.07, wh, fw, M.pvc, fx, wyc, z + w / 2 - fw / 2);
    box(scene, 0.07, wh, 0.07, M.pvc, fx, wyc, z);
    const gl = plane(scene, w / 2 - 0.05, wh - 0.1, glass, fx, wyc, z - w / 4, Math.PI / 2, { cast: false, receive: false });
    gl.renderOrder = 2;
    // right half: a sash that can swing into the room
    const sashW = w / 2 - 0.09;
    const sash = new THREE.Group(); sash.position.set(fx + 0.02, wyc, z + w / 2 - fw); scene.add(sash);
    box(sash, 0.06, wh - 0.12, 0.05, M.pvc, 0, 0, -0.025);
    box(sash, 0.06, wh - 0.12, 0.05, M.pvc, 0, 0, -sashW + 0.025);
    box(sash, 0.06, 0.05, sashW, M.pvc, 0, wh / 2 - 0.085, -sashW / 2);
    box(sash, 0.06, 0.05, sashW, M.pvc, 0, -wh / 2 + 0.085, -sashW / 2);
    box(sash, 0.03, 0.12, 0.02, M.white, 0.04, 0, -sashW + 0.05);
    const sg = plane(sash, sashW - 0.08, wh - 0.2, glass, 0, 0, -sashW / 2, Math.PI / 2, { cast: false, receive: false });
    sg.renderOrder = 2;
    if (open) { refs.window = { sash, open: false, angle: 0 }; reg(sash, 'window', 'Окно'); }
    // sill + radiator
    box(scene, 0.3, 0.03, w + 0.2, M.pvc, x0 + 0.03, wy0 - 0.015, z);
    const rad = new THREE.Group(); rad.position.set(x0 + 0.08, 0.2, z); scene.add(rad);
    for (let i = 0; i < 12; i++) box(rad, 0.08, 0.5, 0.05, M.white, 0, 0.25, -0.33 + i * 0.06);
    col(x0, z - 0.45, x0 + 0.2, z + 0.45);
    // blinds (the openable window has them pulled up)
    const n = open ? 5 : 22;
    const slats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.025, 0.002, w - 0.12), slatMat, n);
    slats.castShadow = true;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      dummy.position.set(x0 + 0.04, wy1 - 0.06 - i * (open ? 0.006 : 0.022), z);
      dummy.rotation.set(0, 0, open ? 1.3 : 0.55);
      dummy.updateMatrix(); slats.setMatrixAt(i, dummy.matrix);
    }
    scene.add(slats);
    box(scene, 0.05, 0.04, w - 0.08, M.white, x0 + 0.04, wy1 - 0.03, z);
  });
  const city = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshBasicMaterial({ map: TX.cityTex(), toneMapped: false, fog: false }));
  city.position.set(-16, 4.2, 3); city.rotation.y = Math.PI / 2;
  scene.add(city);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 40), std(0x7d8279, 1));
  ground.rotation.x = -Math.PI / 2; ground.position.set(-10, -3, 3); scene.add(ground);

  // ceiling panels (the lights themselves live in main.js)
  const panelMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f7ff, emissiveIntensity: 1.6 });
  refs.lightSpots = [[-1.75, -0.35], [0, -0.35], [1.75, -0.35], [-1.75, 1.8], [0, 1.8], [1.75, 1.8], [-1.6, 4.02], [1.6, 4.02], [-1.3, 6.6]];
  refs.lightSpots.forEach(([x, z]) => {
    box(scene, 0.6, 0.02, 0.6, M.white, x, h - 0.01, z, { cast: false });
    box(scene, 0.56, 0.01, 0.56, panelMat, x, h - 0.02, z, { cast: false });
  });
  const ac = new THREE.Group(); ac.position.set(-1.9, 2.45, z0 + 0.12); scene.add(ac);
  rbox(ac, 0.9, 0.28, 0.2, 0.04, M.white, 0, 0, 0);
  for (let i = 0; i < 6; i++) box(ac, 0.8, 0.006, 0.02, M.grey, 0, -0.1 + i * 0.012, 0.095, { cast: false });

  // ---------- office wall decor ----------
  const clockTex = TX.clockTex();
  const clock = new THREE.Group(); clock.position.set(0.55, 2.12, z0 + 0.03); scene.add(clock);
  cyl(clock, 0.17, 0.17, 0.04, M.black, 0, 0, 0, 40).rotation.x = Math.PI / 2;
  add(clock, new THREE.CircleGeometry(0.155, 48), new THREE.MeshStandardMaterial({ map: clockTex, roughness: 0.4 }), 0, 0, 0.021, { cast: false });
  refs.clockTex = clockTex;
  reg(clock, 'clock', 'Часы');
  reg(plane(scene, 0.42, 0.574, new THREE.MeshStandardMaterial({ map: TX.calendarTex(), roughness: 0.8 }), -0.75, 1.72, z0 + 0.006), 'calendar', 'Календарь');
  plane(scene, 0.5, 0.7, new THREE.MeshStandardMaterial({ map: TX.posterTex(), roughness: 0.6 }), 1.3, 1.72, z0 + 0.006);
  const cert = new THREE.Group(); cert.position.set(-2.5, 1.75, z0 + 0.015); scene.add(cert);
  box(cert, 0.36, 0.46, 0.02, std(0x7a5a33, 0.5), 0, 0, 0);
  plane(cert, 0.3, 0.4, new THREE.MeshStandardMaterial({ map: TX.paperTex('ГРАМОТА', 10, 4) }), 0, 0, 0.011);

  const wb = new THREE.Group(); wb.position.set(x1 - 0.02, 1.5, -0.2); wb.rotation.y = -Math.PI / 2; scene.add(wb);
  box(wb, 1.64, 1.04, 0.03, M.metal, 0, 0, 0);
  plane(wb, 1.58, 0.98, new THREE.MeshStandardMaterial({ map: TX.whiteboardTex(), roughness: 0.25 }), 0, 0, 0.016);
  box(wb, 1.5, 0.03, 0.07, M.metal, 0, -0.53, 0.03);
  reg(wb, 'whiteboard', 'Доска со сроками');

  const shelf = new THREE.Group(); shelf.position.set(x1 - 0.22, 0, 1.7); shelf.rotation.y = -Math.PI / 2; scene.add(shelf);
  const shelfMat = std(0xb9a98c, 0.6);
  box(shelf, 1.0, 2.0, 0.02, shelfMat, 0, 1.0, -0.19);
  box(shelf, 0.02, 2.0, 0.4, shelfMat, -0.49, 1.0, 0); box(shelf, 0.02, 2.0, 0.4, shelfMat, 0.49, 1.0, 0);
  const binderColors = ['#1f4e9c', '#b3261e', '#2e7d32', '#f0b400', '#5e35b1', '#374151'];
  const labels = ['Заявки янв', 'Заявки фев', 'Заявки мар', 'Заявки апр', 'Заявки май', 'Заявки июн', 'Заявки июл', 'Заявки авг', 'Прайсы', 'Договоры', 'Маршруты', 'Жалобы'];
  for (let s = 0; s < 5; s++) {
    box(shelf, 0.96, 0.02, 0.38, shelfMat, 0, 0.02 + s * 0.44, 0);
    if (s === 4) break;
    for (let i = 0; i < 12; i++) {
      const c = binderColors[(i + s * 2) % binderColors.length];
      const b = box(shelf, 0.07, 0.32, 0.28, std(c, 0.6), -0.4 + i * 0.075, 0.2 + s * 0.44, 0.02);
      b.material = [b.material, b.material, b.material, b.material, new THREE.MeshStandardMaterial({ map: TX.binderTex(labels[(i + s * 5) % labels.length], c) }), b.material];
    }
  }
  col(x1 - 0.42, 1.18, x1, 2.22);

  // printer on a cabinet by the back wall
  const cab = new THREE.Group(); cab.position.set(0.6, 0, z1 - 0.3); cab.rotation.y = Math.PI; scene.add(cab);
  box(cab, 0.9, 0.72, 0.5, std(0xc9c3b5, 0.6), 0, 0.36, 0);
  const printer = new THREE.Group(); printer.position.set(0, 0.72, 0); cab.add(printer);
  rbox(printer, 0.56, 0.42, 0.48, 0.02, std(0xe6e6e2, 0.5), 0, 0.21, 0);
  box(printer, 0.56, 0.05, 0.4, std(0x44474d, 0.5), 0, 0.44, 0);
  box(printer, 0.18, 0.08, 0.006, std(0x22262b, 0.3), 0.14, 0.37, 0.242);
  box(printer, 0.36, 0.01, 0.2, M.paper, 0, 0.22, 0.26);
  refs.printerPaper = box(printer, 0.21, 0.006, 0.297, M.paper, 0, 0.232, 0.24);
  refs.printerPaper.visible = false;
  refs.printer = printer;
  reg(printer, 'printer', 'Принтер');
  col(0.12, z1 - 0.58, 1.08, z1);
  plane(scene, 0.3, 0.2, new THREE.MeshStandardMaterial({ map: TX.stickyTex('Бумагу\nэкономим!', '#ffffff', 2) }), 0.6, 1.55, z1 - 0.001, Math.PI);

  const cooler = new THREE.Group(); cooler.position.set(-0.7, 0, z1 - 0.3); cooler.rotation.y = Math.PI; scene.add(cooler);
  rbox(cooler, 0.32, 1.0, 0.32, 0.02, M.white, 0, 0.5, 0);
  box(cooler, 0.2, 0.12, 0.03, std(0x999999, 0.6), 0, 0.82, 0.16);
  cyl(cooler, 0.14, 0.14, 0.4, new THREE.MeshPhysicalMaterial({ color: 0x8ec5ff, transparent: true, opacity: 0.45, roughness: 0.1 }), 0, 1.2, 0);
  reg(cooler, 'cooler', 'Кулер');
  col(-0.9, z1 - 0.5, -0.5, z1);

  const rack = new THREE.Group(); rack.position.set(-2.4, 0, z1 - 0.35); scene.add(rack);
  cyl(rack, 0.02, 0.02, 1.8, M.darkMetal, 0, 0.9, 0, 10);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; box(rack, 0.5, 0.02, 0.03, M.darkMetal, Math.cos(a) * 0.2, 0.02, Math.sin(a) * 0.2).rotation.y = -a; }
  add(rack, new THREE.CylinderGeometry(0.1, 0.24, 1.0, 14, 1, true), std(0x3b3f4a, 0.9, 0, { side: THREE.DoubleSide }), 0.1, 1.2, 0).rotation.z = 0.1;
  add(rack, new THREE.CylinderGeometry(0.08, 0.2, 0.8, 14, 1, true), std(0x9c4a5a, 0.9, 0, { side: THREE.DoubleSide }), -0.12, 1.3, 0.05).rotation.z = -0.12;
  col(-2.7, z1 - 0.65, -2.1, z1);

  const ficus = new THREE.Group(); ficus.position.set(-2.95, 0, 2.6); scene.add(ficus);
  cyl(ficus, 0.2, 0.15, 0.38, std(0xa65a36, 0.8), 0, 0.19, 0);
  cyl(ficus, 0.012, 0.018, 1.1, std(0x5b4430, 0.8), 0, 0.9, 0, 8);
  const leafMat = std(0x2f6b33, 0.7);
  const lr = TX.rng(12);
  for (let i = 0; i < 70; i++) {
    const a = lr() * Math.PI * 2, y = 0.8 + lr() * 0.85, r = 0.08 + lr() * (0.35 - Math.abs(y - 1.3) * 0.3);
    const lf = add(ficus, new THREE.SphereGeometry(0.06, 8, 6), leafMat, Math.cos(a) * r, y, Math.sin(a) * r);
    lf.scale.set(1, 0.3, 0.55); lf.rotation.set(lr() * 2, a, lr() * 0.6);
  }
  col(-3.3, 2.3, -2.65, 2.95);

  // ---------- workstations ----------
  buildDesk(scene, 0, M); col(-0.8, -1.22, 0.8, -0.34);
  [-0.875, 0.875].forEach((x) => {
    box(scene, 0.04, 0.34, 0.78, M.partition, x, DESK_H + 0.17, -0.75);
    box(scene, 0.05, 0.02, 0.8, M.darkMetal, x, DESK_H + 0.35, -0.75);
  });
  box(scene, 1.62, 0.42, 0.04, M.partition, 0, DESK_H + 0.21, -1.18);
  box(scene, 1.62, 0.02, 0.05, M.darkMetal, 0, DESK_H + 0.43, -1.18);
  plane(scene, 0.21, 0.297, new THREE.MeshStandardMaterial({ map: TX.paperTex('ГРАФИК СМЕН', 14, 6) }), -0.62, DESK_H + 0.24, -1.157).rotation.z = 0.04;

  // ---------- player workstation ----------
  const monitor = makeMonitor(scene, M, new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }), 0, -0.9);
  refs.screen = monitor.screen;
  reg(monitor.group, 'monitor', 'Работать за компьютером');
  [['пароль:\n12345', '#ffe66b', -0.305, 1.19, 0.12], ['код клиента\n→ фамилия!', '#ff9ec7', 0.305, 1.18, -0.1], ['Сумму\nназывать!', '#9ee6ff', 0.305, 1.06, 0.06]].forEach(([t, c, x, y, rz], i) => {
    const note = plane(monitor.group, 0.075, 0.075, new THREE.MeshStandardMaterial({ map: TX.stickyTex(t, c, i), roughness: 0.8 }), x - (x > 0 ? -0.02 : 0.02), y - DESK_H, 0.034);
    note.rotation.z = rz;
  });
  refs.keyboard = makeKeyboard(scene, M, 0, -0.55);
  refs.mouse = makeMouse(scene, M, 0.31, -0.55);
  refs.phone = makePhone(scene, M, -0.5, -0.62, 0.55);
  reg(refs.phone.group, 'phone', 'Телефон');
  refs.mug = makeMug(scene, M, 0.56, -0.44);
  reg(refs.mug.group, 'mug', 'Кружка');
  refs.lamp = makeLamp(scene, M, -0.7, -1.02);
  reg(refs.lamp.group, 'lamp', 'Лампа');
  const ph = new THREE.Group(); ph.position.set(-0.3, DESK_H, -1.0); scene.add(ph);
  cyl(ph, 0.04, 0.04, 0.1, std(0x33373d, 0.5, 0.5), 0, 0.05, 0);
  [[0x1e46b4, 0.2, 0], [0xc0271d, -0.15, 1], [0x111111, 0.1, 2], [0xf0b400, -0.05, 3]].forEach(([c, t, i]) => cyl(ph, 0.004, 0.004, 0.15, std(c, 0.4), Math.cos(i * 1.3) * 0.018, 0.12, Math.sin(i * 1.3) * 0.018, 8).rotation.set(t, 0, t * 0.8));
  const stp = new THREE.Group(); stp.position.set(-0.22, DESK_H, -0.78); stp.rotation.y = 0.5; scene.add(stp);
  rbox(stp, 0.04, 0.012, 0.15, 0.005, M.black, 0, 0.006, 0);
  refs.staplerTop = rbox(stp, 0.036, 0.022, 0.14, 0.008, std(0x2b58b8, 0.35), 0, 0.028, 0.004);
  reg(stp, 'stapler', 'Степлер');
  const flip = new THREE.Group(); flip.position.set(-0.43, DESK_H, -0.9); flip.rotation.y = 0.35; scene.add(flip);
  const tri = new THREE.Shape(); tri.moveTo(-0.045, 0); tri.lineTo(0.045, 0); tri.lineTo(0, 0.11); tri.closePath();
  const triGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.13, bevelEnabled: false }); triGeo.rotateY(Math.PI / 2); triGeo.translate(-0.065, 0, 0);
  add(flip, triGeo, std(0x2f3136, 0.6));
  plane(flip, 0.12, 0.094, new THREE.MeshStandardMaterial({ map: TX.flipCalTex() }), 0, 0.055, 0.0245, 0).rotation.x = -0.39;
  const calc = add(scene, new THREE.BoxGeometry(0.1, 0.015, 0.14), [M.black, M.black, new THREE.MeshStandardMaterial({ map: TX.calculatorTex(), roughness: 0.6 }), M.black, M.black, M.black], 0.55, DESK_H + 0.0075, -0.68);
  calc.rotation.y = -0.3;
  reg(calc, 'calc', 'Калькулятор');
  ['Прайс 2026', 'Клиенты', 'Маршруты', 'Жалобы'].forEach((t, i) => {
    const c = ['#1f4e9c', '#b3261e', '#2e7d32', '#f0b400'][i];
    const b = box(scene, 0.06, 0.3, 0.26, std(c, 0.6), 0.38 + i * 0.065 + (i === 3 ? 0.02 : 0), DESK_H + 0.15, -0.99);
    b.rotation.z = i === 3 ? -0.12 : 0;
    b.material = [b.material, b.material, b.material, b.material, new THREE.MeshStandardMaterial({ map: TX.binderTex(t, c) }), b.material];
  });
  const tray = new THREE.Group(); tray.position.set(0.7, DESK_H, -0.78); tray.rotation.y = -0.1; scene.add(tray);
  const trayMat = std(0x2a2c30, 0.4, 0.3);
  for (let lvl = 0; lvl < 2; lvl++) {
    const y = lvl * 0.08;
    box(tray, 0.2, 0.006, 0.28, trayMat, 0, y + 0.003, 0);
    box(tray, 0.006, 0.05, 0.28, trayMat, -0.1, y + 0.025, 0); box(tray, 0.006, 0.05, 0.28, trayMat, 0.1, y + 0.025, 0);
    for (let k = 0; k < 4 + lvl * 3; k++) box(tray, 0.18, 0.002, 0.25, M.paper, 0, y + 0.008 + k * 0.003, -0.01).rotation.y = (k % 3 - 1) * 0.03;
  }
  reg(tray, 'papers', 'Лоток с бумагами');
  const sheet = plane(scene, 0.21, 0.297, new THREE.MeshStandardMaterial({ map: TX.paperTex('ПОСТОЯННЫЕ ЗАКАЗЫ', 22, 2) }), 0.05, DESK_H + 0.002, -0.74);
  sheet.rotation.set(-Math.PI / 2, 0, 0.35);
  reg(sheet, 'sheet', 'Лист постоянных заказов');
  refs.sheet = sheet;
  const pad = new THREE.Group(); pad.position.set(-0.31, DESK_H, -0.42); pad.rotation.y = 0.25; scene.add(pad);
  box(pad, 0.15, 0.012, 0.21, std(0xf0ecd8, 0.9), 0, 0.006, 0);
  cyl(pad, 0.005, 0.005, 0.14, std(0x1e46b4, 0.3), 0.04, 0.02, 0.01, 8).rotation.set(Math.PI / 2, 0, 0.3);
  const cac = new THREE.Group(); cac.position.set(0.74, DESK_H, -0.56); scene.add(cac);
  cyl(cac, 0.045, 0.035, 0.07, std(0xd9d1c3, 0.7), 0, 0.035, 0);
  add(cac, new THREE.CapsuleGeometry(0.028, 0.06, 4, 10), std(0x3f7d3a, 0.7), 0, 0.12, 0);
  add(cac, new THREE.SphereGeometry(0.01, 8, 6), std(0xff6fa8, 0.6), 0.005, 0.18, 0);
  reg(cac, 'cactus', 'Кактус');
  const pc = new THREE.Group(); pc.position.set(0.55, 0, -0.85); scene.add(pc);
  box(pc, 0.2, 0.42, 0.44, M.blackMatte, 0, 0.21, 0);
  refs.pcLed = box(pc, 0.008, 0.008, 0.004, new THREE.MeshBasicMaterial({ color: 0x3cb0ff }), 0.06, 0.38, 0.224);
  const bin = new THREE.Group(); bin.position.set(0.18, 0, -0.95); scene.add(bin);
  add(bin, new THREE.CylinderGeometry(0.13, 0.11, 0.32, 20, 1, true), std(0x3a3d42, 0.6, 0.2, { side: THREE.DoubleSide }), 0, 0.16, 0);

  // ---------- boss: Алёна Владимировна, back to the window, facing the office ----------
  // the station is built in its own frame: she sits at the origin facing local -Z (= world +X)
  const bs = new THREE.Group(); bs.position.set(-2.75, 0, -0.25); bs.rotation.y = -Math.PI / 2; scene.add(bs);
  buildDesk(bs, 0, M);
  box(bs, 1.62, 0.3, 0.03, M.partition, 0, 0.36, -1.12);
  // her monitor stands to her left so her face stays visible from the office
  const bm = makeMonitor(bs, M, new THREE.MeshBasicMaterial({ map: TX.spreadsheetTex(), toneMapped: false }), -0.42, -0.9);
  bm.group.rotation.y = 0.45;
  makeKeyboard(bs, M, -0.05, -0.55, true);
  makeMouse(bs, M, 0.27, -0.55);
  const violets = new THREE.Group(); violets.position.set(0.5, DESK_H, -1.02); bs.add(violets);
  [[0, 0, 0x8e44ad], [0.12, 0.02, 0xd6457a]].forEach(([dx, dz, c]) => {
    cyl(violets, 0.045, 0.035, 0.08, std(0xb85c38, 0.8), dx, 0.04, dz);
    for (let i = 0; i < 8; i++) add(violets, new THREE.SphereGeometry(0.03, 8, 6), std(0x2f6b33, 0.8), dx + Math.cos(i) * 0.035, 0.1, dz + Math.sin(i) * 0.035).scale.set(1, 0.35, 1);
    for (let i = 0; i < 5; i++) add(violets, new THREE.SphereGeometry(0.012, 6, 5), std(c, 0.6), dx + Math.cos(i * 1.7) * 0.015, 0.125, dz + Math.sin(i * 1.7) * 0.015);
  });
  const vase = new THREE.Group(); vase.position.set(0.25, DESK_H, -1.05); bs.add(vase);
  add(vase, new THREE.CylinderGeometry(0.025, 0.035, 0.16, 16), new THREE.MeshPhysicalMaterial({ color: 0xcfe6ef, transparent: true, opacity: 0.5, roughness: 0.05 }), 0, 0.08, 0);
  cyl(vase, 0.003, 0.003, 0.3, std(0x2f6b33, 0.6), 0, 0.2, 0, 6);
  add(vase, new THREE.SphereGeometry(0.03, 12, 10), std(0xc2183a, 0.5), 0, 0.36, 0).scale.set(1, 0.8, 1);
  const mirror = new THREE.Group(); mirror.position.set(-0.3, DESK_H, -0.42); bs.add(mirror);
  cyl(mirror, 0.045, 0.045, 0.008, std(0xc9a44a, 0.3, 0.8), 0, 0.004, 0);
  cyl(mirror, 0.04, 0.04, 0.002, std(0xdfe8ee, 0.05, 1), 0, 0.009, 0);
  refs.bossMug = makeMug(bs, M, 0.62, -0.42, 0xf2d6de);
  const frame = new THREE.Group(); frame.position.set(0.05, DESK_H, -1.02); frame.rotation.y = -0.2; bs.add(frame);
  box(frame, 0.15, 0.12, 0.012, std(0xc9a44a, 0.4, 0.6), 0, 0.06, 0).rotation.x = -0.2;
  plane(frame, 0.13, 0.1, new THREE.MeshStandardMaterial({ map: TX.photoTex() }), 0, 0.061, 0.008).rotation.x = -0.2;
  for (let k = 0; k < 6; k++) box(bs, 0.21, 0.004, 0.297, M.paper, 0.64, DESK_H + 0.002 + k * 0.004, -0.72).rotation.y = (k % 3 - 1) * 0.1;
  refs.bossPhone = makePhone(bs, M, -0.62, -0.5, 0.9);
  refs.bossCup = makeCup(M);
  refs.bossCup.position.set(0.3, DESK_H, -0.42);
  refs.bossCup.visible = false;
  bs.add(refs.bossCup);
  makeChair(bs, M, 0, 0, 0);
  refs.boss = makeBoss(bs, M, 0, 0);
  refs.bossStation = bs;
  reg(refs.boss.group, 'boss', 'Алёна Владимировна');
  col(-2.42, -1.08, -1.58, 0.58);       // her desk
  col(x0, -0.62, -2.38, 0.12);          // her chair
  // visitor chair in front of her desk: sit here to talk
  refs.visitChair = makeVisitorChair(scene, M, -1.22, -0.25, Math.PI / 2);
  reg(refs.visitChair, 'visitchair', 'Стул у начальницы');
  col(-1.48, -0.52, -0.96, 0.02);
  // a floor plant where the third desk used to be
  const palm = new THREE.Group(); palm.position.set(2.6, 0, -0.9); scene.add(palm);
  cyl(palm, 0.22, 0.17, 0.42, std(0x3d4148, 0.6), 0, 0.21, 0);
  const pr = TX.rng(77);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, lf = add(palm, new THREE.SphereGeometry(0.09, 8, 6), std(0x3b7a3a, 0.7), Math.cos(a) * 0.3, 0.95 + pr() * 0.4, Math.sin(a) * 0.3);
    lf.scale.set(3.2, 0.25, 0.8); lf.rotation.set(0, -a, 0.5);
  }
  cyl(palm, 0.025, 0.04, 0.9, std(0x6b5234, 0.8), 0, 0.8, 0, 8);
  col(2.3, -1.2, 2.9, -0.6);

  // ---------- player chair + body ----------
  refs.playerChair = makeChair(scene, M, 0, 0, 0);
  reg(refs.playerChair, 'chair', 'Сесть');
  const legs = new THREE.Group(); refs.playerChair.add(legs); refs.playerLegs = legs;
  const trousers = std(0x2c3038, 0.9), shirt = std(0x9fb8d6, 0.85), shoe = std(0x151515, 0.4);
  [-1, 1].forEach((s) => {
    limb(legs, new THREE.Vector3(0.1 * s, 0.56, 0.05), new THREE.Vector3(0.11 * s, 0.57, -0.36), 0.075, trousers);
    limb(legs, new THREE.Vector3(0.11 * s, 0.56, -0.38), new THREE.Vector3(0.12 * s, 0.1, -0.42), 0.06, trousers);
    rbox(legs, 0.1, 0.08, 0.26, 0.03, shoe, 0.12 * s, 0.04, -0.47);
  });
  add(legs, new THREE.CapsuleGeometry(0.15, 0.18, 4, 12), shirt, 0, 0.74, 0.1).scale.set(1.15, 1, 0.8);
  col(-0.3, -0.32, 0.3, 0.32);

  // ---------- corridor ----------
  const exitDoor = new THREE.Group(); exitDoor.position.set(x1 - 0.02, 0, 4.02); exitDoor.rotation.y = -Math.PI / 2; scene.add(exitDoor);
  box(exitDoor, 1.0, 2.12, 0.05, M.white, 0, 1.06, 0);
  box(exitDoor, 0.9, 2.05, 0.04, std(0x6f5b44, 0.55, 0, { map: TX.woodTex() }), 0, 1.03, 0.02);
  box(exitDoor, 0.14, 0.02, 0.04, M.metal, -0.33, 1.02, 0.06);
  plane(exitDoor, 0.34, 0.13, new THREE.MeshBasicMaterial({ map: TX.exitSignTex() }), 0, 2.28, 0.01);
  reg(exitDoor, 'exit', 'Выход');
  reg(plane(scene, 1.2, 0.79, new THREE.MeshStandardMaterial({ map: TX.noticeBoardTex(), roughness: 0.9 }), 0.4, 1.5, 4.92 - 0.001, Math.PI), 'notice', 'Доска объявлений');
  plane(scene, 0.36, 0.48, new THREE.MeshStandardMaterial({ map: TX.handsTex() }), -2.7, 1.5, 3.12 + 0.001, 0);
  // broom stand
  const broomSpot = new THREE.Group(); broomSpot.position.set(3.08, 0, 4.72); scene.add(broomSpot);
  const broomInStand = makeBroom(M); broomInStand.rotation.z = -0.12; broomInStand.position.set(0.05, 0, 0); broomSpot.add(broomInStand);
  box(broomSpot, 0.3, 0.02, 0.22, std(0x2f7d4a, 0.6), -0.15, 0.01, -0.05);
  box(broomSpot, 0.3, 0.12, 0.02, std(0x2f7d4a, 0.6), -0.15, 0.07, -0.16);
  cyl(broomSpot, 0.012, 0.012, 0.5, std(0x2f7d4a, 0.6), -0.15, 0.3, -0.16, 8);
  refs.broomInStand = broomInStand;
  reg(broomSpot, 'broom', 'Веник и совок');
  col(2.8, 4.45, 3.3, 4.92);
  // crumbs (appear when the boss asks to sweep)
  const crumbMat = std(0xb07a3e, 0.9), crumbMat2 = std(0xe0c08a, 0.9);
  [[-2.4, 3.6], [-1.2, 4.3], [0.1, 3.8], [1.2, 4.5], [2.2, 3.7]].forEach(([x, z], i) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    const r = TX.rng(50 + i);
    for (let k = 0; k < 26; k++) add(g, new THREE.IcosahedronGeometry(0.008 + r() * 0.012, 0), r() > 0.5 ? crumbMat : crumbMat2, (r() - 0.5) * 0.35, 0.008, (r() - 0.5) * 0.25, { cast: false });
    const hitArea = add(g, new THREE.CircleGeometry(0.22, 12), new THREE.MeshBasicMaterial({ visible: false }), 0, 0.01, 0, { cast: false });
    hitArea.rotation.x = -Math.PI / 2;
    g.visible = false;
    reg(g, 'crumbs', 'Крошки');
    refs.crumbs.push(g);
  });

  // ---------- kitchen ----------
  const kz = KITCH.z1;
  const cabMat = std(0xd9d2c3, 0.5), topMat = std(0x3c3f44, 0.35, 0.1);
  box(scene, 2.9, 0.86, 0.6, cabMat, -1.75, 0.43, kz - 0.3);
  box(scene, 2.94, 0.04, 0.64, topMat, -1.75, 0.88, kz - 0.32);
  for (let i = 0; i < 6; i++) { box(scene, 0.46, 0.78, 0.01, std(0xe6dfd0, 0.5), -3.0 + i * 0.49, 0.43, kz - 0.605); box(scene, 0.12, 0.012, 0.02, M.metal, -3.0 + i * 0.49, 0.74, kz - 0.615); }
  box(scene, 2.9, 0.6, 0.34, cabMat, -1.75, 1.85, kz - 0.17);
  box(scene, 0.8, 0.6, 0.012, std(0xd0e0e8, 0.8), -1.75, 0.9 + 0.33, kz - 0.006, { cast: false }); // tiled splashback
  col(-3.3, kz - 0.64, -0.28, kz);
  // sink
  box(scene, 0.5, 0.02, 0.4, std(0xb8bcc0, 0.2, 0.9), -2.6, 0.895, kz - 0.32, { cast: false });
  const tap = new THREE.Group(); tap.position.set(-2.6, 0.9, kz - 0.12); scene.add(tap);
  cyl(tap, 0.012, 0.012, 0.25, M.metal, 0, 0.12, 0, 10);
  cyl(tap, 0.01, 0.01, 0.15, M.metal, 0, 0.24, -0.07, 10).rotation.x = Math.PI / 2;
  // microwave, kettle
  const mw = new THREE.Group(); mw.position.set(-3.0, 0.9, kz - 0.3); mw.rotation.y = Math.PI; scene.add(mw);
  rbox(mw, 0.45, 0.28, 0.34, 0.01, M.white, 0, 0.14, 0);
  box(mw, 0.3, 0.2, 0.005, std(0x111418, 0.2), -0.05, 0.14, 0.171);
  reg(mw, 'microwave', 'Микроволновка');
  const kettle = new THREE.Group(); kettle.position.set(-2.1, 0.9, kz - 0.3); scene.add(kettle);
  cyl(kettle, 0.07, 0.085, 0.2, std(0xe8e8e8, 0.3, 0.2), 0, 0.12, 0);
  cyl(kettle, 0.08, 0.08, 0.02, M.black, 0, 0.01, 0);
  reg(kettle, 'kettle', 'Чайник');
  // coffee machine (working)
  const cm = new THREE.Group(); cm.position.set(-1.35, 0.9, kz - 0.33); cm.rotation.y = Math.PI; scene.add(cm);
  rbox(cm, 0.32, 0.42, 0.4, 0.02, std(0x1d1f22, 0.35, 0.4), 0, 0.21, 0);
  box(cm, 0.26, 0.1, 0.02, std(0xa9adb3, 0.25, 0.9), 0, 0.37, 0.2);
  const coffeeScreen = TX.coffeeScreenTex();
  plane(cm, 0.1, 0.05, new THREE.MeshBasicMaterial({ map: coffeeScreen, toneMapped: false }), 0, 0.37, 0.211);
  box(cm, 0.2, 0.015, 0.12, std(0x8f959c, 0.3, 0.8), 0, 0.03, 0.22);
  box(cm, 0.05, 0.04, 0.05, std(0xa9adb3, 0.25, 0.9), 0, 0.23, 0.18);
  const cmCup = makeCup(M); cmCup.position.set(0, 0.04, 0.2); cmCup.visible = false; cm.add(cmCup);
  refs.coffee = { group: cm, screenTex: coffeeScreen, cup: cmCup };
  reg(cm, 'coffee', 'Кофемашина');
  // capsule machine (broken)
  const cm2 = new THREE.Group(); cm2.position.set(-0.75, 0.9, kz - 0.33); cm2.rotation.y = Math.PI; scene.add(cm2);
  rbox(cm2, 0.16, 0.28, 0.32, 0.03, std(0xb3261e, 0.35), 0, 0.14, 0);
  box(cm2, 0.12, 0.012, 0.08, M.metal, 0, 0.03, 0.17);
  plane(cm2, 0.09, 0.09, new THREE.MeshStandardMaterial({ map: TX.stickyTex('НЕ\nРАБОТАЕТ', '#ffe66b', 3) }), 0, 0.18, 0.162);
  reg(cm2, 'coffee2', 'Капсульная кофемашина');
  // fridge
  const fr = new THREE.Group(); fr.position.set(0.36, 0, kz - 0.34); fr.rotation.y = Math.PI; scene.add(fr);
  rbox(fr, 0.6, 1.85, 0.62, 0.03, M.white, 0, 0.925, 0);
  box(fr, 0.02, 0.4, 0.03, M.grey, -0.25, 1.35, 0.32); box(fr, 0.02, 0.25, 0.03, M.grey, -0.25, 0.65, 0.32);
  box(fr, 0.58, 0.005, 0.01, M.grey, 0, 1.12, 0.312);
  plane(fr, 0.1, 0.1, new THREE.MeshStandardMaterial({ map: TX.stickyTex('не брать\nчужое!', '#9ee6ff', 5) }), 0.1, 1.45, 0.312);
  reg(fr, 'fridge', 'Холодильник');
  col(0.02, kz - 0.7, KITCH.x1, kz);
  // table with bread basket
  const tb = new THREE.Group(); tb.position.set(-1.6, 0, 6.3); scene.add(tb);
  box(tb, 1.2, 0.03, 0.8, M.wood, 0, 0.74, 0);
  [[-0.55, -0.35], [0.55, -0.35], [-0.55, 0.35], [0.55, 0.35]].forEach(([x, z]) => box(tb, 0.04, 0.73, 0.04, M.metal, x, 0.365, z));
  [[-0.3, -0.62, 0], [0.3, -0.62, 0], [-0.3, 0.62, Math.PI], [0.3, 0.62, Math.PI]].forEach(([x, z, r]) => {
    const ch = new THREE.Group(); ch.position.set(x, 0, z); ch.rotation.y = r; tb.add(ch);
    box(ch, 0.4, 0.04, 0.4, std(0x7a5a3a, 0.6), 0, 0.45, 0);
    box(ch, 0.4, 0.4, 0.03, std(0x7a5a3a, 0.6), 0, 0.68, -0.19);
    [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]].forEach(([a, b]) => box(ch, 0.025, 0.45, 0.025, M.darkMetal, a, 0.225, b));
  });
  const basket = new THREE.Group(); basket.position.set(0.1, 0.755, 0); tb.add(basket);
  add(basket, new THREE.CylinderGeometry(0.17, 0.13, 0.08, 20, 1, true), std(0xb08850, 0.9, 0, { side: THREE.DoubleSide }), 0, 0.04, 0);
  const crust = std(0xb8702e, 0.7), crust2 = std(0x5a3620, 0.7);
  add(basket, new THREE.SphereGeometry(0.07, 14, 10), crust, -0.05, 0.08, 0).scale.set(1.5, 0.7, 0.9);
  add(basket, new THREE.SphereGeometry(0.06, 14, 10), crust2, 0.06, 0.09, 0.03).scale.set(1.5, 0.8, 0.9);
  add(basket, new THREE.SphereGeometry(0.04, 12, 8), std(0xd89a4a, 0.6), 0.02, 0.12, -0.06).scale.set(1, 0.7, 1);
  reg(basket, 'bread', 'Хлеб с производства');
  col(-2.35, 5.72, -0.85, 6.88);
  plane(scene, 0.42, 0.56, new THREE.MeshStandardMaterial({ map: TX.kitchenPosterTex() }), KITCH.x1 - 0.001, 1.6, 6.3, -Math.PI / 2);

  // ---------- held items (main.js parents them to the camera) ----------
  const heldCup = makeCup(M);
  const heldBroom = makeBroom(M);
  const heldReport = new THREE.Group();
  add(heldReport, new THREE.PlaneGeometry(0.21, 0.297), new THREE.MeshStandardMaterial({ map: TX.paperTex('СВОДКА ЗАЯВОК', 20, 9), side: THREE.DoubleSide }), 0, 0, 0, { cast: false });
  refs.held = { coffee: heldCup, broom: heldBroom, report: heldReport };

  // walkable areas (doorways overlap the rooms so you can pass)
  refs.walk = [
    { ...ROOM }, { ...CORR }, { ...KITCH },
    { x0: DOOR1.x0, x1: DOOR1.x1, z0: 2.5, z1: 3.7, door: 0 },
    { x0: DOOR2.x0, x1: DOOR2.x1, z0: 4.4, z1: 5.6, door: 1 },
  ];
  return refs;
}

function makeCup(M) {
  const g = new THREE.Group();
  cyl(g, 0.055, 0.055, 0.006, M.white, 0, 0.003, 0, 24);
  add(g, new THREE.CylinderGeometry(0.038, 0.03, 0.07, 20, 1, true), std(0xf6f4ef, 0.3, 0, { side: THREE.DoubleSide }), 0, 0.041, 0);
  cyl(g, 0.036, 0.036, 0.004, std(0xc9a57a, 0.4), 0, 0.068, 0, 20);
  add(g, new THREE.TorusGeometry(0.018, 0.005, 6, 12, Math.PI), M.white, 0.04, 0.04, 0).rotation.z = -Math.PI / 2;
  return g;
}

function makeBroom(M) {
  const g = new THREE.Group();
  cyl(g, 0.012, 0.012, 1.2, std(0x8a6a3a, 0.7), 0, 0.72, 0, 8);
  const head = add(g, new THREE.CylinderGeometry(0.03, 0.12, 0.22, 12), std(0xcaa55a, 0.95), 0, 0.11, 0);
  head.scale.z = 0.45;
  return g;
}
function buildDesk(scene, cx, M) {
  const g = new THREE.Group(); g.position.set(cx, 0, 0); scene.add(g);
  const top = rbox(g, 1.6, 0.028, 0.8, 0.006, M.desk, 0, DESK_H - 0.014, -0.75);
  top.receiveShadow = true;
  box(g, 1.6, 0.03, 0.004, M.deskEdge, 0, DESK_H - 0.015, -0.351, { cast: false });
  // metal frame legs
  [-0.74, 0.74].forEach((x) => {
    box(g, 0.05, DESK_H - 0.03, 0.05, M.metal, x, (DESK_H - 0.03) / 2, -0.43);
    box(g, 0.05, DESK_H - 0.03, 0.05, M.metal, x, (DESK_H - 0.03) / 2, -1.07);
    box(g, 0.05, 0.04, 0.7, M.metal, x, DESK_H - 0.05, -0.75);
    box(g, 0.07, 0.02, 0.72, M.metal, x, 0.01, -0.75);
  });
  box(g, 1.44, 0.3, 0.012, std(0x4a4d52, 0.6, 0.3), 0, DESK_H - 0.2, -1.08);
  // drawer pedestal (left)
  const ped = new THREE.Group(); ped.position.set(-0.52, 0, -0.78); g.add(ped);
  box(ped, 0.4, 0.6, 0.55, std(0xcfc4ae, 0.6), 0, 0.32, 0);
  for (let i = 0; i < 3; i++) {
    box(ped, 0.38, 0.18, 0.01, std(0xd9ceb8, 0.55), 0, 0.12 + i * 0.195, 0.278);
    box(ped, 0.12, 0.012, 0.02, M.metal, 0, 0.18 + i * 0.195, 0.29);
  }
  for (let i = 0; i < 4; i++) cyl(ped, 0.015, 0.015, 0.02, M.black, (i % 2 ? 0.16 : -0.16), 0.01, (i < 2 ? 0.22 : -0.22), 8);
  return g;
}

function makeMonitor(scene, M, screenMat, x, z) {
  const g = new THREE.Group(); g.position.set(x, DESK_H, z); scene.add(g);
  rbox(g, 0.26, 0.014, 0.19, 0.006, M.black, 0, 0.007, 0);
  box(g, 0.05, 0.3, 0.025, M.black, 0, 0.16, -0.03);
  const head = new THREE.Group(); head.position.set(0, 0.325, 0); head.rotation.x = -0.08; g.add(head);
  rbox(head, 0.6, 0.36, 0.032, 0.008, M.black, 0, 0, 0);
  box(head, 0.25, 0.18, 0.03, M.black, 0, 0, -0.025);
  const scr = add(head, new THREE.PlaneGeometry(0.57, 0.3206), screenMat, 0, 0.012, 0.0166, { cast: false, receive: false });
  box(head, 0.006, 0.006, 0.002, new THREE.MeshBasicMaterial({ color: 0x5ad26a }), 0.27, -0.165, 0.016, { cast: false });
  return { group: g, screen: scr };
}

const ROWS = [
  [['Esc', 'Escape', 1], [null, null, 0.5], ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => [`F${n}`, `F${n}`, 1]), [null, null, 0.25]],
  [['Ё', 'Backquote', 1, '`'], ...'1234567890'.split('').map((c) => [c, `Digit${c}`, 1]), ['-', 'Minus', 1], ['=', 'Equal', 1], ['⟵', 'Backspace', 2]],
  [['Tab', 'Tab', 1.5], ...'QWERTYUIOP'.split('').map((c, i) => [c, `Key${c}`, 1, 'ЙЦУКЕНГШЩЗ'[i]]), ['[', 'BracketLeft', 1, 'Х'], [']', 'BracketRight', 1, 'Ъ'], ['\\', 'Backslash', 1.5]],
  [['Caps', 'CapsLock', 1.75], ...'ASDFGHJKL'.split('').map((c, i) => [c, `Key${c}`, 1, 'ФЫВАПРОЛД'[i]]), [';', 'Semicolon', 1, 'Ж'], ["'", 'Quote', 1, 'Э'], ['Enter', 'Enter', 2.25]],
  [['Shift', 'ShiftLeft', 2.25], ...'ZXCVBNM'.split('').map((c, i) => [c, `Key${c}`, 1, 'ЯЧСМИТЬ'[i]]), [',', 'Comma', 1, 'Б'], ['.', 'Period', 1, 'Ю'], ['/', 'Slash', 1], ['Shift', 'ShiftRight', 2.75]],
  [['Ctrl', 'ControlLeft', 1.25], ['Win', 'MetaLeft', 1.25], ['Alt', 'AltLeft', 1.25], ['', 'Space', 6.25], ['Alt', 'AltRight', 1.25], ['Fn', 'Fn', 1.25], ['Menu', 'ContextMenu', 1.25], ['Ctrl', 'ControlRight', 1.25]],
];

function makeKeyboard(scene, M, x, z, simple = false) {
  const g = new THREE.Group(); g.position.set(x, DESK_H, z); g.rotation.x = 0.04; scene.add(g);
  rbox(g, 0.37, 0.018, 0.135, 0.006, std(0x1c1d20, 0.5), 0, 0.009, 0);
  const keys = {};
  const u = 0.0182, cap = 0.0158;
  const x0 = -0.172;
  const sideMat = std(0x2a2b2f, 0.6);
  if (simple) {
    box(g, 0.33, 0.008, 0.11, std(0x2b2c30, 0.6), -0.012, 0.021, 0.0);
    return { group: g, keys };
  }
  ROWS.forEach((row, ri) => {
    let cx = x0;
    const zz = -0.055 + ri * u + (ri > 0 ? 0.004 : 0);
    row.forEach(([label, code, w, sub]) => {
      const kw = w * u;
      if (label !== null) {
        const top = new THREE.MeshStandardMaterial({ map: TX.keyTex(label, sub), roughness: 0.55 });
        const key = add(g, new THREE.BoxGeometry(kw - (u - cap), 0.008, cap), [sideMat, sideMat, top, sideMat, sideMat, sideMat], cx + kw / 2, 0.022, zz, { cast: false });
        key.userData.baseY = 0.022;
        if (code) keys[code] = key;
      }
      cx += kw;
    });
  });
  // arrow cluster
  [['↑', 'ArrowUp', 16.2, 4], ['←', 'ArrowLeft', 15.2, 5], ['↓', 'ArrowDown', 16.2, 5], ['→', 'ArrowRight', 17.2, 5], ['Del', 'Delete', 15.2, 1], ['End', 'End', 16.2, 1], ['PgD', 'PageDown', 17.2, 1], ['Ins', 'Insert', 15.2, 2], ['Hm', 'Home', 16.2, 2], ['PgU', 'PageUp', 17.2, 2]].forEach(([l, code, col, row]) => {
    const top = new THREE.MeshStandardMaterial({ map: TX.keyTex(l), roughness: 0.55 });
    const key = add(g, new THREE.BoxGeometry(cap, 0.008, cap), [sideMat, sideMat, top, sideMat, sideMat, sideMat], x0 + col * u + u / 2 - 0.004, 0.022, -0.055 + row * u + 0.004, { cast: false });
    key.userData.baseY = 0.022;
    keys[code] = key;
  });
  box(g, 0.01, 0.002, 0.004, new THREE.MeshBasicMaterial({ color: 0x5ad26a }), 0.16, 0.019, -0.06, { cast: false });
  return { group: g, keys };
}

function makeMouse(scene, M, x, z) {
  const padG = new THREE.Group(); padG.position.set(x, DESK_H, z); scene.add(padG);
  box(padG, 0.23, 0.003, 0.19, std(0x1d3557, 0.95), 0, 0.0015, 0, { cast: false });
  const mouse = new THREE.Group(); mouse.position.set(0, 0.003, 0.01); padG.add(mouse);
  const body = add(mouse, new THREE.SphereGeometry(0.03, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), std(0x1b1c1f, 0.4), 0, 0, 0);
  body.scale.set(1.05, 0.72, 1.85);
  box(mouse, 0.002, 0.004, 0.04, std(0x333333, 0.5), 0, 0.02, -0.03, { cast: false });
  return { group: padG, mouse };
}

// ---------- desk phone ----------
class CoilCurve extends THREE.Curve {
  constructor(a, b) { super(); this.a = a.clone(); this.b = b.clone(); }
  getPoint(t, target = new THREE.Vector3()) {
    const { a, b } = this;
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= Math.sin(Math.PI * t) * Math.max(0, 0.18 - len * 0.35);
    const d = dir.normalize();
    const side = new THREE.Vector3(0, 1, 0).cross(d);
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
    side.normalize();
    const up = new THREE.Vector3().crossVectors(d, side);
    const turns = 34, r = 0.007;
    const k = Math.min(1, t * 12, (1 - t) * 12);
    const ang = t * turns * Math.PI * 2;
    p.addScaledVector(side, Math.cos(ang) * r * k).addScaledVector(up, Math.sin(ang) * r * k);
    return target.copy(p);
  }
}

function makePhone(scene, M, x, z, ry = 0.55) {
  const g = new THREE.Group(); g.position.set(x, DESK_H, z); g.rotation.y = ry; scene.add(g);
  const bodyMat = std(0x2a2c30, 0.45);
  const prof = new THREE.Shape();
  prof.moveTo(-0.11, 0); prof.lineTo(-0.11, 0.028); prof.lineTo(0.11, 0.07); prof.lineTo(0.11, 0); prof.closePath();
  const geo = new THREE.ExtrudeGeometry(prof, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2 });
  geo.rotateY(Math.PI / 2); geo.translate(-0.1, 0, 0);
  add(g, geo, bodyMat);
  const slope = Math.atan2(0.042, 0.22);
  const topTex = TX.phoneTopTex();
  const top = add(g, new THREE.PlaneGeometry(0.11, 0.2), new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.5 }), 0.045, 0.049 + 0.0045, 0, { cast: false });
  top.rotation.x = -Math.PI / 2 + slope;
  // cradle
  const cradle = add(g, new THREE.BoxGeometry(0.065, 0.01, 0.2), std(0x1f2124, 0.5), -0.058, 0.052, 0);
  cradle.rotation.x = slope;
  // handset
  const hs = new THREE.Group();
  const hsMat = std(0x2d2f34, 0.4);
  rbox(hs, 0.048, 0.03, 0.2, 0.012, hsMat, 0, 0, 0);
  rbox(hs, 0.056, 0.03, 0.06, 0.014, hsMat, 0, -0.012, -0.075);
  rbox(hs, 0.056, 0.03, 0.06, 0.014, hsMat, 0, -0.012, 0.075);
  hs.position.set(-0.058, 0.08, 0);
  hs.rotation.x = slope;
  g.add(hs);
  const rest = { pos: hs.position.clone(), quat: hs.quaternion.clone() };
  const cordMat = std(0x222326, 0.5);
  const cordAnchor = new THREE.Vector3(-0.1, 0.02, 0.09);
  const cord = new THREE.Mesh(new THREE.BufferGeometry(), cordMat);
  cord.castShadow = true;
  let root = scene; while (root.parent) root = root.parent;
  root.add(cord); // the cord is built in world coordinates
  const updateCord = () => {
    g.updateWorldMatrix(true, true);
    const a = new THREE.Vector3(0, -0.02, 0.1).applyMatrix4(hs.matrixWorld);
    const b = cordAnchor.clone().applyMatrix4(g.matrixWorld);
    cord.geometry.dispose();
    cord.geometry = new THREE.TubeGeometry(new CoilCurve(a, b), 360, 0.0022, 5, false);
  };
  updateCord();
  interact(g, 'phone', 'Телефон');
  return { group: g, handset: hs, rest, topTex, updateCord };
}

function makeMug(scene, M, x, z, color) {
  const g = new THREE.Group(); g.position.set(x, DESK_H, z); g.rotation.y = -2.2; scene.add(g);
  const mat = color ? std(color, 0.35) : new THREE.MeshStandardMaterial({ map: TX.mugTex(), roughness: 0.35 });
  add(g, new THREE.CylinderGeometry(0.04, 0.037, 0.1, 28, 1, true), mat, 0, 0.05, 0);
  add(g, new THREE.CylinderGeometry(0.036, 0.034, 0.095, 28, 1, true), std(0xf4f2ee, 0.3, 0, { side: THREE.BackSide }), 0, 0.052, 0);
  cyl(g, 0.037, 0.037, 0.004, std(0xf4f2ee, 0.35), 0, 0.002, 0, 28);
  const coffee = cyl(g, 0.035, 0.035, 0.002, std(0x3b2314, 0.15), 0, 0.085, 0, 28);
  const handle = add(g, new THREE.TorusGeometry(0.026, 0.007, 8, 20, Math.PI), color ? mat : std(0xf4f2ee, 0.35), 0.04, 0.05, 0);
  handle.rotation.z = -Math.PI / 2;
  interact(g, 'mug', 'Кружка кофе');
  return { group: g, coffee };
}

function makeLamp(scene, M, x, z) {
  const g = new THREE.Group(); g.position.set(x, DESK_H, z); scene.add(g);
  const mat = std(0x2f5d50, 0.4, 0.3);
  cyl(g, 0.07, 0.08, 0.02, mat, 0, 0.01, 0);
  const a1 = limb(g, new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(0.02, 0.32, -0.06), 0.008, mat);
  limb(g, new THREE.Vector3(0.02, 0.32, -0.06), new THREE.Vector3(0.18, 0.4, 0.12), 0.008, mat);
  const shade = add(g, new THREE.ConeGeometry(0.07, 0.11, 24, 1, true), std(0x2f5d50, 0.4, 0.3, { side: THREE.DoubleSide }), 0.2, 0.36, 0.14);
  shade.rotation.set(0.35, 0, -0.4);
  const bulb = add(g, new THREE.SphereGeometry(0.022, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd9a0, emissiveIntensity: 0 }), 0.205, 0.34, 0.145, { cast: false });
  const light = new THREE.SpotLight(0xffd7a0, 0, 2.2, 0.75, 0.6, 1.5);
  light.position.set(0.21, 0.33, 0.15);
  light.target.position.set(0.3, -0.1, 0.35);
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  light.shadow.bias = -0.0005;
  g.add(light); g.add(light.target);
  interact(g, 'lamp', 'Настольная лампа');
  return { group: g, bulb, light, on: false };
}

// a plain low-backed visitor chair, so it doesn't hide the boss from your desk
function makeVisitorChair(scene, M, x, z, yaw = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; scene.add(g);
  const frame = std(0x2a2c30, 0.4, 0.6);
  rbox(g, 0.44, 0.06, 0.42, 0.02, M.chair, 0, 0.46, 0);
  rbox(g, 0.42, 0.22, 0.04, 0.015, M.chair, 0, 0.72, 0.2).rotation.x = 0.08;
  [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]].forEach(([a, b]) => cyl(g, 0.012, 0.012, 0.44, frame, a, 0.22, b, 8));
  [-0.19, 0.19].forEach((a) => cyl(g, 0.01, 0.01, 0.34, frame, a, 0.66, 0.2, 8));
  return g;
}

export function makeChair(scene, M, x, z, yaw = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; scene.add(g);
  const plastic = std(0x1f2124, 0.5);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = box(g, 0.05, 0.03, 0.3, plastic, Math.sin(a) * 0.15, 0.07, Math.cos(a) * 0.15);
    leg.rotation.y = a;
    add(g, new THREE.SphereGeometry(0.025, 10, 8), plastic, Math.sin(a) * 0.29, 0.03, Math.cos(a) * 0.29);
  }
  cyl(g, 0.035, 0.035, 0.12, plastic, 0, 0.13, 0, 14);
  cyl(g, 0.022, 0.022, 0.2, M.metal, 0, 0.28, 0, 14);
  rbox(g, 0.5, 0.08, 0.48, 0.03, M.chair, 0, 0.46, 0.02);
  const back = rbox(g, 0.46, 0.56, 0.07, 0.03, M.chair, 0, 0.88, 0.29);
  back.rotation.x = 0.1;
  box(g, 0.06, 0.34, 0.03, plastic, 0, 0.6, 0.27);
  [-1, 1].forEach((s) => {
    box(g, 0.03, 0.18, 0.03, plastic, 0.265 * s, 0.57, 0.04);
    rbox(g, 0.06, 0.03, 0.26, 0.012, plastic, 0.265 * s, 0.67, 0.0);
  });
  return g;
}


// Алёна Владимировна. Arms are cylinders re-aimed every frame so she can type,
// hold the phone to her ear or wave you over.
function makeBoss(scene, M, x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  const V = (a, b, c) => new THREE.Vector3(a, b, c);
  const skin = std(0xf0c9b2, 0.6);
  const blouse = std(0x8e2142, 0.75);
  const skirt = std(0x24232d, 0.85);
  const tights = std(0x9c7564, 0.55);
  const hair = std(0x5b2c1a, 0.5);
  const gold = std(0xd9b24a, 0.3, 0.9);
  // legs: pencil skirt over the thighs, tights, heels
  [-1, 1].forEach((s) => {
    limb(g, V(0.085 * s, 0.55, 0.04), V(0.09 * s, 0.56, -0.34), 0.07, skirt);
    limb(g, V(0.09 * s, 0.54, -0.36), V(0.08 * s, 0.11, -0.4), 0.045, tights);
    const shoe = new THREE.Group(); shoe.position.set(0.08 * s, 0, -0.43); g.add(shoe);
    rbox(shoe, 0.07, 0.05, 0.19, 0.02, std(0x1a1112, 0.3), 0, 0.06, -0.02);
    cyl(shoe, 0.008, 0.006, 0.06, std(0x8a1020, 0.3), 0, 0.03, 0.06, 8);
  });
  add(g, new THREE.CapsuleGeometry(0.15, 0.12, 4, 14), skirt, 0, 0.6, 0.06).scale.set(1.15, 0.8, 0.9);
  // torso: waist + chest
  add(g, new THREE.CapsuleGeometry(0.11, 0.14, 4, 14), blouse, 0, 0.76, 0.07).scale.set(1.12, 1, 0.78);
  const chest = add(g, new THREE.CapsuleGeometry(0.13, 0.12, 4, 14), blouse, 0, 0.95, 0.06);
  chest.scale.set(1.12, 1, 0.78); chest.rotation.x = -0.06;
  // V-neckline
  cyl(g, 0.038, 0.042, 0.12, skin, 0, 1.1, 0.05, 12);
  const vgeo = new THREE.CircleGeometry(0.045, 3); const v = add(g, vgeo, skin, 0, 1.04, -0.045, { cast: false });
  v.rotation.z = -Math.PI / 2; v.scale.set(1, 0.8, 1);
  add(g, new THREE.TorusGeometry(0.047, 0.0025, 6, 24), gold, 0, 1.07, 0.04, { cast: false }).rotation.x = Math.PI / 2 - 0.25;
  add(g, new THREE.SphereGeometry(0.008, 8, 6), gold, 0, 1.03, -0.01, { cast: false });
  // head
  const head = new THREE.Group(); head.position.set(0, 1.15, 0.05); g.add(head);
  add(head, new THREE.SphereGeometry(0.095, 24, 18), skin, 0, 0.12, 0).scale.set(0.9, 1.1, 0.98);
  add(head, new THREE.SphereGeometry(0.05, 14, 10), skin, 0, 0.07, -0.035).scale.set(1.15, 0.9, 1); // jaw/chin
  add(head, new THREE.SphereGeometry(0.014, 8, 6), skin, 0, 0.11, -0.094).scale.set(0.9, 1.2, 1);
  const eyeW = std(0xffffff, 0.3), iris = std(0x3a6b4a, 0.2), lash = std(0x140c0a, 0.6);
  [-1, 1].forEach((s) => {
    add(head, new THREE.SphereGeometry(0.013, 10, 8), eyeW, 0.032 * s, 0.135, -0.082).scale.set(1.2, 0.8, 0.6);
    add(head, new THREE.SphereGeometry(0.0075, 8, 6), iris, 0.032 * s, 0.135, -0.09);
    const l = box(head, 0.03, 0.004, 0.01, lash, 0.033 * s, 0.144, -0.089, { cast: false }); l.rotation.z = 0.25 * s;
    const b = box(head, 0.03, 0.005, 0.006, std(0x3b2016, 0.8), 0.033 * s, 0.162, -0.087, { cast: false }); b.rotation.z = -0.15 * s;
    add(head, new THREE.SphereGeometry(0.016, 8, 6), std(0xf2a8a0, 0.7), 0.05 * s, 0.1, -0.075, { cast: false }).scale.set(1, 0.6, 0.4);
    add(head, new THREE.SphereGeometry(0.018, 8, 6), skin, 0.087 * s, 0.12, 0.0).scale.set(0.5, 1, 0.8);
    add(head, new THREE.SphereGeometry(0.009, 8, 6), gold, 0.089 * s, 0.092, -0.004, { cast: false });
  });
  add(head, new THREE.SphereGeometry(0.02, 12, 8), std(0xb8283c, 0.35), 0, 0.073, -0.088, { cast: false }).scale.set(1.35, 0.45, 0.55);
  // hair: crown, long back, side locks, swept fringe
  add(head, new THREE.SphereGeometry(0.104, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.6), hair, 0, 0.135, 0.008).scale.set(0.97, 1.08, 1.04);
  add(head, new THREE.SphereGeometry(0.1, 18, 14), hair, 0, 0.0, 0.05).scale.set(1.12, 2.2, 0.72);
  [-1, 1].forEach((s) => {
    const lock = add(head, new THREE.CapsuleGeometry(0.03, 0.2, 4, 10), hair, 0.083 * s, 0.02, -0.02);
    lock.rotation.z = 0.12 * s; lock.scale.set(1, 1, 0.8);
  });
  const fringe = add(head, new THREE.SphereGeometry(0.1, 18, 12), hair, 0.02, 0.2, -0.045);
  fringe.scale.set(0.98, 0.42, 0.62); fringe.rotation.z = 0.28;

  // arms
  const sleeve = blouse;
  const mkArm = () => {
    const upper = add(g, new THREE.CylinderGeometry(0.042, 0.036, 1, 10), sleeve, 0, 0, 0);
    const fore = add(g, new THREE.CylinderGeometry(0.034, 0.028, 1, 10), sleeve, 0, 0, 0);
    const elbow = add(g, new THREE.SphereGeometry(0.037, 10, 8), sleeve);
    const shoulder = add(g, new THREE.SphereGeometry(0.047, 10, 8), sleeve);
    const hand = add(g, new THREE.SphereGeometry(0.03, 10, 8), skin);
    hand.scale.set(0.8, 0.6, 1.3);
    return { upper, fore, elbow, shoulder, hand };
  };
  const arms = [mkArm(), mkArm()];
  const bracelet = add(g, new THREE.TorusGeometry(0.03, 0.004, 6, 16), gold, 0, 0, 0);
  const Y = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();
  const aim = (m, a, b) => {
    tmp.subVectors(b, a);
    const len = tmp.length();
    m.position.copy(a).addScaledVector(tmp, 0.5);
    m.quaternion.setFromUnitVectors(Y, tmp.normalize());
    m.scale.set(1, len, 1);
  };
  const lerp3 = (a, b, k) => new THREE.Vector3().lerpVectors(a, b, k);
  // pose: t — time, phone — 0..1 (left hand to the ear), wave — 0..1 (right hand raised)
  const setPose = (t, phone = 0, wave = 0, typing = true) => {
    [-1, 1].forEach((s, i) => {
      const A = arms[i];
      const S = V(0.165 * s, 1.03, 0.07);
      const bob = typing ? Math.sin(t * 16 + i * 1.9) * 0.012 : 0;
      let E = V(0.2 * s, 0.82, -0.07), H = V(0.12 * s, 0.79 + bob, -0.37);
      if (i === 0 && phone > 0) { E = lerp3(E, V(-0.25, 0.93, -0.1), phone); H = lerp3(H, V(-0.115, 1.22, -0.02), phone); }
      if (i === 1 && wave > 0) { E = lerp3(E, V(0.3, 1.08, -0.1), wave); H = lerp3(H, V(0.34 + Math.sin(t * 9) * 0.05, 1.36, -0.16), wave); }
      aim(A.upper, S, E); aim(A.fore, E, H);
      A.shoulder.position.copy(S); A.elbow.position.copy(E); A.hand.position.copy(H);
      if (i === 0) { bracelet.position.copy(lerp3(E, H, 0.85)); bracelet.quaternion.copy(A.fore.quaternion); bracelet.rotateX(Math.PI / 2); }
    });
  };
  setPose(0);
  return { group: g, head, setPose, earLocal: V(-0.1, 0.12, 0.0), look: 0, lookTarget: 0, phase: Math.random() * 10 };
}
