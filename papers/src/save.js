const KEY = 'pogranpost.save.v1';
const SOUND_KEY = 'pogranpost.sound';

export const Save = {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },
  write(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      /* storage unavailable, progress just won't persist */
    }
  },
  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      /* ignore */
    }
  },
  soundOn() {
    try {
      return localStorage.getItem(SOUND_KEY) !== 'off';
    } catch (e) {
      return true;
    }
  },
  setSound(on) {
    try {
      localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
    } catch (e) {
      /* ignore */
    }
  },
};
