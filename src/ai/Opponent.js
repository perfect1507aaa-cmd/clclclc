import { OWNER, CHANNEL_MAX, DORMANT_CLAIM_COST, UPGRADE_MAX_LEVEL } from '../core/constants.js';

// The enemy operator. Difficulty ramps smoothly across the ten campaign
// levels: early on it runs its hardware under-powered, thinks slowly, and
// waits before its first move; by BLACKSITE it is at full strength.
export class Opponent {
  constructor(level) {
    const lvl = level.aiLevel || 2;
    const t = Math.min(1, Math.max(0, (lvl - 2) / 8));

    this.powerMult = 0.55 + 0.45 * t;
    this.thinkInterval = 2.3 - 1.3 * t;
    this.startFreeze = 6 - 5 * t;

    this.dualChannel = t >= 0.6;
    this.costAware = t >= 0.35;
    this.reinforceUnderFire = t >= 0.5;
    this.investUpgrades = t >= 0.3;
    this.pullReinforcements = t >= 0.75;

    this.timer = 0;
  }

  update(dt, gameState) {
    if (gameState.result) return;
    if (gameState.time < this.startFreeze) return;
    this.timer += dt;
    if (this.timer < this.thinkInterval) return;
    this.timer = 0;
    this.decide(gameState);
  }

  enemyNodes(gameState) {
    const list = [];
    for (const node of gameState.nodes.values()) if (node.owner === OWNER.ENEMY) list.push(node);
    return list;
  }

  decide(gameState) {
    const enemyNodes = this.enemyNodes(gameState);
    if (enemyNodes.length === 0) return;

    this.expandFrontier(gameState, enemyNodes);
    this.claimDormant(gameState, enemyNodes);
    if (this.investUpgrades) this.upgrade(gameState, enemyNodes);
    if (this.reinforceUnderFire) this.reinforce(gameState, enemyNodes);
  }

  expandFrontier(gameState, enemyNodes) {
    const candidates = [];
    for (const node of enemyNodes) {
      if (node.channels.length >= CHANNEL_MAX) continue;
      for (const edge of gameState.adjacency.get(node.id)) {
        if (edge.dashed) continue;
        const targetId = edge.other(node.id);
        const target = gameState.nodes.get(targetId);
        if (target.owner === OWNER.ENEMY || target.owner === OWNER.DORMANT) continue;
        if (node.hasChannelTo(targetId)) continue;
        const defenseFactor = this.costAware ? target.defenseMultiplier : 1;
        const cost = target.buffer * defenseFactor + 1;
        candidates.push({ node, targetId, cost });
      }
    }
    if (!candidates.length) return;
    candidates.sort((a, b) => a.cost - b.cost);
    const picks = this.dualChannel ? 2 : 1;
    let taken = 0;
    for (const c of candidates) {
      if (taken >= picks) break;
      if (c.node.channels.length >= CHANNEL_MAX) continue;
      const res = gameState.toggleChannel(c.node.id, c.targetId, OWNER.ENEMY);
      if (res === 'added') taken++;
    }
  }

  claimDormant(gameState, enemyNodes) {
    for (const node of enemyNodes) {
      if (node.buffer < DORMANT_CLAIM_COST * 1.4) continue;
      for (const edge of gameState.adjacency.get(node.id)) {
        const targetId = edge.other(node.id);
        const target = gameState.nodes.get(targetId);
        if (target.owner === OWNER.DORMANT) {
          gameState.attemptClaimDormant(targetId, OWNER.ENEMY);
          break;
        }
      }
    }
  }

  upgrade(gameState, enemyNodes) {
    const order = ['nic', 'ice', 'cpu', 'ram'];
    for (const node of enemyNodes) {
      if (node.buffer < node.bufferMax * 0.55) continue;
      for (const branch of order) {
        if (node.upgrades[branch] < UPGRADE_MAX_LEVEL && node.buffer >= node.upgradeCost(branch)) {
          gameState.attemptUpgrade(node.id, branch, OWNER.ENEMY);
          break;
        }
      }
    }
  }

  reinforce(gameState, enemyNodes) {
    for (const node of enemyNodes) {
      const underFire = gameState.adjacency.get(node.id).some((edge) => {
        const otherId = edge.other(node.id);
        const other = gameState.nodes.get(otherId);
        if (other.owner === OWNER.ENEMY || other.owner === OWNER.DORMANT) return false;
        return edge.a === node.id ? edge.flowBA > 0 : edge.flowAB > 0;
      });
      if (!underFire) continue;
      for (const edge of gameState.adjacency.get(node.id)) {
        if (edge.dashed) continue;
        const otherId = edge.other(node.id);
        const other = gameState.nodes.get(otherId);
        if (other.owner !== OWNER.ENEMY) continue;
        if (other.hasChannelTo(node.id) || other.channels.length >= CHANNEL_MAX) continue;
        if (this.pullReinforcements || other.buffer > other.bufferMax * 0.4) {
          gameState.toggleChannel(other.id, node.id, OWNER.ENEMY);
          break;
        }
      }
    }
  }
}
