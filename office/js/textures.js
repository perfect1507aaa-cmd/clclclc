import * as THREE from 'three';

export const SANS = 'Arial, "Liberation Sans", Helvetica, sans-serif';
export const HAND = '"Caveat", "Comic Sans MS", cursive';

export function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTex(w, h, draw, { repeat, srgb = true, aniso = 8 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.userData.draw = draw;
  return t;
}
export function redraw(tex, ...args) {
  const c = tex.image, g = c.getContext('2d');
  tex.userData.draw(g, c.width, c.height, ...args);
  tex.needsUpdate = true;
}

// ---------- surfaces ----------
export const carpetTex = () => canvasTex(512, 512, (g, w, h) => {
  const r = rng(7);
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
    const shade = (tx + ty) % 2 ? 0 : 6;
    g.fillStyle = `rgb(${86 + shade},${94 + shade},${104 + shade})`;
    g.fillRect(tx * 256, ty * 256, 256, 256);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(255,255,255,${0.025 + r() * 0.03})`;
      if ((tx + ty) % 2) g.fillRect(tx * 256 + i * 2.84, ty * 256, 1, 256);
      else g.fillRect(tx * 256, ty * 256 + i * 2.84, 256, 1);
    }
  }
  for (let i = 0; i < 26000; i++) {
    const v = r();
    g.fillStyle = v > 0.5 ? `rgba(160,170,185,${r() * 0.35})` : `rgba(40,45,55,${r() * 0.35})`;
    g.fillRect(r() * w, r() * h, 1.5, 1.5);
  }
  g.fillStyle = 'rgba(30,34,40,.35)';
  g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h); g.fillRect(0, 255, w, 2); g.fillRect(255, 0, 2, h);
}, { repeat: [1, 1] });

export const ceilingTex = () => canvasTex(512, 512, (g, w, h) => {
  const r = rng(3);
  g.fillStyle = '#eceae4'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(120,115,105,${r() * 0.35})`; g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r()); }
  g.fillStyle = '#c9c6bd';
  g.fillRect(0, 0, w, 6); g.fillRect(0, 0, 6, h); g.fillRect(0, 253, w, 6); g.fillRect(253, 0, 6, h);
}, { repeat: [1, 1] });

export const woodTex = () => canvasTex(1024, 512, (g, w, h) => {
  const r = rng(11);
  const grd = g.createLinearGradient(0, 0, w, 0);
  grd.addColorStop(0, '#d8c3a0'); grd.addColorStop(0.5, '#dcc8a6'); grd.addColorStop(1, '#d3bd98');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) {
    const y = r() * h;
    g.strokeStyle = `rgba(${130 + r() * 40},${95 + r() * 30},${60},${0.05 + r() * 0.1})`;
    g.lineWidth = 0.5 + r() * 2;
    g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= w; x += 64) g.lineTo(x, y + Math.sin(x * 0.004 + i) * 6 + (r() - 0.5) * 2);
    g.stroke();
  }
});

export const plasterTex = (base = '#e8e4da') => canvasTex(256, 256, (g, w, h) => {
  const r = rng(5);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4000; i++) { g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.035)'; g.fillRect(r() * w, r() * h, 2, 2); }
}, { repeat: [1, 1] });

export const fabricTex = (base) => canvasTex(128, 128, (g, w, h) => {
  const r = rng(9);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.05})`; g.fillRect(0, y, w, 1); }
  for (let x = 0; x < w; x += 2) { g.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.04})`; g.fillRect(x, 0, 1, h); }
}, { repeat: [4, 4] });

