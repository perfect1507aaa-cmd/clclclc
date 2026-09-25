// Procedural combat sounds built with the Web Audio API (no sound files).
let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;

try { muted = localStorage.getItem('duel-muted') === '1'; } catch { /* storage unavailable */ }

// Browsers only allow audio after a user gesture; call this from one.
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('duel-muted', m ? '1' : '0'); } catch { /* ignore */ }
  if (master) master.gain.value = m ? 0 : 0.55;
}

// ── Building blocks ─────────────────────────────────────────────────────────
function env(gainNode, t0, attack, decay, peak) {
  const g = gainNode.gain;
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(peak, t0 + attack);
  g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

function tone({ freq, to, type = 'sine', t = 0, attack = 0.004, decay = 0.3, gain = 0.3, vibrato = 0, filter }) {
  const t0 = ctx.currentTime + t;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + attack + decay);
  if (vibrato) {
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 7;
    lg.gain.value = vibrato;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t0);
    lfo.stop(t0 + attack + decay + 0.05);
  }
  const g = ctx.createGain();
  env(g, t0, attack, decay, gain);
  let node = o;
  if (filter) {
    const f = ctx.createBiquadFilter();
    Object.assign(f, { type: filter.type });
    f.frequency.value = filter.freq;
    f.Q.value = filter.q ?? 1;
    node = node.connect(f);
  }
  node.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + attack + decay + 0.05);
}

function noise({ t = 0, attack = 0.002, decay = 0.15, gain = 0.4, type = 'bandpass', freq = 1000, to, q = 1 }) {
  const t0 = ctx.currentTime + t;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t0);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + attack + decay);
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t0, attack, decay, gain);
  s.connect(f).connect(g).connect(master);
  s.start(t0, Math.random() * 0.5);
  s.stop(t0 + attack + decay + 0.05);
}

// Voice-like sound: a buzzy source through two vowel formants.
function voice({ pitch, to, t = 0, decay = 0.22, gain = 0.25, formants = [650, 1100], vibrato = 0 }) {
  for (const [i, f] of formants.entries()) {
    tone({ freq: pitch, to, type: 'sawtooth', t, attack: 0.02, decay, gain: gain / (i + 1), vibrato, filter: { type: 'bandpass', freq: f, q: 6 } });
  }
}

function metal({ base, t = 0, decay = 0.45, gain = 0.16 }) {
  for (const [k, r] of [[1, 1], [2.76, 0.6], [5.4, 0.4], [8.93, 0.25]]) tone({ freq: base * k, t, decay: decay * r, gain: gain * r });
  noise({ t, decay: 0.05, gain: 0.3, type: 'highpass', freq: 3000 });
}

