import { OWNER, DORMANT_CLAIM_COST } from '../core/constants.js';

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

  otherNodes(gameState, excludeOwner) {
    const list = [];
    for (const node of gameState.nodes.values()) {
      if (node.owner === OWNER.DORMANT || node.owner === excludeOwner) continue;
      list.push(node);
    }
    return list;
  }

  decide(gameState) {
    const enemyNodes = this.enemyNodes(gameState);
    if (enemyNodes.length === 0) return;

    this.expandFrontier(gameState, enemyNodes);
    this.claimDormant(gameState, enemyNodes);
    if (this.reinforceUnderFire) this.reinforce(gameState, enemyNodes);
  }

  expandFrontier(gameState, enemyNodes) {
    const targets = this.otherNodes(gameState, OWNER.ENEMY);
    if (!targets.length) return;

    const candidates = [];
    for (const node of enemyNodes) {
      if (!node.canOpenConnection()) continue;
      for (const target of targets) {
        if (node.outgoing.some((cid) => {
          const c = gameState.connections.find((x) => x.id === cid);
          return c && c.to === target.id;
        })) {
          continue;
        }
        const defenseFactor = this.costAware ? target.defenseMultiplier : 1;
        const dist = Math.hypot(node.x - target.x, node.y - target.y);
        const cost = target.buffer * defenseFactor + dist * 8;
        candidates.push({ node, target, cost });
      }
    }
    if (!candidates.length) return;
    candidates.sort((a, b) => a.cost - b.cost);
    const picks = this.dualChannel ? 2 : 1;
    let taken = 0;
    for (const c of candidates) {
      if (taken >= picks) break;
      if (!c.node.canOpenConnection()) continue;
      const res = gameState.connect(c.node.id, c.target.id, OWNER.ENEMY);
      if (res === 'added') taken++;
    }
  }

  claimDormant(gameState, enemyNodes) {
    const richest = enemyNodes.reduce((a, b) => (b.buffer > a.buffer ? b : a), enemyNodes[0]);
    if (!richest || richest.buffer < DORMANT_CLAIM_COST * 1.4) return;
    for (const node of gameState.nodes.values()) {
      if (node.owner === OWNER.DORMANT) {
        if (gameState.attemptClaimDormant(node.id, OWNER.ENEMY)) return;
      }
    }
  }

  reinforce(gameState, enemyNodes) {
    for (const node of enemyNodes) {
      const underFire = gameState.connections.some((c) => {
        if (c.to !== node.id) return false;
        const source = gameState.nodes.get(c.from);
        return source && source.owner !== OWNER.ENEMY && c.deliverFlow > 0;
      });
      if (!underFire) continue;
      for (const ally of enemyNodes) {
        if (ally.id === node.id || !ally.canOpenConnection()) continue;
        if (ally.buffer < ally.bufferMax * 0.3) continue;
        if (gameState.connect(ally.id, node.id, OWNER.ENEMY) === 'added') break;
      }
    }
  }
}
