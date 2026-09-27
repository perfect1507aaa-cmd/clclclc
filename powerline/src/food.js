import { CFG, FOOD_COLORS } from './config.js';
import { PointGrid } from './grid.js';
import { rand, pick } from './util.js';

const radiusFor = (v) => Math.min(13, 3.6 + Math.sqrt(v) * 2.1);

export class FoodField {
  constructor(size) {
    this.size = size;
    this.items = [];
    this.moving = [];
    this.ambient = 0;
    this.grid = new PointGrid(size, CFG.FOOD_CELL);
    // Rich "pastures" that slowly drift; most ambient food appears there, so
    // players naturally gather instead of spreading evenly over the map.
    this.zones = Array.from({ length: 4 }, () => {
      const a = rand(Math.PI * 2);
      return { x: rand(900, size - 900), y: rand(900, size - 900), r: rand(550, 750), vx: Math.cos(a) * 12, vy: Math.sin(a) * 12 };
    });
  }

  add(x, y, v, color, ambient, vx = 0, vy = 0) {
    const f = { x, y, v, r: radiusFor(v), color, ambient, rot: rand(Math.PI), spin: rand(-1.2, 1.2), vx, vy, dead: false, born: 0 };
    this.items.push(f);
    if (ambient) this.ambient++;
    if (vx || vy) this.moving.push(f);
    return f;
  }

  spawnAmbient(count) {
    const m = 40;
    for (let i = 0; i < count; i++) {
      const inZone = Math.random() < 0.75;
      const z = inZone ? pick(this.zones) : null;
      const a = rand(Math.PI * 2);
      const rr = z ? Math.sqrt(Math.random()) * z.r : 0;
      // Slight clustering: a third of ambient food appears in small clumps.
      if (Math.random() < 0.33) {
        const cx = z ? z.x + Math.cos(a) * rr : rand(m, this.size - m);
        const cy = z ? z.y + Math.sin(a) * rr : rand(m, this.size - m);
        const color = pick(FOOD_COLORS);
        const n = 3 + Math.floor(rand(5));
        for (let j = 0; j < n; j++) {
          this.add(Math.min(this.size - m, Math.max(m, cx + rand(-70, 70))), Math.min(this.size - m, Math.max(m, cy + rand(-70, 70))), rand(1, 2.2), color, true);
        }
        i += n - 1;
      } else if (z) {
        const x = Math.min(this.size - m, Math.max(m, z.x + Math.cos(a) * rr));
        const y = Math.min(this.size - m, Math.max(m, z.y + Math.sin(a) * rr));
        this.add(x, y, rand(1, 2.2), pick(FOOD_COLORS), true);
      } else {
        this.add(rand(m, this.size - m), rand(m, this.size - m), rand(1, 2.2), pick(FOOD_COLORS), true);
      }
    }
  }

  // Scatter a dead snake's body into pellets.
  dropBody(snake) {
    const total = snake.score * CFG.DEATH_DROP;
    const count = Math.max(8, Math.min(240, Math.round(snake.score / 3)));
    const v = total / count;
    const step = Math.max(6, snake.curLen / count);
    const jitter = snake.w * 1.1 + 6;
    snake.sampleBody(step, (x, y) => {
      const a = rand(Math.PI * 2);
      const s = rand(10, 90);
      this.add(
        Math.min(this.size - 5, Math.max(5, x + rand(-jitter, jitter))),
        Math.min(this.size - 5, Math.max(5, y + rand(-jitter, jitter))),
        v * rand(0.7, 1.3),
        snake.color,
        false,
        Math.cos(a) * s,
        Math.sin(a) * s,
      );
    });
  }

  update(dt) {
    if (this.moving.length) {
      const damp = Math.exp(-4 * dt);
      let w = 0;
      for (const f of this.moving) {
        if (f.dead) continue;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.vx *= damp;
        f.vy *= damp;
        if (Math.abs(f.vx) + Math.abs(f.vy) > 2) this.moving[w++] = f;
        else f.vx = f.vy = 0;
      }
      this.moving.length = w;
    }
    for (const f of this.items) f.rot += f.spin * dt;
    for (const z of this.zones) {
      z.x += z.vx * dt;
      z.y += z.vy * dt;
      if (z.x < 800 || z.x > this.size - 800) z.vx = -z.vx;
      if (z.y < 800 || z.y > this.size - 800) z.vy = -z.vy;
    }

    if (this.items.length < CFG.FOOD_MAX && this.ambient < CFG.FOOD_TARGET) {
      this.spawnAmbient(Math.min(4, CFG.FOOD_TARGET - this.ambient));
    }
  }

  compact() {
    let w = 0;
    let amb = 0;
    const items = this.items;
    for (let i = 0; i < items.length; i++) {
      const f = items[i];
      if (f.dead) continue;
      if (f.ambient) amb++;
      items[w++] = f;
    }
    items.length = w;
    this.ambient = amb;
  }

  rebuildGrid() {
    this.grid.clear();
    for (const f of this.items) if (!f.dead) this.grid.add(f.x, f.y, f);
  }
}
