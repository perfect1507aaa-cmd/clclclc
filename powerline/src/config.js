export const CFG = {
  MAP: 6000,
  MAX_STEP: 1 / 60,

  BASE_SPEED: 265,
  MAX_BOOST: 0.75, // +75% at full charge
  CHARGE_GAIN: 2.6,
  CHARGE_DECAY: 0.28, // slow cool-down: a charge carries you for a few seconds
  CHARGE_RANGE: 70, // extra reach (beyond both half-widths) that still charges you

  START_SCORE: 10,
  LEN_BASE: 140,
  LEN_PER_SCORE: 5.5,
  WIDTH_MIN: 7,
  WIDTH_K: 0.32,
  WIDTH_MAX: 22,

  FOOD_TARGET: 1000,
  FOOD_MAX: 3400,
  DEATH_DROP: 0.7, // fraction of score converted into food on death

  SEG_CELL: 160,
  FOOD_CELL: 128,
};

// directions: 0 right, 1 down, 2 left, 3 up (screen space, y grows down)
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];
export const turnRight = (d) => (d + 1) & 3;
export const turnLeft = (d) => (d + 3) & 3;
export const opposite = (d) => (d + 2) & 3;

export const SNAKE_COLORS = [
  '#ff9ec4', // pink
  '#e8a3ff', // lilac
  '#7ff0ff', // cyan
  '#c8ff6e', // lime
  '#5dff8f', // green
  '#7dffd2', // mint
  '#ffa64d', // orange
  '#ffe45c', // yellow
  '#ff5c7a', // red
  '#6aa8ff', // blue
  '#ff5ce1', // magenta
  '#b28cff', // violet
  '#f4f4ff', // white
];

export const FOOD_COLORS = ['#ff4fa3', '#c04dff', '#ff5ce1', '#9b5cff', '#ff9a3c', '#ffd23f', '#ff6b6b'];

export const EMOTES = ['LOL', 'gg', 'Hi!', 'ez', 'rip', 'wow', 'oops', 'run!'];

export const widthFor = (score) => Math.min(CFG.WIDTH_MAX, CFG.WIDTH_MIN + Math.sqrt(score) * CFG.WIDTH_K);
export const lengthFor = (score) => CFG.LEN_BASE + score * CFG.LEN_PER_SCORE;
