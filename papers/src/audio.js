// Tiny WebAudio synth for UI feedback. Fails silently where audio is unavailable.
let ctx = null;
let enabled = true;

function ac() {
  if (!enabled) return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      return null;
    }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, { type = 'square', vol = 0.05, delay = 0, slide = 0 } = {}) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur, { vol = 0.15, delay = 0, freq = 1200 } = {}) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = freq;
  const gain = c.createGain();
  gain.gain.value = vol;
  src.connect(filter).connect(gain).connect(c.destination);
  src.start(t0);
}

export const sfx = {
  setEnabled(on) {
    enabled = on;
  },
  stamp() {
    tone(70, 0.18, { type: 'sine', vol: 0.4, slide: -30 });
    noise(0.08, { vol: 0.3, freq: 600 });
  },
  paper() {
    noise(0.09, { vol: 0.08, freq: 3000 });
  },
  horn() {
    tone(330, 0.35, { type: 'sawtooth', vol: 0.05 });
    tone(415, 0.35, { type: 'sawtooth', vol: 0.04 });
  },
  select() {
    tone(1100, 0.04, { vol: 0.03 });
  },
  match() {
    tone(660, 0.08, { type: 'triangle', vol: 0.08 });
    tone(990, 0.12, { type: 'triangle', vol: 0.08, delay: 0.08 });
  },
  mismatch() {
    tone(220, 0.12, { type: 'square', vol: 0.06 });
    tone(165, 0.2, { type: 'square', vol: 0.06, delay: 0.12 });
  },
  citation() {
    for (let i = 0; i < 3; i++) tone(1400, 0.05, { vol: 0.04, delay: i * 0.09 });
    noise(0.4, { vol: 0.05, freq: 5000, delay: 0.3 });
  },
  alarm() {
    for (let i = 0; i < 4; i++) tone(880, 0.18, { type: 'sawtooth', vol: 0.05, delay: i * 0.22, slide: -300 });
  },
  bell() {
    tone(1318, 0.5, { type: 'sine', vol: 0.12 });
    tone(988, 0.7, { type: 'sine', vol: 0.1, delay: 0.25 });
  },
};
