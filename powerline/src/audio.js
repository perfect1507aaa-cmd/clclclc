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

  // Soft glassy "tink": mostly the fundamental, just a hint of metallic partial.
  // Quick pickups in a row climb in pitch.
  eat() {
    if (!this.ctx) return;
    const now = performance.now();
    if (now - this.lastEat < 40) return;
    this.combo = now - this.lastEat < 450 ? Math.min((this.combo || 0) + 1, 12) : 0;
    this.lastEat = now;
    const f = 1320 * 2 ** (this.combo / 6);
    const t = this.ctx.currentTime;
    const partials = [
      [1, 0.05, 0.16],
      [2, 0.012, 0.08],
      [2.76, 0.004, 0.05],
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

  // Meaty kill: low thump with a pitch drop, a crunchy noise burst, then a short
  // bright sting that climbs with the kill streak.
  kill(streak = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const thump = ctx.createOscillator();
    const tg = ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(170, t);
    thump.frequency.exponentialRampToValueAtTime(42, t + 0.28);
    tg.gain.setValueAtTime(0.0001, t);
    tg.gain.linearRampToValueAtTime(0.5, t + 0.008);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    thump.connect(tg).connect(this.master);
    thump.start(t);
    thump.stop(t + 0.4);

    const len = Math.floor(ctx.sampleRate * 0.22);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400, t);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.2);
    const ng = ctx.createGain();
    ng.gain.value = 0.35;
    noise.connect(lp).connect(ng).connect(this.master);
    noise.start(t);

    const grit = ctx.createOscillator();
    const gg = ctx.createGain();
    grit.type = 'square';
    grit.frequency.setValueAtTime(95, t);
    grit.frequency.exponentialRampToValueAtTime(55, t + 0.12);
    gg.gain.setValueAtTime(0.07, t);
    gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    grit.connect(gg).connect(this.master);
    grit.start(t);
    grit.stop(t + 0.16);

    const base = 520 * 2 ** (Math.min(streak - 1, 8) / 12);
    setTimeout(() => this._tone(base, 0.09, 'triangle', 0.05), 70);
    setTimeout(() => this._tone(base * 1.5, 0.14, 'triangle', 0.045), 140);
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
