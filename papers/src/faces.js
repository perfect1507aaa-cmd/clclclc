// Procedural SVG portraits. The same (seed, sex) always draws the same person,
// so passport photos can be compared against the face in the booth window.
import { Rng } from './rng.js';

const SKIN = ['#f2d4b6', '#e9c19c', '#d9a77c', '#c48c60', '#a86d46', '#855233'];
const HAIR = ['#1c1916', '#3a291c', '#5e4128', '#936a3f', '#c9a25c', '#8b8b86', '#d9d5cc', '#7c3319'];
const SHIRT = ['#3d4a5c', '#5c3d3d', '#4a5c3d', '#5c553d', '#2f2f38', '#6a6a6a', '#40585c', '#6b5a7a'];

export function faceTraits(seed, sex) {
  const r = new Rng(seed * 7919 + 13);
  const male = sex === 'M';
  return {
    sex,
    skin: r.int(0, SKIN.length - 1),
    hair: r.int(0, HAIR.length - 1),
    style: r.int(0, 4),
    bald: male && r.chance(0.15),
    faceW: r.int(27, 34),
    faceH: r.int(36, 43),
    hairline: r.int(27, 34),
    eyeGap: r.int(10, 15),
    eyeY: r.int(52, 57),
    eyeSize: r.int(2, 4),
    brow: r.int(0, 2),
    nose: r.int(0, 2),
    mouthW: r.int(6, 12),
    mouthCurve: r.int(-2, 2),
    facial: male ? r.pick([0, 0, 0, 1, 2, 3]) : 0,
    glasses: r.chance(0.22),
    mole: r.chance(0.2) ? [r.int(-14, 14), r.int(2, 18)] : null,
    scar: male && r.chance(0.12),
    shirt: r.int(0, SHIRT.length - 1),
  };
}

// True when two faces differ in enough prominent features to be told apart.
export function facesDistinct(a, b) {
  let d = 0;
  for (const k of ['hair', 'style', 'facial', 'glasses', 'skin', 'bald']) if (a[k] !== b[k]) d++;
  if (Math.abs(a.faceW - b.faceW) > 3) d++;
  return d >= 2;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s) => Math.max(0, Math.min(255, ((n >> s) & 255) + amt));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