// ---------- outside view: Moscow outskirts, panel blocks ----------
export const cityTex = () => canvasTex(2048, 1024, (g, w, h) => {
  const r = rng(21);
  const sky = g.createLinearGradient(0, 0, 0, h * 0.7);
  sky.addColorStop(0, '#7fa8d6'); sky.addColorStop(0.6, '#b9d0e6'); sky.addColorStop(1, '#e3ebef');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  // clouds
  for (let i = 0; i < 18; i++) {
    const cx = r() * w, cy = 80 + r() * 260;
    g.fillStyle = 'rgba(255,255,255,.55)';
    for (let k = 0; k < 7; k++) { g.beginPath(); g.ellipse(cx + (r() - 0.5) * 180, cy + (r() - 0.5) * 30, 60 + r() * 80, 18 + r() * 16, 0, 0, 7); g.fill(); }
  }
  // far blocks
  const layer = (base, tone, minH, maxH, winA) => {
    let x = -20;
    while (x < w) {
      const bw = 120 + r() * 220, bh = minH + r() * (maxH - minH);
      const top = base - bh;
      g.fillStyle = tone; g.fillRect(x, top, bw, bh + 400);
      const cols = Math.floor(bw / 26), rows = Math.floor(bh / 30);
      for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
        g.fillStyle = r() < 0.12 ? `rgba(255,236,190,${winA})` : `rgba(60,75,95,${winA})`;
        g.fillRect(x + 8 + cx * 26, top + 10 + cy * 30, 14, 16);
      }
      // panel seams
      g.fillStyle = 'rgba(0,0,0,.06)';
      for (let cy = 0; cy < rows; cy++) g.fillRect(x, top + 5 + cy * 30, bw, 2);
      x += bw + 10 + r() * 60;
    }
  };
  layer(h * 0.62, '#aeb8c2', 120, 280, 0.25);
  layer(h * 0.72, '#cfd2cf', 200, 380, 0.5);
  // trees
  for (let i = 0; i < 70; i++) {
    const tx = r() * w, ty = h * 0.78 + r() * 40;
    g.fillStyle = ['#56733d', '#667f45', '#7a8a3e', '#c49a36'][Math.floor(r() * 4)];
    g.beginPath(); g.ellipse(tx, ty, 40 + r() * 50, 60 + r() * 50, 0, 0, 7); g.fill();
  }
  g.fillStyle = '#6f7472'; g.fillRect(0, h * 0.84, w, h * 0.16);
  g.fillStyle = '#8b8f8c'; g.fillRect(0, h * 0.86, w, 8);
}, { aniso: 4 });

// ---------- paper, posters and labels ----------
export const paperTex = (title, lines = 18, seed = 1) => canvasTex(256, 362, (g, w, h) => {
  const r = rng(seed);
  g.fillStyle = '#fbfbf7'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#222'; g.font = `bold 13px ${SANS}`; g.textAlign = 'center';
  g.fillText(title, w / 2, 34);
  for (let i = 0; i < lines; i++) {
    const y = 56 + i * 15;
    g.fillStyle = 'rgba(40,40,40,.55)';
    g.fillRect(22, y, (w - 44) * (0.55 + r() * 0.45), 4);
  }
  g.strokeStyle = 'rgba(40,40,40,.6)'; g.strokeRect(22, h - 90, w - 44, 50);
  g.fillStyle = 'rgba(40,40,40,.4)';
  for (let i = 0; i < 3; i++) g.fillRect(28, h - 80 + i * 14, w - 56, 3);
});

