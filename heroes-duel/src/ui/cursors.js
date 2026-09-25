// Custom battle cursors drawn as small inline SVGs (32×32, hotspot in the centre).
const cache = new Map();

function toCursor(svg, fallback = 'pointer') {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16, ${fallback}`;
}

const wrap = (inner, angle = 0) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
  `<g transform="rotate(${angle} 16 16)" stroke="#1a130c" stroke-width="1.2" stroke-linejoin="round">${inner}</g></svg>`;

// Blade points "up" before rotation; the angle turns it toward the target.
const SWORD = `
  <path d="M16 2 L18.6 6 L18.6 19 L13.4 19 L13.4 6 Z" fill="#e9eef3"/>
  <path d="M16 3.5 L16 18.5" stroke="#9aa4ae" stroke-width="0.8"/>
  <rect x="9.5" y="19" width="13" height="2.6" rx="1" fill="#d4a93c"/>
  <rect x="14.6" y="21.6" width="2.8" height="6" fill="#6b3d1f"/>
  <circle cx="16" cy="29" r="1.9" fill="#d4a93c"/>`;

const ARROW = `
  <path d="M16 2 L19.5 8 L16.9 8 L16.9 23 L15.1 23 L15.1 8 L12.5 8 Z" fill="#e3e8ec"/>
  <path d="M15.1 21 L11.5 27 L11.5 30 L15.1 25.5 Z" fill="#c9433a"/>
  <path d="M16.9 21 L20.5 27 L20.5 30 L16.9 25.5 Z" fill="#c9433a"/>
  <rect x="15.1" y="8" width="1.8" height="15" fill="#9a6b3c"/>`;

// Same arrow snapped in the middle: the two halves drift apart.
const BROKEN = `
  <g transform="translate(-2.2 -1) rotate(-14 16 10)">
    <path d="M16 2 L19.5 8 L16.9 8 L16.9 13.5 L16 12.6 L15.1 14 L15.1 8 L12.5 8 Z" fill="#e3e8ec"/>
    <path d="M15.1 8 L16.9 8 L16.9 13.5 L16 12.6 L15.1 14 Z" fill="#9a6b3c"/>
  </g>
  <g transform="translate(2.2 1) rotate(14 16 22)">
    <path d="M15.1 17 L16 16.2 L16.9 17.6 L16.9 23 L15.1 23 Z" fill="#9a6b3c"/>
    <path d="M15.1 21 L11.5 27 L11.5 30 L15.1 25.5 Z" fill="#c9433a"/>
    <path d="M16.9 21 L20.5 27 L20.5 30 L16.9 25.5 Z" fill="#c9433a"/>
  </g>`;

const BOOT = `
  <path d="M11 4 L18 4 L18 18 L26 21 L26 27 L9 27 L9 22 L11 20 Z" fill="#b98a4e"/>
  <rect x="9" y="25" width="17" height="2.5" fill="#4a2f1a"/>`;

const WING = `
  <path d="M5 22 C8 10 16 5 27 5 C24 9 25 10 22 12 C24 12 22 15 19 16 C21 16 18 19 15 19 C16 20 13 22 5 22 Z" fill="#f4efe2"/>`;

const NO = `
  <circle cx="16" cy="16" r="11" fill="none" stroke="#1a130c" stroke-width="5"/>
  <circle cx="16" cy="16" r="11" fill="none" stroke="#d6453a" stroke-width="3"/>
  <path d="M8.5 8.5 L23.5 23.5" stroke="#1a130c" stroke-width="5"/>
  <path d="M8.5 8.5 L23.5 23.5" stroke="#d6453a" stroke-width="3"/>`;

function get(name, inner, angle = 0) {
  const k = `${name}:${angle}`;
  if (!cache.has(k)) cache.set(k, toCursor(wrap(inner, angle), name === 'no' ? 'not-allowed' : 'pointer'));
  return cache.get(k);
}

// Angle in degrees, snapped to 15° so the cache stays small.
const snap = (deg) => Math.round(deg / 15) * 15;

export const cursors = {
  sword: (deg) => get('sword', SWORD, snap(deg)),
  arrow: (deg) => get('arrow', ARROW, snap(deg)),
  broken: (deg) => get('broken', BROKEN, snap(deg)),
  move: () => get('move', BOOT),
  fly: () => get('fly', WING),
  no: () => get('no', NO),
};
