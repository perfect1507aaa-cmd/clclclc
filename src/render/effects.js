// Scanlines + vignette overlay, precomputed to an offscreen canvas and
// redrawn only on resize — it's static, no need to rebuild every frame.
export class ScreenEffects {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.w = 0;
    this.h = 0;
  }

  build(w, h) {
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);

    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 3) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
      ctx.stroke();
    }

    const grad = ctx.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.35,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.72
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.lineWidth = Math.max(w, h) * 0.06;
    ctx.strokeRect(0, 0, w, h);
  }

  draw(ctx, w, h) {
    if (this.w !== w || this.h !== h) this.build(w, h);
    ctx.drawImage(this.canvas, 0, 0);
  }
}
