// Minimal promise-based tweening driven by the render loop.
const active = new Set();

export function tween(duration, onUpdate, ease = (t) => t) {
  return new Promise((resolve) => {
    active.add({ start: performance.now(), duration: duration * 1000, onUpdate, ease, resolve });
  });
}

export function updateTweens(now = performance.now()) {
  for (const tw of active) {
    const t = Math.min(1, (now - tw.start) / tw.duration);
    tw.onUpdate(tw.ease(t));
    if (t >= 1) {
      active.delete(tw);
      tw.resolve();
    }
  }
}

export const wait = (s) => tween(s, () => {});
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
