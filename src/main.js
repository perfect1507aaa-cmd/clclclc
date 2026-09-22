import { GameState } from './core/GameState.js';
import { Opponent } from './ai/Opponent.js';
import { LEVELS } from './levels/levels.js';
import { Renderer } from './render/Renderer.js';
import { InputController } from './input/InputController.js';
import { HUD } from './ui/HUD.js';
import { Progress } from './save.js';
import { OWNER } from './core/constants.js';

const menuScreen = document.getElementById('menu-screen');
const gameScreen = document.getElementById('game-screen');
const endOverlay = document.getElementById('end-overlay');
const pauseOverlay = document.getElementById('pause-overlay');
const levelGrid = document.getElementById('level-grid');
const canvas = document.getElementById('game-canvas');
const hudRoot = document.getElementById('hud');

const hud = new HUD(hudRoot);
const renderer = new Renderer(canvas);

let gameState = null;
let opponent = null;
let currentLevelIndex = 0;
let paused = false;
let lastTs = 0;
let rafId = null;

const input = new InputController(canvas, renderer, {
  getGameState: () => (paused ? null : gameState),
  onToggleChannel: (from, to) => {
    if (!gameState) return;
    gameState.toggleChannel(from, to, OWNER.PLAYER);
  },
  onClaimDormant: (id) => {
    if (!gameState) return;
    gameState.attemptClaimDormant(id, OWNER.PLAYER);
  },
  onUpgrade: (id, branch) => {
    if (!gameState) return;
    gameState.attemptUpgrade(id, branch, OWNER.PLAYER);
  },
});

function buildMenu() {
  levelGrid.innerHTML = '';
  const progress = Progress.get();
  LEVELS.forEach((level, i) => {
    const tile = document.createElement('button');
    const unlocked = i + 1 <= progress.unlocked;
    const completed = progress.completed.includes(i);
    tile.className = 'level-tile' + (unlocked ? '' : ' locked') + (completed ? ' completed' : '');
    tile.innerHTML = `<span class="code">${level.code}</span><span class="name">${level.name}</span>`;
    if (unlocked) {
      tile.addEventListener('click', () => startLevel(i));
    } else {
      tile.disabled = true;
    }
    levelGrid.appendChild(tile);
  });
}

document.getElementById('reset-progress').addEventListener('click', () => {
  Progress.reset();
  buildMenu();
});

function showScreen(el) {
  [menuScreen, gameScreen].forEach((s) => s.classList.add('hidden'));
  el.classList.remove('hidden');
}

function startLevel(index) {
  currentLevelIndex = index;
  const level = LEVELS[index];
  gameState = new GameState(level);
  if (level.hasOpponent) {
    opponent = new Opponent(level);
    gameState.setAiPowerMult(opponent.powerMult);
  } else {
    opponent = null;
  }
  input.clearSelection();
  hud.setLevel(level);
  endOverlay.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  paused = false;
  showScreen(gameScreen);
  renderer.resize(gameState);
  lastTs = performance.now();
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

function loop(ts) {
  rafId = requestAnimationFrame(loop);
  let dt = (ts - lastTs) / 1000;
  lastTs = ts;
  dt = Math.min(dt, 0.05);

  if (!paused && gameState) {
    if (!gameState.result) {
      gameState.tick(dt);
      if (opponent) opponent.update(dt, gameState);
      hud.update(gameState);
      if (gameState.result) onLevelEnd(gameState.result);
    }
  }

  if (gameState) renderer.render(gameState, input.getState(), paused ? 0 : dt);
}

function onLevelEnd(result) {
  const level = LEVELS[currentLevelIndex];
  const titleEl = document.getElementById('end-title');
  const subEl = document.getElementById('end-sub');
  const nextBtn = document.getElementById('end-next');

  if (result === 'victory') {
    titleEl.textContent = 'СЕТЬ ВЗЯТА';
    titleEl.className = 'victory';
    subEl.textContent = `${level.code} · ${level.name} пройден`;
    Progress.markComplete(currentLevelIndex, LEVELS.length);
    nextBtn.style.display = currentLevelIndex + 1 < LEVELS.length ? 'inline-block' : 'none';
  } else {
    titleEl.textContent = 'СОЕДИНЕНИЕ РАЗОРВАНО';
    titleEl.className = 'defeat';
    subEl.textContent = 'узлы потеряны, доступ закрыт';
    nextBtn.style.display = 'none';
  }
  endOverlay.classList.remove('hidden');
}

document.getElementById('end-retry').addEventListener('click', () => startLevel(currentLevelIndex));
document.getElementById('end-next').addEventListener('click', () => startLevel(currentLevelIndex + 1));
document.getElementById('end-menu').addEventListener('click', () => {
  endOverlay.classList.add('hidden');
  buildMenu();
  showScreen(menuScreen);
});

hud.onPause(() => {
  if (!gameState || gameState.result) return;
  paused = true;
  pauseOverlay.classList.remove('hidden');
});
document.getElementById('pause-resume').addEventListener('click', () => {
  paused = false;
  pauseOverlay.classList.add('hidden');
  lastTs = performance.now();
});
document.getElementById('pause-restart').addEventListener('click', () => {
  pauseOverlay.classList.add('hidden');
  startLevel(currentLevelIndex);
});
document.getElementById('pause-menu').addEventListener('click', () => {
  paused = false;
  pauseOverlay.classList.add('hidden');
  buildMenu();
  showScreen(menuScreen);
});

window.addEventListener('resize', () => {
  if (gameState) renderer.resize(gameState);
});

buildMenu();
showScreen(menuScreen);
