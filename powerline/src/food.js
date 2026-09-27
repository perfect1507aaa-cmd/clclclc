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
      // Slight clustering: a third of ambient food appears in small clumps.
      if (Math.random() < 0.33) {
        const cx = rand(m, this.size - m);
        const cy = rand(m, this.size - m);
        const color = pick(FOOD_COLORS);
        const n = 3 + Math.floor(rand(5));
        for (let j = 0; j < n; j++) {
          this.add(Math.min(this.size - m, Math.max(m, cx + rand(-70, 70))), Math.min(this.size - m, Math.max(m, cy + rand(-70, 70))), rand(1, 2.2), color, true);
        }
        i += n - 1;
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
