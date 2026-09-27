const KEY_DIRS = {
  ArrowRight: 0, KeyD: 0,
  ArrowDown: 1, KeyS: 1,
  ArrowLeft: 2, KeyA: 2,
  ArrowUp: 3, KeyW: 3,
};

export class Input {
  constructor(canvas, handlers) {
    this.h = handlers;
    this.mouse = null; // last cursor position in CSS px
    this.mouseMovedAt = 0;

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      const d = KEY_DIRS[e.code];
      if (d !== undefined) {
        e.preventDefault();
        this.h.onDir(d, 'key');
        return;
      }
      if (e.code.startsWith('Digit')) {
        const n = +e.code.slice(5);
        if (n >= 1 && n <= 8) this.h.onEmote(n - 1);
      } else if (e.code === 'KeyM') this.h.onMute();
      else if (e.code === 'Enter' || e.code === 'Space') this.h.onConfirm(e);
      else if (e.code === 'Escape') this.h.onEscape();
    });

    canvas.addEventListener('mousemove', (e) => {
      this.mouse = { x: e.clientX, y: e.clientY };
      this.mouseMovedAt = performance.now();
    });

    // swipe steering: every 22px of finger travel along an axis is a turn
    let origin = null;
    canvas.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      origin = { x: t.clientX, y: t.clientY };
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      if (!origin) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - origin.x;
      const dy = t.clientY - origin.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 22) {
        const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : dy > 0 ? 1 : 3;
        this.h.onDir(d, 'touch');
        origin = { x: t.clientX, y: t.clientY };
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchend', () => (origin = null));
  }

  // Direction the cursor points to relative to (hx, hy), with a dead zone.
  mouseDir(hx, hy, current) {
    if (!this.mouse) return null;
    const dx = this.mouse.x - hx;
    const dy = this.mouse.y - hy;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (Math.max(ax, ay) < 30) return null;
    let d = ax > ay ? (dx > 0 ? 0 : 2) : dy > 0 ? 1 : 3;
    // pointing straight back: start the U-turn toward the cursor's side
    if (d === ((current + 2) & 3)) {
      if (d === 0 || d === 2) d = dy > 0 ? 1 : 3;
      else d = dx > 0 ? 0 : 2;
    }
    return d;
  }
}
