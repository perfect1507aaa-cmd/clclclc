import { CFG, DX, DY } from './config.js';
import { SegmentGrid } from './grid.js';
import { FoodField } from './food.js';
import { Snake } from './snake.js';
import { rand } from './util.js';

export class World {
  constructor() {
    this.size = CFG.MAP;
    this.time = 0;
    this.snakes = [];
    this.ranked = [];
    this.feasts = []; // fresh remains that draw greedy players in: {pts, value, t, killer}
    this.nextId = 1;
    this.events = [];
    this.grid = new SegmentGrid(this.size, CFG.SEG_CELL);
    this.food = new FoodField(this.size);
    this.food.spawnAmbient(CFG.FOOD_TARGET);
    this._q = [];
    this._fq = [];
    this._rankTimer = 0;
  }

  // ---------- spawning ----------

  findSpawn() {
    const m = 450;
    let best = null;
    let bestScore = -1;
    for (let i = 0; i < 40; i++) {
      const x = rand(m, this.size - m);
      const y = rand(m, this.size - m);
      const clear = this.clearance(x, y, 420);
      if (clear >= 420) return { x, y };
      if (clear > bestScore) {
        bestScore = clear;
        best = { x, y };
      }
    }
    return best;
  }

  // Distance from (x, y) to the nearest body or head within `limit`.
  clearance(x, y, limit) {
    const g = this.grid;
    g.query(x - limit, y - limit, x + limit, y + limit, this._q);
    let best = limit;
    for (const k of this._q) {
      const d = distToSeg(x, y, g.x1[k], g.y1[k], g.x2[k], g.y2[k]) - g.hw[k];
      if (d < best) best = d;
    }
    for (const s of this.snakes) {
      const h = s.head;
      const d = Math.hypot(h.x - x, h.y - y) - 60;
      if (d < best) best = d;
    }
    return Math.max(0, best);
  }

  addSnake(opts) {
    const p = opts.x !== undefined ? opts : this.findSpawn();
    let dir = 0;
    let bestFree = -1;
    const cx = this.size / 2 - p.x;
    const cy = this.size / 2 - p.y;
    for (let d = 0; d < 4; d++) {
      // prefer open space, loosely biased toward the map centre
      const free = this.rayFree(null, p.x, p.y, d, 900, 10) + (DX[d] * cx + DY[d] * cy) * 0.05 + rand(120);
      if (free > bestFree) {
        bestFree = free;
        dir = d;
      }
    }
    const s = new Snake({ ...opts, id: this.nextId++, x: p.x, y: p.y, dir, time: this.time });
    this.snakes.push(s);
    return s;
  }

  // Removes a snake without a killer (disconnect). Its body still turns into food.
  removeSnake(s) {
    if (!s.alive) return;
    s.alive = false;
    this.food.dropBody(s);
    this.addFeast(s, null);
    this.events.push({ type: 'leave', snake: s });
  }

  kill(s, killer, reason) {
    if (!s.alive) return;
    s.alive = false;
    this.food.dropBody(s);
    this.addFeast(s, killer && killer !== s ? killer : null);
    if (killer && killer !== s) killer.kills++;
    this.events.push({ type: 'death', snake: s, killer: killer && killer !== s ? killer : null, reason });
  }

  addFeast(s, killer) {
    const value = s.score * CFG.DEATH_DROP;
    if (value < 25) return;
    const pts = [];
    s.sampleBody(Math.max(120, s.curLen / 6), (x, y) => {
      if (pts.length < 8) pts.push({ x, y });
    });
    this.feasts.push({ pts, value, t: this.time, killer, victim: s });
  }

  // ---------- queries ----------