export const stickyTex = (text, color = '#ffe66b', seed = 1) => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = color; g.fillRect(0, 0, w, h);
  const grd = g.createLinearGradient(0, 0, 0, 40); grd.addColorStop(0, 'rgba(0,0,0,.08)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, w, 40);
  g.fillStyle = '#1d2a8a'; g.font = `48px ${HAND}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const lines = text.split('\n');
  lines.forEach((l, i) => g.fillText(l, w / 2 + (seed % 3) * 2, h / 2 + (i - (lines.length - 1) / 2) * 52));
});

export const calendarTex = () => canvasTex(512, 700, (g, w, h) => {
  const now = new Date();
  const months = ['ЯНВАРЬ', 'ФЕВРАЛЬ', 'МАРТ', 'АПРЕЛЬ', 'МАЙ', 'ИЮНЬ', 'ИЮЛЬ', 'АВГУСТ', 'СЕНТЯБРЬ', 'ОКТЯБРЬ', 'НОЯБРЬ', 'ДЕКАБРЬ'];
  g.fillStyle = '#fdfdfb'; g.fillRect(0, 0, w, h);
  // photo: birch trees
  const sky = g.createLinearGradient(0, 0, 0, 300); sky.addColorStop(0, '#8fb3d9'); sky.addColorStop(1, '#e6d7a8');
  g.fillStyle = sky; g.fillRect(20, 20, w - 40, 300);
  g.fillStyle = '#c9a23c'; g.fillRect(20, 250, w - 40, 70);
  const r = rng(4);
  for (let i = 0; i < 9; i++) {
    const x = 40 + i * 52 + r() * 20;
    g.fillStyle = '#f2f0ea'; g.fillRect(x, 30, 12, 260);
    g.fillStyle = '#2d2d2d'; for (let k = 0; k < 9; k++) g.fillRect(x + (r() > 0.5 ? 0 : 5), 40 + r() * 240, 7, 3);
    g.fillStyle = `rgba(${200 + r() * 40},${150 + r() * 40},40,.85)`; g.beginPath(); g.ellipse(x + 6, 50 + r() * 40, 40, 30, 0, 0, 7); g.fill();
  }
  g.fillStyle = '#b3261e'; g.font = `bold 34px ${SANS}`; g.textAlign = 'center';
  g.fillText(`${months[now.getMonth()]} ${now.getFullYear()}`, w / 2, 370);
  const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  g.font = `bold 18px ${SANS}`;
  days.forEach((d, i) => { g.fillStyle = i > 4 ? '#b3261e' : '#555'; g.fillText(d, 60 + i * 65, 410); });
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const off = (first.getDay() + 6) % 7;
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  g.font = `22px ${SANS}`;
  for (let d = 1; d <= dim; d++) {
    const i = d - 1 + off, cx = 60 + (i % 7) * 65, cy = 450 + Math.floor(i / 7) * 46;
    g.fillStyle = i % 7 > 4 ? '#b3261e' : '#222';
    if (d < now.getDate()) {
      g.fillText(String(d), cx, cy);
      g.strokeStyle = 'rgba(30,50,160,.7)'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(cx - 14, cy - 18); g.lineTo(cx + 14, cy + 4); g.stroke();
    } else g.fillText(String(d), cx, cy);
    if (d === now.getDate()) { g.strokeStyle = '#d0021b'; g.lineWidth = 3; g.beginPath(); g.ellipse(cx, cy - 7, 24, 19, 0, 0, 7); g.stroke(); }
  }
});

export const clockTex = () => canvasTex(512, 512, (g, w, h) => {
  const now = new Date();
  const c = w / 2;
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#fdfdfb'; g.beginPath(); g.arc(c, c, 240, 0, 7); g.fill();
  g.fillStyle = '#222';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const len = i % 5 ? 12 : 30, wd = i % 5 ? 3 : 8;
    g.save(); g.translate(c, c); g.rotate(a); g.fillRect(-wd / 2, -225, wd, len); g.restore();
  }
  g.font = `bold 44px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) { const a = (i / 12) * Math.PI * 2; g.fillText(String(i), c + Math.sin(a) * 160, c - Math.cos(a) * 160); }
  g.font = `18px ${SANS}`; g.fillStyle = '#777'; g.fillText('ЧАСОВОЙ ЗАВОД', c, c + 80);
  const hand = (a, len, wd, col) => { g.save(); g.translate(c, c); g.rotate(a); g.fillStyle = col; g.fillRect(-wd / 2, -len, wd, len + 26); g.restore(); };
  const s = now.getSeconds() + now.getMilliseconds() / 1000, m = now.getMinutes() + s / 60, hr = (now.getHours() % 12) + m / 60;
  hand((hr / 12) * Math.PI * 2, 120, 14, '#1a1a1a');
  hand((m / 60) * Math.PI * 2, 190, 9, '#1a1a1a');
  hand((s / 60) * Math.PI * 2, 205, 3, '#c0271d');
  g.fillStyle = '#c0271d'; g.beginPath(); g.arc(c, c, 10, 0, 7); g.fill();
});