// ── Sound library ───────────────────────────────────────────────────────────
const SFX = {
  blunt: () => { noise({ decay: 0.14, gain: 0.7, type: 'lowpass', freq: 500 }); tone({ freq: 110, to: 55, decay: 0.16, gain: 0.5 }); },
  flail: () => { metal({ base: 700, decay: 0.2, gain: 0.08 }); SFX.blunt(); },
  sword: () => { noise({ decay: 0.08, gain: 0.35, type: 'bandpass', freq: 2200, to: 5000 }); metal({ base: 520, t: 0.02 }); },
  claw: () => { noise({ decay: 0.08, gain: 0.6, type: 'bandpass', freq: 2500, to: 6000, q: 2 }); noise({ t: 0.09, decay: 0.09, gain: 0.5, type: 'bandpass', freq: 2200, to: 5500, q: 2 }); },
  screech: (p = 1) => tone({ freq: 1500 * p, to: 700 * p, type: 'sawtooth', attack: 0.03, decay: 0.38, gain: 0.12, vibrato: 60, filter: { type: 'bandpass', freq: 1800 * p, q: 3 } }),
  lance: () => { SFX.blunt(); metal({ base: 330, decay: 0.6, gain: 0.2 }); },
  holy: () => { metal({ base: 620, decay: 0.5 }); for (const f of [1320, 1760, 2640]) tone({ freq: f, t: 0.03, attack: 0.05, decay: 0.8, gain: 0.05 }); },
  staff: () => { noise({ decay: 0.1, gain: 0.5, type: 'bandpass', freq: 900, q: 2 }); tone({ freq: 240, to: 150, decay: 0.12, gain: 0.25 }); },
  bow: () => { tone({ freq: 190, to: 110, type: 'triangle', decay: 0.18, gain: 0.35 }); noise({ decay: 0.3, gain: 0.25, type: 'highpass', freq: 1500, to: 4000 }); },
  crossbow: () => { noise({ decay: 0.04, gain: 0.6, type: 'highpass', freq: 2500 }); tone({ freq: 140, to: 80, type: 'square', decay: 0.1, gain: 0.12, filter: { type: 'lowpass', freq: 900 } }); noise({ t: 0.03, decay: 0.25, gain: 0.2, type: 'highpass', freq: 2000, to: 4500 }); },
  magic: () => { tone({ freq: 420, to: 1400, attack: 0.05, decay: 0.35, gain: 0.18, vibrato: 30 }); tone({ freq: 2100, t: 0.1, decay: 0.4, gain: 0.05 }); },
  arrowHit: () => noise({ decay: 0.07, gain: 0.6, type: 'bandpass', freq: 900, q: 2 }),
  magicHit: () => { noise({ decay: 0.25, gain: 0.3, type: 'bandpass', freq: 3000, to: 800 }); tone({ freq: 880, to: 440, decay: 0.3, gain: 0.12 }); },
  grunt: (p = 160) => voice({ pitch: p, to: p * 0.75, decay: 0.2, gain: 0.22 }),
  armor: (p = 130) => { metal({ base: 440, decay: 0.2, gain: 0.08 }); voice({ pitch: p, to: p * 0.75, t: 0.02, decay: 0.18, gain: 0.18 }); },
  neigh: () => voice({ pitch: 520, to: 380, decay: 0.5, gain: 0.16, formants: [900, 1800], vibrato: 40 }),
  choir: () => { for (const f of [262, 330, 392]) voice({ pitch: f, to: f * 0.94, decay: 0.6, gain: 0.07, formants: [800, 1150] }); },
  thud: () => { noise({ decay: 0.3, gain: 0.6, type: 'lowpass', freq: 300 }); tone({ freq: 70, to: 40, decay: 0.35, gain: 0.5 }); },
  step: () => noise({ decay: 0.04, gain: 0.12, type: 'lowpass', freq: 700 }),
  flap: () => noise({ attack: 0.03, decay: 0.12, gain: 0.25, type: 'lowpass', freq: 600, to: 250 }),
  click: () => tone({ freq: 900, decay: 0.05, gain: 0.08, type: 'triangle' }),
};

// What each creature sounds like when it strikes, gets hurt or dies.
const VOICES = {
  peasant: { attack: 'blunt', hurt: ['grunt', 190], die: ['grunt', 140] },
  conscript: { attack: 'flail', hurt: ['grunt', 170], die: ['grunt', 125] },
  archer: { attack: 'blunt', shoot: 'bow', hit: 'arrowHit', hurt: ['grunt', 200], die: ['grunt', 150] },
  marksman: { attack: 'blunt', shoot: 'crossbow', hit: 'arrowHit', hurt: ['grunt', 185], die: ['grunt', 140] },
  footman: { attack: 'sword', hurt: ['armor', 135], die: ['armor', 100] },
  squire: { attack: 'sword', hurt: ['armor', 120], die: ['armor', 90] },
  griffin: { attack: 'claw', cry: 1, hurt: ['screech', 1.25], die: ['screech', 0.7] },
  imperial_griffin: { attack: 'claw', cry: 0.9, hurt: ['screech', 1.15], die: ['screech', 0.65] },
  priest: { attack: 'staff', shoot: 'magic', hit: 'magicHit', hurt: ['grunt', 125], die: ['grunt', 95] },
  inquisitor: { attack: 'staff', shoot: 'magic', hit: 'magicHit', hurt: ['grunt', 115], die: ['grunt', 90] },
  cavalier: { attack: 'lance', hurt: ['neigh'], die: ['thud'] },
  paladin: { attack: 'lance', hurt: ['neigh'], die: ['thud'] },
  angel: { attack: 'holy', hurt: ['choir'], die: ['choir'] },
  archangel: { attack: 'holy', hurt: ['choir'], die: ['choir'] },
};

function play(name, arg) {
  if (!ctx || muted) return;
  SFX[name]?.(arg);
}

export const sfx = {
  attack(id) {
    const v = VOICES[id];
    play(v.attack);
    if (v.cry) play('screech', v.cry);
  },
  shoot(id) { play(VOICES[id].shoot); },
  impact(id) { play(VOICES[id].hit || 'arrowHit'); },
  hurt(id) { const [n, a] = VOICES[id].hurt; play(n, a); },
  die(id) {
    const [n, a] = VOICES[id].die;
    play(n, a);
    play('thud');
  },
  step(fly) { play(fly ? 'flap' : 'step'); },
  click() { play('click'); },
};