  // Free distance from (x, y) moving in direction d, treating bodies (and the
  // border) as boxes inflated by their half width plus `pad`.
  rayFree(self, x, y, d, maxDist, pad, extra) {
    const dx = DX[d];
    const dy = DY[d];
    let best = dx > 0 ? this.size - x : dx < 0 ? x : dy > 0 ? this.size - y : y;
    best -= pad;
    if (best < 0) best = 0;
    if (best > maxDist) best = maxDist;

    let minx, maxx, miny, maxy;
    if (dx !== 0) {
      miny = y - pad;
      maxy = y + pad;
      minx = dx > 0 ? x : x - best;
      maxx = dx > 0 ? x + best : x;
    } else {
      minx = x - pad;
      maxx = x + pad;
      miny = dy > 0 ? y : y - best;
      maxy = dy > 0 ? y + best : y;
    }
    const g = this.grid;
    const skipFrom = self ? self.pts.length - 3 : 1e9;
    g.query(minx, miny, maxx, maxy, this._q);
    for (const k of this._q) {
      if (g.owner[k] === self && g.idx[k] >= skipFrom) continue;
      const hw = g.hw[k];
      const d2 = hitDistance(x, y, dx, dy, pad,
        Math.min(g.x1[k], g.x2[k]) - hw, Math.min(g.y1[k], g.y2[k]) - hw,
        Math.max(g.x1[k], g.x2[k]) + hw, Math.max(g.y1[k], g.y2[k]) + hw);
      if (d2 < best) best = d2;
    }
    if (extra) {
      for (const e of extra) {
        const d2 = hitDistance(x, y, dx, dy, pad,
          Math.min(e[0], e[2]) - e[4], Math.min(e[1], e[3]) - e[4],
          Math.max(e[0], e[2]) + e[4], Math.max(e[1], e[3]) + e[4]);
        if (d2 < best) best = d2;
      }
    }
    return best < 0 ? 0 : best;
  }

  snakesNear(x, y, r, out = []) {
    out.length = 0;
    for (const s of this.snakes) {
      if (!s.alive) continue;
      const h = s.head;
      if (Math.abs(h.x - x) < r && Math.abs(h.y - y) < r) out.push(s);
    }
    return out;
  }

  get king() {
    return this.ranked[0] || null;
  }

  rankOf(s) {
    return this.ranked.indexOf(s) + 1;
  }

  // ---------- simulation ----------

  step(dt) {
    this.time += dt;
    const snakes = this.snakes;

    for (const s of snakes) if (s.alive && s.brain) s.brain.update(dt);

    for (const s of snakes) {
      if (!s.alive) continue;
      this.updateCharge(s, dt);
      s.step(dt);
    }

    this.rebuildGrid();

    for (const s of snakes) {
      if (!s.alive) continue;
      const hit = this.collide(s);
      if (hit) s._hit = hit;
    }
    for (const s of snakes) {
      if (s._hit) {
        const hit = s._hit;
        s._hit = null;
        this.kill(s, hit === 'wall' ? null : hit, hit === 'wall' ? 'wall' : hit === s ? 'self' : 'snake');
      }
    }

    this.food.update(dt);
    this.food.rebuildGrid();
    for (const s of snakes) if (s.alive) this.eat(s, dt);
    this.food.compact();

    // drop dead snakes from the active list
    let w = 0;
    for (const s of snakes) if (s.alive) snakes[w++] = s;
    snakes.length = w;

    this._rankTimer -= dt;
    if (this._rankTimer <= 0) {
      this._rankTimer = 0.25;
      if (this.feasts.length) this.feasts = this.feasts.filter((f) => this.time - f.t < 25);
      this.ranked = snakes.slice().sort((a, b) => b.score - a.score);
      for (let i = 0; i < this.ranked.length; i++) {
        const s = this.ranked[i];
        if (i + 1 < s.bestRank) s.bestRank = i + 1;
      }
    }
  }

  rebuildGrid() {
    const g = this.grid;
    g.clear();
    for (const s of this.snakes) {
      if (!s.alive) continue;
      const hw = s.w / 2;
      const pts = s.pts;
      for (let i = 0; i < pts.length - 1; i++) {
        g.add(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, hw, s, i);
      }
    }
  }

