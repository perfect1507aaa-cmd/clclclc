import { CFG, DX, DY, turnLeft, turnRight } from './config.js';
import { rand, randInt, chance, lerp, pick, clamp } from './util.js';

// Behaviour archetypes. Ranges are sampled per bot so no two play the same.
//  newbie - clumsy, greedy, panics
//  casual - a bit of everything
//  grazer - the prey: farms quiet spots, bolts from anything that approaches
//  killer - hunts people, locks onto a victim and keeps trying to cut it off
//  pro    - efficient and safe; server regulars are pros who keep coming back
export const ARCHETYPES = {
  newbie: { skill: [0.03, 0.3], aggression: [0, 0.15], greed: [0.6, 1], hugger: [0, 0.15], caution: [0, 0.4], fear: [0.3, 0.7], lives: [1, 3], chatty: [0.05, 0.5], toxic: 0.15 },
  casual: { skill: [0.3, 0.6], aggression: [0.15, 0.45], greed: [0.4, 0.9], hugger: [0.1, 0.45], caution: [0.2, 0.6], fear: [0.3, 0.6], lives: [2, 5], chatty: [0.1, 0.6], toxic: 0.3 },
  grazer: { skill: [0.4, 0.7], aggression: [0, 0.08], greed: [0.7, 0.95], hugger: [0.05, 0.3], caution: [0.6, 1], fear: [0.75, 1], lives: [2, 6], chatty: [0, 0.35], toxic: 0.05 },
  killer: { skill: [0.62, 0.88], aggression: [0.8, 1], greed: [0.2, 0.5], hugger: [0.5, 0.85], caution: [0.05, 0.35], fear: [0, 0.12], lives: [3, 8], chatty: [0.3, 0.9], toxic: 0.7 },
  pro: { skill: [0.9, 1], aggression: [0.45, 0.75], greed: [0.6, 0.85], hugger: [0.85, 1], caution: [0.3, 0.6], fear: [0.12, 0.3], lives: [4, 12], chatty: [0.1, 0.5], toxic: 0.3 },
};

