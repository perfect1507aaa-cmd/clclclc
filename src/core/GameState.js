import { Node } from './Node.js';
import { Connection } from './Connection.js';
import {
  OWNER,
  DORMANT_CLAIM_COST,
  DORMANT_INITIAL_BUFFER,
  TRACE_MAX,
  TRACE_DECAY_PER_SEC,
  TRACE_GAIN_PER_DAMAGE,
  TRACE_ICE_BUFFER_LOSS,
  TRACE_RESET_TO,
} from './constants.js';

export class GameState {
  constructor(level) {
    this.level = level;
    this.nodes = new Map();
    this.connections = [];

    for (const n of level.nodes) {
      const node = new Node(n);
      this.nodes.set(node.id, node);
    }

    this.time = 0;
    this.traceEnabled = !!level.trace;
    this.trace = this.traceEnabled ? TRACE_RESET_TO * 0.4 : 0;
    this.traceStrikeEvent = null;

    this.objective = level.objective; // 'conquest' | 'hold' | 'exfil'
    this.holdDuration = level.holdDuration || 20;
    this.holdProgress = 0;
    this.exfilTarget = level.exfilTarget || 60;
    this.exfilProgress = 0;
    this.mainframeId = level.mainframeId || null;

    this.result = null; // null | 'victory' | 'defeat'
    this.events = []; // transient events for renderer/audio: {type,...}
    this.captureEvents = [];

    this.aiPowerMult = 1;
  }

  setAiPowerMult(mult) {
    this.aiPowerMult = mult;
    for (const node of this.nodes.values()) {
      if (node.owner === OWNER.ENEMY) {
        node.powerMult = mult;
        node.recomputeStats();
      }
    }
  }

  pushEvent(evt) {
    this.events.push(evt);
  }

  drainEvents() {
    const evts = this.events;
    this.events = [];
    return evts;
  }

  // --- connections ------------------------------------------------------

  connect(fromId, toId, actingOwner) {
    if (fromId === toId) return null;
    const source = this.nodes.get(fromId);
    const target = this.nodes.get(toId);
    if (!source || !target) return null;
    if (source.owner !== actingOwner) return null;
    if (target.owner === OWNER.DORMANT) return null;

    const existing = this.connections.find((c) => c.from === fromId && c.to === toId);
    if (existing) {
      this.disconnect(existing.id);
      return 'removed';
    }
    if (!source.canOpenConnection()) return 'full';

    const conn = new Connection(fromId, toId, actingOwner);
    this.connections.push(conn);
    source.outgoing.push(conn.id);
    return 'added';
  }

  disconnect(connId) {
    const conn = this.connections.find((c) => c.id === connId);
    if (!conn) return;
    const source = this.nodes.get(conn.from);
    if (source) source.buffer = Math.min(source.bufferMax, source.buffer + conn.inTransit);
    this.removeConnection(conn);
  }

  cutConnection(connId, t) {
    const conn = this.connections.find((c) => c.id === connId);
    if (!conn) return false;
    const clamped = Math.min(1, Math.max(0, t));
    const source = this.nodes.get(conn.from);
    const target = this.nodes.get(conn.to);
    const toSource = conn.inTransit * clamped;
    const toDest = conn.inTransit - toSource;

    if (source) source.buffer = Math.min(source.bufferMax, source.buffer + toSource);
    if (source && target && toDest > 0) this.deliver(source, target, toDest);

    this.pushEvent({ type: 'cut', fromId: conn.from, toId: conn.to, t: clamped });
    this.removeConnection(conn);
    return true;
  }

  removeConnection(conn) {
    const idx = this.connections.indexOf(conn);
    if (idx >= 0) this.connections.splice(idx, 1);
    const source = this.nodes.get(conn.from);
    if (source) {
      const oi = source.outgoing.indexOf(conn.id);
      if (oi >= 0) source.outgoing.splice(oi, 1);
    }
  }

