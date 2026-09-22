import { NODE_TYPES } from './nodeTypes.js';
import { CHANNEL_MAX, TIER_THRESHOLDS, TIER_STATS, CAPTURE_FLASH_DURATION, OWNER } from './constants.js';

let uid = 0;

export function tierOf(buffer) {
  const b = Math.floor(Math.max(0, buffer));
  if (b >= TIER_THRESHOLDS[2]) return 3;
  if (b >= TIER_THRESHOLDS[1]) return 2;
  return 1;
}

export class Node {
  constructor({ id, type, x, y, owner = OWNER.NEUTRAL, dormant = false }) {
    this.id = id ?? `n${uid++}`;
    this.type = type;
    this.x = x;
    this.y = y;
    this.owner = dormant ? OWNER.DORMANT : owner;
    this.dormant = dormant;

    this.outgoing = []; // connection ids sourced from this node
    this.powerMult = 1; // AI difficulty scaling, 1 for player nodes

    const base = NODE_TYPES[type];
    this.bufferMax = base.bufferMax;
    this.buffer = dormant ? 0 : base.bufferMax * 0.15;

    this.captureFlashT = 0;
    this.pulseT = Math.random() * 10;
    this.genPulseT = 0;

    this.recomputeStats();
    if (!dormant && owner !== OWNER.NEUTRAL) {
      this.buffer = this.bufferMax * 0.35;
    }
  }

  get base() {
    return NODE_TYPES[this.type];
  }

  get tier() {
    return tierOf(this.buffer);
  }

  recomputeStats() {
    const base = this.base;
    const t = TIER_STATS[this.tier];
    this.bufferMax = base.bufferMax;
    this.generation = base.generation * t.generation * this.powerMult;
    this.output = base.output * t.output * this.powerMult;
    this.defenseMultiplier = (1 - base.defense / 100) * t.defense;
    this.flowBoost = base.flowBoost;
    if (this.buffer > this.bufferMax) this.buffer = this.bufferMax;
  }

  get channelShareOutput() {
    return this.output * 0.25 * this.flowBoost;
  }

  isOwned() {
    return this.owner === OWNER.PLAYER || this.owner === OWNER.ENEMY;
  }

  canOpenConnection() {
    return this.outgoing.length < CHANNEL_MAX;
  }

  resetOnCapture(newOwner) {
    this.owner = newOwner;
    this.dormant = false;
    this.outgoing = [];
    this.buffer = 1;
    this.recomputeStats();
    this.captureFlashT = CAPTURE_FLASH_DURATION;
  }

  tickGeneration(dt) {
    if (!this.isOwned()) return;
    this.buffer = Math.min(this.bufferMax, this.buffer + this.generation * dt);
    this.genPulseT += this.generation * dt;
    if (this.genPulseT >= 4) {
      this.genPulseT -= 4;
      this.pulseFlash = 1;
    }
  }

  tickCosmetics(dt) {
    this.pulseT += dt;
    if (this.captureFlashT > 0) this.captureFlashT = Math.max(0, this.captureFlashT - dt);
    if (this.pulseFlash) {
      this.pulseFlash -= dt * 3;
      if (this.pulseFlash <= 0) this.pulseFlash = 0;
    }
  }
}
