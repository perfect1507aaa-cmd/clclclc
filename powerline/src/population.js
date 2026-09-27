import { SNAKE_COLORS, CFG } from './config.js';
import { Brain, makePersona, pickArchetype, adjustForm } from './brain.js';
import { botName } from './names.js';
import { rand, pick, chance, gauss } from './util.js';

const WARM_SCORE = { newbie: 35, casual: 140, farmer: 260, hunter: 320, pro: 650 };

export class BotPlayer {
  constructor(type) {
    this.persona = makePersona(type);
    this.name = botName(type);
    this.color = pick(SNAKE_COLORS);
    this.state = 'joining';
    this.snake = null;
    this.respawnAt = 0;
    this.lives = this.persona.lives;
    this.leaving = false;
  }
}

// Keeps the arena's bot population in line with the simulated room occupancy:
// bots join, play a few lives, sit on the death screen, rage-quit and leave.
export class Population {
  constructor(world, online) {
    this.world = world;
    this.online = online;
    this.bots = [];
    this.room = null;
    this.joinTimer = 0;
    this.leaveTimer = 0;
  }

  get present() {
    let n = 0;
    for (const b of this.bots) if (b.state !== 'gone') n++;
    return n;
  }

  setRoom(room) {
    this.room = room;
    this.online.pinned = room;
    this.bots = [];
    const n = Math.max(3, Math.round(room.target ?? room.players));
    for (let i = 0; i < n; i++) {
      const b = new BotPlayer(pickArchetype());
      this.bots.push(b);
      if (chance(0.12)) {
        b.state = 'dead';
        b.respawnAt = this.world.time + rand(0.5, 8);
      } else {
        const mean = WARM_SCORE[b.persona.type];
        const score = Math.min(3200, CFG.START_SCORE + -Math.log(Math.random() + 1e-9) * mean);
        this.spawn(b, score);
      }
    }
  }

  spawn(b, score = CFG.START_SCORE) {
    adjustForm(b.persona, 'spawn');
    const s = this.world.addSnake({ name: b.name, color: b.color, score, owner: b });
    s.brain = new Brain(this.world, s, b.persona);
    b.snake = s;
    b.state = 'alive';
    if (chance(b.persona.chatty * 0.06)) s.say(pick(['Hi!', 'hello', 'привет', 'hey', 'o/']), this.world.time);
    return s;
  }

  onDeath(ev) {
    const now = this.world.time;
    const b = ev.snake.owner;
    if (b) {
      b.state = 'dead';
      b.snake = null;
      b.lives--;
      adjustForm(b.persona, 'death');
      const quick = b.persona.type === 'pro' || b.persona.type === 'hunter';
      b.respawnAt = now + (quick ? rand(1.2, 3.5) : rand(2, 10));
      // getting killed by a real person stings a bit more
      if (ev.killer && ev.killer.isPlayer && chance(0.12)) b.lives = 0;
      if (chance(0.03)) b.respawnAt += rand(10, 40); // wandered off to another tab
    }
    const k = ev.killer;
    if (k && k.owner) adjustForm(k.owner.persona, 'kill');
    if (k && k.owner && k.alive && chance(k.owner.persona.chatty * (ev.snake.isPlayer ? 0.8 : 0.45))) {
      const lines = k.owner.persona.toxic ? ['ez', 'noob', 'LOL', 'bye', 'rekt', 'lol'] : ['gg', 'LOL', ':)', 'sorry', 'oops', 'gg wp'];
      k.say(pick(lines), now + rand(0.2, 0.8));
    }
  }

  update(dt, playerIn) {
    const now = this.world.time;
    const room = this.room;
    if (!room) return;

    for (const b of this.bots) {
      if (b.state === 'dead' && now >= b.respawnAt) {
        if (b.lives <= 0 || b.leaving) b.state = 'gone';
        else this.spawn(b);
      } else if (b.state === 'alive' && b.snake) {
        // rare disconnects; small snakes that are "leaving" quit mid-round
        const p = b.leaving ? (b.snake.score < 60 ? 0.03 : 0.004) : 0.0004;
        if (chance(p * dt)) {
          this.world.removeSnake(b.snake);
          b.snake = null;
          b.state = 'gone';
        }
      }
    }
    this.bots = this.bots.filter((b) => b.state !== 'gone');

    const target = Math.round(room.target + gauss() * 0.3) - (playerIn ? 1 : 0);
    const present = this.present;
    this.joinTimer -= dt;
    if (present < target && this.joinTimer <= 0) {
      this.joinTimer = rand(0.8, 4.5);
      const b = new BotPlayer(pickArchetype());
      b.state = 'dead';
      b.respawnAt = now + rand(0.3, 2.5); // "connecting…"
      this.bots.push(b);
    }
    this.leaveTimer -= dt;
    if (present > target + 1 && this.leaveTimer <= 0) {
      this.leaveTimer = rand(3, 12);
      const candidates = this.bots.filter((b) => !b.leaving);
      if (candidates.length) pick(candidates).leaving = true;
    }

    room.players = this.present + (playerIn ? 1 : 0);
  }
}