export function pickArchetype() {
  const r = Math.random();
  if (r < 0.3) return 'newbie';
  if (r < 0.64) return 'casual';
  if (r < 0.82) return 'grazer';
  if (r < 0.96) return 'killer';
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
    fear: rand(...a.fear),
    regular: false,
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
  p.awareness = lerp(0.25, 1, skill); // how early threats get noticed
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

    this.mode = 'graze';
    this.modeUntil = 0;
    this.victim = null;
    this.feast = null;
    this.grazeZone = null;
    this.home = null;
    this.homeUntil = 0;
    this.threat = { score: 0, ax: 0, ay: 0, who: null };
    this.stalk = new Map(); // how long each nearby snake has stayed close
    this.lastPerceive = now;
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
    const cell = Math.max(12, Math.min(30, s.w * 1.25));
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
    for (const k of _segQ) {
      if (g.owner[k] === s) continue;
      const e = g.hw[k] + me;
      mark(Math.min(g.x1[k], g.x2[k]) - e, Math.min(g.y1[k], g.y2[k]) - e, Math.max(g.x1[k], g.x2[k]) + e, Math.max(g.y1[k], g.y2[k]) + e);
    }
    // Our own body, minus the parts near the tail that will have slid away by
    // the time the head could get there (a good player happily chases their tail).
    const pts = s.pts;
    const e = s.w / 2 + me;
    const growth = Math.max(0, s.length - s.curLen);
    let arc = -growth;
    const chunk = cell * 3;
    for (let i = 0; i < pts.length - 2; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      for (let t = 0; t < len; t += chunk) {
        const t2 = Math.min(len, t + chunk);
        const x1 = a.x + ((b.x - a.x) * t) / len;
        const y1 = a.y + ((b.y - a.y) * t) / len;
        const x2 = a.x + ((b.x - a.x) * t2) / len;
        const y2 = a.y + ((b.y - a.y) * t2) / len;
        const reach = Math.min(Math.abs(x1 - h.x) + Math.abs(y1 - h.y), Math.abs(x2 - h.x) + Math.abs(y2 - h.y));
        if (arc + t2 > reach * 0.85) mark(Math.min(x1, x2) - e, Math.min(y1, y2) - e, Math.max(x1, x2) + e, Math.max(y1, y2) + e);
      }
      arc += len;
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
    this.assessThreat(now);
    // greed and bloodlust make people cut corners; fear makes them jumpy
    let bold = this.mode === 'feast' ? p.greed * 0.45 : this.mode === 'hunt' ? p.aggression * 0.3 : 0;
    if (p.type === 'pro') bold *= 0.3; // the good ones keep their cool
    const jumpy = this.mode === 'flee' ? 0.15 : 0;
    // a big snake has a lot to lose; good players get noticeably more careful
    const stake = p.skill > 0.8 ? Math.min(0.5, s.score / 2000) : 0;
    const pad = s.w / 2 + 2 + (p.caution + stake) * 6 * (1 - bold);
    const look = p.look * (s.speed / CFG.BASE_SPEED);
    const preds = p.skill > 0.4 ? this.predictions() : null;
    const F = w.rayFree(s, h.x, h.y, d, look, pad, preds);
    const danger = (s.speed * (p.react + p.think * 0.5 + 0.08) + s.minTurnGap + s.w + 8 + (p.caution + stake) * 40) * (1 - bold * 0.5 + jumpy);
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

    // ---- intent: what this person is trying to do right now ----
    if (now > this.modeUntil || !this.modeValid(now)) this.chooseMode(now);
    else if (this.mode !== 'flee' && this.threat.score > this.fleeThreshold()) this.enterFlee(now);

    if (this.mode === 'hunt' && now > this.cutCooldown && this.tryCutoff(now, pad, this.victim)) return;
    if (this.mode === 'hunt' && this.closeIn(now, pad)) return;
    if (this.mode !== 'flee' && p.aggression > 0.3 && now > this.cutCooldown && this.tryCutoff(now, pad, null)) return;
    if (this.mode !== 'flee' && p.hugger > 0.25 && this.tryHug(now, pad)) return;

    this.updateTarget(now, look, pad, preds);
    let desired = null;
    if (this.target) desired = this.steerTo(this.target.x, this.target.y, look, pad, preds);
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
      // experienced players sweep through food in long passes instead of jittering,
      // and never fold into a hairpin just to grab a pellet
      if (ok && p.skill > 0.5 && this.mode !== 'hunt' && this.mode !== 'flee') {
        if (s.sinceTurn < s.w * 2.5 + 30 * p.skill) ok = false;
        else if (rot === this.lastRot && s.sinceTurn < s.w * 4 + 30) ok = false;
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
    // Coiling the same way again and again ends in a spiral; take the other way out if it's open.
    if (this.rotRun >= 3) {
      const same = this.lastRot > 0 ? dR : dL;
      const other = this.lastRot > 0 ? dL : dR;
      const otherRay = other === dL ? this._rayL : this._rayR;
      if (otherRay > critical * 1.2) {
        if (same === dL) sR += 0.35 * p.skill;
        else sL += 0.35 * p.skill;
      }
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

  // ---------- perception ----------

  // Who is coming at me? Bigger snakes heading my way and anyone who keeps
  // hanging around (a stalker) count as threats.
  assessThreat(now) {
    const s = this.s;
    const h = s.head;
    const p = this.p;
    const dt = Math.min(0.5, now - this.lastPerceive);
    this.lastPerceive = now;
    const R = 220 + 380 * p.awareness;
    let score = 0;
    let ax = 0;
    let ay = 0;
    let who = null;
    let whoV = 0;
    for (const o of this.w.snakesNear(h.x, h.y, R, this._near)) {
      if (o === s) continue;
      const rx = h.x - o.head.x;
      const ry = h.y - o.head.y;
      const dist = Math.hypot(rx, ry) || 1;
      if (dist > R) continue;
      const toward = (DX[o.dir] * rx + DY[o.dir] * ry) / dist;
      const size = o.score > s.score * 1.3 ? 1.4 : o.score < s.score * 0.5 ? 0.55 : 1;
      const st = (this.stalk.get(o) || 0) + (dist < 420 ? dt * 2 : 0); // x2 offsets the decay below
      this.stalk.set(o, st);
      const v = (1 - dist / R) * (toward > 0.4 ? 1.25 : 0.35) * size + (st > 2.5 ? 0.5 : 0);
      score += v;
      ax += (rx / dist) * v;
      ay += (ry / dist) * v;
      if (v > whoV) {
        whoV = v;
        who = o;
      }
    }
    for (const [o, st] of this.stalk) {
      const n = st - dt;
      if (n <= 0 || !o.alive) this.stalk.delete(o);
      else this.stalk.set(o, n);
    }
    this.threat = { score, ax, ay, who };
  }

  fleeThreshold() {
    return lerp(1.5, 0.45, this.p.fear);
  }

  // Fresh remains within reach, scored by value, distance and how fresh they are.
  bestFeast(now) {
    const s = this.s;
    const h = s.head;
    const maxR = 250 + 650 * this.p.greed;
    const worth = 40 + s.score * 0.15; // small scraps aren't worth a detour for a big snake
    let best = null;
    let bestV = 0;
    for (const f of this.w.feasts) {
      const age = now - f.t;
      if (age > 22 || f.victim === s || f.value < worth) continue;
      const left = 1 - age / 22;
      for (const pt of f.pts) {
        const d = Math.abs(pt.x - h.x) + Math.abs(pt.y - h.y);
        if (d > maxR) continue;
        const v = (f.value * left) / (d + 250);
        if (v > bestV) {
          bestV = v;
          best = { x: pt.x, y: pt.y, f, d, mine: f.killer === s };
        }
      }
    }
    if (best) {
      let crowd = 0;
      for (const o of this.w.snakesNear(best.x, best.y, 420, this._near)) if (o !== s) crowd++;
      best.crowd = crowd;
    }
    return best;
  }

  // Someone worth chasing: close, beatable, and (for killers) juicy or human.
  pickVictim(R) {
    const s = this.s;
    const h = s.head;
    const killer = this.p.type === 'killer';
    let best = null;
    let bestV = 0.15;
    for (const o of this.w.snakesNear(h.x, h.y, R, this._near)) {
      if (o === s) continue;
      const dist = Math.hypot(o.head.x - h.x, o.head.y - h.y);
      if (dist > R) continue;
      let v = 1 - dist / R;
      if (killer) {
        if (o.score > s.score * 3 + 100) v *= 0.55;
        if (o.score < 25) v *= 0.6;
        if (o.isPlayer) v *= 1.6; // humans are the most fun to hunt
      } else if (o.score > s.score * 0.9) {
        v *= 0.25;
      }
      if (o === this.victim) v *= 1.5; // grudges stick
      if (v > bestV) {
        bestV = v;
        best = o;
      }
    }
    return best;
  }

  // ---------- intent ----------

  enter(mode, now, dur) {
    const prev = this.mode;
    this.mode = mode;
    this.modeUntil = now + dur;
    this.targetUntil = 0;
    this.target = null;
    const s = this.s;
    const p = this.p;
    this.grazeZone = null;
    if (mode === 'graze') {
      // people have a favourite spot and keep coming back to it for a while
      if (!this.home || now > this.homeUntil) {
        const quiet = p.type === 'grazer' || (p.type === 'pro' && s.score > 600);
        this.home = chance(p.type === 'newbie' ? 0.5 : 0.9) ? this.nearestZone(quiet) : null;
        this.homeUntil = now + rand(30, 60);
      }
      // a long snake can't farm inside a small field without coiling up; it works the area around it
      this.grazeZone = this.home && s.curLen < this.home.r * 4 ? this.home : null;
    }
    if (mode === prev) return;
    if (mode === 'hunt' && p.toxic && chance(p.chatty * 0.12)) s.say(pick(['come here', "you're next", ':)', 'run']), now);
    else if (mode === 'feast' && chance(p.chatty * 0.08)) s.say(pick(['yum', 'mine!', 'food!', 'free food']), now);
  }

  enterFlee(now) {
    this.enter('flee', now, rand(1.4, 3.2));
    if (chance(this.p.chatty * 0.2 * this.p.fear)) this.s.say(pick(['run!', 'help', 'noo', '!!!', 'pls no']), now);
  }

  modeValid(now) {
    if (this.mode === 'hunt') {
      const v = this.victim;
      return !!v && v.alive && Math.abs(v.head.x - this.s.head.x) + Math.abs(v.head.y - this.s.head.y) < 1700;
    }
    if (this.mode === 'feast') return !!this.feast && now - this.feast.f.t < 22;
    return true;
  }

  chooseMode(now) {
    const s = this.s;
    const p = this.p;
    if (this.threat.score > this.fleeThreshold()) return this.enterFlee(now);
    const feast = this.bestFeast(now);
    const small = s.score < 90;
    const t = p.type;

    const goFeast = () => {
      this.feast = feast;
      this.enter('feast', now, rand(6, 12));
    };
    const goHunt = (v, dur) => {
      this.victim = v;
      this.enter('hunt', now, dur);
    };

    if (t === 'killer') {
      if (feast && feast.mine && feast.d < 1000) return goFeast(); // collect the kill
      const v = this.pickVictim(1100);
      if (v && !(small && chance(0.35))) return goHunt(v, rand(8, 20));
      if (feast && feast.d < 1200 && chance(0.6)) return goFeast();
      if (small) return this.enter('graze', now, rand(6, 12));
      return this.enter('roam', now, rand(3, 7));
    }
    if (t === 'pro') {
      // once big, a top player protects the lead: quiet fields, no scrums
      const big = s.score > 600;
      if (feast && feast.d < 900 && feast.crowd < (big ? 2 : 3)) return goFeast();
      if (!small && chance(p.aggression * (big ? 0.4 : 1))) {
        const v = this.pickVictim(650);
        if (v) return goHunt(v, rand(4, 9));
      }
      return this.enter('graze', now, rand(8, 16));
    }
    if (t === 'grazer') {
      if (feast && feast.crowd <= 1 && feast.d < 1000) return goFeast();
      if (chance(0.15)) return this.enter('roam', now, rand(3, 6));
      return this.enter('graze', now, rand(10, 20));
    }
    if (t === 'casual') {
      if (feast && feast.d < 600 + 1000 * p.greed) return goFeast();
      if (chance(p.aggression * 0.5)) {
        const v = this.pickVictim(500);
        if (v) return goHunt(v, rand(3, 7));
      }
      if (chance(0.25)) return this.enter('roam', now, rand(3, 7));
      return this.enter('graze', now, rand(8, 16));
    }
    // newbie
    if (feast && feast.d < 900 && chance(p.greed)) return goFeast();
    if (chance(0.2)) return this.enter('roam', now, rand(2, 6));
    return this.enter('graze', now, rand(5, 10));
  }

  // ---------- targets ----------

  updateTarget(now, look, pad, preds) {
    const s = this.s;
    const h = s.head;
    const p = this.p;
    const size = this.w.size;

    if (this.mode === 'flee') {
      let ax = this.threat.ax;
      let ay = this.threat.ay;
      const n = Math.hypot(ax, ay);
      if (n < 1e-3) {
        if (this.target) return;
        ax = DX[s.dir];
        ay = DY[s.dir];
      } else {
        ax /= n;
        ay /= n;
      }
      let tx = clamp(h.x + ax * 700, 250, size - 250);
      let ty = clamp(h.y + ay * 700, 250, size - 250);
      if (Math.abs(tx - h.x) + Math.abs(ty - h.y) < 250) {
        // cornered against the wall: slip out sideways
        tx = clamp(h.x - ay * 700, 250, size - 250);
        ty = clamp(h.y + ax * 700, 250, size - 250);
      }
      this.target = { x: tx, y: ty };
      return;
    }

    if (this.mode === 'hunt') {
      const o = this.victim;
      const oh = o.head;
      const rd = turnRight(o.dir);
      // stay on the side we're already on, run level with them and a bit ahead
      const side = (h.x - oh.x) * DX[rd] + (h.y - oh.y) * DY[rd] >= 0 ? 1 : -1;
      const lead = 160 + p.skill * 220 + (s.speed - o.speed) * 0.3;
      const gap = (s.w + o.w) / 2 + 16 + (1 - p.skill) * 30;
      this.target = { x: oh.x + DX[o.dir] * lead + DX[rd] * gap * side, y: oh.y + DY[o.dir] * lead + DY[rd] * gap * side };
      return;
    }

    if (this.mode === 'feast') {
      const f = this.feast;
      if (p.skill > 0.6 && f.f.victim) {
        const t = this.corpseTarget(f.f.victim);
        if (t) {
          this.target = t;
          return;
        }
      }
      const d = Math.abs(f.x - h.x) + Math.abs(f.y - h.y);
      if (d > 320) {
        this.target = { x: f.x, y: f.y };
        return;
      }
      if (!this.target || !this.target.food || this.target.food.dead || now > this.targetUntil) {
        const food = this.pickFood(f.x, f.y, 420, 0, p.skill > 0.6);
        if (!food) {
          this.modeUntil = now; // picked clean
          return;
        }
        this.target = { x: food.x, y: food.y, food };
        this.targetUntil = now + rand(0.3, 0.8);
      }
      return;
    }

    if (this.mode === 'roam') {
      if (!this.target) this.target = this.roamPoint();
      if (Math.abs(this.target.x - h.x) + Math.abs(this.target.y - h.y) < 220) this.modeUntil = now;
      return;
    }

    // graze: most people drift to a pasture and farm there
    if (this.grazeZone) {
      const z = this.grazeZone;
      if (Math.abs(z.x - h.x) + Math.abs(z.y - h.y) > z.r * 1.1) {
        this.target = { x: z.x, y: z.y };
        this.modeUntil = Math.max(this.modeUntil, now + 3); // finish the trip before rethinking
        return;
      }
    }
    if (!this.target || !this.target.food || this.target.food.dead || now > this.targetUntil) {
      const R = 300 + 450 * p.greed + 300 * p.skill;
      const z = this.grazeZone;
      const aversion = p.type === 'grazer' ? p.fear * 1.5 : p.fear * 0.4;
      const food = z ? this.pickFood(z.x, z.y, z.r, aversion, true, z) : this.pickFood(h.x, h.y, R, aversion, true);
      if (food) {
        this.target = { x: food.x, y: food.y, food };
        this.targetUntil = now + rand(0.5, 1.5) * (1.4 - p.skill * 0.6);
      } else {
        this.target = this.pasture(p.type === 'grazer');
        this.targetUntil = now + rand(3, 6);
      }
    }
  }

  // Remains lie along the dead snake's old path. Good players line up with a
  // stretch that still has food and ride straight along it.
  corpseTarget(victim) {
    const s = this.s;
    const h = s.head;
    const pts = victim.pts;
    const cands = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (a.x === b.x && a.y === b.y) continue;
      const px = clamp(h.x, Math.min(a.x, b.x), Math.max(a.x, b.x));
      const py = clamp(h.y, Math.min(a.y, b.y), Math.max(a.y, b.y));
      const d = Math.abs(px - h.x) + Math.abs(py - h.y);
      if (d < 900) cands.push({ a, b, px, py, d });
    }
    cands.sort((u, v) => u.d - v.d);
    const reach = 40 + s.w * 2.5;
    for (let i = 0; i < Math.min(cands.length, 8); i++) {
      const c = cands[i];
      const horiz = c.a.y === c.b.y;
      // which end is ahead of us along the corpse, and is there still food that way?
      let ex;
      let ey;
      if (horiz) {
        const toward = DX[s.dir] !== 0 ? DX[s.dir] : c.b.x - c.px > c.px - c.a.x ? Math.sign(c.b.x - c.a.x) : Math.sign(c.a.x - c.b.x);
        ex = toward > 0 ? Math.max(c.a.x, c.b.x) : Math.min(c.a.x, c.b.x);
        ey = c.a.y;
      } else {
        const toward = DY[s.dir] !== 0 ? DY[s.dir] : c.b.y - c.py > c.py - c.a.y ? Math.sign(c.b.y - c.a.y) : Math.sign(c.a.y - c.b.y);
        ex = c.a.x;
        ey = toward > 0 ? Math.max(c.a.y, c.b.y) : Math.min(c.a.y, c.b.y);
      }
      const midx = (c.px + ex) / 2;
      const midy = (c.py + ey) / 2;
      const span = Math.abs(ex - c.px) + Math.abs(ey - c.py);
      if (span < 60) continue;
      const foods = this.w.food.grid.query(Math.min(c.px, ex) - reach, Math.min(c.py, ey) - reach, Math.max(c.px, ex) + reach, Math.max(c.py, ey) + reach, this._fq);
      let n = 0;
      for (const f of foods) if (!f.dead && Math.abs(f.x - midx) <= span / 2 + reach && Math.abs(f.y - midy) <= span / 2 + reach) n++;
      if (n < 3) continue;
      const lateral = horiz ? Math.abs(h.y - c.a.y) : Math.abs(h.x - c.a.x);
      const aligned = lateral < reach * 0.6 && (horiz ? DX[s.dir] !== 0 : DY[s.dir] !== 0);
      return aligned ? { x: ex, y: ey } : { x: c.px, y: c.py };
    }
    return null;
  }

  // Best pellet near (cx, cy). Crowded pellets are worth less to timid players.
  pickFood(cx, cy, R, crowdAversion, preferAhead, zone) {
    const s = this.s;
    const h = s.head;
    const d = s.dir;
    const foods = this.w.food.grid.query(cx - R, cy - R, cx + R, cy + R, this._fq);
    const others = crowdAversion > 0 ? this.w.snakesNear(cx, cy, R + 260, []).filter((o) => o !== s) : null;
    const stride = foods.length > 180 ? Math.ceil(foods.length / 180) : 1;
    const off = stride > 1 ? randInt(0, stride - 1) : 0;
    // Skilled farmers read where the food is densest and head for that patch.
    let patch = null;
    if (this.p.skill > 0.7 && foods.length > 12) {
      const C = 140;
      const sums = new Map();
      for (const f of foods) {
        if (f.dead) continue;
        const key = Math.floor(f.x / C) * 4096 + Math.floor(f.y / C);
        sums.set(key, (sums.get(key) || 0) + f.v);
      }
      let pv = 0;
      for (const [key, sum] of sums) {
        const px = (Math.floor(key / 4096) + 0.5) * C;
        const py = ((key % 4096) + 0.5) * C;
        const v = sum / (Math.abs(px - h.x) + Math.abs(py - h.y) + 200);
        if (v > pv) {
          pv = v;
          patch = { x: px, y: py };
        }
      }
    }
    let best = null;
    let bestV = 0;
    for (let i = off; i < foods.length; i += stride) {
      const f = foods[i];
      if (f.dead) continue;
      if (zone && (f.x - zone.x) ** 2 + (f.y - zone.y) ** 2 > zone.r * zone.r) continue;
      if (patch && Math.abs(f.x - patch.x) + Math.abs(f.y - patch.y) > 200) continue;
      const rx = f.x - h.x;
      const ry = f.y - h.y;
      let v = f.v / (Math.abs(rx) + Math.abs(ry) + 60);
      if (preferAhead && rx * DX[d] + ry * DY[d] < 0) v *= 0.45;
      if (others) {
        let n = 0;
        for (const o of others) if (Math.abs(o.head.x - f.x) + Math.abs(o.head.y - f.y) < 300) n++;
        v /= 1 + n * crowdAversion;
      }
      if (v > bestV) {
        bestV = v;
        best = f;
      }
    }
    return best;
  }

  nearestZone(quiet) {
    const h = this.s.head;
    let best = null;
    let bestV = -Infinity;
    for (const z of this.w.food.zones) {
      const n = this.w.snakesNear(z.x, z.y, z.r + 200, []).length;
      // the timid want an empty field; everyone else goes where the action is
      const v = -(Math.abs(z.x - h.x) + Math.abs(z.y - h.y)) + (quiet ? -400 * n : 220 * n) + rand(-300, 300);
      if (v > bestV) {
        bestV = v;
        best = z;
      }
    }
    return best;
  }

  // Nearest food pasture; timid players prefer the emptiest one.
  pasture(quiet) {
    const h = this.s.head;
    let best = null;
    let bestV = -Infinity;
    for (const z of this.w.food.zones) {
      let v = -(Math.abs(z.x - h.x) + Math.abs(z.y - h.y));
      if (quiet) v -= this.w.snakesNear(z.x, z.y, z.r + 200, []).length * 400;
      if (v > bestV) {
        bestV = v;
        best = z;
      }
    }
    return { x: best.x + rand(-best.r, best.r) * 0.5, y: best.y + rand(-best.r, best.r) * 0.5 };
  }

  // Where to wander: killers head for the crowd, others drift toward pastures or big names.
  roamPoint() {
    const s = this.s;
    const snakes = this.w.snakes;
    if (this.p.type === 'killer' || (this.p.type !== 'grazer' && chance(0.5))) {
      let best = null;
      let bestN = -1;
      for (let i = 0; i < 6 && snakes.length > 1; i++) {
        const o = pick(snakes);
        if (o === s) continue;
        const n = this.w.snakesNear(o.head.x, o.head.y, 600, []).length + o.score / 400;
        if (n > bestN) {
          bestN = n;
          best = o;
        }
      }
      if (best) return { x: clamp(best.head.x + rand(-300, 300), 300, this.w.size - 300), y: clamp(best.head.y + rand(-300, 300), 300, this.w.size - 300) };
    }
    return this.pasture(this.p.type === 'grazer');
  }

  // Running parallel to the victim but too far out: slide over next to its line,
  // soak up the charge, and use the extra speed to get ahead of it.
  closeIn(now, pad) {
    const s = this.s;
    const o = this.victim;
    if (!o || o.dir !== s.dir || now < this.hugCooldown) return false;
    const h = s.head;
    const d = s.dir;
    const rd = turnRight(d);
    const lat = (o.head.x - h.x) * DX[rd] + (o.head.y - h.y) * DY[rd];
    const along = (o.head.x - h.x) * DX[d] + (o.head.y - h.y) * DY[d];
    const alat = Math.abs(lat);
    if (alat > 520 || along < -250) return false; // already well past it
    const want = pad + o.w / 2 + 3 + (1 - this.p.skill) * 14;
    const jog = alat - want;
    if (jog < Math.max(12, s.minTurnGap)) return false;
    const toward = lat > 0 ? rd : turnLeft(d);
    const free = this.w.rayFree(s, h.x, h.y, toward, alat, pad, null);
    if (free < jog + 4) return false;
    this.hugCooldown = now + rand(0.4, 0.9);
    this.plan = [{ dir: toward, after: 0 }, { dir: d, after: jog * rand(0.95, 1.03) }];
    return true;
  }

  // Overtake a parallel snake and slam a wall across its lane.
  tryCutoff(now, pad, only) {
    const s = this.s;
    const h = s.head;
    const d = s.dir;
    const rd = turnRight(d);
    const list = only ? [only] : this.w.snakesNear(h.x, h.y, 520, this._near);
    for (const o of list) {
      if (o === s || !o.alive || o.dir !== d) continue;
      const oh = o.head;
      const along = (h.x - oh.x) * DX[d] + (h.y - oh.y) * DY[d];
      const lat = (oh.x - h.x) * DX[rd] + (oh.y - h.y) * DY[rd];
      const alat = Math.abs(lat);
      if (alat < (s.w + o.w) / 2 + 4 || alat > 330) continue; // same lane or too far
      // estimate of time the victim needs to notice, scaled by how bold we are
      // how much warning the victim gets: bloodthirsty players cut it fine
      const margin = o.speed * ((only ? 0.07 : 0.18) + (1 - this.p.aggression) * 0.2) + (o.w + s.w) * 0.75 + 12;
      if (along < o.speed * (alat / s.speed) + margin) continue;
      const toward = lat > 0 ? rd : turnLeft(d);
      const free = this.w.rayFree(s, h.x, h.y, toward, alat + 140, pad, null);
      if (free < alat + o.w + 40) continue;
      const cross = alat + o.w / 2 + s.w + rand(20, 70) * (1.2 - this.p.skill);
      this.plan = [{ dir: toward, after: 0 }, { dir: d, after: cross }];
      this.cutCooldown = now + rand(1.5, 4) * (1.3 - this.p.aggression) * (only ? 0.6 : 1);
      return true;
    }
    this.cutCooldown = now + (only ? rand(0.1, 0.3) : rand(0.2, 0.6));
    return false;
  }

  // Slide next to a parallel line to ride its charge.
  tryHug(now, pad) {
    const s = this.s;
    if (s.spark && s.spark.k > 0.45 && chance(this.p.hugger)) return true; // keep riding
    if (now < this.hugCooldown) return false;
    this.hugCooldown = now + rand(0.3, 1) * (1.4 - this.p.hugger);
    const h = s.head;
    const d = s.dir;
    // don't ride away from where we're going
    if (this.target) {
      const along = (this.target.x - h.x) * DX[d] + (this.target.y - h.y) * DY[d];
      if (along < -100) return false;
    }
    const rd = turnRight(d);
    const horiz = DX[d] !== 0;
    const g = this.w.grid;
    const maxLat = 120 + 200 * this.p.hugger;
    const R = maxLat + 20;
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
    // ride just outside our own safety margin so the line doesn't read as an obstacle
    const want = pad + bestHw + 3 + (1 - this.p.skill) * 18;
    const jog = bestAbs - want;
    if (jog < Math.max(10, s.minTurnGap) || bestAbs > maxLat) return false;
    const toward = bestLat > 0 ? rd : turnLeft(d);
    const free = this.w.rayFree(s, h.x, h.y, toward, bestAbs, pad, null);
    if (free < jog + 4) return false;
    this.plan = [{ dir: toward, after: 0 }, { dir: d, after: jog * rand(0.92, 1.05) }];
    return true;
  }
}