export function faceSVG(seed, sex) {
  const t = faceTraits(seed, sex);
  const skin = SKIN[t.skin];
  const skinDark = shade(skin, -40);
  const hair = HAIR[t.hair];
  const cx = 50;
  const cy = 58;
  const fw = t.faceW;
  const fh = t.faceH;
  const top = cy - fh;
  const parts = [];

  // Long hair falls behind the head and shoulders.
  if (sex === 'F' && (t.style === 0 || t.style === 1 || t.style === 3)) {
    const bottom = t.style === 1 ? cy + 14 : cy + 42;
    if (t.style === 3) {
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (0.05 + (i / 8) * 0.9);
        parts.push(`<circle cx="${cx + Math.cos(a) * (fw + 6)}" cy="${cy - 10 + Math.sin(a) * 34}" r="11" fill="${hair}"/>`);
      }
    }
    parts.push(`<rect x="${cx - fw - 6}" y="${top + 4}" width="${fw * 2 + 12}" height="${bottom - top - 4}" rx="${fw}" fill="${hair}"/>`);
  }

  // Shoulders and neck.
  parts.push(`<path d="M8 120 Q12 92 50 88 Q88 92 92 120 Z" fill="${SHIRT[t.shirt]}"/>`);
  parts.push(`<path d="M40 104 L50 92 L60 104" fill="none" stroke="${shade(SHIRT[t.shirt], 40)}" stroke-width="2"/>`);
  parts.push(`<rect x="${cx - 8}" y="${cy + fh - 14}" width="16" height="18" fill="${skinDark}"/>`);

  // Ears and head.
  parts.push(`<ellipse cx="${cx - fw}" cy="${cy + 2}" rx="4" ry="7" fill="${skinDark}"/>`);
  parts.push(`<ellipse cx="${cx + fw}" cy="${cy + 2}" rx="4" ry="7" fill="${skinDark}"/>`);
  parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${fw}" ry="${fh}" fill="${skin}"/>`);

  // Facial hair sits on the skin, under the features.
  if (t.facial === 2) {
    parts.push(`<path d="M${cx - fw + 2} ${cy + 6} Q${cx - fw + 4} ${cy + fh + 4} ${cx} ${cy + fh + 5} Q${cx + fw - 4} ${cy + fh + 4} ${cx + fw - 2} ${cy + 6} Q${cx + fw - 8} ${cy + 22} ${cx} ${cy + 20} Q${cx - fw + 8} ${cy + 22} ${cx - fw + 2} ${cy + 6} Z" fill="${hair}"/>`);
  } else if (t.facial === 3) {
    parts.push(`<path d="M${cx - fw + 3} ${cy + 8} Q${cx} ${cy + fh + 8} ${cx + fw - 3} ${cy + 8} Q${cx} ${cy + 24} ${cx - fw + 3} ${cy + 8} Z" fill="${hair}" opacity="0.28"/>`);
  }

  // Eyes.
  const ey = t.eyeY;
  for (const s of [-1, 1]) {
    const ex = cx + s * t.eyeGap;
    parts.push(`<ellipse cx="${ex}" cy="${ey}" rx="${3 + t.eyeSize * 0.6}" ry="${1.6 + t.eyeSize * 0.4}" fill="#f4f1ea"/>`);
    parts.push(`<circle cx="${ex}" cy="${ey}" r="${1.4 + t.eyeSize * 0.3}" fill="#1d1d22"/>`);
    const bw = [1.2, 2, 3][t.brow];
    const tilt = t.brow === 2 ? 2 : 0;
    parts.push(`<path d="M${ex - 5} ${ey - 5 - (s < 0 ? 0 : tilt)} L${ex + 5} ${ey - 5 - (s < 0 ? tilt : 0)}" stroke="${hair}" stroke-width="${bw}" stroke-linecap="round"/>`);
  }

  // Nose.
  const nl = [11, 13, 15][t.nose];
  parts.push(`<path d="M${cx} ${ey + 2} L${cx - 3 - t.nose} ${ey + nl} Q${cx} ${ey + nl + 2} ${cx + 2} ${ey + nl - 1}" fill="none" stroke="${skinDark}" stroke-width="1.6" stroke-linejoin="round"/>`);

  // Mouth.
  const my = ey + nl + 9;
  const mw = t.mouthW;
  const lip = sex === 'F' ? '#a8434a' : shade(skin, -70);
  parts.push(`<path d="M${cx - mw} ${my} Q${cx} ${my + t.mouthCurve * 2 + 2} ${cx + mw} ${my}" fill="none" stroke="${lip}" stroke-width="${sex === 'F' ? 2.6 : 1.8}" stroke-linecap="round"/>`);

  if (t.facial === 1 || t.facial === 2) {
    parts.push(`<path d="M${cx - mw - 2} ${my - 2} Q${cx} ${my - 9} ${cx + mw + 2} ${my - 2} Q${cx} ${my - 4} ${cx - mw - 2} ${my - 2} Z" fill="${hair}"/>`);
  }

  if (t.mole) parts.push(`<circle cx="${cx + t.mole[0]}" cy="${ey + t.mole[1]}" r="1.3" fill="#4a2c20"/>`);
  if (t.scar) parts.push(`<path d="M${cx + t.eyeGap + 3} ${ey - 8} L${cx + t.eyeGap - 3} ${ey + 10}" stroke="#9c5d52" stroke-width="1.4"/>`);

  // Hair on top of the head.
  const hl = t.hairline;
  const ctrlY = 2 * (top + hl) - (cy - 4);
  const cap = `M${cx - fw - 1} ${cy - 4} A${fw + 1} ${fh + 2} 0 0 1 ${cx + fw + 1} ${cy - 4} Q${cx} ${ctrlY} ${cx - fw - 1} ${cy - 4} Z`;
  if (t.bald) {
    parts.push(`<path d="M${cx - fw} ${cy - 2} Q${cx - fw - 1} ${cy - 18} ${cx - fw + 8} ${cy - 22} L${cx - fw + 4} ${cy - 2} Z" fill="${hair}"/>`);
    parts.push(`<path d="M${cx + fw} ${cy - 2} Q${cx + fw + 1} ${cy - 18} ${cx + fw - 8} ${cy - 22} L${cx + fw - 4} ${cy - 2} Z" fill="${hair}"/>`);
  } else if (sex === 'M') {
    if (t.style === 2) {
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (1.05 + (i / 8) * 0.9);
        parts.push(`<circle cx="${cx + Math.cos(a) * fw}" cy="${cy - 8 + Math.sin(a) * (fh - 6)}" r="8" fill="${hair}"/>`);
      }
    } else {
      parts.push(`<path d="${cap}" fill="${hair}" opacity="${t.style === 3 ? 0.6 : 1}"/>`);
      if (t.style === 1) parts.push(`<ellipse cx="${cx - 8}" cy="${top + 2}" rx="${fw - 6}" ry="9" fill="${hair}"/>`);
      if (t.style === 4) parts.push(`<path d="M${cx - fw + 2} ${top + 14} Q${cx + 4} ${top - 10} ${cx + fw + 3} ${top + 16} Q${cx} ${top + 4} ${cx - fw + 2} ${top + 14} Z" fill="${hair}"/>`);
    }
  } else {
    parts.push(`<path d="${cap}" fill="${hair}"/>`);
    if (t.style === 2) parts.push(`<circle cx="${cx}" cy="${top - 4}" r="11" fill="${hair}"/>`);
    if (t.style === 0 || t.style === 4) {
      parts.push(`<path d="M${cx - fw + 2} ${top + 16} Q${cx - 6} ${top + hl + 6} ${cx + 10} ${top + hl - 2} Q${cx} ${top + 10} ${cx - fw + 2} ${top + 16} Z" fill="${hair}"/>`);
    }
  }

  if (t.glasses) {
    for (const s of [-1, 1]) parts.push(`<circle cx="${cx + s * t.eyeGap}" cy="${ey}" r="6.5" fill="none" stroke="#222" stroke-width="1.5"/>`);
    parts.push(`<path d="M${cx - t.eyeGap + 6.5} ${ey} L${cx + t.eyeGap - 6.5} ${ey}" stroke="#222" stroke-width="1.5"/>`);
  }

  return `<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${parts.join('')}</svg>`;
}