export const posterTex = () => canvasTex(512, 720, (g, w, h) => {
  g.fillStyle = '#12355b'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffffff'; g.font = `bold 44px ${SANS}`; g.textAlign = 'left';
  g.fillText('ПЛАН ПРОДАЖ', 34, 80);
  g.font = `28px ${SANS}`; g.fillStyle = '#ffd24a'; g.fillText('3 квартал · 2026', 34, 122);
  const px = 50, py = 170, pw = 420, ph = 330;
  g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1;
  for (let i = 0; i <= 5; i++) { g.beginPath(); g.moveTo(px, py + (i * ph) / 5); g.lineTo(px + pw, py + (i * ph) / 5); g.stroke(); }
  const plan = [0.3, 0.42, 0.55, 0.66, 0.78, 0.9], fact = [0.28, 0.38, 0.5, 0.49, 0.61, 0.58];
  const pts = (arr) => arr.map((v, i) => [px + (i * pw) / 5, py + ph - v * ph]);
  const line = (arr, col, dash) => { g.setLineDash(dash || []); g.strokeStyle = col; g.lineWidth = 7; g.beginPath(); pts(arr).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.setLineDash([]); };
  line(plan, 'rgba(255,255,255,.7)', [16, 12]);
  line(fact, '#ffd24a');
  pts(fact).forEach(([x, y]) => { g.fillStyle = '#ffd24a'; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); });
  g.font = `22px ${SANS}`; g.fillStyle = '#cfe0f5';
  ['ИЮЛ', '', 'АВГ', '', 'СЕН', ''].forEach((t, i) => g.fillText(t, px + (i * pw) / 5 - 18, py + ph + 36));
  g.fillStyle = '#fff'; g.font = `bold 30px ${SANS}`; g.fillText('Выполнение: 64%', 34, 610);
  g.font = `22px ${SANS}`; g.fillStyle = '#cfe0f5'; g.fillText('Премия зависит от каждого!', 34, 655);
});

export const whiteboardTex = () => canvasTex(1024, 640, (g, w, h) => {
  g.fillStyle = '#f7f8f8'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(120,130,140,.08)'; for (let i = 0; i < 8; i++) g.fillRect(100 + i * 110, 60 + (i % 3) * 170, 180, 30);
  g.font = `64px ${HAND}`; g.fillStyle = '#1e46b4'; g.fillText('СРОКИ ОКТЯБРЬ:', 50, 90);
  g.font = `46px ${HAND}`; g.fillStyle = '#222';
  ['• 25.10 — НДС, взносы', '• 27.10 — 6-НДФЛ', '• 28.10 — прибыль!!!', '• Пт — инвентаризация'].forEach((t, i) => g.fillText(t, 70, 170 + i * 62));
  g.fillStyle = '#c0271d'; g.font = `54px ${HAND}`; g.fillText('НЕ ТРОГАТЬ', 640, 560);
  g.strokeStyle = '#c0271d'; g.lineWidth = 5; g.beginPath(); g.ellipse(760, 545, 170, 50, -0.05, 0, 7); g.stroke();
  // doodle: chart
  g.strokeStyle = '#1b8a4a'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(640, 360); g.lineTo(640, 150); g.moveTo(640, 360); g.lineTo(960, 360); g.stroke();
  g.beginPath(); g.moveTo(650, 330); g.lineTo(720, 280); g.lineTo(790, 300); g.lineTo(860, 210); g.lineTo(940, 170); g.stroke();
  g.font = `40px ${HAND}`; g.fillStyle = '#1b8a4a'; g.fillText('↑ растём', 780, 140);
});

export const exitSignTex = () => canvasTex(256, 96, (g, w, h) => {
  g.fillStyle = '#18a148'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff'; g.font = `bold 50px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('ВЫХОД', w / 2 + 20, h / 2 + 2);
  g.fillRect(24, 36, 34, 22); g.beginPath(); g.moveTo(22, 26); g.lineTo(8, 47); g.lineTo(22, 68); g.fill();
});

export const mugTex = () => canvasTex(512, 256, (g, w, h) => {
  g.fillStyle = '#f4f2ee'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#b3261e'; g.font = `bold 34px ${SANS}`; g.textAlign = 'center';
  g.fillText('ЛУЧШИЙ', w * 0.75, 110); g.fillText('БУХГАЛТЕР', w * 0.75, 152);
  g.font = `22px ${SANS}`; g.fillStyle = '#555'; g.fillText('квартала', w * 0.75, 186);
});

