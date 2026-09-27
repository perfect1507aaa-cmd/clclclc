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
export function buildWorld(scene, { screenTex }) {
  const refs = { interactables: [], colleagues: [], anims: [] };
  const M = {
    wall: std(0xe6e2d8, 0.95, 0, { map: TX.plasterTex('#e7e3d9') }),
    wallAccent: std(0x9fb3a6, 0.95),
    floor: std(0xffffff, 0.98, 0, { map: TX.carpetTex() }),
    ceiling: std(0xffffff, 0.95, 0, { map: TX.ceilingTex() }),
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
    skin: std(0xe0b49a, 0.7),
    paper: std(0xfbfbf7, 0.9),
  };

  // ---------- room shell ----------
  const { x0, x1, z0, z1, h } = ROOM;
  const W = x1 - x0, D = z1 - z0, cz = (z0 + z1) / 2;
  M.floor.map.repeat.set(W, D);
  M.ceiling.map.repeat.set(W / 1.2, D / 1.2);
  M.wall.map.repeat.set(3, 2);
  const floor = add(scene, new THREE.PlaneGeometry(W, D), M.floor, 0, 0, cz, { cast: false });
  floor.rotation.x = -Math.PI / 2;
  const ceil = add(scene, new THREE.PlaneGeometry(W, D), M.ceiling, 0, h, cz, { cast: false });
  ceil.rotation.x = Math.PI / 2;
  plane(scene, W, h, M.wall, 0, h / 2, z0, 0);
  plane(scene, W, h, M.wall, 0, h / 2, z1, Math.PI);
  plane(scene, D, h, M.wall, x1, h / 2, cz, -Math.PI / 2);
  // skirting boards
  const skirt = std(0x5a5550, 0.6);
  box(scene, W, 0.08, 0.015, skirt, 0, 0.04, z0 + 0.008, { cast: false });
  box(scene, W, 0.08, 0.015, skirt, 0, 0.04, z1 - 0.008, { cast: false });
  box(scene, 0.015, 0.08, D, skirt, x1 - 0.008, 0.04, cz, { cast: false });
  box(scene, 0.015, 0.08, D, skirt, x0 + 0.008, 0.04, cz, { cast: false });

  // left wall with two windows
  const wins = [{ z: -0.35, w: 1.5 }, { z: 1.9, w: 1.5 }];
  const wy0 = 0.85, wy1 = 2.35, wt = 0.24, wx = x0 - wt / 2;
  box(scene, wt, wy0, D, M.wall, wx, wy0 / 2, cz);
  box(scene, wt, h - wy1, D, M.wall, wx, (h + wy1) / 2, cz);
  let zPrev = z0;
  [...wins, { z: z1 + 0.75, w: 1.5 }].forEach((wd) => {
    const a = zPrev, b = wd.z - wd.w / 2;
    if (b > a) box(scene, wt, wy1 - wy0, b - a, M.wall, wx, (wy0 + wy1) / 2, (a + b) / 2);
    zPrev = wd.z + wd.w / 2;
  });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xdfeef5, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.12, depthWrite: false });
  const slatMat = std(0xeeeeea, 0.6);
  wins.forEach(({ z, w }) => {
    const fw = 0.06, fx = x0 - 0.1;
    box(scene, 0.07, fw, w, M.pvc, fx, wy0 + fw / 2, z);
    box(scene, 0.07, fw, w, M.pvc, fx, wy1 - fw / 2, z);
    box(scene, 0.07, wy1 - wy0, fw, M.pvc, fx, (wy0 + wy1) / 2, z - w / 2 + fw / 2);
    box(scene, 0.07, wy1 - wy0, fw, M.pvc, fx, (wy0 + wy1) / 2, z + w / 2 - fw / 2);
    box(scene, 0.07, wy1 - wy0, 0.07, M.pvc, fx, (wy0 + wy1) / 2, z);
    const gl = plane(scene, w, wy1 - wy0, glass, fx, (wy0 + wy1) / 2, z, Math.PI / 2, { cast: false, receive: false });
    gl.renderOrder = 2;
    // sill + radiator
    box(scene, 0.3, 0.03, w + 0.2, M.pvc, x0 + 0.03, wy0 - 0.015, z);
    const rad = new THREE.Group(); rad.position.set(x0 + 0.08, 0.2, z); scene.add(rad);
    for (let i = 0; i < 12; i++) box(rad, 0.08, 0.5, 0.05, M.white, 0, 0.25, -0.33 + i * 0.06);
    box(rad, 0.02, 0.04, 0.9, M.white, 0.02, 0.52, 0);
    // horizontal blinds, lowered to ~40%
    const n = 26;
    const slats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.025, 0.002, w - 0.12), slatMat, n);
    slats.castShadow = true;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      dummy.position.set(x0 + 0.04, wy1 - 0.06 - i * 0.022, z);
      dummy.rotation.set(0, 0, 0.55);
      dummy.updateMatrix(); slats.setMatrixAt(i, dummy.matrix);
    }
    scene.add(slats);
    box(scene, 0.05, 0.04, w - 0.08, M.white, x0 + 0.04, wy1 - 0.03, z);
    box(scene, 0.03, 0.012, w - 0.12, M.white, x0 + 0.04, wy1 - 0.08 - n * 0.022, z);
    add(scene, new THREE.CylinderGeometry(0.002, 0.002, 0.9, 4), M.white, x0 + 0.06, wy1 - 0.5, z + w / 2 - 0.12);
  });
  // outside
  const city = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshBasicMaterial({ map: TX.cityTex(), toneMapped: false, fog: false }));
  city.position.set(-16, 4.2, 0.8); city.rotation.y = Math.PI / 2;
  scene.add(city);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 40), std(0x7d8279, 1));
  ground.rotation.x = -Math.PI / 2; ground.position.set(-10, -3, 0.8); scene.add(ground);

  // ceiling light panels
  const panelMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f7ff, emissiveIntensity: 1.6 });
  [[-1.75, -0.35], [0, -0.35], [1.75, -0.35], [-1.75, 1.8], [0, 1.8], [1.75, 1.8]].forEach(([x, z]) => {
    box(scene, 0.6, 0.02, 0.6, M.white, x, h - 0.01, z, { cast: false });
    box(scene, 0.56, 0.01, 0.56, panelMat, x, h - 0.02, z, { cast: false });
  });
  // air conditioner
  const ac = new THREE.Group(); ac.position.set(-1.9, 2.45, z0 + 0.12); scene.add(ac);
  rbox(ac, 0.9, 0.28, 0.2, 0.04, M.white, 0, 0, 0);
  for (let i = 0; i < 6; i++) box(ac, 0.8, 0.006, 0.02, M.grey, 0, -0.1 + i * 0.012, 0.095, { cast: false });
  box(ac, 0.012, 0.012, 0.005, new THREE.MeshBasicMaterial({ color: 0x3cff6a }), 0.38, 0.07, 0.101);

  // ---------- front wall decor ----------
  const clockTex = TX.clockTex();
  const clock = new THREE.Group(); clock.position.set(0.55, 2.12, z0 + 0.03); scene.add(clock);
  cyl(clock, 0.17, 0.17, 0.04, M.black, 0, 0, 0, 40).rotation.x = Math.PI / 2;
  const face = add(clock, new THREE.CircleGeometry(0.155, 48), new THREE.MeshStandardMaterial({ map: clockTex, roughness: 0.4 }), 0, 0, 0.021, { cast: false });
  interact(clock, 'clock', 'Посмотреть на часы');
  refs.clockTex = clockTex;
  refs.interactables.push(clock);

  const cal = plane(scene, 0.42, 0.574, new THREE.MeshStandardMaterial({ map: TX.calendarTex(), roughness: 0.8 }), -0.75, 1.72, z0 + 0.006);
  interact(cal, 'calendar', 'Календарь');
  refs.interactables.push(cal);
  plane(scene, 0.5, 0.7, new THREE.MeshStandardMaterial({ map: TX.posterTex(), roughness: 0.6 }), 1.3, 1.72, z0 + 0.006);
  // certificate frame
  const cert = new THREE.Group(); cert.position.set(-2.5, 1.75, z0 + 0.015); scene.add(cert);
  box(cert, 0.36, 0.46, 0.02, std(0x7a5a33, 0.5), 0, 0, 0);
  plane(cert, 0.3, 0.4, new THREE.MeshStandardMaterial({ map: TX.paperTex('БЛАГОДАРНОСТЬ', 10, 4) }), 0, 0, 0.011);
  // power sockets
  [-1.75, 0, 1.75].forEach((x) => { rbox(scene, 0.14, 0.07, 0.02, 0.008, M.white, x + 0.3, 0.95, z0 + 0.01, { cast: false }); });

  // ---------- right wall: whiteboard + shelf ----------
  const wb = new THREE.Group(); wb.position.set(x1 - 0.02, 1.5, -0.2); wb.rotation.y = -Math.PI / 2; scene.add(wb);
  box(wb, 1.64, 1.04, 0.03, M.metal, 0, 0, 0);
  plane(wb, 1.58, 0.98, new THREE.MeshStandardMaterial({ map: TX.whiteboardTex(), roughness: 0.25 }), 0, 0, 0.016);
  box(wb, 1.5, 0.03, 0.07, M.metal, 0, -0.53, 0.03);
  [0xc0271d, 0x1e46b4, 0x111111].forEach((c, i) => cyl(wb, 0.009, 0.009, 0.13, std(c, 0.5), -0.5 + i * 0.07, -0.505, 0.045, 10).rotation.z = Math.PI / 2);
  refs.interactables.push(interact(wb, 'whiteboard', 'Доска со сроками'));

  const shelf = new THREE.Group(); shelf.position.set(x1 - 0.22, 0, 1.7); shelf.rotation.y = -Math.PI / 2; scene.add(shelf);
  const shelfMat = std(0xb9a98c, 0.6);
  box(shelf, 1.0, 2.0, 0.02, shelfMat, 0, 1.0, -0.19);
  box(shelf, 0.02, 2.0, 0.4, shelfMat, -0.49, 1.0, 0); box(shelf, 0.02, 2.0, 0.4, shelfMat, 0.49, 1.0, 0);
  const binderColors = ['#1f4e9c', '#b3261e', '#2e7d32', '#f0b400', '#5e35b1', '#374151'];
  const years = ['2019', '2020', '2021', '2022', '2023', '2024', '2025', 'Акты', 'Счета', 'Кадры', 'ФНС', 'Банк'];
  for (let s = 0; s < 5; s++) {
    box(shelf, 0.96, 0.02, 0.38, shelfMat, 0, 0.02 + s * 0.44, 0);
    if (s === 4) break;
    for (let i = 0; i < 12; i++) {
      const col = binderColors[(i + s * 2) % binderColors.length];
      const b = box(shelf, 0.07, 0.32, 0.28, std(col, 0.6), -0.4 + i * 0.075, 0.2 + s * 0.44, 0.02);
      const lab = new THREE.MeshStandardMaterial({ map: TX.binderTex(years[(i + s * 5) % years.length], col) });
      b.material = [b.material, b.material, b.material, b.material, lab, b.material];
    }
  }
  box(shelf, 0.96, 0.02, 0.38, shelfMat, 0, 2.0, 0);

  // ---------- back wall: door, printer, cooler, coat rack, ficus ----------
  const door = new THREE.Group(); door.position.set(2.2, 0, z1 - 0.02); door.rotation.y = Math.PI; scene.add(door);
  box(door, 1.0, 2.12, 0.05, M.white, 0, 1.06, 0);
  box(door, 0.9, 2.05, 0.04, std(0x9b7b56, 0.55, 0, { map: TX.woodTex() }), 0, 1.03, 0.02);
  box(door, 0.12, 0.02, 0.04, M.metal, -0.33, 1.02, 0.06);
  plane(door, 0.34, 0.13, new THREE.MeshBasicMaterial({ map: TX.exitSignTex() }), 0, 2.28, 0.01);

  const cab = new THREE.Group(); cab.position.set(0.6, 0, z1 - 0.3); cab.rotation.y = Math.PI; scene.add(cab);
  box(cab, 0.9, 0.72, 0.5, std(0xc9c3b5, 0.6), 0, 0.36, 0);
  box(cab, 0.42, 0.6, 0.005, std(0xb8b1a1, 0.6), -0.22, 0.36, 0.253);
  box(cab, 0.42, 0.6, 0.005, std(0xb8b1a1, 0.6), 0.22, 0.36, 0.253);
  const printer = new THREE.Group(); printer.position.set(0, 0.72, 0); cab.add(printer);
  rbox(printer, 0.56, 0.42, 0.48, 0.02, std(0xe6e6e2, 0.5), 0, 0.21, 0);
  box(printer, 0.56, 0.05, 0.4, std(0x44474d, 0.5), 0, 0.44, 0);
  box(printer, 0.18, 0.08, 0.006, std(0x22262b, 0.3), 0.14, 0.37, 0.242);
  box(printer, 0.36, 0.01, 0.2, M.paper, 0, 0.22, 0.26);
  refs.printerPaper = box(printer, 0.21, 0.004, 0.297, M.paper, 0, 0.23, 0.2);
  refs.printerPaper.visible = false;
  refs.printer = printer;
  refs.interactables.push(interact(printer, 'printer', 'МФУ «в коридоре»'));
  plane(scene, 0.3, 0.2, new THREE.MeshStandardMaterial({ map: TX.stickyTex('Бумагу\nэкономим!', '#ffffff', 2) }), 0.6, 1.55, z1 - 0.006, Math.PI);

  const cooler = new THREE.Group(); cooler.position.set(-0.7, 0, z1 - 0.3); cooler.rotation.y = Math.PI; scene.add(cooler);
  rbox(cooler, 0.32, 1.0, 0.32, 0.02, M.white, 0, 0.5, 0);
  box(cooler, 0.2, 0.12, 0.03, std(0x999999, 0.6), 0, 0.82, 0.16);
  box(cooler, 0.03, 0.03, 0.03, std(0x2266dd, 0.4), -0.05, 0.86, 0.18); box(cooler, 0.03, 0.03, 0.03, std(0xdd2222, 0.4), 0.05, 0.86, 0.18);
  cyl(cooler, 0.14, 0.14, 0.4, new THREE.MeshPhysicalMaterial({ color: 0x8ec5ff, transparent: true, opacity: 0.45, roughness: 0.1 }), 0, 1.2, 0);
  refs.interactables.push(interact(cooler, 'cooler', 'Кулер с водой'));

  const rack = new THREE.Group(); rack.position.set(-2.4, 0, z1 - 0.35); scene.add(rack);
  cyl(rack, 0.02, 0.02, 1.8, M.darkMetal, 0, 0.9, 0, 10);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const leg = box(rack, 0.5, 0.02, 0.03, M.darkMetal, Math.cos(a) * 0.2, 0.02, Math.sin(a) * 0.2); leg.rotation.y = -a; }
  const coat1 = add(rack, new THREE.CylinderGeometry(0.1, 0.24, 1.0, 14, 1, true), std(0x3b3f4a, 0.9, 0, { side: THREE.DoubleSide }), 0.1, 1.2, 0);
  coat1.rotation.z = 0.1;
  add(rack, new THREE.CylinderGeometry(0.08, 0.2, 0.8, 14, 1, true), std(0x7a4a3a, 0.9, 0, { side: THREE.DoubleSide }), -0.12, 1.3, 0.05).rotation.z = -0.12;
  add(rack, new THREE.SphereGeometry(0.1, 12, 8), std(0x8a1f28, 0.9), 0.02, 1.84, 0);

  const ficus = new THREE.Group(); ficus.position.set(-2.95, 0, 2.6); scene.add(ficus);
  cyl(ficus, 0.2, 0.15, 0.38, std(0xa65a36, 0.8), 0, 0.19, 0);
  cyl(ficus, 0.012, 0.018, 1.1, std(0x5b4430, 0.8), 0, 0.9, 0, 8);
  const leafMat = std(0x2f6b33, 0.7);
  const lr = TX.rng(12);
  for (let i = 0; i < 70; i++) {
    const a = lr() * Math.PI * 2, y = 0.8 + lr() * 0.85, r = 0.08 + lr() * (0.35 - Math.abs(y - 1.3) * 0.3);
    const leaf = add(ficus, new THREE.SphereGeometry(0.06, 8, 6), leafMat, Math.cos(a) * r, y, Math.sin(a) * r);
    leaf.scale.set(1, 0.3, 0.55); leaf.rotation.set(lr() * 2, a, lr() * 0.6);
  }

  // ---------- workstations ----------
  [-1.75, 0, 1.75].forEach((x) => buildDesk(scene, x, M));
  // partitions between desks
  [-0.875, 0.875].forEach((x) => {
    box(scene, 0.04, 0.34, 0.78, M.partition, x, DESK_H + 0.17, -0.75);
    box(scene, 0.05, 0.02, 0.8, M.darkMetal, x, DESK_H + 0.35, -0.75);
  });
  // front screens (along the back edge of the desks)
  [-1.75, 0, 1.75].forEach((x) => {
    box(scene, 1.62, 0.42, 0.04, M.partition, x, DESK_H + 0.21, -1.18);
    box(scene, 1.62, 0.02, 0.05, M.darkMetal, x, DESK_H + 0.43, -1.18);
  });
  // pinned schedule on the screen in front of the player
  const sched = plane(scene, 0.21, 0.297, new THREE.MeshStandardMaterial({ map: TX.paperTex('ГРАФИК ОТПУСКОВ', 14, 6) }), -0.62, DESK_H + 0.24, -1.157);
  sched.rotation.z = 0.04;

  // ---------- player workstation ----------
  const monitor = makeMonitor(scene, M, new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }), 0, -0.9);
  refs.screen = monitor.screen;
  refs.monitor = monitor.group;
  interact(monitor.group, 'monitor', 'Работать за компьютером');
  refs.interactables.push(monitor.group);
  // sticky notes on the bezel
  [['пароль:\n12345', '#ffe66b', -0.305, 1.19, 0.12], ['позвонить\nИванову', '#ff9ec7', 0.305, 1.18, -0.1], ['акт сверки!!!', '#9ee6ff', 0.305, 1.06, 0.06]].forEach(([t, c, x, y, rz], i) => {
    const note = plane(monitor.group, 0.075, 0.075, new THREE.MeshStandardMaterial({ map: TX.stickyTex(t, c, i), roughness: 0.8 }), x - (x > 0 ? -0.02 : 0.02), y - DESK_H, 0.034);
    note.rotation.z = rz;
  });

  refs.keyboard = makeKeyboard(scene, M, 0, -0.55);
  refs.mouse = makeMouse(scene, M, 0.31, -0.55);
  refs.phone = makePhone(scene, M, -0.5, -0.62);
  refs.interactables.push(refs.phone.group);
  refs.mug = makeMug(scene, M, 0.56, -0.44);
  refs.interactables.push(refs.mug.group);
  refs.lamp = makeLamp(scene, M, -0.7, -1.02);
  refs.interactables.push(refs.lamp.group);

  // pen holder
  const ph = new THREE.Group(); ph.position.set(-0.3, DESK_H, -1.0); scene.add(ph);
  cyl(ph, 0.04, 0.04, 0.1, std(0x33373d, 0.5, 0.5), 0, 0.05, 0);
  [[0x1e46b4, 0.2, 0], [0xc0271d, -0.15, 1], [0x111111, 0.1, 2], [0xf0b400, -0.05, 3], [0x2e7d32, 0.22, 4]].forEach(([c, t, i]) => {
    const p = cyl(ph, 0.004, 0.004, 0.15, std(c, 0.4), Math.cos(i * 1.3) * 0.018, 0.12, Math.sin(i * 1.3) * 0.018, 8);
    p.rotation.set(t, 0, t * 0.8);
  });
  const scissors = cyl(ph, 0.006, 0.006, 0.12, std(0xd03030, 0.4), 0.015, 0.14, -0.01, 8); scissors.rotation.z = -0.25;

  // stapler
  const stp = new THREE.Group(); stp.position.set(-0.22, DESK_H, -0.78); stp.rotation.y = 0.5; scene.add(stp);
  rbox(stp, 0.04, 0.012, 0.15, 0.005, M.black, 0, 0.006, 0);
  const stTop = rbox(stp, 0.036, 0.022, 0.14, 0.008, std(0x2b58b8, 0.35), 0, 0.028, 0.004);
  refs.staplerTop = stTop;
  refs.interactables.push(interact(stp, 'stapler', 'Степлер'));

  // flip calendar
  const flip = new THREE.Group(); flip.position.set(-0.43, DESK_H, -0.9); flip.rotation.y = 0.35; scene.add(flip);
  const tri = new THREE.Shape(); tri.moveTo(-0.045, 0); tri.lineTo(0.045, 0); tri.lineTo(0, 0.11); tri.closePath();
  const triGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.13, bevelEnabled: false }); triGeo.rotateY(Math.PI / 2); triGeo.translate(-0.065, 0, 0);
  add(flip, triGeo, std(0x2f3136, 0.6));
  const flipFace = plane(flip, 0.12, 0.094, new THREE.MeshStandardMaterial({ map: TX.flipCalTex() }), 0, 0.055, 0.0245, 0);
  flipFace.rotation.x = -0.39;

  // calculator
  const calc = add(scene, new THREE.BoxGeometry(0.1, 0.015, 0.14), [M.black, M.black, new THREE.MeshStandardMaterial({ map: TX.calculatorTex(), roughness: 0.6 }), M.black, M.black, M.black], 0.55, DESK_H + 0.0075, -0.68);
  calc.rotation.y = -0.3;
  refs.interactables.push(interact(calc, 'calc', 'Калькулятор'));

  // binders standing on the desk
  ['Акты 2026', 'Счета', 'Кадры', 'Договоры'].forEach((t, i) => {
    const col = ['#1f4e9c', '#b3261e', '#2e7d32', '#f0b400'][i];
    const b = box(scene, 0.06, 0.3, 0.26, std(col, 0.6), 0.38 + i * 0.065, DESK_H + 0.15, -0.99);
    b.rotation.z = i === 3 ? -0.12 : 0;
    if (i === 3) b.position.x += 0.02;
    const lab = new THREE.MeshStandardMaterial({ map: TX.binderTex(t, col) });
    b.material = [b.material, b.material, b.material, b.material, lab, b.material];
  });
  // document tray with papers
  const tray = new THREE.Group(); tray.position.set(0.7, DESK_H, -0.78); tray.rotation.y = -0.1; scene.add(tray);
  const trayMat = std(0x2a2c30, 0.4, 0.3);
  for (let lvl = 0; lvl < 2; lvl++) {
    const y = lvl * 0.08;
    box(tray, 0.2, 0.006, 0.28, trayMat, 0, y + 0.003, 0);
    box(tray, 0.006, 0.05, 0.28, trayMat, -0.1, y + 0.025, 0); box(tray, 0.006, 0.05, 0.28, trayMat, 0.1, y + 0.025, 0);
    box(tray, 0.2, 0.03, 0.006, trayMat, 0, y + 0.015, 0.14);
    for (let k = 0; k < 4 + lvl * 3; k++) {
      const p = box(tray, 0.18, 0.002, 0.25, M.paper, (Math.random() - 0.5) * 0.01, y + 0.008 + k * 0.003, -0.01);
      p.rotation.y = (Math.random() - 0.5) * 0.08;
    }
  }
  refs.interactables.push(interact(tray, 'papers', 'Стопка первичных документов'));
  // loose paper and notepad
  const act = plane(scene, 0.21, 0.297, new THREE.MeshStandardMaterial({ map: TX.paperTex('АКТ СВЕРКИ', 16, 2) }), 0.05, DESK_H + 0.001, -0.74);
  act.rotation.set(-Math.PI / 2, 0, 0.35);
  act.receiveShadow = true;
  const pad = new THREE.Group(); pad.position.set(-0.31, DESK_H, -0.42); pad.rotation.y = 0.25; scene.add(pad);
  box(pad, 0.15, 0.012, 0.21, std(0xf0ecd8, 0.9), 0, 0.006, 0);
  box(pad, 0.15, 0.004, 0.03, std(0x444a52, 0.6), 0, 0.014, -0.09);
  const pen = cyl(pad, 0.005, 0.005, 0.14, std(0x1e46b4, 0.3), 0.04, 0.02, 0.01, 8); pen.rotation.set(Math.PI / 2, 0, 0.3);
  // cactus
  const cac = new THREE.Group(); cac.position.set(0.74, DESK_H, -0.56); scene.add(cac);
  cyl(cac, 0.045, 0.035, 0.07, std(0xd9d1c3, 0.7), 0, 0.035, 0);
  cyl(cac, 0.042, 0.042, 0.005, std(0x4a3a2a, 1), 0, 0.068, 0);
  const body = add(cac, new THREE.CapsuleGeometry(0.028, 0.06, 4, 10), std(0x3f7d3a, 0.7), 0, 0.12, 0);
  body.scale.set(1, 1, 0.9);
  add(cac, new THREE.SphereGeometry(0.01, 8, 6), std(0xff6fa8, 0.6), 0.005, 0.18, 0);
  refs.interactables.push(interact(cac, 'cactus', 'Кактус'));

  // under the desk: PC + trash bin
  const pc = new THREE.Group(); pc.position.set(0.55, 0, -0.85); scene.add(pc);
  box(pc, 0.2, 0.42, 0.44, M.blackMatte, 0, 0.21, 0);
  box(pc, 0.19, 0.4, 0.004, std(0x2b2d31, 0.4), 0, 0.21, 0.221);
  refs.pcLed = box(pc, 0.008, 0.008, 0.004, new THREE.MeshBasicMaterial({ color: 0x3cb0ff }), 0.06, 0.38, 0.224);
  const bin = new THREE.Group(); bin.position.set(0.18, 0, -0.95); scene.add(bin);
  add(bin, new THREE.CylinderGeometry(0.13, 0.11, 0.32, 20, 1, true), std(0x3a3d42, 0.6, 0.2, { side: THREE.DoubleSide }), 0, 0.16, 0);
  cyl(bin, 0.11, 0.11, 0.005, std(0x3a3d42, 0.6), 0, 0.003, 0);
  for (let i = 0; i < 4; i++) add(bin, new THREE.IcosahedronGeometry(0.035, 0), M.paper, (Math.random() - 0.5) * 0.1, 0.2 + i * 0.02, (Math.random() - 0.5) * 0.1);

  // ---------- neighbours ----------
  // Людмила Петровна (left)
  makeMonitor(scene, M, new THREE.MeshBasicMaterial({ map: TX.spreadsheetTex(), toneMapped: false }), -1.75, -0.9);
  makeKeyboard(scene, M, -1.75, -0.55, true);
  makeMouse(scene, M, -1.44, -0.55);
  const violets = new THREE.Group(); violets.position.set(-2.35, DESK_H, -0.95); scene.add(violets);
  [[0, 0, 0x8e44ad], [0.12, 0.03, 0xd6457a], [0.24, -0.01, 0x6c5ce7]].forEach(([dx, dz, c]) => {
    cyl(violets, 0.045, 0.035, 0.08, std(0xb85c38, 0.8), dx, 0.04, dz);
    for (let i = 0; i < 8; i++) { const lf = add(violets, new THREE.SphereGeometry(0.03, 8, 6), std(0x2f6b33, 0.8), dx + Math.cos(i) * 0.035, 0.1, dz + Math.sin(i) * 0.035); lf.scale.set(1, 0.35, 1); }
    for (let i = 0; i < 5; i++) add(violets, new THREE.SphereGeometry(0.012, 6, 5), std(c, 0.6), dx + Math.cos(i * 1.7) * 0.015, 0.125, dz + Math.sin(i * 1.7) * 0.015);
  });
  const lpMug = makeMug(scene, M, -1.2, -0.45, 0xd2e6f5);
  lpMug.group.scale.setScalar(1.2);
  const frame = new THREE.Group(); frame.position.set(-2.2, DESK_H, -0.7); frame.rotation.y = 0.5; scene.add(frame);
  box(frame, 0.15, 0.12, 0.012, std(0xc9a44a, 0.4, 0.6), 0, 0.06, 0).rotation.x = -0.2;
  plane(frame, 0.13, 0.1, new THREE.MeshStandardMaterial({ map: TX.photoTex() }), 0, 0.061, 0.008).rotation.x = -0.2;
  for (let k = 0; k < 6; k++) box(scene, 0.21, 0.004, 0.297, M.paper, -2.2 + (Math.random() - 0.5) * 0.02, DESK_H + 0.002 + k * 0.004, -0.42).rotation.y = (Math.random() - 0.5) * 0.3;
  makeChair(scene, M, -1.75, 0, 0.15);
  const lp = makePerson(scene, M, -1.75, 0, { shirt: 0x7b2d3b, hair: 0x9a9a98, bun: true, glasses: true, skin: 0xe8c0a6, name: 'Людмила Петровна' });
  refs.colleagues.push(lp);
  refs.interactables.push(lp.group);

  // Серёга (right)
  makeMonitor(scene, M, new THREE.MeshBasicMaterial({ map: TX.solitaireTex(), toneMapped: false }), 1.75, -0.9);
  makeKeyboard(scene, M, 1.75, -0.55, true);
  makeMouse(scene, M, 2.06, -0.55);
  const canMat = std(0x1f9d55, 0.3, 0.7);
  [[1.18, -0.5], [1.12, -0.62], [2.35, -0.95]].forEach(([x, z], i) => { const c = cyl(scene, 0.033, 0.033, 0.16, canMat, x, DESK_H + (i === 2 ? 0.033 : 0.08), z, 16); if (i === 2) c.rotation.z = Math.PI / 2; });
  const fig = new THREE.Group(); fig.position.set(2.3, DESK_H, -0.7); scene.add(fig);
  add(fig, new THREE.SphereGeometry(0.04, 12, 10), std(0xff8a00, 0.5), 0, 0.1, 0);
  cyl(fig, 0.03, 0.04, 0.07, std(0x1565c0, 0.5), 0, 0.035, 0);
  makeChair(scene, M, 1.75, 0, -0.1);
  const sg = makePerson(scene, M, 1.75, 0, { shirt: 0x3e5a45, hair: 0x4a3222, headset: true, skin: 0xe2b597, name: 'Серёга' });
  refs.colleagues.push(sg);
  refs.interactables.push(sg.group);

  // ---------- player ----------
  refs.playerChair = makeChair(scene, M, 0, 0, 0);
  const legs = new THREE.Group(); refs.playerChair.add(legs);
  const trousers = std(0x2c3038, 0.9), shirt = std(0x9fb8d6, 0.85), shoe = std(0x151515, 0.4);
  [-1, 1].forEach((s) => {
    limb(legs, new THREE.Vector3(0.1 * s, 0.56, 0.05), new THREE.Vector3(0.11 * s, 0.57, -0.36), 0.075, trousers);
    limb(legs, new THREE.Vector3(0.11 * s, 0.56, -0.38), new THREE.Vector3(0.12 * s, 0.1, -0.42), 0.06, trousers);
    rbox(legs, 0.1, 0.08, 0.26, 0.03, shoe, 0.12 * s, 0.04, -0.47);
  });
  const belly = add(legs, new THREE.CapsuleGeometry(0.15, 0.18, 4, 12), shirt, 0, 0.74, 0.1);
  belly.scale.set(1.15, 1, 0.8);
  box(legs, 0.3, 0.05, 0.2, std(0x1d1d1d, 0.6), 0, 0.6, 0.06);

  return refs;
}

