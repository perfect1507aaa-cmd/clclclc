// Headless balance check: node tools/headless.mjs [seconds] [seed] [players]
// With a seed the run is reproducible (fixed RNG, fixed room size).
const seedArg = process.argv[3];
if (seedArg !== undefined) {
  let a = +seedArg >>> 0 || 1;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
import { World } from '../src/world.js';
import { OnlineSim } from '../src/online.js';
import { Population } from '../src/population.js';

const secs = +(process.argv[2] || 180);
const world = new World();
const online = new OnlineSim();
const pop = new Population(world, online);
const room = online.bestRoom();
if (seedArg !== undefined) room.target = +(process.argv[4] || 32);
pop.setRoom(room);

const kind = (s) => (s.owner.persona.regular ? 'regular' : s.owner.persona.type);
const deaths = {};
const reasons = {};
const lives = {};
const kills = {};
const maxScore = {};
const aliveSamples = {};
const modeTime = {};
let top5Regs = 0;
let top5Samples = 0;
let top1Reg = 0;
let nnSum = 0;
let nnN = 0;
const comeback = []; // seconds from a regular's respawn to its return into the top 5
const reachedTop = new WeakSet();

const t0 = performance.now();
const dt = 1 / 60;
for (let i = 0; i < secs * 60; i++) {
  world.step(dt);
  if (seedArg === undefined) online.update(dt);
  for (const ev of world.events) {
    if (ev.type === 'death') {
      const k = kind(ev.snake);
      deaths[k] = (deaths[k] || 0) + 1;
      reasons[`${k}:${ev.reason}`] = (reasons[`${k}:${ev.reason}`] || 0) + 1;
      (lives[k] ||= []).push(world.time - ev.snake.born);
      (maxScore[k] ||= []).push(ev.snake.maxScore);
      if (ev.killer) kills[kind(ev.killer)] = (kills[kind(ev.killer)] || 0) + 1;
    }
    if (ev.type === 'death' || ev.type === 'leave') pop.onDeath(ev);
  }
  world.events.length = 0;
  pop.update(dt, false);

  if (i % 30 === 0) {
    for (const s of world.snakes) {
      const k = kind(s);
      aliveSamples[k] = (aliveSamples[k] || 0) + 0.5;
      const m = (modeTime[k] ||= {});
      m[s.brain.mode] = (m[s.brain.mode] || 0) + 1;
    }
    const top = world.ranked.slice(0, 5);
    top5Regs += top.filter((s) => s.owner.persona.regular).length;
    if (top[0] && top[0].owner.persona.regular) top1Reg++;
    top5Samples++;
    for (const s of top) {
      if (s.owner.persona.regular && !reachedTop.has(s) && world.time - s.born > 1 && s.born > 1) {
        reachedTop.add(s);
        comeback.push(world.time - s.born);
      }
    }
    // clustering: mean distance to the nearest other head
    for (const s of world.snakes) {
      let best = Infinity;
      for (const o of world.snakes) if (o !== s) best = Math.min(best, Math.hypot(o.head.x - s.head.x, o.head.y - s.head.y));
      if (best < Infinity) {
        nnSum += best;
        nnN++;
      }
    }
  }
}
const ms = performance.now() - t0;
console.log(`room ${room.name} target ${room.target.toFixed(1)} present ${pop.present}  ${(ms / (secs * 60)).toFixed(3)} ms/step`);
for (const k of Object.keys(aliveSamples)) {
  const l = lives[k] || [];
  const avg = l.length ? l.reduce((a, b) => a + b, 0) / l.length : NaN;
  const ms2 = l.length ? maxScore[k].reduce((a, b) => a + b, 0) / l.length : NaN;
  const m = modeTime[k];
  const tot = Object.values(m).reduce((a, b) => a + b, 0);
  const modes = Object.entries(m).sort((a, b) => b[1] - a[1]).map(([n, v]) => `${n} ${Math.round((v / tot) * 100)}%`).join(', ');
  console.log(`${k.padEnd(8)} deaths/min/bot ${((l.length / aliveSamples[k]) * 60).toFixed(2)}  avgLife ${avg.toFixed(0)}s  avgMax ${ms2.toFixed(0)}  growth ${(ms2 / avg).toFixed(1)}/s  kills/min ${(((kills[k] || 0) / aliveSamples[k]) * 60).toFixed(2)}  | ${modes}`);
}
console.log(`regulars in top-5: ${(top5Regs / top5Samples).toFixed(2)} of 5 on average; #1 is a regular ${Math.round((top1Reg / top5Samples) * 100)}% of the time`);
console.log(`regular comebacks to top-5: ${comeback.map((c) => c.toFixed(0) + 's').join(' ') || '—'}`);
const n = world.snakes.length;
const uniform = 0.5 * world.size / Math.sqrt(n);
console.log(`mean nearest-head distance ${(nnSum / nnN).toFixed(0)} (uniform scatter would be ~${uniform.toFixed(0)})`);
console.log('death reasons', JSON.stringify(reasons));
console.log('top now:', world.ranked.slice(0, 6).map((s) => `${s.name}(${kind(s)}) ${Math.round(s.score)}`).join(' | '));
