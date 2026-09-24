// Duel setup: battlefield size, starting armies and obstacle generation.
// Coordinates are grid cells: col 0..cols-1 (left → right), row 0..rows-1.
// Large creatures occupy a 2×2 block anchored at (col, row) = its top-left cell.

export const GRID = { cols: 12, rows: 10 };

// Each side may deploy only in its two outermost columns.
export const DEPLOY_COLS = { left: [0, 1], right: [10, 11] };

export const SIDES = {
  left: { name: 'Синие', color: '#3f7fe0' },
  right: { name: 'Красные', color: '#e0503f' },
};

// One stack per tier, sized as two weeks of creature growth.
// col/row give the default formation for the left side; the right side mirrors it.
export const ARMY_TEMPLATE = [
  { tier: 7, count: 2, col: 0, row: 0 },
  { tier: 1, count: 44, col: 1, row: 2 },
  { tier: 2, count: 24, col: 0, row: 3 },
  { tier: 6, count: 4, col: 0, row: 4 },
  { tier: 5, count: 6, col: 0, row: 6 },
  { tier: 3, count: 20, col: 1, row: 7 },
  { tier: 4, count: 10, col: 0, row: 8 },
];

// Random rocks, trees and stumps in the neutral columns.
export function randomObstacles(rand = Math.random) {
  const types = ['rock', 'rock', 'tree', 'stump'];
  const n = 4 + Math.floor(rand() * 3);
  const out = [];
  const used = new Set();
  while (out.length < n) {
    const col = 3 + Math.floor(rand() * 6);
    const row = Math.floor(rand() * GRID.rows);
    const key = `${col},${row}`;
    if (used.has(key)) continue;
    used.add(key);
    out.push({ type: types[Math.floor(rand() * types.length)], col, row });
  }
  return out;
}
