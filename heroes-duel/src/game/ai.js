// Simple greedy opponent: shoot if possible, otherwise make the most valuable
// melee strike in reach, otherwise advance toward the nearest enemy.
import { Battle, totalHp, rect, rectGap } from './battle.js';

const value = (u) => u.def.hp * (1 + u.def.tier * 0.35);

function expected(battle, att, target, opts) {
  const r = battle.damageRange(att, target, opts);
  return Math.min((r.min + r.max) / 2, totalHp(target));
}

export function decide(battle, u) {
  const enemies = battle.enemiesOf(u);
  if (!enemies.length) return { type: 'defend' };

  if (battle.canShoot(u)) {
    let best = null;
    for (const e of enemies) {
      const dmg = expected(battle, u, e, { ranged: true });
      const score = (dmg / e.def.hp) * value(e);
      if (!best || score > best.score) best = { score, target: e };
    }
    return { type: 'shoot', target: best.target };
  }

  const reach = battle.reachable(u);
  let best = null;
  for (const e of enemies) {
    for (const n of battle.meleeOptions(u, e, reach)) {
      const moved = n.steps;
      const dmg = expected(battle, u, e, { ranged: false, moved });
      let score = (dmg / e.def.hp) * value(e);
      if (battle.canRetaliate(e)) score -= 0.25 * value(u);
      score -= n.cost * 0.01; // prefer shorter walks on ties
      if (!best || score > best.score) best = { score, target: e, node: n };
    }
  }
  if (best) return { type: 'melee', target: best.target, node: best.node, path: Battle.path(best.node) };

  // Nothing in reach: move to the reachable spot closest to any enemy.
  let move = null;
  for (const n of reach.values()) {
    const me = rect(u, n.col, n.row);
    let d = Infinity;
    for (const e of enemies) d = Math.min(d, rectGap(me, rect(e)) + battle.distance({ ...u, col: n.col, row: n.row }, e) * 0.01);
    if (!move || d < move.d) move = { d, node: n };
  }
  if (move && move.node.steps > 0) return { type: 'move', node: move.node, path: Battle.path(move.node) };
  return { type: 'defend' };
}
