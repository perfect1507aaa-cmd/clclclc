// Dates are stored as whole UTC day numbers (days since 1970-01-01).
const MS_PER_DAY = 86400000;

export const START_DAY = Math.round(Date.UTC(1986, 2, 3) / MS_PER_DAY);

export function dateForShift(shift) {
  return START_DAY + shift - 1;
}

const pad = (n) => String(n).padStart(2, '0');

export function fmtDate(d) {
  const x = new Date(d * MS_PER_DAY);
  return `${pad(x.getUTCDate())}.${pad(x.getUTCMonth() + 1)}.${x.getUTCFullYear()}`;
}

export function addYears(d, years) {
  const x = new Date(d * MS_PER_DAY);
  x.setUTCFullYear(x.getUTCFullYear() + years);
  return Math.round(x.getTime() / MS_PER_DAY);
}

export function fmtClock(minutes) {
  const m = Math.floor(minutes);
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
