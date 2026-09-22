const KEY = 'netsplit.progress.v1';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { unlocked: 1, completed: [] };
    const data = JSON.parse(raw);
    return { unlocked: data.unlocked || 1, completed: data.completed || [] };
  } catch (e) {
    return { unlocked: 1, completed: [] };
  }
}

function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    /* storage unavailable, progress just won't persist */
  }
}

export const Progress = {
  get() {
    return load();
  },
  markComplete(levelIndex, totalLevels) {
    const data = load();
    if (!data.completed.includes(levelIndex)) data.completed.push(levelIndex);
    data.unlocked = Math.max(data.unlocked, Math.min(totalLevels, levelIndex + 2));
    save(data);
    return data;
  },
  isUnlocked(levelIndex) {
    const data = load();
    return levelIndex + 1 <= data.unlocked;
  },
  reset() {
    save({ unlocked: 1, completed: [] });
  },
};
