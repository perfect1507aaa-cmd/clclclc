// 3D view of a stack: model, team ring, count label, and its animations.
import * as THREE from 'three';
import { buildCreatureModel } from './models.js';
import { cellToWorld, TILE } from './battlefield.js';
import { tween, easeInOut, easeOut } from './tween.js';

export class UnitView {
  constructor(unit, color, labelLayer) {
    this.unit = unit;
    this.color = color;
    this.group = new THREE.Group();
    this.facing = new THREE.Group();
    this.group.add(this.facing);

    const r = unit.size === 2 ? 0.9 : 0.42;
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(r * 0.84, r, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.012;
    this.group.add(this.ring);

    this.build();

    this.label = document.createElement('div');
    this.label.className = `stack-count ${unit.side}`;
    labelLayer.appendChild(this.label);
    this.updateLabel();
    this.placeAt(unit.col, unit.row);
    this.faceDefault();
  }

  build() {
    if (this.model) this.facing.remove(this.model);
    this.model = buildCreatureModel(this.unit.def);
    if (this.unit.size === 1 && this.unit.def.model.kind === 'humanoid') this.model.scale.setScalar(0.95);
    this.facing.add(this.model);
    this.group.traverse((o) => { o.userData.view = this; });
  }

  anchorWorld(col, row) {
    const p = cellToWorld(col, row);
    const off = this.unit.size === 2 ? TILE / 2 : 0;
    return new THREE.Vector3(p.x + off, p.y + 0.04, p.z + off);
  }

  placeAt(col, row) {
    this.group.position.copy(this.anchorWorld(col, row));
  }

  faceDefault() {
    this.facing.rotation.y = this.unit.side === 'left' ? Math.PI / 2 : -Math.PI / 2;
  }

  faceTowards(p) {
    const dx = p.x - this.group.position.x;
    const dz = p.z - this.group.position.z;
    if (Math.abs(dx) + Math.abs(dz) > 1e-4) this.facing.rotation.y = Math.atan2(dx, dz);
  }

  labelAnchor() {
    const s = this.unit.side === 'left' ? 1 : -1;
    const o = this.unit.size === 2 ? 0.75 : 0.33;
    return new THREE.Vector3(s * o, 0.05, o).add(this.group.position);
  }

  updateLabel() {
    this.label.textContent = this.unit.count;
  }

  async moveAlong(path) {
    const fly = this.unit.def.abilities.includes('flyer');
    if (fly && path.length) {
      const end = path[path.length - 1];
      const from = this.group.position.clone();
      const to = this.anchorWorld(end.col, end.row);
      this.faceTowards(to);
      const dist = from.distanceTo(to);
      await tween(0.35 + dist * 0.09, (t) => {
        this.group.position.lerpVectors(from, to, t);
        this.group.position.y = from.y + Math.sin(t * Math.PI) * Math.min(1.6, 0.4 + dist * 0.25);
      }, easeInOut);
      return;
    }
    for (const step of path) {
      const from = this.group.position.clone();
      const to = this.anchorWorld(step.col, step.row);
      this.faceTowards(to);
      await tween(0.2, (t) => {
        this.group.position.lerpVectors(from, to, t);
        this.group.position.y = from.y + Math.abs(Math.sin(t * Math.PI)) * 0.06;
      });
    }
  }

  async lunge(targetPos) {
    this.faceTowards(targetPos);
    const home = this.group.position.clone();
    const dir = targetPos.clone().sub(home).setY(0).normalize().multiplyScalar(0.35);
    await tween(0.16, (t) => this.group.position.copy(home).addScaledVector(dir, t), easeOut);
    await tween(0.2, (t) => this.group.position.copy(home).addScaledVector(dir, 1 - t), easeInOut);
  }

  async hitFlash() {
    const mats = [];
    this.model.traverse((o) => { if (o.isMesh) mats.push(o); });
    const saved = mats.map((m) => m.material);
    const red = new THREE.MeshStandardMaterial({ color: 0xff5040, emissive: 0xaa1100, flatShading: true });
    mats.forEach((m) => { m.material = red; });
    const home = this.facing.position.clone();
    await tween(0.22, (t) => { this.facing.position.x = home.x + Math.sin(t * Math.PI * 6) * 0.04 * (1 - t); });
    mats.forEach((m, i) => { m.material = saved[i]; });
    this.facing.position.copy(home);
  }

  async die() {
    this.label.remove();
    const start = this.group.position.y;
    await tween(0.7, (t) => {
      this.facing.rotation.z = t * 1.3;
      this.group.position.y = start - t * 0.25;
      this.ring.material.opacity = 0.75 * (1 - t);
    }, easeInOut);
    this.group.visible = false;
  }

  dispose() {
    this.label.remove();
    this.group.removeFromParent();
  }
}

// Arrow for archers, glowing bolt for priests.
export async function projectile(scene, from, to, kind) {
  let mesh;
  if (kind === 'magic') {
    mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), new THREE.MeshStandardMaterial({ color: 0xfff0a0, emissive: 0xffd060, emissiveIntensity: 1.4, flatShading: true }));
  } else {
    mesh = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 4), new THREE.MeshStandardMaterial({ color: 0x7a5a3a }));
    shaft.rotation.x = Math.PI / 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 4), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.5 }));
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.28;
    mesh.add(shaft, tip);
  }
  scene.add(mesh);
  const a = from.clone().setY(from.y + 0.7);
  const b = to.clone().setY(to.y + 0.6);
  const dist = a.distanceTo(b);
  const arc = kind === 'magic' ? 0.4 : Math.min(2, dist * 0.18);
  const prev = a.clone();
  await tween(0.25 + dist * 0.045, (t) => {
    mesh.position.lerpVectors(a, b, t);
    mesh.position.y += Math.sin(t * Math.PI) * arc;
    if (t > 0) mesh.lookAt(mesh.position.clone().multiplyScalar(2).sub(prev));
    prev.copy(mesh.position);
  });
  scene.remove(mesh);
}
