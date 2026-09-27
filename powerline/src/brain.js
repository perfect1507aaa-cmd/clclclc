import { CFG, DX, DY, turnLeft, turnRight } from './config.js';
import { rand, randInt, chance, lerp, pick } from './util.js';

// Behaviour archetypes. Ranges are sampled per bot so no two play the same.
export const ARCHETYPES = {
  newbie: { skill: [0.03, 0.3], aggression: [0, 0.2], greed: [0.6, 1], hugger: [0, 0.15], caution: [0, 0.4], lives: [1, 3], chatty: [0.05, 0.5], toxic: 0.15 },
  casual: { skill: [0.3, 0.6], aggression: [0.1, 0.45], greed: [0.5, 0.9], hugger: [0.1, 0.45], caution: [0.2, 0.6], lives: [2, 5], chatty: [0.1, 0.6], toxic: 0.3 },
  farmer: { skill: [0.45, 0.72], aggression: [0, 0.12], greed: [0.85, 1], hugger: [0.2, 0.5], caution: [0.6, 1], lives: [2, 6], chatty: [0, 0.3], toxic: 0.05 },
  hunter: { skill: [0.6, 0.86], aggression: [0.6, 0.95], greed: [0.3, 0.6], hugger: [0.5, 0.85], caution: [0.1, 0.5], lives: [3, 8], chatty: [0.3, 0.9], toxic: 0.6 },
  pro: { skill: [0.85, 1], aggression: [0.45, 0.9], greed: [0.5, 0.8], hugger: [0.8, 1], caution: [0.3, 0.7], lives: [4, 12], chatty: [0.1, 0.6], toxic: 0.35 },
};

export function pickArchetype() {
  const r = Math.random();
  if (r < 0.3) return 'newbie';
  if (r < 0.65) return 'casual';
  if (r < 0.77) return 'farmer';
  if (r < 0.92) return 'hunter';
  return 'pro';
}

export function makePersona(type) {
  const a = ARCHETYPES[type];
  const base = rand(...a.skill);
  const p = {
    type,
    base, // the player's "true" skill
    form: -rand(0.02, 0.08), // current form: cold at the start of a session
    aggression: rand(...a.aggression),
    greed: rand(...a.greed),
    hugger: rand(...a.hugger),
    caution: rand(...a.caution),
    chatty: rand(...a.chatty),
    toxic: chance(a.toxic),
    lives: randInt(...a.lives),
    reflex: rand(0.8, 1.25), // individual reaction speed quirk
    stair: rand(0.4, 2.5),
  };
  derive(p);
  return p;
}

// Recomputes skill-dependent parameters from base skill and current form.
export function derive(p) {
  const skill = Math.max(0.02, Math.min(1, p.base + p.form));
  p.skill = skill;
  p.think = lerp(0.22, 0.05, skill) * p.reflex;
  p.react = lerp(0.3, 0.06, skill) * p.reflex;
  p.look = 130 + 700 * skill;
  p.mistake = (1 - skill) ** 3 * 0.25;
  p.zig = (1 - skill) * 0.06;
}

// Form drifts with results: warming up, tilting after deaths, confidence after kills.
export function adjustForm(p, event) {
  if (event === 'spawn') p.form = Math.min(0.03, p.form + 0.025);
  else if (event === 'death') p.form -= rand(0.01, 0.04);
  else if (event === 'kill') p.form += 0.012;
  p.form = Math.max(-0.15, Math.min(0.06, p.form));
  derive(p);
}

const RN = 40; // local raster is RN x RN cells centred on the head
const rBlocked = new Uint8Array(RN * RN);
const rSeen = new Uint8Array(RN * RN);
const rQueue = new Int16Array(RN * RN);
const _segQ = [];

export class Brain {
  constructor(world, snake, persona) {
    this.w = world;
    this.s = snake;
    this.p = persona;
    const now = world.time;
    this.pending = []; // delayed reactions: {at, dir}
    this.plan = []; // precise manoeuvres: {dir, after} (after = distance since last turn)
    this.nextThink = now + rand(persona.think);
    this.fartUntil = 0;
    // some players take a moment to grab the keyboard after spawning
    this.afkUntil = now + (chance((1 - persona.skill) * 0.35) ? rand(0.6, 3.2) : rand(0.05, 0.3));
    this.target = null;
    this.targetUntil = 0;
    this.cutCooldown = now + rand(2, 5);
    this.hugCooldown = now + rand(1, 3);
    this._near = [];
    this._fq = [];
    this._preds = [];
    this.lastRot = 0;
    this.rotRun = 0;
    this.scanAt = 0;
  }

