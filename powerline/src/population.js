import { SNAKE_COLORS, CFG } from './config.js';
import { Brain, makePersona, pickArchetype, adjustForm } from './brain.js';
import { botName, regularName } from './names.js';
import { rand, randInt, pick, chance, gauss } from './util.js';

const WARM_SCORE = { newbie: 35, casual: 140, grazer: 220, killer: 260, pro: 450 };

export class BotPlayer {
  constructor(type, name) {
    this.persona = makePersona(type);
    this.name = name || botName(type);
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
    const n = Math.max(6, Math.round(room.target ?? room.players));

    // Server regulars: a handful of strong players who basically live here,
    // sit at the top of the board and come straight back after dying.
    const clan = pick(['[PL]', '[NRG]', '[GOD]', '[VX]', 'ツ']);
    const regs = randInt(4, 5);
    const usedNames = new Set();
    for (let i = 0; i < regs; i++) {
      let name;
      const core = (n) => n.replace(/[^A-Za-z]/g, '').replace(/^(PL|NRG|GOD|VX|EU|RU|ZZ|TTV|K)/, '').toLowerCase();
      do name = i < 2 ? `${clan} ${regularName()}` : botName('pro');
      while (usedNames.has(core(name)));
      usedNames.add(core(name));
      const b = new BotPlayer('pro', name);
      b.persona.regular = true;
      b.persona.base = Math.max(b.persona.base, 0.93);
      b.persona.form = 0;
      b.persona.lives = Infinity;
      this.bots.push(b);
      this.spawn(b, rand(600, 2200) * (1 - i * 0.12));
    }

    for (let i = regs; i < n; i++) {
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
    if (b.pendingLine) {
      s.say(b.pendingLine, this.world.time);
      b.pendingLine = null;
    } else if (chance(b.persona.chatty * 0.06)) s.say(pick(['Hi!', 'hello', 'привет', 'hey', 'o/']), this.world.time);
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
      const quick = b.persona.type === 'pro' || b.persona.type === 'killer';
      b.respawnAt = now + (b.persona.regular ? rand(0.8, 2.2) : quick ? rand(1.2, 3.5) : rand(2, 10));
      if (!b.persona.regular) {
        // getting killed by a real person stings a bit more
        if (ev.killer && ev.killer.isPlayer && chance(0.12)) b.lives = 0;
        if (chance(0.03)) b.respawnAt += rand(10, 40); // wandered off to another tab
      } else if (chance(b.persona.chatty * 0.15)) {
        b.pendingLine = pick(['brb', 'again...', 'lag', 'ugh', 'ok']);
      }
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
        const p = b.persona.regular ? 0.00003 : b.leaving ? (b.snake.score < 60 ? 0.03 : 0.004) : 0.0004;
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
      const candidates = this.bots.filter((b) => !b.leaving && !b.persona.regular);
      if (candidates.length) pick(candidates).leaving = true;
    }

    room.players = this.present + (playerIn ? 1 : 0);
  }
}
