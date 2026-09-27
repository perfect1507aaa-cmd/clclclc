// Headless balance check: node tools/headless.mjs [seconds]
import { World } from '../src/world.js';
import { OnlineSim } from '../src/online.js';
import { Population } from '../src/population.js';

const secs = +(process.argv[2] || 180);
const world = new World();
const online = new OnlineSim();
const pop = new Population(world, online);
const room = online.bestRoom();
pop.setRoom(room);
const stats = { wall: 0, self: 0, snake: 0, byType: {}, killsByType: {}, detail: {}, life: {}, maxS: {} };
const alive = {};
const t0 = performance.now();
const dt = 1 / 60;
for (let i = 0; i < secs * 60; i++) {
  world.step(dt);
  online.update(dt);
  for (const ev of world.events) {
    if (ev.type !== 'death') continue;
    stats[ev.reason]++;
    const ty = ev.snake.owner.persona.type;
    stats.byType[ty] = (stats.byType[ty] || 0) + 1;
    const key = ty + ':' + ev.reason;
    stats.detail[key] = (stats.detail[key] || 0) + 1;
    (stats.life[ty] ||= []).push(world.time - ev.snake.born);
    (stats.maxS[ty] ||= []).push(ev.snake.maxScore);
    if (ev.killer) {
      const kt = ev.killer.owner.persona.type;
      stats.killsByType[kt] = (stats.killsByType[kt] || 0) + 1;
    }
    pop.onDeath(ev);
  }
  world.events.length = 0;
  pop.update(dt, false);
  if (i % 60 === 0) for (const s of world.snakes) alive[s.owner.persona.type] = (alive[s.owner.persona.type] || 0) + 1;
}
for (const t in stats.life) {
  const l = stats.life[t];
  const avg = l.reduce((a, b) => a + b, 0) / l.length;
  const ms = stats.maxS[t].reduce((a, b) => a + b, 0) / l.length;
  console.log(`${t}: deaths/min/bot ${(l.length / (alive[t] / 60)).toFixed(2)} avgLife ${avg.toFixed(0)}s avgMaxScore ${ms.toFixed(0)}`);
}
delete stats.life; delete stats.maxS;
const ms = performance.now() - t0;
console.log(`room ${room.name} target ${room.target.toFixed(1)} present ${pop.present}`);
console.log(`${(ms / (secs * 60)).toFixed(3)} ms/step`);
console.log(stats);
const types = {};
for (const s of world.snakes) {
  const t = s.owner.persona.type;
  (types[t] ||= []).push(Math.round(s.score));
}
for (const t in types) console.log(t, types[t].sort((a, b) => b - a).join(' '));
console.log('food', world.food.items.length);