export const binderTex = (label, color) => canvasTex(96, 512, (g, w, h) => {
  g.fillStyle = color; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.arc(w / 2, h - 90, 22, 0, 7); g.fill();
  g.fillStyle = '#fdfdf8'; g.fillRect(12, 60, w - 24, 260);
  g.save(); g.translate(w / 2, 190); g.rotate(-Math.PI / 2);
  g.fillStyle = '#111'; g.font = `44px ${HAND}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, 0, 2); g.restore();
});

export const calculatorTex = () => canvasTex(256, 360, (g, w, h) => {
  g.fillStyle = '#2b2d31'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#8f9b80'; g.fillRect(20, 20, w - 40, 64);
  g.fillStyle = '#1b1f18'; g.font = `44px ${SANS}`; g.textAlign = 'right'; g.fillText('1 245 300.', w - 30, 70);
  g.fillStyle = '#444'; g.fillRect(20, 96, w - 40, 22);
  g.fillStyle = '#ffcc55'; for (let i = 0; i < 4; i++) g.fillRect(28 + i * 52, 102, 8, 10);
  const keys = ['MC', 'MR', 'M-', 'M+', '7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '=', '+'];
  keys.forEach((k, i) => {
    const x = 20 + (i % 4) * 56, y = 130 + Math.floor(i / 4) * 44;
    g.fillStyle = i < 4 ? '#58606b' : k === '=' ? '#d9822b' : /\d|\./.test(k) ? '#e8e8e4' : '#9aa3ad';
    g.fillRect(x, y, 48, 36);
    g.fillStyle = /\d|\./.test(k) ? '#111' : '#fff'; g.font = `bold 20px ${SANS}`; g.textAlign = 'center'; g.fillText(k, x + 24, y + 26);
  });
});

export const flipCalTex = () => canvasTex(256, 200, (g, w, h) => {
  const now = new Date();
  const months = ['ЯНВАРЬ', 'ФЕВРАЛЬ', 'МАРТ', 'АПРЕЛЬ', 'МАЙ', 'ИЮНЬ', 'ИЮЛЬ', 'АВГУСТ', 'СЕНТЯБРЬ', 'ОКТЯБРЬ', 'НОЯБРЬ', 'ДЕКАБРЬ'];
  const days = ['ВОСКРЕСЕНЬЕ', 'ПОНЕДЕЛЬНИК', 'ВТОРНИК', 'СРЕДА', 'ЧЕТВЕРГ', 'ПЯТНИЦА', 'СУББОТА'];
  g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#b3261e'; g.fillRect(0, 0, w, 44);
  g.fillStyle = '#fff'; g.font = `bold 26px ${SANS}`; g.textAlign = 'center'; g.fillText(months[now.getMonth()], w / 2, 32);
  g.fillStyle = '#222'; g.font = `bold 100px ${SANS}`; g.fillText(String(now.getDate()), w / 2, 148);
  g.font = `20px ${SANS}`; g.fillStyle = '#666'; g.fillText(days[now.getDay()], w / 2, 184);
});

export const photoTex = () => canvasTex(256, 200, (g, w, h) => {
  const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#f6b26b'); sky.addColorStop(1, '#6fa8dc');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  g.fillStyle = '#2f5e8c'; g.fillRect(0, 130, w, 70);
  g.fillStyle = '#fff4c2'; g.beginPath(); g.arc(180, 110, 26, 0, 7); g.fill();
  g.fillStyle = '#3a2a1f'; g.beginPath(); g.arc(80, 118, 12, 0, 7); g.fill(); g.fillRect(70, 128, 20, 40);
  g.beginPath(); g.arc(110, 124, 9, 0, 7); g.fill(); g.fillRect(103, 132, 14, 32);
});

// ---------- colleague screens ----------
export const spreadsheetTex = () => canvasTex(1024, 576, (g, w, h) => {
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#217346'; g.fillRect(0, 0, w, 34);
  g.fillStyle = '#fff'; g.font = `15px ${SANS}`; g.fillText('Реестр_платежей_сентябрь_ФИНАЛ_v7_исправл.xlsx', 12, 22);
  g.fillStyle = '#f3f3f3'; g.fillRect(0, 34, w, 60);
  g.fillStyle = '#333'; g.font = `13px ${SANS}`; ['Файл', 'Главная', 'Вставка', 'Формулы', 'Данные'].forEach((t, i) => g.fillText(t, 12 + i * 80, 54));
  const r = rng(8);
  g.font = `13px ${SANS}`;
  for (let y = 0; y < 22; y++) for (let x = 0; x < 9; x++) {
    const cx = 40 + x * 108, cy = 100 + y * 21;
    g.strokeStyle = '#dcdcdc'; g.strokeRect(cx, cy, 108, 21);
    g.fillStyle = y === 0 ? '#ddebf7' : (y === 6 || y === 13) && x > 3 ? '#fff2a8' : '#fff';
    g.fillRect(cx + 1, cy + 1, 106, 19);
    g.fillStyle = '#222';
    const t = y === 0 ? ['Дата', 'Контрагент', 'Счет', 'Сумма', 'НДС', 'Статус', 'Оплачено', 'Остаток', 'Прим.'][x]
      : x === 0 ? `${String(1 + y).padStart(2, '0')}.09` : x === 1 ? ['Ромашка', 'Горизонт', 'Лютик', 'Меридиан', 'Сидоров'][y % 5] : x === 5 ? (r() > 0.3 ? 'опл.' : 'ждем') : x === 8 ? (r() > 0.8 ? '???' : '') : Math.round(r() * 90000).toLocaleString('ru-RU');
    g.fillText(t, cx + 6, cy + 15);
  }
  g.fillStyle = '#f3f3f3'; g.fillRect(0, 100, 40, h);
  g.fillStyle = '#666'; for (let y = 0; y < 22; y++) g.fillText(String(y + 1), 10, 115 + y * 21);
});

export const solitaireTex = () => canvasTex(1024, 576, (g, w, h) => {
  g.fillStyle = '#0f7a3a'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(0, 0, w, 28);
  g.fillStyle = '#222'; g.font = `15px ${SANS}`; g.fillText('Косынка     Игра   Справка                           Очки: 1 245   Время: 3:12:44', 10, 19);
  const card = (x, y, faceUp, label, red) => {
    g.fillStyle = faceUp ? '#fff' : '#2451a6'; g.fillRect(x, y, 90, 124);
    g.strokeStyle = '#111'; g.strokeRect(x + 0.5, y + 0.5, 89, 123);
    if (!faceUp) { g.strokeStyle = 'rgba(255,255,255,.4)'; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(x + 6, y + 10 + i * 14); g.lineTo(x + 84, y + 16 + i * 14); g.stroke(); } return; }
    g.fillStyle = red ? '#c0171d' : '#111'; g.font = `bold 22px ${SANS}`; g.fillText(label, x + 8, y + 26);
    g.font = `44px ${SANS}`; g.fillText(red ? '♥' : '♠', x + 28, y + 88);
  };
  card(40, 50, false); card(150, 50, true, 'К', true);
  ['Т', '2', '', ''].forEach((l, i) => { if (l) card(450 + i * 120, 50, true, l, i % 2 === 0); else { g.strokeStyle = 'rgba(255,255,255,.5)'; g.strokeRect(450 + i * 120, 50, 90, 124); } });
  const labels = ['В', '10', '8', 'Д', '5', '9', '3'];
  for (let c = 0; c < 7; c++) {
    for (let k = 0; k < c; k++) card(40 + c * 130, 210 + k * 18, false);
    card(40 + c * 130, 210 + c * 18, true, labels[c], c % 2 === 1);
  }
});

// ---------- keyboard legends ----------
const keyCache = new Map();
export function keyTex(main, sub) {
  const k = `${main}|${sub || ''}`;
  if (keyCache.has(k)) return keyCache.get(k);
  const t = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#26272b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2d2e33'; g.fillRect(4, 4, w - 8, h - 8);
    g.fillStyle = '#e8e8e8';
    if (main.length > 2) { g.font = `bold 13px ${SANS}`; g.textAlign = 'left'; g.fillText(main, 9, 24); }
    else { g.font = `bold 22px ${SANS}`; g.textAlign = 'left'; g.fillText(main, 10, 28); }
    if (sub) { g.fillStyle = '#ff6a55'; g.font = `bold 19px ${SANS}`; g.textAlign = 'right'; g.fillText(sub, w - 9, h - 11); }
  }, { aniso: 4 });
  keyCache.set(k, t);
  return t;
}

// ---------- desk phone keypad + LCD (dynamic) ----------
export const phoneTopTex = () => canvasTex(256, 460, (g, w, h, st = {}) => {
  g.fillStyle = '#2a2c30'; g.fillRect(0, 0, w, h);
  // LCD
  g.fillStyle = st.backlight ? '#b9d98a' : '#95a57c'; g.fillRect(24, 26, w - 48, 88);
  g.strokeStyle = '#111'; g.lineWidth = 3; g.strokeRect(24, 26, w - 48, 88);
  g.fillStyle = '#1d2618'; g.font = `bold 26px ${SANS}`; g.textAlign = 'left';
  g.fillText(st.line1 || '', 36, 62);
  g.font = `22px ${SANS}`; g.fillText(st.line2 || '', 36, 98);
  // LED
  g.fillStyle = st.led ? '#ff3b2f' : '#541612'; g.beginPath(); g.arc(w - 30, 140, 8, 0, 7); g.fill();
  if (st.led) { g.fillStyle = 'rgba(255,80,60,.35)'; g.beginPath(); g.arc(w - 30, 140, 16, 0, 7); g.fill(); }
  // keys
  const keys = [['1', ''], ['2', 'АБВГ'], ['3', 'ДЕЖЗ'], ['4', 'ИЙКЛ'], ['5', 'МНОП'], ['6', 'РСТУ'], ['7', 'ФХЦЧ'], ['8', 'ШЩЪЫ'], ['9', 'ЬЭЮЯ'], ['*', ''], ['0', '+'], ['#', '']];
  keys.forEach(([k, l], i) => {
    const x = 26 + (i % 3) * 70, y = 170 + Math.floor(i / 3) * 62;
    g.fillStyle = '#4a4d53'; g.fillRect(x, y, 58, 48);
    g.fillStyle = '#5a5d64'; g.fillRect(x, y, 58, 6);
    g.fillStyle = '#f2f2f2'; g.font = `bold 26px ${SANS}`; g.textAlign = 'center'; g.fillText(k, x + 29, y + 30);
    g.font = `10px ${SANS}`; g.fillStyle = '#bbb'; g.fillText(l, x + 29, y + 43);
  });
  g.fillStyle = '#6d7077'; g.font = `12px ${SANS}`; g.textAlign = 'center'; g.fillText('ОФИС-ТЕЛ 2000', w / 2, 158);
}, { aniso: 4 });

export const lcdState = (tex, st) => redraw(tex, st);

// ---------- corridor & kitchen ----------
export const linoleumTex = () => canvasTex(512, 512, (g, w, h) => {
  const r = rng(31);
  g.fillStyle = '#b9b2a2'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 14000; i++) { g.fillStyle = r() > 0.5 ? `rgba(90,80,65,${r() * 0.25})` : `rgba(255,250,235,${r() * 0.25})`; g.fillRect(r() * w, r() * h, 2 + r() * 3, 1 + r() * 2); }
  g.fillStyle = 'rgba(60,55,45,.18)'; g.fillRect(0, 0, w, 2);
}, { repeat: [1, 1] });

export const kitchenTileTex = () => canvasTex(512, 512, (g, w, h) => {
  const n = 4, s = w / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    g.fillStyle = (x + y) % 2 ? '#e9e6df' : '#cfd5d8';
    g.fillRect(x * s, y * s, s, s);
  }
  g.strokeStyle = '#a9a69e'; g.lineWidth = 3;
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); }
}, { repeat: [1, 1] });

export const noticeBoardTex = () => canvasTex(640, 420, (g, w, h) => {
  const r = rng(41);
  g.fillStyle = '#b78a55'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(${90 + r() * 60},${60 + r() * 40},30,.35)`; g.fillRect(r() * w, r() * h, 2, 2); }
  g.strokeStyle = '#6b4a28'; g.lineWidth = 16; g.strokeRect(0, 0, w, h);
  const sheet = (x, y, sw, sh, rot, title, lines, col = '#fdfdf8') => {
    g.save(); g.translate(x, y); g.rotate(rot);
    g.fillStyle = col; g.fillRect(-sw / 2, -sh / 2, sw, sh);
    g.fillStyle = '#222'; g.font = `bold 17px ${SANS}`; g.textAlign = 'center'; g.fillText(title, 0, -sh / 2 + 28);
    g.font = `13px ${SANS}`; lines.forEach((l, i) => g.fillText(l, 0, -sh / 2 + 54 + i * 18));
    g.fillStyle = '#c0271d'; g.beginPath(); g.arc(0, -sh / 2 + 8, 6, 0, 7); g.fill();
    g.restore();
  };
  sheet(130, 150, 200, 230, -0.04, 'ПРИКАЗ № 14', ['о трудовой дисциплине', 'в отделе заявок', '', 'Телефон брать', 'не позднее 3-го гудка!', '', 'Дир. Громов В. П.']);
  sheet(340, 130, 170, 180, 0.05, 'ГРАФИК УБОРКИ', ['Пн — Алёна В.', 'Вт — место №2', 'Ср — место №2', 'Чт — сан. день', 'Пт — место №2']);
  sheet(520, 170, 170, 200, -0.06, 'ПРОДАМ ГАРАЖ', ['недорого', 'ГСК «Мотор»', '', 'тел. 8-916-…'], '#fff6b8');
  sheet(330, 330, 230, 120, 0.02, 'С ДНЁМ ХЛЕБОПЕКА!', ['поздравляем коллектив', '16 октября'], '#ffe0e6');
});

