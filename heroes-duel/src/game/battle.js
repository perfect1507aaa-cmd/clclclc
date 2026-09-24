// Battle rules: grid occupancy, movement, the ATB initiative timeline and damage.
import { GRID } from '../data/duel.js';
import { CREATURES, has } from '../data/haven.js';

export const RANGE_PENALTY_DIST = 6; // shooters deal half damage beyond this distance
export const DEFEND_BONUS = 1.3; // "Defend" raises defense by 30% until the unit's next turn
export const WAIT_ATB = 0.5; // "Wait" puts the unit halfway along the ATB bar
const EPS = 1e-6;

let nextUid = 1;

export function makeUnit(side, id, count, col, row) {
  const def = CREATURES[id];
  return {
    uid: nextUid++,
    side,
    id,
    def,
    count,
    topHp: def.hp,
    col,
    row,
    size: has(def, 'large') ? 2 : 1,
    atb: 0,
    retaliated: false,
    defending: false,
    waited: false,
    shots: def.shots,
    alive: true,
  };
}

export const key = (c, r) => `${c},${r}`;

export function rect(u, col = u.col, row = u.row) {
  return { c0: col, c1: col + u.size - 1, r0: row, r1: row + u.size - 1 };
}

// Chebyshev gap between two rectangles: 0 = overlap, 1 = touching (incl. diagonal).
export function rectGap(a, b) {
  const dx = Math.max(0, b.c0 - a.c1, a.c0 - b.c1);
  const dy = Math.max(0, b.r0 - a.r1, a.r0 - b.r1);
  return Math.max(dx, dy);
}

export function center(u, col = u.col, row = u.row) {
  return { x: col + (u.size - 1) / 2, y: row + (u.size - 1) / 2 };
}

export function totalHp(u) {
  return u.count > 0 ? (u.count - 1) * u.def.hp + u.topHp : 0;
}

export class Battle {
  constructor(units, obstacles, rand = Math.random) {
    this.units = units;
    this.obstacles = new Set(obstacles.map((o) => key(o.col, o.row)));
    this.rand = rand;
    this.time = 0;
    this.active = null;
    // Everyone starts slightly scattered along the first quarter of the ATB bar.
    for (const u of units) u.atb = rand() * 0.25;
  }

  get round() {
    return Math.floor(this.time + EPS) + 1;
  }

  alive(side) {
    return this.units.filter((u) => u.alive && (!side || u.side === side));
  }

  enemiesOf(u) {
    return this.units.filter((e) => e.alive && e.side !== u.side);
  }

  winner() {
    const l = this.alive('left').length;
    const r = this.alive('right').length;
    if (l && r) return null;
    return l ? 'left' : r ? 'right' : 'draw';
  }

  unitAt(col, row) {
    for (const u of this.units) {
      if (!u.alive) continue;
      if (col >= u.col && col < u.col + u.size && row >= u.row && row < u.row + u.size) return u;
    }
    return null;
  }

  inside(col, row, size = 1) {
    return col >= 0 && row >= 0 && col + size <= GRID.cols && row + size <= GRID.rows;
  }

  canStand(u, col, row) {
    if (!this.inside(col, row, u.size)) return false;
    for (let dc = 0; dc < u.size; dc++) {
      for (let dr = 0; dr < u.size; dr++) {
        if (this.obstacles.has(key(col + dc, row + dr))) return false;
        const o = this.unitAt(col + dc, row + dr);
        if (o && o !== u) return false;
      }
    }
    return true;
  }

