// All sounds are synthesized; nothing is downloaded.
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; }

  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(this.ctx.destination);
    this.noiseBuf = this.makeNoise();
    this.startAmbience();
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }
  makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    return buf;
  }
  whiteBuf() {
    if (this._white) return this._white;
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return (this._white = buf);
  }
  startAmbience() {
    const c = this.ctx;
    // ventilation / room tone
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    const gn = c.createGain(); gn.gain.value = 0.05;
    src.connect(lp).connect(gn).connect(this.master); src.start();
    // fluorescent 100 Hz hum
    const o = c.createOscillator(); o.frequency.value = 100;
    const og = c.createGain(); og.gain.value = 0.004;
    o.connect(og).connect(this.master); o.start();
  }
  tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, attack = 0.005, release = 0.05, dest } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release));
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(dest || this.master);
    o.start(t); o.stop(t + dur + 0.02);
    return o;
  }
  noise(dur, { freq = 2000, q = 1, vol = 0.2, at = 0, type = 'bandpass' } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + at;
    const s = c.createBufferSource(); s.buffer = this.whiteBuf();
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  key(vol = 0.18) { this.noise(0.035, { freq: 3200 + Math.random() * 1200, q: 2, vol }); this.noise(0.02, { freq: 900, q: 1, vol: vol * 0.6, at: 0.012 }); }
  click() { this.noise(0.02, { freq: 4200, q: 3, vol: 0.12 }); }
  colleagueKey() { this.key(0.03 + Math.random() * 0.02); }
  error() { this.tone(440, 0.12, { type: 'square', vol: 0.05 }); this.tone(330, 0.18, { type: 'square', vol: 0.05, at: 0.12 }); }
  stapler() { this.noise(0.05, { freq: 1500, q: 2, vol: 0.4 }); this.noise(0.08, { freq: 5000, q: 4, vol: 0.25, at: 0.03 }); }
  sip() { this.noise(0.35, { freq: 900, q: 0.7, vol: 0.12 }); this.noise(0.2, { freq: 400, q: 1, vol: 0.12, at: 0.5 }); }
  lampSwitch() { this.noise(0.03, { freq: 2500, q: 5, vol: 0.35 }); }
  pickup() { this.noise(0.08, { freq: 700, q: 1, vol: 0.3 }); }
  hangup() { this.noise(0.06, { freq: 500, q: 1, vol: 0.4 }); this.noise(0.04, { freq: 2600, q: 4, vol: 0.2, at: 0.02 }); }
  printer() {
    if (!this.ctx) return;
    for (let i = 0; i < 14; i++) this.noise(0.14, { freq: 300 + (i % 3) * 180, q: 3, vol: 0.12, at: 0.3 + i * 0.15 });
    this.tone(90, 2.4, { type: 'sawtooth', vol: 0.03, at: 0.2, attack: 0.3, release: 0.4 });
  }
  // two-tone office ring: 1 s trill, 2 s pause (caller loops it)
  ringOnce() {
    if (!this.ctx) return;
    for (let i = 0; i < 20; i++) this.tone(i % 2 ? 1300 : 1040, 0.05, { type: 'square', vol: 0.06, at: i * 0.05, attack: 0.002, release: 0.01 });
  }
  // Russian dial tone is a continuous 425 Hz
  dialTone(on) {
    if (!this.ctx) return;
    if (on && !this._dial) {
      const o = this.ctx.createOscillator(); o.frequency.value = 425;
      const g = this.ctx.createGain(); g.gain.value = 0.05;
      o.connect(g).connect(this.master); o.start();
      this._dial = { o, g };
    } else if (!on && this._dial) {
      this._dial.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
      this._dial.o.stop(this.ctx.currentTime + 0.1);
      this._dial = null;
    }
  }
  busy() { for (let i = 0; i < 4; i++) this.tone(425, 0.35, { vol: 0.05, at: i * 0.7 }); }
  // Talking "voice": short formant blips per syllable
  babble(text, pitch = 180, phone = false) {
    if (!this.ctx) return 0;
    const syl = Math.min(40, Math.max(3, Math.round(text.replace(/[^а-яёa-z]/gi, '').length / 2.6)));
    const c = this.ctx;
    let dest = this.master;
    if (phone) {
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 0.9;
      bp.connect(this.master); dest = bp;
    }
    let t = 0;
    for (let i = 0; i < syl; i++) {
      const d = 0.07 + Math.random() * 0.06;
      const f = pitch * (0.85 + Math.random() * 0.35);
      const o = this.tone(f, d, { type: 'sawtooth', vol: phone ? 0.05 : 0.025, at: t, attack: 0.01, release: 0.03, dest });
      if (o) o.frequency.linearRampToValueAtTime(f * (0.9 + Math.random() * 0.2), c.currentTime + t + d);
      t += d + 0.02 + (Math.random() < 0.12 ? 0.15 : 0);
    }
    return t;
  }
}