  updateCharge(s, dt) {
    const h = s.head;
    const reach = CFG.CHARGE_RANGE;
    const R = reach + s.w / 2 + 12;
    const g = this.grid;
    g.query(h.x - R - 30, h.y - R - 30, h.x + R + 30, h.y + R + 30, this._q);
    let best = Infinity;
    let nx = 0;
    let ny = 0;
    for (const k of this._q) {
      const o = g.owner[k];
      if (o === s || !o.alive) continue;
      const x1 = Math.min(g.x1[k], g.x2[k]);
      const x2 = Math.max(g.x1[k], g.x2[k]);
      const y1 = Math.min(g.y1[k], g.y2[k]);
      const y2 = Math.max(g.y1[k], g.y2[k]);
      const px = h.x < x1 ? x1 : h.x > x2 ? x2 : h.x;
      const py = h.y < y1 ? y1 : h.y > y2 ? y2 : h.y;
      const d = Math.hypot(h.x - px, h.y - py) - g.hw[k] - s.w / 2;
      if (d < best) {
        best = d;
        nx = px;
        ny = py;
      }
    }
    if (best < reach) {
      const k = 1 - Math.max(0, best) / reach;
      s.charge += k * k * CFG.CHARGE_GAIN * dt;
      s.spark = { x: nx, y: ny, k };
    } else {
      s.spark = null;
    }
    s.charge -= CFG.CHARGE_DECAY * dt;
    if (s.charge < 0) s.charge = 0;
    else if (s.charge > 1) s.charge = 1;
    s.speed = CFG.BASE_SPEED * (1 + CFG.MAX_BOOST * s.charge);
  }

  // Returns the snake that was hit, 'wall', or null.
  collide(s) {
    const h = s.head;
    if (h.x < 0 || h.y < 0 || h.x > this.size || h.y > this.size) return 'wall';
    const r = s.w * 0.32;
    const minx = Math.min(s.prevX, h.x) - r;
    const maxx = Math.max(s.prevX, h.x) + r;
    const miny = Math.min(s.prevY, h.y) - r;
    const maxy = Math.max(s.prevY, h.y) + r;
    const g = this.grid;
    const skipFrom = s.pts.length - 3;
    g.query(minx, miny, maxx, maxy, this._q);
    for (const k of this._q) {
      const o = g.owner[k];
      if (o === s && g.idx[k] >= skipFrom) continue;
      const hw = g.hw[k];
      if (Math.max(g.x1[k], g.x2[k]) + hw < minx) continue;
      if (Math.min(g.x1[k], g.x2[k]) - hw > maxx) continue;
      if (Math.max(g.y1[k], g.y2[k]) + hw < miny) continue;
      if (Math.min(g.y1[k], g.y2[k]) - hw > maxy) continue;
      return o;
    }
    return null;
  }

  eat(s, dt) {
    const h = s.head;
    const mag = 40 + s.w * 2.5;
    const eatR = s.w * 0.6 + 5;
    const pull = (220 + s.speed) * dt;
    this.food.grid.query(h.x - mag, h.y - mag, h.x + mag, h.y + mag, this._fq);
    for (const f of this._fq) {
      if (f.dead) continue;
      const dx = h.x - f.x;
      const dy = h.y - f.y;
      const d2 = dx * dx + dy * dy;
      const er = eatR + f.r;
      if (d2 < er * er) {
        f.dead = true;
        s.addScore(f.v);
        if (s.isPlayer) this.events.push({ type: 'eat', snake: s, food: f });
      } else if (d2 < mag * mag) {
        const d = Math.sqrt(d2);
        const m = Math.min(d, pull);
        f.x += (dx / d) * m;
        f.y += (dy / d) * m;
      }
    }
  }
}

function distToSeg(x, y, x1, y1, x2, y2) {
  const ax = Math.min(x1, x2);
  const bx = Math.max(x1, x2);
  const ay = Math.min(y1, y2);
  const by = Math.max(y1, y2);
  const px = x < ax ? ax : x > bx ? bx : x;
  const py = y < ay ? ay : y > by ? by : y;
  return Math.hypot(x - px, y - py);
}

// Distance along an axis-aligned ray (with half-thickness pad) to a box, or Infinity.
function hitDistance(x, y, dx, dy, pad, minx, miny, maxx, maxy) {
  if (dx !== 0) {
    if (maxy < y - pad || miny > y + pad) return Infinity;
    if (dx > 0) return maxx < x ? Infinity : minx - x;
    return minx > x ? Infinity : x - maxx;
  }
  if (maxx < x - pad || minx > x + pad) return Infinity;
  if (dy > 0) return maxy < y ? Infinity : miny - y;
  return miny > y ? Infinity : y - maxy;
}