  attemptClaimDormant(dormantId, actingOwner) {
    const dormantNode = this.nodes.get(dormantId);
    if (!dormantNode || dormantNode.owner !== OWNER.DORMANT) return false;
    let best = null;
    for (const n of this.nodes.values()) {
      if (n.owner === actingOwner && n.buffer >= DORMANT_CLAIM_COST) {
        if (!best || n.buffer > best.buffer) best = n;
      }
    }
    if (!best) return false;
    best.buffer -= DORMANT_CLAIM_COST;
    dormantNode.owner = actingOwner;
    dormantNode.dormant = false;
    dormantNode.buffer = DORMANT_INITIAL_BUFFER;
    dormantNode.recomputeStats();
    this.pushEvent({ type: 'claim', nodeId: dormantId, owner: actingOwner });
    return true;
  }

  // --- simulation ----------------------------------------------------

  tick(dt) {
    if (this.result) return;
    this.time += dt;

    for (const node of this.nodes.values()) node.tickGeneration(dt);
    // tier bonuses depend on current buffer, so keep them live for every
    // node (a big neutral/enemy node is tankier even before you own it)
    for (const node of this.nodes.values()) node.recomputeStats();

    this.computeAndApplyFlows(dt);

    for (const node of this.nodes.values()) node.tickCosmetics(dt);
    for (const conn of this.connections) {
      if (conn.collisionFlash > 0) conn.collisionFlash = Math.max(0, conn.collisionFlash - dt * 3);
    }

    if (this.traceEnabled) this.tickTrace(dt);
    this.tickObjective(dt);
    this.checkEndConditions();
  }

  computeAndApplyFlows(dt) {
    const pending = new Map();

    // pass 1: draw from each source into its pipe, work out how much each
    // pipe is trying to leak into its destination this tick
    for (const conn of this.connections) {
      const source = this.nodes.get(conn.from);
      if (!source || !source.isOwned()) {
        pending.set(conn.id, 0);
        conn.drawFlow = 0;
        continue;
      }
      const draw = Math.max(0, Math.min(source.channelShareOutput, dt > 0 ? source.buffer / dt : 0));
      source.buffer = Math.max(0, source.buffer - draw * dt);
      conn.inTransit += draw * dt;
      conn.drawFlow = draw;

      const travelTime = conn.travelTime(this.nodes);
      const leakRate = conn.inTransit / travelTime;
      pending.set(conn.id, Math.min(leakRate * dt, conn.inTransit));
    }

    // pass 2: opposing pipes between the same two nodes fight — both burn
    // their attempted delivery, only the difference gets through
    const resolved = new Set();
    for (const conn of this.connections) {
      if (resolved.has(conn.id)) continue;
      const opposite = this.connections.find(
        (c) => !resolved.has(c.id) && c.id !== conn.id && c.from === conn.to && c.to === conn.from
      );

      if (opposite) {
        const a = pending.get(conn.id) || 0;
        const b = pending.get(opposite.id) || 0;
        conn.inTransit = Math.max(0, conn.inTransit - a);
        opposite.inTransit = Math.max(0, opposite.inTransit - b);
        conn.deliverFlow = a;
        opposite.deliverFlow = b;
        conn.collisionRatio = a + b > 0 ? a / (a + b) : 0.5;
        opposite.collisionRatio = 1 - conn.collisionRatio;
        conn.collisionFlash = 1;
        opposite.collisionFlash = 1;

        const net = a - b;
        if (Math.abs(net) > 0.0001) {
          const winner = net > 0 ? conn : opposite;
          const source = this.nodes.get(winner.from);
          const target = this.nodes.get(winner.to);
          if (source && target) this.deliver(source, target, Math.abs(net));
        }
        resolved.add(conn.id);
        resolved.add(opposite.id);
      } else {
        const amount = pending.get(conn.id) || 0;
        conn.inTransit = Math.max(0, conn.inTransit - amount);
        conn.deliverFlow = amount;
        conn.collisionRatio = null;
        const source = this.nodes.get(conn.from);
        const target = this.nodes.get(conn.to);
        if (source && target && amount > 0) this.deliver(source, target, amount);
        resolved.add(conn.id);
      }
    }
  }