// ============================================================
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

function makePhone(scene, M, x, z) {
  const g = new THREE.Group(); g.position.set(x, DESK_H, z); g.rotation.y = 0.55; scene.add(g);
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
  scene.add(cord);
  const updateCord = () => {
    hs.updateMatrixWorld(true);
    g.updateMatrixWorld(true);
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

function makePerson(scene, M, x, z, o) {
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  const shirt = std(o.shirt, 0.9), skin = std(o.skin, 0.7), trousers = std(0x2a2d33, 0.9), hair = std(o.hair, 0.95);
  const V = (a, b, c) => new THREE.Vector3(a, b, c);
  [-1, 1].forEach((s) => {
    limb(g, V(0.1 * s, 0.56, 0.05), V(0.11 * s, 0.57, -0.36), 0.075, trousers);
    limb(g, V(0.11 * s, 0.56, -0.38), V(0.12 * s, 0.1, -0.42), 0.06, trousers);
    rbox(g, 0.1, 0.08, 0.25, 0.03, std(0x151515, 0.4), 0.12 * s, 0.04, -0.47);
  });
  const torso = add(g, new THREE.CapsuleGeometry(0.16, 0.3, 6, 14), shirt, 0, 0.84, 0.07);
  torso.scale.set(1.12, 1, 0.72);
  torso.rotation.x = -0.08;
  cyl(g, 0.045, 0.05, 0.08, skin, 0, 1.1, 0.05, 12);
  const head = new THREE.Group(); head.position.set(0, 1.14, 0.05); g.add(head);
  const skull = add(head, new THREE.SphereGeometry(0.1, 20, 16), skin, 0, 0.12, 0);
  skull.scale.set(0.92, 1.08, 1);
  add(head, new THREE.SphereGeometry(0.018, 8, 6), skin, 0, 0.11, -0.1);
  [-1, 1].forEach((s) => {
    add(head, new THREE.SphereGeometry(0.011, 8, 6), std(0x1b1b1b, 0.3), 0.034 * s, 0.14, -0.088);
    add(head, new THREE.SphereGeometry(0.02, 8, 6), skin, 0.093 * s, 0.12, 0.0).scale.set(0.5, 1, 0.8);
  });
  const hairCap = add(head, new THREE.SphereGeometry(0.106, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.13, 0.008);
  hairCap.scale.set(0.95, 1.05, 1.02);
  hairCap.rotation.x = -0.35;
  if (o.bun) add(head, new THREE.SphereGeometry(0.055, 14, 12), hair, 0, 0.22, 0.07);
  if (o.glasses) {
    const gm = std(0x6b4a2a, 0.4, 0.4);
    [-1, 1].forEach((s) => add(head, new THREE.TorusGeometry(0.024, 0.003, 6, 16), gm, 0.035 * s, 0.14, -0.1, { cast: false }));
    box(head, 0.02, 0.003, 0.003, gm, 0, 0.145, -0.1, { cast: false });
  }
  if (o.headset) {
    const hm = std(0x18191c, 0.4);
    const band = add(head, new THREE.TorusGeometry(0.11, 0.009, 8, 24, Math.PI), hm, 0, 0.13, 0.01);
    band.rotation.y = Math.PI / 2;
    [-1, 1].forEach((s) => cyl(head, 0.04, 0.04, 0.03, hm, 0.1 * s, 0.12, 0.0, 16).rotation.z = Math.PI / 2);
  }
  // arms with elbow pivots so the forearms can "type"
  const arms = [];
  [-1, 1].forEach((s) => {
    const sh = V(0.2 * s, 1.02, 0.08), el = V(0.23 * s, 0.8, -0.1);
    limb(g, sh, el, 0.048, shirt);
    const pivot = new THREE.Group(); pivot.position.copy(el); g.add(pivot);
    limb(pivot, V(0, 0, 0), V(-0.1 * s, -0.03, -0.3), 0.04, shirt);
    add(pivot, new THREE.SphereGeometry(0.035, 10, 8), skin, -0.105 * s, -0.035, -0.33).scale.set(1, 0.6, 1.3);
    arms.push(pivot);
  });
  interact(g, 'colleague', o.name);
  g.userData.person = o.name;
  return { group: g, head, arms, name: o.name, look: 0, lookTarget: 0, typing: true, phase: Math.random() * 10 };
}
