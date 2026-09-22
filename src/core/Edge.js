import { CABLE_BASE_BANDWIDTH, COLLISION_FLASH_DECAY } from './constants.js';

export class Edge {
  constructor(id, aId, bId, { dashed = false } = {}) {
    this.id = id;
    this.a = aId;
    this.b = bId;
    this.dashed = dashed; // dormant link, not usable for combat

    // runtime flow state, recomputed every tick, used by renderer
    this.flowAB = 0;
    this.flowBA = 0;
    this.collision = null; // { ratio } 0=at A, 1=at B
    this.collisionFlash = 0;
  }

  other(nodeId) {
    return nodeId === this.a ? this.b : this.a;
  }

  connects(id) {
    return this.a === id || this.b === id;
  }

  bandwidth(nodes) {
    const a = nodes.get(this.a);
    const b = nodes.get(this.b);
    const mult = Math.max(a.base.cableMultiplier, b.base.cableMultiplier);
    return CABLE_BASE_BANDWIDTH * mult;
  }

  tickCosmetics(dt) {
    if (this.collisionFlash > 0) {
      this.collisionFlash = Math.max(0, this.collisionFlash - dt * COLLISION_FLASH_DECAY);
    }
  }
}