  deliver(sourceNode, targetNode, amount) {
    if (amount <= 0) return;
    if (targetNode.owner === sourceNode.owner) {
      targetNode.buffer = Math.min(targetNode.bufferMax, targetNode.buffer + amount);
      return;
    }
    const dmg = amount * targetNode.defenseMultiplier;
    targetNode.buffer -= dmg;

    if (sourceNode.owner === OWNER.PLAYER && this.traceEnabled) {
      this.trace = Math.min(TRACE_MAX, this.trace + dmg * TRACE_GAIN_PER_DAMAGE);
    }

    if (targetNode.buffer <= 0) {
      const prevOwner = targetNode.owner;
      // any pipes this node was pushing out are severed by the capture
      this.connections = this.connections.filter((c) => c.from !== targetNode.id);
      targetNode.resetOnCapture(sourceNode.owner);
      targetNode.powerMult = sourceNode.owner === OWNER.ENEMY ? this.aiPowerMult : 1;
      targetNode.recomputeStats();
      targetNode.buffer = 1;
      this.captureEvents.push({ nodeId: targetNode.id, from: prevOwner, to: sourceNode.owner });
      this.pushEvent({ type: 'capture', nodeId: targetNode.id, from: prevOwner, to: sourceNode.owner });
    }
  }

  tickTrace(dt) {
    this.trace = Math.max(0, this.trace - TRACE_DECAY_PER_SEC * dt);
    if (this.trace >= TRACE_MAX) {
      let biggest = null;
      for (const n of this.nodes.values()) {
        if (n.owner === OWNER.PLAYER && (!biggest || n.buffer > biggest.buffer)) biggest = n;
      }
      if (biggest) {
        biggest.buffer = Math.max(0, biggest.buffer * (1 - TRACE_ICE_BUFFER_LOSS));
        this.pushEvent({ type: 'trace-strike', nodeId: biggest.id });
        this.traceStrikeEvent = { nodeId: biggest.id, t: 1.2 };
      }
      this.trace = TRACE_RESET_TO;
    }
    if (this.traceStrikeEvent) {
      this.traceStrikeEvent.t -= dt;
      if (this.traceStrikeEvent.t <= 0) this.traceStrikeEvent = null;
    }
  }

  tickObjective(dt) {
    if (this.objective === 'conquest') return;
    const mf = this.mainframeId ? this.nodes.get(this.mainframeId) : null;
    if (!mf) return;
    const held = mf.owner === OWNER.PLAYER;

    if (this.objective === 'hold') {
      if (held) {
        this.holdProgress = Math.min(this.holdDuration, this.holdProgress + dt);
      } else {
        this.holdProgress = Math.max(0, this.holdProgress - dt * 1.5);
      }
    } else if (this.objective === 'exfil') {
      if (held) {
        this.exfilProgress = Math.min(
          this.exfilTarget,
          this.exfilProgress + (this.exfilTarget / this.holdDuration) * dt
        );
      }
    }
  }

  countOwned(owner) {
    let c = 0;
    for (const n of this.nodes.values()) if (n.owner === owner) c++;
    return c;
  }

  checkEndConditions() {
    const playerNodes = this.countOwned(OWNER.PLAYER);
    if (playerNodes === 0) {
      this.result = 'defeat';
      return;
    }

    if (this.objective === 'conquest') {
      // "capture everything" means the whole map, not just beating the enemy
      // operator — this also has to work on levels with no opponent at all.
      const neutralLeft = this.countOwned(OWNER.NEUTRAL);
      const enemyLeft = this.countOwned(OWNER.ENEMY);
      if (neutralLeft === 0 && enemyLeft === 0) this.result = 'victory';
    } else if (this.objective === 'hold') {
      if (this.holdProgress >= this.holdDuration) this.result = 'victory';
    } else if (this.objective === 'exfil') {
      if (this.exfilProgress >= this.exfilTarget) this.result = 'victory';
    }
  }
}
