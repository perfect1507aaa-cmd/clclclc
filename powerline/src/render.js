import { CFG, DX, DY } from './config.js';
import { rand, rgba, rgb, hexToRgb, clamp } from './util.js';

const BG = '#051820';
const OUTSIDE = '#0b3139';
const DOT = '#0a2530';
const BORDER = [70, 170, 255];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: CFG.MAP / 2, y: CFG.MAP / 2, z: 1 };
    this.particles = [];
    this.ghosts = [];
    this.foodSprites = new Map();
    this.headSprites = new Map();
    this._fq = [];
    this.pattern = this._makePattern();
    // soft neon glow is rendered at quarter resolution, blurred and added on top
    this.glow = document.createElement('canvas');
    this.gctx = this.glow.getContext('2d');
    this.canBlur = 'filter' in this.gctx;
    this.resize();
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cw = window.innerWidth;
    this.ch = window.innerHeight;
    this.canvas.width = Math.round(this.cw * this.dpr);
    this.canvas.height = Math.round(this.ch * this.dpr);
    this.canvas.style.width = `${this.cw}px`;
    this.canvas.style.height = `${this.ch}px`;
    this.glow.width = Math.ceil(this.canvas.width / 4);
    this.glow.height = Math.ceil(this.canvas.height / 4);
  }

  _makePattern() {
    const c = document.createElement('canvas');
    const s = 52;
    c.width = c.height = s;
    const g = c.getContext('2d');
    g.fillStyle = DOT;
    g.beginPath();
    g.arc(s / 2, s / 2, 13, 0, Math.PI * 2);
    g.fill();
    return this.ctx.createPattern(c, 'repeat');
  }

  _foodSprite(color) {
    let spr = this.foodSprites.get(color);
    if (spr) return spr;
    const c = document.createElement('canvas');
    const S = 64;
    c.width = c.height = S;
    const g = c.getContext('2d');
    const col = hexToRgb(color);
    const r = 13;
    g.translate(S / 2, S / 2);
    g.shadowColor = rgba(col, 0.9);
    g.shadowBlur = 14;
    g.lineWidth = 5;
    g.strokeStyle = rgb(col);
    g.fillStyle = rgba(col, 0.25);
    roundRect(g, -r, -r, r * 2, r * 2, 5);
    g.fill();
    g.stroke();
    g.shadowBlur = 0;
    g.lineWidth = 2;
    g.strokeStyle = rgba([255, 255, 255], 0.35);
    roundRect(g, -r + 1, -r + 1, r * 2 - 2, r * 2 - 2, 4);
    g.stroke();
    spr = { c, scale: 1 / 13 };
    this.foodSprites.set(color, spr);
    return spr;
  }

  _headSprite(snake) {
    let spr = this.headSprites.get(snake.color);
    if (spr) return spr;
    const c = document.createElement('canvas');
    const S = 128;
    c.width = c.height = S;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, rgba([255, 255, 255], 0.9));
    grd.addColorStop(0.12, rgba(snake.coreRgb, 0.75));
    grd.addColorStop(0.35, rgba(snake.rgb, 0.28));
    grd.addColorStop(1, rgba(snake.rgb, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    spr = c;
    this.headSprites.set(snake.color, spr);
    return spr;
  }

  // ---------- effects ----------

  onDeath(snake) {
    this.ghosts.push({ pts: snake.pts.map((p) => ({ x: p.x, y: p.y })), w: snake.w, rgb: snake.rgb, t: 0 });
    const h = snake.head;
    for (let i = 0; i < 36; i++) {
      const a = rand(Math.PI * 2);
      const sp = rand(60, 420);
      this.particles.push({ x: h.x, y: h.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.4, 1.1), t: 0, rgb: i % 3 ? snake.rgb : [255, 255, 255], size: rand(2, 5) });
    }
  }

  emitSparks(snake, dt) {
    if (snake.charge < 0.08 && !snake.spark) return;
    const h = snake.head;
    const n = snake.charge * 40 * dt + (snake.spark ? snake.spark.k * 25 * dt : 0);
    let count = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
    const back = (snake.dir + 2) & 3;
    while (count-- > 0) {
      const side = rand(-1, 1) * (snake.w * 1.6);
      const px = h.x + DX[back] * rand(2, 26) + DY[back] * side;
      const py = h.y + DY[back] * rand(2, 26) + DX[back] * side;
      this.particles.push({
        x: px,
        y: py,
        vx: DX[back] * rand(20, 90) + rand(-40, 40),
        vy: DY[back] * rand(20, 90) + rand(-40, 40),
        life: rand(0.25, 0.6),
        t: 0,
        rgb: Math.random() < 0.5 ? [255, 255, 255] : snake.coreRgb,
        size: rand(1.2, 2.6),
        dash: true,
      });
    }
  }

  // ---------- camera ----------

  updateCamera(tx, ty, zoom, dt, snap) {
    const k = snap ? 1 : 1 - Math.exp(-dt * 7);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    this.cam.z += (zoom - this.cam.z) * (snap ? 1 : 1 - Math.exp(-dt * 2.5));
  }

  baseZoom() {
    return Math.sqrt(this.cw * this.ch) / 1350;
  }

  worldToScreen(x, y) {
    const c = this.cam;
    return [(x - c.x) * c.z + this.cw / 2, (y - c.y) * c.z + this.ch / 2];
  }

  // ---------- frame ----------

  render(world, dt, opts) {
    const ctx = this.ctx;
    const dpr = this.dpr;
    const cam = this.cam;
    const z = cam.z;
    const time = world.time;
    const size = world.size;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = OUTSIDE;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const S = z * dpr;
    const ox = this.canvas.width / 2 - cam.x * S;
    const oy = this.canvas.height / 2 - cam.y * S;
    ctx.setTransform(S, 0, 0, S, ox, oy);

    const hw = this.cw / 2 / z;
    const hh = this.ch / 2 / z;
    const vx0 = cam.x - hw - 60;
    const vx1 = cam.x + hw + 60;
    const vy0 = cam.y - hh - 60;
    const vy1 = cam.y + hh + 60;

    // arena floor
    const fx0 = Math.max(0, vx0);
    const fy0 = Math.max(0, vy0);
    const fx1 = Math.min(size, vx1);
    const fy1 = Math.min(size, vy1);
    if (fx1 > fx0 && fy1 > fy0) {
      ctx.fillStyle = BG;
      ctx.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
      if (z > 0.25) {
        ctx.fillStyle = this.pattern;
        ctx.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
      }
    }

    // border
    ctx.lineJoin = 'miter';
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(BORDER, 0.12);
    ctx.lineWidth = 34;
    ctx.strokeRect(0, 0, size, size);
    ctx.strokeStyle = rgba(BORDER, 0.3);
    ctx.lineWidth = 14;
    ctx.strokeRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = rgb([150, 215, 255]);
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, size, size);

    // food
    const foods = world.food.grid.query(vx0, vy0, vx1, vy1, this._fq);
    for (const f of foods) {
      if (f.dead) continue;
      const spr = this._foodSprite(f.color);
      const r = f.r * (1 + 0.12 * Math.sin(time * 4 + f.rot * 3));
      const sc = r * spr.scale * S;
      const c = Math.cos(f.rot) * sc;
      const s = Math.sin(f.rot) * sc;
      ctx.setTransform(c, s, -s, c, ox + f.x * S, oy + f.y * S);
      ctx.drawImage(spr.c, -32, -32);
    }
    ctx.setTransform(S, 0, 0, S, ox, oy);

    // dying bodies flash and fade
    for (const g of this.ghosts) {
      g.t += dt;
      const a = 1 - g.t / 0.55;
      if (a <= 0) continue;
      tracePath(ctx, g.pts);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(g.rgb, 0.5 * a);
      ctx.lineWidth = g.w * (2 + g.t * 6);
      ctx.stroke();
      ctx.strokeStyle = rgba([255, 255, 255], 0.8 * a);
      ctx.lineWidth = g.w * (1 - g.t);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    this.ghosts = this.ghosts.filter((g) => g.t < 0.55);

    // snakes (player drawn last so it stays on top)
    const visible = [];
    for (const s of world.snakes) {
      if (!s.alive) continue;
      if (!inView(s, vx0 - 40, vy0 - 40, vx1 + 40, vy1 + 40)) continue;
      visible.push(s);
    }
    visible.sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0) || a.score - b.score);
    this._drawGlow(visible, S / 4, ox / 4, oy / 4);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.85;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.glow, 0, 0, this.glow.width * 4, this.glow.height * 4);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(S, 0, 0, S, ox, oy);
    for (const s of visible) this._drawBody(ctx, s);
    for (const s of visible) this._drawHead(ctx, s, S, ox, oy);

    // particles
    ctx.globalCompositeOperation = 'lighter';
    let w = 0;
    for (const p of this.particles) {
      p.t += dt;
      if (p.t >= p.life) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      const a = 1 - p.t / p.life;
      ctx.fillStyle = rgba(p.rgb, a);
      if (p.dash) {
        const horiz = Math.abs(p.vx) > Math.abs(p.vy);
        ctx.fillRect(p.x - (horiz ? p.size * 2 : p.size / 2), p.y - (horiz ? p.size / 2 : p.size * 2), horiz ? p.size * 4 : p.size, horiz ? p.size : p.size * 4);
      } else {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      this.particles[w++] = p;
    }
    this.particles.length = w;
    if (this.particles.length > 1500) this.particles.splice(0, this.particles.length - 1500);
    ctx.globalCompositeOperation = 'source-over';

    // screen-space overlays
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const king = world.king;
    const fontPx = Math.round(clamp(15 * Math.sqrt(z), 11, 18));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const s of visible) {
      const [sx, sy] = this.worldToScreen(s.head.x, s.head.y);
      if (opts.names && !(s.isPlayer && opts.hideOwnName)) {
        ctx.font = `700 ${fontPx}px Roboto, "Segoe UI", Arial, sans-serif`;
        ctx.fillStyle = s.isPlayer ? 'rgba(255,255,255,0.75)' : 'rgba(220,228,235,0.55)';
        // keep the label off our own line: below when moving sideways, beside when vertical
        if (DX[s.dir] !== 0) {
          ctx.fillText(s.name, sx, sy + 20 + s.w * z);
        } else {
          ctx.textAlign = 'left';
          ctx.fillText(s.name, sx + 14 + s.w * z, sy + DY[s.dir] * -4);
          ctx.textAlign = 'center';
        }
      }
      if (s === king && world.snakes.length > 1) drawCrown(ctx, sx, sy - 34 - s.w * z, time);
      if (s.emote && time < s.emoteUntil) this._drawEmote(ctx, s, sx, sy, time);
    }
  }

  _drawGlow(visible, S, ox, oy) {
    const g = this.gctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.glow.width, this.glow.height);
    g.setTransform(S, 0, 0, S, ox, oy);
    g.lineJoin = 'miter';
    g.lineCap = 'square';
    if (this.canBlur) g.filter = `blur(${Math.max(1.5, 3 * this.dpr * 0.5)}px)`;
    for (const s of visible) {
      tracePath(g, s.pts);
      g.strokeStyle = rgba(s.rgb, 0.55);
      g.lineWidth = s.w * (this.canBlur ? 2.2 : 3);
      g.stroke();
      if (!this.canBlur) {
        g.strokeStyle = rgba(s.rgb, 0.25);
        g.lineWidth = s.w * 5;
        g.stroke();
      }
    }
    g.filter = 'none';
  }

  _drawBody(ctx, s) {
    tracePath(ctx, s.pts);
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'square';
    ctx.strokeStyle = rgb(s.rgb);
    ctx.lineWidth = s.w;
    ctx.stroke();
    ctx.strokeStyle = rgb(s.coreRgb);
    ctx.lineWidth = s.w * 0.45;
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  _drawHead(ctx, s, S, ox, oy) {
    const h = s.head;
    const glow = this._headSprite(s);
    const gs = s.w * (4.5 + s.charge * 4);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glow, h.x - gs, h.y - gs, gs * 2, gs * 2);

    // electric arcs toward the line we're charging from
    if (s.spark && s.spark.k > 0.05) {
      const sp = s.spark;
      const n = 1 + (sp.k > 0.5 ? 1 : 0);
      for (let j = 0; j < n; j++) {
        ctx.beginPath();
        ctx.moveTo(h.x, h.y);
        const steps = 5;
        for (let i = 1; i < steps; i++) {
          const t = i / steps;
          ctx.lineTo(h.x + (sp.x - h.x) * t + rand(-9, 9), h.y + (sp.y - h.y) * t + rand(-9, 9));
        }
        ctx.lineTo(sp.x + rand(-4, 4), sp.y + rand(-4, 4));
        ctx.strokeStyle = rgba(j ? s.coreRgb : [255, 255, 255], 0.35 + sp.k * 0.5);
        ctx.lineWidth = 1.2 + sp.k * 1.4;
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(h.x, h.y, s.w * 0.62, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawEmote(ctx, s, sx, sy, time) {
    const left = s.emoteUntil - time;
    const a = clamp(left / 0.3, 0, 1) * clamp((2.6 - left) / 0.12 + 0.2, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = '700 11px Roboto, "Segoe UI", Arial, sans-serif';
    const tw = ctx.measureText(s.emote).width;
    const bx = sx - 26 - tw;
    const by = sy - 38;
    ctx.strokeStyle = 'rgba(80,240,220,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx + tw + 10, by + 16);
    ctx.lineTo(sx - 4, sy - 4);
    ctx.stroke();
    ctx.fillStyle = 'rgba(3,40,44,0.92)';
    roundRect(ctx, bx, by, tw + 12, 18, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#5ff5e0';
    ctx.textAlign = 'left';
    ctx.fillText(s.emote, bx + 6, by + 9.5);
    ctx.restore();
    ctx.textAlign = 'center';
  }
}

function inView(s, x0, y0, x1, y1) {
  const pts = s.pts;
  let minx = Infinity;
  let miny = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.x < minx) minx = p.x;
    if (p.x > maxx) maxx = p.x;
    if (p.y < miny) miny = p.y;
    if (p.y > maxy) maxy = p.y;
  }
  return maxx >= x0 && minx <= x1 && maxy >= y0 && miny <= y1;
}

function tracePath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function drawCrown(ctx, x, y, t) {
  const bob = Math.sin(t * 3) * 2;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.shadowColor = 'rgba(255,230,40,0.9)';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#ffe53b';
  ctx.beginPath();
  ctx.moveTo(-17, 10);
  ctx.lineTo(-19, -8);
  ctx.lineTo(-9, 1);
  ctx.lineTo(0, -12);
  ctx.lineTo(9, 1);
  ctx.lineTo(19, -8);
  ctx.lineTo(17, 10);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff6a8';
  for (const px of [-19, 0, 19]) {
    ctx.beginPath();
    ctx.arc(px, px === 0 ? -13 : -9, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#d9b400';
  ctx.fillRect(-16, 6, 32, 4);
  ctx.restore();
}