// Silhouette used for people waiting in the queue.
export function silhouetteSVG(seed) {
  const r = new Rng(seed);
  const c = SHIRT[r.int(0, SHIRT.length - 1)];
  const h = HAIR[r.int(0, HAIR.length - 1)];
  return `<svg viewBox="0 0 20 44" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="10" cy="7" r="6" fill="${h}"/><path d="M2 44 L3 18 Q10 12 17 18 L18 44 Z" fill="${c}"/></svg>`;
}

export function sealSVG(id) {
  const ink = '#b3262e';
  const ring = `<circle cx="25" cy="25" r="22" fill="none" stroke="${ink}" stroke-width="2.5"/>`;
  const inner = `<circle cx="25" cy="25" r="16" fill="none" stroke="${ink}" stroke-width="1.2"/>`;
  const star = (n) => {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const rad = i % 2 ? 5 : 12;
      const a = -Math.PI / 2 + (i * Math.PI) / n;
      pts.push(`${(25 + Math.cos(a) * rad).toFixed(1)},${(25 + Math.sin(a) * rad).toFixed(1)}`);
    }
    return `<polygon points="${pts.join(' ')}" fill="${ink}"/>`;
  };
  const shapes = {
    star: ring + star(5),
    star6: ring + star(6),
    cross: ring + inner + `<path d="M25 13 V37 M13 25 H37" stroke="${ink}" stroke-width="4"/>`,
    saltire: ring + inner + `<path d="M17 17 L33 33 M33 17 L17 33" stroke="${ink}" stroke-width="4"/>`,
    ring: ring + inner + `<circle cx="25" cy="25" r="6" fill="${ink}"/>`,
  };
  return `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${shapes[id] || ''}</svg>`;
}
