// Places army stacks on the grid: model, team base ring and a stack-count label.
import * as THREE from 'three';
import { CREATURES, isLarge } from '../data/haven.js';
import { buildCreatureModel } from './models.js';
import { cellToWorld, TILE } from './battlefield.js';

export function createStack(army, stack, index) {
  const def = CREATURES[stack.id];
  const large = isLarge(stack.id);
  const span = large ? 2 : 1;
  const cells = [];
  for (let dc = 0; dc < span; dc++) for (let dr = 0; dr < span; dr++) cells.push([stack.col + dc, stack.row + dr]);

  const g = new THREE.Group();
  const p = cellToWorld(stack.col, stack.row);
  const off = large ? TILE / 2 : 0;
  g.position.set(p.x + off, p.y + 0.04, p.z + off);

  // Team ring on the ground
  const ringR = large ? 0.9 : 0.42;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(ringR * 0.86, ringR, 20),
    new THREE.MeshBasicMaterial({ color: army.color, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.012;
  g.add(ring);

  const model = buildCreatureModel(def);
  model.rotation.y = army.side === 'left' ? Math.PI / 2 : -Math.PI / 2;
  if (!large && def.model.kind === 'humanoid') model.scale.setScalar(0.95);
  g.add(model);

  // Stack-count label rendered as HTML, anchored at the front-bottom corner.
  const label = document.createElement('div');
  label.className = `stack-count ${army.side}`;
  label.textContent = stack.count;
  const anchor = new THREE.Vector3(
    (army.side === 'left' ? 1 : -1) * (large ? 0.75 : 0.33),
    0.05,
    large ? 0.75 : 0.33,
  );

  const unit = {
    key: `${army.side}-${index}`,
    army,
    stack,
    def,
    large,
    cells,
    group: g,
    model,
    ring,
    label,
    anchor,
  };
  g.traverse((o) => { o.userData.unit = unit; });
  return unit;
}