  update(dt) {
    const now = this.w.time;
    const s = this.s;
    while (this.pending.length && this.pending[0].at <= now) s.queueTurn(this.pending.shift().dir);

    if (this.plan.length && s.turnQueue.length === 0 && s.sinceTurn >= this.plan[0].after) {
      const step = this.plan.shift();
      // a manoeuvre still gets a glance before committing to it
      const h = s.head;
      const need = s.speed * 0.3 + s.minTurnGap + s.w;
      const free = this.w.rayFree(s, h.x, h.y, step.dir, need + 1, s.w / 2 + 2, null);
      if (free < need || !s.queueTurn(step.dir)) this.plan.length = 0;
    }

    if (now < this.afkUntil) return;
    if (now > this.fartUntil && chance(this.p.mistake * dt)) this.fartUntil = now + rand(0.2, 1.1) * (1.15 - this.p.skill);
    if (now >= this.nextThink) {
      this.nextThink = now + this.p.think * rand(0.7, 1.3);
      this.think(now);
    }
  }

  // `why` is only recorded when a debug log is attached (see tools/ascii.mjs).
  turn(dir, now, urgent, why) {
    if (this.log) this.log.push(`${now.toFixed(2)} ${why} ${dir}`);
    const rot = dir === turnRight(this.s.plannedDir) ? 1 : -1;
    this.rotRun = rot === this.lastRot ? this.rotRun + 1 : 1;
    this.lastRot = rot;
    const delay = this.p.react * (urgent ? rand(0.6, 1.1) : rand(0.8, 1.6));
    this.pending.push({ at: now + delay, dir, urgent });
  }

  // Short segments where nearby heads will be soon; skilled players respect them.
  predictions() {
    const s = this.s;
    const h = s.head;
    const out = this._preds;
    out.length = 0;
    const t = 0.35 + this.p.skill * 0.45;
    for (const o of this.w.snakesNear(h.x, h.y, 650, this._near)) {
      if (o === s) continue;
      const oh = o.head;
      const len = o.speed * t;
      out.push([oh.x, oh.y, oh.x + DX[o.dir] * len, oh.y + DY[o.dir] * len, o.w / 2 + 4]);
    }
    return out;
  }

