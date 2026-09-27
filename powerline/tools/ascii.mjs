import { World } from '../src/world.js';
import { OnlineSim } from '../src/online.js';
import { Population } from '../src/population.js';
const want = process.argv[2] || 'pro';
const world = new World();
const online = new OnlineSim();
const pop = new Population(world, online);
pop.setRoom(online.bestRoom());
const oSpawn = pop.spawn.bind(pop);
pop.spawn = (b, sc) => { const s = oSpawn(b, sc); s.brain.log = []; return s; };
for (const s of world.snakes) s.brain.log = [];
let shown = 0;
const origKill = world.kill.bind(world);
world.kill = (s, killer, reason) => {
  const types = want.split(',');
  if ((types.includes(s.owner.persona.type) || (types.includes('regular') && s.owner.persona.regular)) && shown < 4 && world.time > 5) {
    shown++;
    const h = s.head;
    const C = 18; const W = 70, H = 34;
    const grid = Array.from({ length: H }, () => Array(W).fill(' '));
    const ox = h.x - (W / 2) * C, oy = h.y - (H / 2) * C;
    const letters = new Map();
    let li = 0;
    for (const o of world.snakes) {
      if (!o.alive && o !== s) continue;
      const ch = o === s ? '#' : 'abcdefghijklmnopqrstuvwxyz'[li++ % 26];
      letters.set(o, ch);
      o.sampleBody(C / 2, (x, y) => {
        const gx = Math.floor((x - ox) / C), gy = Math.floor((y - oy) / C);
        if (gx >= 0 && gy >= 0 && gx < W && gy < H) grid[gy][gx] = ch;
      });
      const oh = o.head;
      const gx = Math.floor((oh.x - ox) / C), gy = Math.floor((oh.y - oy) / C);
      if (gx >= 0 && gy >= 0 && gx < W && gy < H) grid[gy][gx] = o === s ? '@' : ch.toUpperCase();
    }
    console.log(`=== ${s.owner.persona.type} (${s.name}) ${reason} killer=${killer && killer !== 'wall' ? letters.get(killer) + ' ' + killer.owner.persona.type : '-'} dir=${s.dir} spd=${s.speed.toFixed(0)} w=${s.w.toFixed(0)} cell=${C}`);
    console.log(s.brain.mode, s.brain.log.slice(-14).join('\n'));
    console.log(grid.map((r) => '|' + r.join('') + '|').join('\n'));
  }
  origKill(s, killer, reason);
};
for (let i = 0; i < 60 * 300 && shown < 4; i++) {
  world.step(1 / 60);
  for (const ev of world.events) if (ev.type === 'death') pop.onDeath(ev);
  world.events.length = 0;
  pop.update(1 / 60, false);
}
