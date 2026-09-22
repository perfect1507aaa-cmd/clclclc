import { TRAVEL_TIME_SCALE, TRAVEL_TIME_MIN } from './constants.js';

let uid = 0;

// A live point-to-point pipe from one node to another. Packets drawn from
// the source accumulate as `inTransit` mass and leak toward the
// destination over `travelTime` (derived from on-screen distance) — so a
// longer connection holds more mass in flight at any given moment. A cut
// splits whatever is currently in the pipe between the two ends.
export class Connection {
  constructor(fromId, toId, owner) {
    this.id = `c${uid++}`;
    this.from = fromId;
    this.to = toId;
    this.owner = owner;
    this.inTransit = 0;
    this.deliverFlow = 0; // last tick's delivered rate, for rendering
    this.drawFlow = 0; // last tick's draw rate, for rendering
  }

  travelTime(nodes) {
    const a = nodes.get(this.from);
    const b = nodes.get(this.to);
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    return Math.max(TRAVEL_TIME_MIN, dist * TRAVEL_TIME_SCALE);
  }
}
