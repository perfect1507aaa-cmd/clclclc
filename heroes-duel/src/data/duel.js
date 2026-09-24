// Duel setup: battlefield dimensions, both armies and obstacle layout.
// Coordinates are grid cells: col 0..GRID.cols-1 (left → right), row 0..GRID.rows-1.
// Large creatures occupy a 2×2 block anchored at (col, row) = its top-left cell.

export const GRID = { cols: 12, rows: 10 };

export const ARMIES = [
  {
    side: 'left',
    name: 'Синие',
    hero: 'Рыцарь Зари',
    color: '#3f7fe0',
    stacks: [
      { id: 'archangel', count: 3, col: 0, row: 0 },
      { id: 'conscript', count: 66, col: 1, row: 2 },
      { id: 'marksman', count: 36, col: 0, row: 3 },
      { id: 'paladin', count: 6, col: 0, row: 4 },
      { id: 'inquisitor', count: 9, col: 0, row: 6 },
      { id: 'squire', count: 30, col: 1, row: 7 },
      { id: 'imperial_griffin', count: 15, col: 0, row: 8 },
    ],
  },
  {
    side: 'right',
    name: 'Красные',
    hero: 'Рыцарь Заката',
    color: '#e0503f',
    stacks: [
      { id: 'seraph', count: 3, col: 10, row: 0 },
      { id: 'brute', count: 66, col: 10, row: 2 },
      { id: 'crossbowman', count: 36, col: 11, row: 3 },
      { id: 'champion', count: 6, col: 10, row: 4 },
      { id: 'zealot', count: 9, col: 11, row: 6 },
      { id: 'vindicator', count: 30, col: 10, row: 7 },
      { id: 'battle_griffin', count: 15, col: 10, row: 8 },
    ],
  },
];

// Impassable cells in no-man's land.
export const OBSTACLES = [
  { type: 'rock', col: 5, row: 2 },
  { type: 'rock', col: 6, row: 2 },
  { type: 'tree', col: 4, row: 6 },
  { type: 'stump', col: 7, row: 7 },
  { type: 'rock', col: 6, row: 5 },
];
