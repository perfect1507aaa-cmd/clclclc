import { NODE_TYPES } from './nodeTypes.js';
import {
  CHANNEL_MAX,
  UPGRADE_BASE_COST,
  UPGRADE_MAX_LEVEL,
  UPGRADE_COST_GROWTH,
  CPU_GEN_PER_LEVEL,
  RAM_BUF_PER_LEVEL,
  NIC_OUT_PER_LEVEL,
  ICE_DMG_MULT_PER_LEVEL,
  CAPTURE_FLASH_DURATION,
  OWNER,
} from './constants.js';

let uid = 0;

export class Node {
  constructor({ id, type, x, y, owner = OWNER.NEUTRAL, dormant = false }) {
    this.id = id ?? `n${uid++}`;
    this.type = type;
    this.x = x;
    this.y = y;
    this.owner = dormant ? OWNER.DORMANT : owner;
    this.dormant = dormant;

    this.upgrades = { cpu: 0, ram: 0, nic: 0, ice: 0 };
    this.channels = []; // array of targetNodeId, order = activation order
    this.powerMult = 1; // AI difficulty scaling, 1 for player nodes

    const base = NODE_TYPES[type];
    this.bufferMax = base.bufferMax;
    this.buffer = dormant ? 0 : Math.min(base.bufferMax, base.bufferMax * 0.15);
    this.generation = base.generation;
    this.output = base.output;
    this.defensePercent = base.defense;

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

  recomputeStats() {
    const base = this.base;
    const prevMax = this.bufferMax || base.bufferMax;
    this.bufferMax = base.bufferMax * (1 + RAM_BUF_PER_LEVEL * this.upgrades.ram);
    this.generation =
      base.generation * (1 + CPU_GEN_PER_LEVEL * this.upgrades.cpu) * this.powerMult;
    this.output = base.output * (1 + NIC_OUT_PER_LEVEL * this.upgrades.nic) * this.powerMult;
    this.defenseMultiplier =
      (1 - base.defense / 100) * Math.pow(ICE_DMG_MULT_PER_LEVEL, this.upgrades.ice);
    // keep buffer proportionally sane if max shrank/grew (only grows in practice)
    if (this.buffer > this.bufferMax) this.buffer = this.bufferMax;
    void prevMax;
  }

  get channelShareOutput() {
    return this.output * 0.25;
  }

  isOwned() {
    return this.owner === OWNER.PLAYER || this.owner === OWNER.ENEMY;
  }

  hasChannelTo(targetId) {
    return this.channels.includes(targetId);
  }

  toggleChannel(targetId) {
    const idx = this.channels.indexOf(targetId);
    if (idx >= 0) {
      this.channels.splice(idx, 1);
      return 'removed';
    }
    if (this.channels.length >= CHANNEL_MAX) {
      return 'full';
    }
    this.channels.push(targetId);
    return 'added';
  }

  removeChannel(targetId) {
    const idx = this.channels.indexOf(targetId);
    if (idx >= 0) this.channels.splice(idx, 1);
  }

  upgradeCost(branch) {
    const level = this.upgrades[branch];
    if (level >= UPGRADE_MAX_LEVEL) return Infinity;
    return Math.round(
      UPGRADE_BASE_COST * Math.pow(UPGRADE_COST_GROWTH, level) * this.base.upgradeCostMult
    );
  }

  canUpgrade(branch) {
    if (!this.isOwned()) return false;
    if (this.upgrades[branch] >= UPGRADE_MAX_LEVEL) return false;
    return this.buffer >= this.upgradeCost(branch);
  }

  applyUpgrade(branch) {
    if (!this.canUpgrade(branch)) return false;
    const cost = this.upgradeCost(branch);
    this.buffer -= cost;
    this.upgrades[branch] += 1;
    this.recomputeStats();
    return true;
  }

  resetOnCapture(newOwner) {
    this.owner = newOwner;
    this.dormant = false;
    this.upgrades = { cpu: 0, ram: 0, nic: 0, ice: 0 };
    this.channels = [];
    this.recomputeStats();
    this.buffer = 1;
    this.captureFlashT = CAPTURE_FLASH_DURATION;
  }

  tickGeneration(dt) {
    if (!this.isOwned()) return;
    const before = this.buffer;
    this.buffer = Math.min(this.bufferMax, this.buffer + this.generation * dt);
    this.genPulseT += this.generation * dt;
    if (this.genPulseT >= 4) {
      this.genPulseT -= 4;
      this.pulseFlash = 1;
    }
    void before;
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
