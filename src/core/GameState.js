import { Node } from './Node.js';
import { Edge } from './Edge.js';
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
    this.edges = [];
    this.adjacency = new Map(); // nodeId -> [edge,...]

    for (const n of level.nodes) {
      const node = new Node(n);
      this.nodes.set(node.id, node);
      this.adjacency.set(node.id, []);
    }
    level.edges.forEach(([a, b, opts], i) => {
      const edge = new Edge(`e${i}`, a, b, opts || {});
      this.edges.push(edge);
      this.adjacency.get(a).push(edge);
      this.adjacency.get(b).push(edge);
    });

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

  neighborsOf(nodeId) {
    return this.adjacency.get(nodeId).map((e) => this.nodes.get(e.other(nodeId)));
  }

  pushEvent(evt) {
    this.events.push(evt);
  }

  drainEvents() {
    const evts = this.events;
    this.events = [];
    return evts;
  }

  // --- player/AI actions -------------------------------------------------

  toggleChannel(sourceId, targetId, actingOwner) {
    const source = this.nodes.get(sourceId);
    const target = this.nodes.get(targetId);
    if (!source || !target) return null;
    if (source.owner !== actingOwner) return null;
    if (target.owner === OWNER.DORMANT) return null;
    const edge = this.adjacency.get(sourceId).find((e) => e.connects(targetId));
    if (!edge || edge.dashed) return null;
    return source.toggleChannel(targetId);
  }

  attemptUpgrade(nodeId, branch, actingOwner) {
    const node = this.nodes.get(nodeId);
    if (!node || node.owner !== actingOwner) return false;
    return node.applyUpgrade(branch);
  }

  attemptClaimDormant(dormantId, actingOwner) {
    const dormantNode = this.nodes.get(dormantId);
    if (!dormantNode || dormantNode.owner !== OWNER.DORMANT) return false;
    const neighborEdges = this.adjacency.get(dormantId);
    let best = null;
    for (const e of neighborEdges) {
      const n = this.nodes.get(e.other(dormantId));
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

    this.computeAndApplyFlows(dt);

    for (const node of this.nodes.values()) node.tickCosmetics(dt);
    for (const edge of this.edges) edge.tickCosmetics(dt);

    if (this.traceEnabled) this.tickTrace(dt);
    this.tickObjective(dt);
    this.checkEndConditions();
  }

  computeAndApplyFlows(dt) {
    for (const edge of this.edges) {
      edge.flowAB = 0;
      edge.flowBA = 0;
      edge.collision = null;
      if (edge.dashed) continue;

      const nodeA = this.nodes.get(edge.a);
      const nodeB = this.nodes.get(edge.b);
      const bandwidth = edge.bandwidth(this.nodes);

      const rawAB = this.rawFlow(nodeA, edge.b, bandwidth, dt);
      const rawBA = this.rawFlow(nodeB, edge.a, bandwidth, dt);

      // sunk cost: senders burn their own raw rate from buffer regardless of outcome
      if (rawAB > 0) nodeA.buffer = Math.max(0, nodeA.buffer - rawAB * dt);
      if (rawBA > 0) nodeB.buffer = Math.max(0, nodeB.buffer - rawBA * dt);

      edge.flowAB = rawAB;
      edge.flowBA = rawBA;

      if (rawAB > 0 && rawBA > 0) {
        const total = rawAB + rawBA;
        const ratio = 0.5 + 0.5 * ((rawAB - rawBA) / total);
        edge.collision = { ratio: Math.min(0.96, Math.max(0.04, ratio)) };
        edge.collisionFlash = 1;
        const net = rawAB - rawBA;
        if (net > 0.0001) {
          this.deliver(nodeA, nodeB, net * dt);
        } else if (net < -0.0001) {
          this.deliver(nodeB, nodeA, -net * dt);
        }
      } else if (rawAB > 0) {
        this.deliver(nodeA, nodeB, rawAB * dt);
      } else if (rawBA > 0) {
        this.deliver(nodeB, nodeA, rawBA * dt);
      }
    }
  }

  rawFlow(sourceNode, targetId, bandwidth, dt) {
    if (!sourceNode.isOwned()) return 0;
    if (!sourceNode.hasChannelTo(targetId)) return 0;
    const desired = sourceNode.channelShareOutput;
    const bufferCap = dt > 0 ? sourceNode.buffer / dt : 0;
    return Math.max(0, Math.min(desired, bandwidth, bufferCap));
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
      targetNode.resetOnCapture(sourceNode.owner);
      targetNode.powerMult = sourceNode.owner === OWNER.ENEMY ? this.aiPowerMult : 1;
      targetNode.recomputeStats();
      targetNode.buffer = 1;
      this.captureEvents.push({ nodeId: targetNode.id, from: prevOwner, to: sourceNode.owner });
      this.pushEvent({ type: 'capture', nodeId: targetNode.id, from: prevOwner, to: sourceNode.owner });
      // drop any outstanding channels elsewhere pointed with stale assumptions is unnecessary;
      // flow calc re-reads live owner each tick.
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
