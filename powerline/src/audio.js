// Tiny WebAudio synth: no assets needed.
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.lastEat = 0;
    try {
      this.muted = localStorage.getItem('pl.muted') === '1';
    } catch {
      /* storage unavailable */
    }
  }

  unlock() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(this.ctx.destination);

    // continuous electric hum, driven by the player's charge
    this.hum = this.ctx.createOscillator();
    this.hum.type = 'sawtooth';
    this.hum.frequency.value = 70;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    this.humGain = this.ctx.createGain();
    this.humGain.gain.value = 0;
    this.hum.connect(lp).connect(this.humGain).connect(this.master);
    this.hum.start();
  }

  toggle() {
    this.muted = !this.muted;
    try {
      localStorage.setItem('pl.muted', this.muted ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.6;
    return this.muted;
  }

  _tone(freq, dur, type = 'sine', vol = 0.1, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // Bright bell-like "ting"; quick pickups in a row climb in pitch.
  eat() {
    if (!this.ctx) return;
    const now = performance.now();
    if (now - this.lastEat < 40) return;
    this.combo = now - this.lastEat < 450 ? Math.min((this.combo || 0) + 1, 12) : 0;
    this.lastEat = now;
    const f = 1568 * 2 ** (this.combo / 6); // whole-tone steps from G6
    const t = this.ctx.currentTime;
    const partials = [
      [1, 0.05, 0.45],
      [2.76, 0.018, 0.22], // inharmonic partial gives the metallic ring
      [5.4, 0.008, 0.1],
    ];
    for (const [mul, vol, dur] of partials) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f * mul;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
  }

  kill() {
    [660, 880, 1320].forEach((f, i) => setTimeout(() => this._tone(f, 0.12, 'square', 0.04), i * 70));
  }

  death() {
    if (!this.ctx) return;
    this._tone(320, 0.7, 'sawtooth', 0.09, 0.15);
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.4);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = 0.12;
    src.connect(g).connect(this.master);
    src.start(t);
  }

  setCharge(k) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.humGain.gain.setTargetAtTime(k * 0.05, t, 0.08);
    this.hum.frequency.setTargetAtTime(60 + k * 140, t, 0.1);
  }
}
