import { rand, gauss, clamp } from './util.js';

// Simulated server list with a believable, slowly drifting population that
// follows each region's local time of day.
const REGIONS = [
  { id: 'eu', name: 'EU · Франкфурт', tz: 2, peak: 120 },
  { id: 'ru', name: 'RU · Москва', tz: 3, peak: 95 },
  { id: 'use', name: 'US · Нью-Йорк', tz: -4, peak: 110 },
  { id: 'usw', name: 'US · Лос-Анджелес', tz: -7, peak: 70 },
  { id: 'sa', name: 'SA · Сан-Паулу', tz: -3, peak: 85 },
  { id: 'as', name: 'Asia · Сингапур', tz: 8, peak: 75 },
];

export const ROOM_CAP = 40;

// 0..1 activity curve: dead at 5am, climbs through the day, peaks ~21:00.
function diurnal(hour) {
  const a = 0.5 + 0.5 * Math.cos(((hour - 21) / 24) * Math.PI * 2);
  const b = 0.5 + 0.5 * Math.cos(((hour - 16) / 12) * Math.PI * 2);
  return clamp(0.12 + 0.7 * a + 0.18 * b * a, 0.08, 1);
}

export class OnlineSim {
  constructor() {
    const userTz = -new Date().getTimezoneOffset() / 60;
    this.regions = REGIONS.map((r) => ({
      ...r,
      noise: gauss() * 0.08,
      basePing: Math.round(18 + Math.min(Math.abs(r.tz - userTz), 24 - Math.abs(r.tz - userTz)) * 14 + rand(0, 12)),
      rooms: [],
    }));
    this.menuShare = 0.12;
    this.pinned = null; // room the player is in: never closes
    for (const r of this.regions) this._updateRegion(r, 0, true);
  }

  _load(r) {
    const now = new Date();
    const hour = (now.getUTCHours() + now.getUTCMinutes() / 60 + r.tz + 24) % 24;
    return Math.max(4, r.peak * (diurnal(hour) + r.noise));
  }

  _updateRegion(r, dt, init) {
    // Ornstein–Uhlenbeck drift so numbers wander without running away
    r.noise += (-r.noise * 0.02 + gauss() * 0.012) * (init ? 0 : dt * 4);
    const load = this._load(r);
    const want = Math.max(1, Math.round(load / (ROOM_CAP * 0.72)));
    while (r.rooms.length < want) {
      r.rooms.push({ id: `${r.id}-${r.rooms.length + 1}`, name: `${r.name} #${r.rooms.length + 1}`, region: r, players: init ? 0 : 2, share: rand(0.7, 1.3) });
    }
    while (r.rooms.length > want + 1 && r.rooms[r.rooms.length - 1] !== this.pinned) r.rooms.pop();
    let totalShare = 0;
    r.rooms.forEach((room, i) => (totalShare += room.share / (1 + i * 0.35)));
    r.rooms.forEach((room, i) => {
      const target = clamp((load * room.share) / (1 + i * 0.35) / totalShare, 1, ROOM_CAP);
      room.target = target;
      if (room !== this.pinned) {
        room.players = init ? Math.round(target) : room.players + (target - room.players) * Math.min(1, dt * 0.3) + gauss() * 0.4 * dt;
        room.players = clamp(room.players, 0, ROOM_CAP);
      }
    });
  }

  update(dt) {
    for (const r of this.regions) this._updateRegion(r, dt, false);
  }

  get rooms() {
    return this.regions.flatMap((r) => r.rooms);
  }

  get total() {
    let t = 0;
    for (const room of this.rooms) t += room.players;
    return Math.round(t * (1 + this.menuShare));
  }

  bestRoom() {
    let best = null;
    let bestScore = -Infinity;
    for (const room of this.rooms) {
      if (room.players > ROOM_CAP - 2) continue;
      const score = -room.region.basePing * 1.2 + Math.min(room.players, 26) * 3;
      if (score > bestScore) {
        bestScore = score;
        best = room;
      }
    }
    return best || this.rooms[0];
  }

  ping(room, t) {
    const base = room.region.basePing;
    // small jitter plus the odd lag spike
    const spike = Math.sin(t * 0.37) > 0.985 ? rand(40, 160) : 0;
    return Math.round(base + Math.sin(t * 1.7) * 3 + rand(-2, 4) + spike);
  }
}
