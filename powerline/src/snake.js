import { CFG, DX, DY, opposite, widthFor, lengthFor } from './config.js';
import { hexToRgb, mixRgb } from './util.js';

export class Snake {
  constructor({ id, name, color, x, y, dir, score = CFG.START_SCORE, isPlayer = false, owner = null, time = 0 }) {
    this.id = id;
    this.name = name;
    this.isPlayer = isPlayer;
    this.owner = owner; // BotPlayer or null for the human
    this.setColor(color);

    // pts[0] is the tail end, the last element is the moving head.
    this.pts = [{ x, y }, { x, y }];
    this.curLen = 0;
    this.dir = dir;
    this.turnQueue = [];
    this.sinceTurn = 1e9;
    this.prevX = x;
    this.prevY = y;

    this.setScore(score);
    this.charge = 0;
    this.speed = CFG.BASE_SPEED;
    this.spark = null; // nearest foreign point while charging {x, y, k}

    this.alive = true;
    this.born = time;
    this.kills = 0;
    this.maxScore = score;
    this.bestRank = 999;
    this.emote = null;
    this.emoteUntil = 0;
    this.brain = null;
  }

  setColor(color) {
    this.color = color;
    this.rgb = hexToRgb(color);
    this.coreRgb = mixRgb(this.rgb, [255, 255, 255], 0.55);
  }

  get head() {
    return this.pts[this.pts.length - 1];
  }

  setScore(score) {
    this.score = score;
    this.length = lengthFor(score);
    this.w = widthFor(score);
    if (score > this.maxScore) this.maxScore = score;
  }

  addScore(v) {
    this.setScore(this.score + v);
  }

  get minTurnGap() {
    return this.w * 1.25 + 3;
  }

  // The direction the snake will face once its queued turns are consumed.
  get plannedDir() {
    return this.turnQueue.length ? this.turnQueue[this.turnQueue.length - 1] : this.dir;
  }

  queueTurn(d) {
    const last = this.plannedDir;
    if (d === last || d === opposite(last)) return false;
    if (this.turnQueue.length >= 3) return false;
    this.turnQueue.push(d);
    return true;
  }

  say(text, now, dur = 2.6) {
    this.emote = text;
    this.emoteUntil = now + dur;
  }

  step(dt) {
    let h = this.head;
    this.prevX = h.x;
    this.prevY = h.y;
    if (this.turnQueue.length && this.sinceTurn >= this.minTurnGap) {
      const d = this.turnQueue.shift();
      if (d !== this.dir && d !== opposite(this.dir)) {
        this.pts.push({ x: h.x, y: h.y });
        h = this.head;
        this.dir = d;
        this.sinceTurn = 0;
      }
    }
    const dist = this.speed * dt;
    h.x += DX[this.dir] * dist;
    h.y += DY[this.dir] * dist;
    this.sinceTurn += dist;
    this.curLen += dist;
    this.trim();
  }

  trim() {
    let excess = this.curLen - this.length;
    const pts = this.pts;
    while (excess > 0 && pts.length >= 2) {
      const a = pts[0];
      const b = pts[1];
      const seg = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      if (seg <= excess && pts.length > 2) {
        pts.shift();
        excess -= seg;
        this.curLen -= seg;
      } else {
        const m = Math.min(seg, excess);
        if (seg > 0) {
          a.x += ((b.x - a.x) / seg) * m;
          a.y += ((b.y - a.y) / seg) * m;
        }
        this.curLen -= m;
        excess = 0;
      }
    }
  }

  // Walks the body from head to tail, calling fn(x, y) every `step` units.
  sampleBody(step, fn) {
    const pts = this.pts;
    let carry = 0;
    for (let i = pts.length - 1; i > 0; i--) {
      const a = pts[i];
      const b = pts[i - 1];
      const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      if (len === 0) continue;
      let t = carry;
      while (t < len) {
        fn(a.x + ((b.x - a.x) * t) / len, a.y + ((b.y - a.y) * t) / len);
        t += step;
      }
      carry = t - len;
    }
  }
}