  // Dijkstra over anchor positions with 8-way moves (diagonal costs √2).
  // Walkers need free ground for every step; flyers only need a free landing spot.
  reachable(u) {
    const fly = has(u.def, 'flyer');
    const speed = u.def.speed;
    const nodes = new Map();
    const start = { col: u.col, row: u.row, cost: 0, steps: 0, prev: null };
    nodes.set(key(u.col, u.row), start);
    const open = [start];
    const passable = (c, r) => (fly ? this.inside(c, r, u.size) : this.canStand(u, c, r));
    while (open.length) {
      open.sort((a, b) => a.cost - b.cost);
      const n = open.shift();
      if (n.done) continue;
      n.done = true;
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          if (!dc && !dr) continue;
          const c = n.col + dc, r = n.row + dr;
          const diag = dc && dr;
          const cost = n.cost + (diag ? Math.SQRT2 : 1);
          if (cost > speed + EPS || !passable(c, r)) continue;
          if (diag && !fly && !(this.canStand(u, n.col + dc, n.row) && this.canStand(u, n.col, n.row + dr))) continue;
          const k = key(c, r);
          const old = nodes.get(k);
          if (old && old.cost <= cost + EPS) continue;
          const node = { col: c, row: r, cost, steps: n.steps + 1, prev: n };
          nodes.set(k, node);
          open.push(node);
        }
      }
    }
    if (fly) for (const [k, n] of nodes) if (!this.canStand(u, n.col, n.row)) nodes.delete(k);
    return nodes;
  }

  static path(node) {
    const out = [];
    for (let n = node; n && n.prev; n = n.prev) out.unshift({ col: n.col, row: n.row });
    return out;
  }

  adjacentEnemies(u, col = u.col, row = u.row) {
    const me = rect(u, col, row);
    return this.enemiesOf(u).filter((e) => rectGap(me, rect(e)) === 1);
  }

  canShoot(u) {
    return has(u.def, 'shooter') && u.shots > 0 && this.adjacentEnemies(u).length === 0;
  }

  // Reachable positions from which `u` can strike `target` in melee.
  meleeOptions(u, target, reach = this.reachable(u)) {
    const t = rect(target);
    const out = [];
    for (const n of reach.values()) if (rectGap(rect(u, n.col, n.row), t) === 1) out.push(n);
    return out;
  }

  distance(a, b) {
    const p = center(a), q = center(b);
    return Math.hypot(p.x - q.x, p.y - q.y);
  }

  // Attack/defense ratio and situational multipliers.
  multiplier(att, target, { ranged, moved = 0 }) {
    const A = att.def.attack;
    const D = target.def.defense * (target.defending ? DEFEND_BONUS : 1);
    let m = A >= D ? 1 + 0.05 * (A - D) : 1 / (1 + 0.05 * (D - A));
    if (ranged) {
      if (this.distance(att, target) > RANGE_PENALTY_DIST) m *= 0.5;
      if (has(target.def, 'large_shield')) m *= 0.5;
    } else {
      if (has(att.def, 'shooter') && !has(att.def, 'no_melee_penalty')) m *= 0.5;
      if (has(att.def, 'jousting')) m *= 1 + 0.05 * moved;
    }
    return m;
  }

  // Base damage: one roll per creature up to 10; bigger stacks scale 10 rolls.
  baseRoll(att) {
    const [lo, hi] = att.def.dmg;
    const n = Math.min(att.count, 10);
    let sum = 0;
    for (let i = 0; i < n; i++) sum += lo + Math.floor(this.rand() * (hi - lo + 1));
    return (sum * att.count) / n;
  }

  damageRange(att, target, opts) {
    const m = this.multiplier(att, target, opts);
    const [lo, hi] = att.def.dmg;
    const min = Math.max(1, Math.floor(att.count * lo * m));
    const max = Math.max(1, Math.floor(att.count * hi * m));
    return { min, max, killsMin: this.killsFor(target, min), killsMax: this.killsFor(target, max) };
  }

  killsFor(target, dmg) {
    const left = totalHp(target) - dmg;
    if (left <= 0) return target.count;
    return target.count - Math.ceil(left / target.def.hp);
  }

  applyDamage(target, dmg) {
    const before = target.count;
    const left = totalHp(target) - dmg;
    if (left <= 0) {
      target.count = 0;
      target.topHp = 0;
      target.alive = false;
    } else {
      target.count = Math.ceil(left / target.def.hp);
      target.topHp = left - (target.count - 1) * target.def.hp;
    }
    return before - target.count;
  }

  strike(att, target, opts) {
    const dmg = Math.max(1, Math.floor(this.baseRoll(att) * this.multiplier(att, target, opts)));
    const kills = this.applyDamage(target, dmg);
    if (opts.ranged) att.shots--;
    return { attacker: att, target, dmg, kills, died: !target.alive };
  }

  canRetaliate(defender) {
    return defender.alive && (has(defender.def, 'unlimited_retaliation') || !defender.retaliated);
  }

  // ── ATB timeline ──
  // A unit's turn comes when its ATB reaches 1; it advances by initiative/10 per unit of time.
  next() {
    let best = null, bestDt = Infinity;
    for (const u of this.alive()) {
      const dt = (1 - u.atb) / (u.def.initiative / 10);
      if (dt < bestDt - EPS || (Math.abs(dt - bestDt) <= EPS && tieBreak(u, best) < 0)) {
        best = u;
        bestDt = dt;
      }
    }
    bestDt = Math.max(0, bestDt);
    for (const u of this.alive()) u.atb += bestDt * (u.def.initiative / 10);
    this.time += bestDt;
    best.atb = 1;
    best.retaliated = false;
    best.defending = false;
    this.active = best;
    return best;
  }

  endTurn(u, { wait = false, defend = false } = {}) {
    if (wait) {
      u.atb = WAIT_ATB;
      u.waited = true;
    } else {
      u.atb = 0;
      u.waited = false;
    }
    u.defending = defend;
    this.active = null;
  }

  // Upcoming turn order, assuming the active unit ends its turn normally.
  forecast(n = 14) {
    const sim = this.alive().map((u) => ({ u, atb: u === this.active ? 1 : u.atb }));
    const out = [];
    let time = this.time;
    while (out.length < n && sim.length) {
      let best = null, bestDt = Infinity;
      for (const s of sim) {
        const dt = (1 - s.atb) / (s.u.def.initiative / 10);
        if (dt < bestDt - EPS || (Math.abs(dt - bestDt) <= EPS && tieBreak(s.u, best?.u) < 0)) {
          best = s;
          bestDt = dt;
        }
      }
      bestDt = Math.max(0, bestDt);
      for (const s of sim) s.atb += bestDt * (s.u.def.initiative / 10);
      time += bestDt;
      out.push({ unit: best.u, round: Math.floor(time + EPS) + 1 });
      best.atb = 0;
    }
    return out;
  }
}

function tieBreak(a, b) {
  if (!b) return -1;
  if (a.atb !== b.atb) return b.atb - a.atb;
  if (a.side !== b.side) return a.side === 'left' ? -1 : 1;
  return a.uid - b.uid;
}
