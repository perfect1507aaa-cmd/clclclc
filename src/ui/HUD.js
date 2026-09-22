export class HUD {
  constructor(root) {
    this.root = root;
    this.root.innerHTML = `
      <div class="hud-top">
        <div class="hud-level"></div>
        <div class="hud-objective"></div>
        <button class="hud-pause" title="Меню">II</button>
      </div>
      <div class="hud-trace-wrap" hidden>
        <div class="hud-trace-label">TRACE</div>
        <div class="hud-trace-bar"><div class="hud-trace-fill"></div></div>
      </div>
      <div class="hud-progress-wrap" hidden>
        <div class="hud-progress-bar"><div class="hud-progress-fill"></div></div>
        <div class="hud-progress-label"></div>
      </div>
    `;
    this.levelEl = root.querySelector('.hud-level');
    this.objectiveEl = root.querySelector('.hud-objective');
    this.pauseBtn = root.querySelector('.hud-pause');
    this.traceWrap = root.querySelector('.hud-trace-wrap');
    this.traceFill = root.querySelector('.hud-trace-fill');
    this.progressWrap = root.querySelector('.hud-progress-wrap');
    this.progressFill = root.querySelector('.hud-progress-fill');
    this.progressLabel = root.querySelector('.hud-progress-label');
  }

  onPause(fn) {
    this.pauseBtn.addEventListener('click', fn);
  }

  setLevel(level) {
    this.levelEl.textContent = `${level.code} · ${level.name}`;
    let objText = '';
    if (level.objective === 'conquest') objText = 'Захватить всю сеть';
    else if (level.objective === 'hold') objText = `Удержать мейнфрейм ${level.holdDuration}s`;
    else if (level.objective === 'exfil') objText = `Выкачать ${level.exfilTarget} TB`;
    this.objectiveEl.textContent = objText;
    this.traceWrap.hidden = !level.trace;
    this.progressWrap.hidden = level.objective === 'conquest';
  }

  update(gameState) {
    if (gameState.traceEnabled) {
      const pct = Math.min(100, (gameState.trace / 100) * 100);
      this.traceFill.style.width = `${pct}%`;
      this.traceFill.classList.toggle('danger', pct > 75);
    }
    if (gameState.objective === 'hold') {
      const pct = (gameState.holdProgress / gameState.holdDuration) * 100;
      this.progressFill.style.width = `${pct}%`;
      this.progressLabel.textContent = `${gameState.holdProgress.toFixed(1)}s / ${gameState.holdDuration}s`;
    } else if (gameState.objective === 'exfil') {
      const pct = (gameState.exfilProgress / gameState.exfilTarget) * 100;
      this.progressFill.style.width = `${pct}%`;
      this.progressLabel.textContent = `${gameState.exfilProgress.toFixed(1)} / ${gameState.exfilTarget} TB`;
    }
  }
}