  // Rasterise obstacles around the head so we can measure reachable space.
  buildRaster(preds) {
    const s = this.s;
    const h = s.head;
    const cell = Math.max(12, Math.min(26, s.w * 1.2));
    const ox = h.x - (RN / 2) * cell;
    const oy = h.y - (RN / 2) * cell;
    rBlocked.fill(0);
    const mark = (minx, miny, maxx, maxy) => {
      const ax = Math.max(0, Math.ceil((minx - ox) / cell - 0.5));
      const bx = Math.min(RN - 1, Math.floor((maxx - ox) / cell - 0.5));
      const ay = Math.max(0, Math.ceil((miny - oy) / cell - 0.5));
      const by = Math.min(RN - 1, Math.floor((maxy - oy) / cell - 0.5));
      for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) rBlocked[y * RN + x] = 1;
    };
    const me = s.w / 2 + 1;
    const size = this.w.size;
    mark(-1e9, -1e9, 0 + me, 1e9);
    mark(size - me, -1e9, 1e9, 1e9);
    mark(-1e9, -1e9, 1e9, me);
    mark(-1e9, size - me, 1e9, 1e9);
    const g = this.w.grid;
    const span = (RN / 2) * cell;
    g.query(h.x - span, h.y - span, h.x + span, h.y + span, _segQ);
    const skipFrom = s.pts.length - 2; // our current segment runs through the head cell
    for (const k of _segQ) {
      if (g.owner[k] === s && g.idx[k] >= skipFrom) continue;
      const e = g.hw[k] + me;
      mark(Math.min(g.x1[k], g.x2[k]) - e, Math.min(g.y1[k], g.y2[k]) - e, Math.max(g.x1[k], g.x2[k]) + e, Math.max(g.y1[k], g.y2[k]) + e);
    }
    if (preds) {
      for (const p of preds) {
        const e = p[4] + me;
        mark(Math.min(p[0], p[2]) - e, Math.min(p[1], p[3]) - e, Math.max(p[0], p[2]) + e, Math.max(p[1], p[3]) + e);
      }
    }
    this._raster = { ox, oy, cell, stamp: this.w.time };
  }

  // Number of reachable cells when leaving the head in direction `dir`.
  flood(dir, free = Infinity) {
    const s = this.s;
    const r = this._raster;
    const h = s.head;
    const off = s.minTurnGap + r.cell;
    if (free < off) return 0; // the start cell would be behind an obstacle
    const sx = Math.floor((h.x + DX[dir] * off - r.ox) / r.cell);
    const sy = Math.floor((h.y + DY[dir] * off - r.oy) / r.cell);
    if (sx < 0 || sy < 0 || sx >= RN || sy >= RN) return 0;
    const start = sy * RN + sx;
    if (rBlocked[start]) return 0;
    rSeen.fill(0);
    let qh = 0;
    let qt = 0;
    rQueue[qt++] = start;
    rSeen[start] = 1;
    // the cells right behind the head are unreachable for this move
    const hx = Math.floor((h.x - r.ox) / r.cell);
    const hy = Math.floor((h.y - r.oy) / r.cell);
    if (hx >= 0 && hy >= 0 && hx < RN && hy < RN) rSeen[hy * RN + hx] = 1;
    while (qh < qt) {
      const c = rQueue[qh++];
      const x = c % RN;
      const y = (c - x) / RN;
      if (x > 0 && !rSeen[c - 1] && !rBlocked[c - 1]) { rSeen[c - 1] = 1; rQueue[qt++] = c - 1; }
      if (x < RN - 1 && !rSeen[c + 1] && !rBlocked[c + 1]) { rSeen[c + 1] = 1; rQueue[qt++] = c + 1; }
      if (y > 0 && !rSeen[c - RN] && !rBlocked[c - RN]) { rSeen[c - RN] = 1; rQueue[qt++] = c - RN; }
      if (y < RN - 1 && !rSeen[c + RN] && !rBlocked[c + RN]) { rSeen[c + RN] = 1; rQueue[qt++] = c + RN; }
    }
    return qt;
  }

  // Cells we need so our own body fits in a pocket without coiling into itself.
  roomNeeded() {
    const cell = this._raster.cell;
    return Math.min(RN * RN * 0.35, 12 + (this.s.curLen / cell) * 1.3);
  }

  // Skilled players "see" enclosed pockets; beginners often don't.
  usesSpace() {
    return chance(0.15 + this.p.skill * 0.95);
  }

  evalDir(dir, look, pad, preds) {
    const s = this.s;
    const h = s.head;
    const w = this.w;
    const first = w.rayFree(s, h.x, h.y, dir, look, pad, preds);
    if (dir === turnLeft(s.dir)) this._rayL = first;
    else this._rayR = first;
    if (this.p.skill < 0.3 || first < s.minTurnGap + 4) return first;
    // look one corner further to avoid obvious dead ends
    const probe = Math.min(first - pad, s.minTurnGap + 40 + 160 * this.p.skill);
    if (probe <= 0) return first;
    const px = h.x + DX[dir] * probe;
    const py = h.y + DY[dir] * probe;
    const b = w.rayFree(s, px, py, turnLeft(dir), look, pad, preds);
    const c = w.rayFree(s, px, py, turnRight(dir), look, pad, preds);
    const deep = Math.max(first - probe, b, c);
    return first * (1 - this.p.skill * 0.5) + deep * this.p.skill * 0.5;
  }

  think(now) {
    const s = this.s;
    const w = this.w;
    const p = this.p;
    if (s.turnQueue.length || (this.pending.length && this.pending[0].urgent)) return;
    const busy = this.pending.length > 0; // a casual turn is on its way; still watch for danger

    const d = s.dir;
    const h = s.head;
    const pad = s.w / 2 + 2 + p.caution * 6;
    const look = p.look * (s.speed / CFG.BASE_SPEED);
    const preds = p.skill > 0.4 ? this.predictions() : null;
    const F = w.rayFree(s, h.x, h.y, d, look, pad, preds);
    const danger = s.speed * (p.react + p.think * 0.5 + 0.08) + s.minTurnGap + s.w + 8 + p.caution * 40;
    const farting = now < this.fartUntil;

    const critical = s.speed * (p.react + 0.05) + s.minTurnGap * 0.5 + s.w;
    const scan = p.skill > 0.45 && now > this.scanAt;
    if (!farting && (F < danger || scan)) {
      const inDanger = F < danger;
      if (!inDanger) this.scanAt = now + lerp(1.2, 0.3, p.skill);
      const choice = this.safestDir(F, look, pad, preds, critical, inDanger);
      if (choice !== d) {
        this.plan.length = 0;
        this.pending.length = 0;
        this.turn(choice, now, true, `${inDanger ? 'danger' : 'scan'} F=${F.toFixed(0)} dz=${danger.toFixed(0)}`);
        if (F < danger * 0.45 && chance(p.chatty * 0.04)) s.say(pick(['wow', 'omg', '!!', 'close']), now);
        return;
      }
      if (inDanger && F < critical) return;
    }
    if (this.plan.length || busy) return;

    if (p.aggression > 0.3 && now > this.cutCooldown && this.tryCutoff(now, pad)) return;
    if (p.hugger > 0.25 && this.tryHug(now, pad)) return;

    if (now > this.targetUntil || (this.target && this.target.food && this.target.food.dead) || (this.target && this.target.prey && !this.target.prey.alive)) {
      this.pickTarget(now);
    }
    let desired = null;
    if (this.target) {
      if (this.target.prey) this.updatePreyTarget();
      desired = this.steerTo(this.target.x, this.target.y, look, pad, preds);
    }
    if (desired === null && chance(p.zig)) desired = chance(0.5) ? turnLeft(d) : turnRight(d);

    if (desired !== null && desired !== d) {
      const v = w.rayFree(s, h.x, h.y, desired, look, pad, preds);
      let ok = v > danger * 1.6 || v >= look * 0.95 || (farting && v > danger * 0.7);
      // three turns the same way closes a loop; people notice they are circling
      const rot = desired === turnRight(d) ? 1 : -1;
      if (ok && rot === this.lastRot && this.rotRun >= 2 && !chance((1 - p.skill) * 0.3)) {
        ok = false;
        this.targetUntil = now;
      }
      if (ok && !farting && this.usesSpace()) {
        this.buildRaster(preds);
        const fD = this.flood(desired, v);
        const fF = this.flood(d, F);
        if (fD < fF * 0.6 || fD < this.roomNeeded()) ok = false;
      }
      if (ok) this.turn(desired, now, false, `goal v=${v.toFixed(0)}`);
      else this.targetUntil = Math.min(this.targetUntil, now + 0.3);
    }
  }

  // Picks the direction with the most room: ray length plus, for players who
  // read the board, reachable area. Forward wins ties so we don't wiggle.
  safestDir(F, look, pad, preds, critical, inDanger) {
    const s = this.s;
    const p = this.p;
    const d = s.dir;
    const dL = turnLeft(d);
    const dR = turnRight(d);
    const vL = this.evalDir(dL, look, pad, preds);
    const vR = this.evalDir(dR, look, pad, preds);
    let sF = Math.min(F, look) / look;
    let sL = Math.min(vL, look) / look;
    let sR = Math.min(vR, look) / look;
    if (this.usesSpace()) {
      this.buildRaster(preds);
      const fF = this.flood(d, F);
      const fL = this.flood(dL, this._rayL);
      const fR = this.flood(dR, this._rayR);
      const big = Math.max(fF, fL, fR, 1);
      const need = this.roomNeeded();
      sF = sF * 0.4 + fF / big - (fF < need ? 0.6 : 0);
      sL = sL * 0.4 + fL / big - (fL < need ? 0.6 : 0);
      sR = sR * 0.4 + fR / big - (fR < need ? 0.6 : 0);
    }
    if (F < critical) sF -= 2;
    else sF += inDanger ? 0.12 : 0.45;
    const tight = s.minTurnGap + s.w * 2;
    if (this._rayL < tight) sL -= 2;
    if (this._rayR < tight) sR -= 2;
    if (inDanger && chance((1 - p.skill) * 0.22)) {
      // panic: grab whichever side comes to mind
      const side = chance(0.5) ? dL : dR;
      return F < critical ? side : chance(0.5) ? side : d;
    }
    if (sF >= sL && sF >= sR) return d;
    return sL > sR ? dL : dR;
  }

  steerTo(tx, ty, look, pad, preds) {
    const s = this.s;
    const h = s.head;
    const d = s.dir;
    const rd = turnRight(d);
    const rx = tx - h.x;
    const ry = ty - h.y;
    const along = rx * DX[d] + ry * DY[d];
    const lat = rx * DX[rd] + ry * DY[rd];
    const tol = 6 + (1 - this.p.skill) * 30 + s.w;
    const alat = Math.abs(lat);
    if (along <= tol) {
      if (alat <= tol) {
        if (along >= -tol) return null;
        // straight behind: pick the roomier side
        const vl = this.w.rayFree(s, h.x, h.y, turnLeft(d), look, pad, preds);
        const vr = this.w.rayFree(s, h.x, h.y, rd, look, pad, preds);
        return vr > vl ? rd : turnLeft(d);
      }
      return lat > 0 ? rd : turnLeft(d);
    }
    // humans tend to "staircase" diagonally toward things
    if (alat > tol && alat > along * this.p.stair) return lat > 0 ? rd : turnLeft(d);
    return null;
  }

  pickTarget(now) {
    const s = this.s;
    const h = s.head;
    const p = this.p;

    // hunters sometimes pick a snake to shadow instead of food
    if (p.aggression > 0.5 && chance(p.aggression * 0.5)) {
      let prey = null;
      let bestD = 750;
      for (const o of this.w.snakesNear(h.x, h.y, 750, this._near)) {
        if (o === s) continue;
        if (p.type !== 'pro' && o.score > s.score * 1.6 + 40) continue;
        const dd = Math.abs(o.head.x - h.x) + Math.abs(o.head.y - h.y);
        if (dd < bestD) {
          bestD = dd;
          prey = o;
        }
      }
      if (prey) {
        this.target = { prey, side: chance(0.5) ? 1 : -1, x: 0, y: 0 };
        this.updatePreyTarget();
        this.targetUntil = now + rand(1.5, 4);
        return;
      }
    }

    const R = 300 + 450 * p.greed + 300 * p.skill;
    const foods = this.w.food.grid.query(h.x - R, h.y - R, h.x + R, h.y + R, this._fq);
    let best = null;
    let bestV = 0;
    const d = s.dir;
    const stride = foods.length > 180 ? Math.ceil(foods.length / 180) : 1;
    const off = stride > 1 ? randInt(0, stride - 1) : 0;
    for (let i = off; i < foods.length; i += stride) {
      const f = foods[i];
      if (f.dead) continue;
      const rx = f.x - h.x;
      const ry = f.y - h.y;
      const dist = Math.abs(rx) + Math.abs(ry);
      let v = f.v / (dist + 60);
      if (rx * DX[d] + ry * DY[d] < 0) v *= 0.45;
      if (v > bestV) {
        bestV = v;
        best = f;
      }
    }
    if (best) {
      this.target = { x: best.x, y: best.y, food: best };
      this.targetUntil = now + rand(0.5, 1.5) * (1.4 - p.skill * 0.6);
      return;
    }
    const m = 900;
    const size = this.w.size;
    this.target = { x: rand(m, size - m), y: rand(m, size - m) };
    this.targetUntil = now + rand(3, 7);
  }

  updatePreyTarget() {
    const t = this.target;
    const o = t.prey;
    const oh = o.head;
    const rd = turnRight(o.dir);
    const lead = 180 + this.p.skill * 200;
    const gap = (this.s.w + o.w) / 2 + 14;
    t.x = oh.x + DX[o.dir] * lead + DX[rd] * gap * t.side;
    t.y = oh.y + DY[o.dir] * lead + DY[rd] * gap * t.side;
  }

  // Overtake a parallel snake and slam a wall across its lane.
  tryCutoff(now, pad) {
    const s = this.s;
    const h = s.head;
    const d = s.dir;
    const rd = turnRight(d);
    for (const o of this.w.snakesNear(h.x, h.y, 520, this._near)) {
      if (o === s || o.dir !== d) continue;
      const oh = o.head;
      const along = (h.x - oh.x) * DX[d] + (h.y - oh.y) * DY[d];
      const lat = (oh.x - h.x) * DX[rd] + (oh.y - h.y) * DY[rd];
      const alat = Math.abs(lat);
      if (alat < s.w + o.w || alat > 330) continue;
      // estimate of time the victim needs to notice, scaled by how bold we are
      const margin = o.speed * (0.18 + (1 - this.p.aggression) * 0.2) + o.w + s.w + 18;
      if (along < o.speed * (alat / s.speed) + margin) continue;
      const toward = lat > 0 ? rd : turnLeft(d);
      const free = this.w.rayFree(s, h.x, h.y, toward, alat + 140, pad, null);
      if (free < alat + o.w + 40) continue;
      const cross = alat + o.w / 2 + s.w + rand(20, 70) * (1.2 - this.p.skill);
      this.plan = [{ dir: toward, after: 0 }, { dir: d, after: cross }];
      this.cutCooldown = now + rand(1.5, 4) * (1.3 - this.p.aggression);
      return true;
    }
    this.cutCooldown = now + rand(0.2, 0.6);
    return false;
  }

  // Slide next to a parallel line to ride its charge.
  tryHug(now, pad) {
    const s = this.s;
    if (s.spark && s.spark.k > 0.45 && chance(this.p.hugger)) return true; // keep riding
    if (now < this.hugCooldown) return false;
    this.hugCooldown = now + rand(0.4, 1.2);
    const h = s.head;
    const d = s.dir;
    const rd = turnRight(d);
    const horiz = DX[d] !== 0;
    const g = this.w.grid;
    const R = 190;
    const q = g.query(h.x - R, h.y - R, h.x + R, h.y + R, this.w._q);
    let bestLat = 0;
    let bestAbs = Infinity;
    let bestHw = 0;
    for (const k of q) {
      if (g.owner[k] === s) continue;
      const segHoriz = g.y1[k] === g.y2[k];
      if (segHoriz !== horiz) continue;
      // lateral distance and how far the line runs ahead of us
      let lat;
      let ahead;
      if (horiz) {
        lat = (g.y1[k] - h.y) * DY[rd];
        ahead = DX[d] > 0 ? Math.max(g.x1[k], g.x2[k]) - h.x : h.x - Math.min(g.x1[k], g.x2[k]);
        const behind = DX[d] > 0 ? Math.min(g.x1[k], g.x2[k]) - h.x : h.x - Math.max(g.x1[k], g.x2[k]);
        if (behind > 80) continue;
      } else {
        lat = (g.x1[k] - h.x) * DX[rd];
        ahead = DY[d] > 0 ? Math.max(g.y1[k], g.y2[k]) - h.y : h.y - Math.min(g.y1[k], g.y2[k]);
        const behind = DY[d] > 0 ? Math.min(g.y1[k], g.y2[k]) - h.y : h.y - Math.max(g.y1[k], g.y2[k]);
        if (behind > 80) continue;
      }
      if (ahead < 160) continue;
      const a = Math.abs(lat);
      if (a < bestAbs) {
        bestAbs = a;
        bestLat = lat;
        bestHw = g.hw[k];
      }
    }
    if (bestAbs === Infinity) return false;
    const want = s.w / 2 + bestHw + 7 + (1 - this.p.skill) * 22;
    const jog = bestAbs - want;
    if (jog < Math.max(10, s.minTurnGap) || bestAbs > 175) return false;
    const toward = bestLat > 0 ? rd : turnLeft(d);
    const free = this.w.rayFree(s, h.x, h.y, toward, bestAbs, pad, null);
    if (free < jog + 4) return false;
    this.plan = [{ dir: toward, after: 0 }, { dir: d, after: jog * rand(0.92, 1.05) }];
    return true;
  }
}