export const kitchenPosterTex = () => canvasTex(420, 560, (g, w, h) => {
  g.fillStyle = '#fbf6ea'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#6b3a1f'; g.font = `bold 46px ${SANS}`; g.textAlign = 'center';
  g.fillText('КОФЕ', w / 2, 90);
  g.font = `24px ${SANS}`; g.fillText('только для сотрудников', w / 2, 132); g.fillText('отдела заявок', w / 2, 162);
  g.fillStyle = '#6b3a1f'; g.beginPath(); g.ellipse(w / 2, 300, 90, 60, 0, 0, Math.PI); g.fill();
  g.fillRect(w / 2 - 90, 240, 180, 60);
  g.strokeStyle = '#6b3a1f'; g.lineWidth = 12; g.beginPath(); g.arc(w / 2 + 104, 280, 30, -1.4, 1.4); g.stroke();
  g.strokeStyle = 'rgba(107,58,31,.5)'; g.lineWidth = 6; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(w / 2 + i * 40, 225); g.bezierCurveTo(w / 2 + i * 40 - 20, 200, w / 2 + i * 40 + 20, 180, w / 2 + i * 40, 150 + 20); g.stroke(); }
  g.fillStyle = '#b3261e'; g.font = `bold 28px ${SANS}`; g.fillText('ЧАШКИ МОЕМ', w / 2, 440); g.fillText('ЗА СОБОЙ!', w / 2, 476);
  g.fillStyle = '#777'; g.font = `18px ${SANS}`; g.fillText('администрация', w / 2, 530);
});

export const handsTex = () => canvasTex(360, 480, (g, w, h) => {
  g.fillStyle = '#e8f3fb'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1b5e9c'; g.font = `bold 44px ${SANS}`; g.textAlign = 'center';
  g.fillText('МОЙТЕ', w / 2, 80); g.fillText('РУКИ!', w / 2, 132);
  g.fillStyle = '#7fb6e0'; for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(80 + (i * 67) % 220, 200 + (i * 41) % 180, 14 + (i % 3) * 6, 0, 7); g.fill(); }
  g.fillStyle = '#333'; g.font = `20px ${SANS}`; g.fillText('СанПиН для пищевого', w / 2, 430); g.fillText('производства', w / 2, 456);
});

export const coffeeScreenTex = () => canvasTex(128, 64, (g, w, h, st = 'idle') => {
  g.fillStyle = '#0d1a14'; g.fillRect(0, 0, w, h);
  g.fillStyle = st === 'brew' ? '#ffcc55' : st === 'ready' ? '#7dff9a' : '#5ad2ff';
  g.font = `bold 18px ${SANS}`; g.textAlign = 'center';
  g.fillText(st === 'brew' ? 'ГОТОВИМ…' : st === 'ready' ? 'ГОТОВО' : 'КАПУЧИНО', w / 2, 38);
}, { aniso: 2 });
