import { pick, chance } from './util.js';

const FIRST = [
  'Alex', 'Max', 'Leo', 'Nina', 'Isabel', 'Hector', 'Mustafa', 'Yuki', 'Pablo', 'Lena', 'Tom', 'Sofia', 'Ivan',
  'Ahmed', 'Luca', 'Mia', 'Kenji', 'Omar', 'Chloe', 'Diego', 'Emma', 'Olga', 'Pedro', 'Sara', 'Artem', 'Dima',
  'Katya', 'Mehmet', 'Lucas', 'Noah', 'Aisha', 'Mateo', 'Jin', 'Hana', 'Vova', 'Nastya', 'Kirill', 'Felix',
];
const LAST = ['Pascal', 'Silva', 'Novak', 'Kim', 'Rossi', 'Ivanov', 'Müller', 'Garcia', 'Santos', 'Dubois', 'Yilmaz', 'Petrov'];
const EMOJI = ['🌸', '👽', '🐕', '🔥', '⚡', '💀', '🐍', '👑', '😎', '🦊', '🐱', '🍕', '🌙', '💎', '🎮', '✨', '🙂', '🤡', '🐉', '🍀'];
const FLAGS = ['🇧🇷', '🇺🇸', '🇷🇺', '🇩🇪', '🇫🇷', '🇹🇷', '🇵🇱', '🇺🇦', '🇲🇽', '🇪🇸', '🇮🇹', '🇰🇷', '🇵🇭', '🇦🇷'];

const NEWBIE = [
  'Unnamed', 'Unnamed', 'player', 'asdf', 'aaa', 'hi', 'me', 'noob', 'lol', 'test', '123', 'xd', 'snake', 'bob',
  'кек', 'привет', 'я', 'ой', 'eu', 'kid', 'pls no', 'dont kill me', 'first time', 'mom', 'qwerty', 'tiger',
  'Жека', 'kitty', 'banana', 'potato', 'bruh', 'jajaja', '.', '?', 'lmao', 'Unnamed', 'babyshark', 'ez',
];
const CASUAL = [
  'green', 'Blue', 'shadow', 'night', 'Legend', 'Ghost', 'Neo', 'Zero', 'Nova', 'Storm', 'Pixel', 'Spark',
  'Nomad', 'Echo', 'Luna', 'Rex', 'Milo', 'Toxic', 'Frost', 'Blaze', 'Volt', 'Astro', 'Moon', 'Sunny', 'Кот',
  'Волк', 'Лиса', 'xl.fr', 'BOO™', 'OMG', 'Mr.Bean', 'turbo', 'hello kitty', 'papi', 'Lol', 'Max', 'Crazy',
];
const PRO_CORE = [
  'Viper', 'Venom', 'Raijin', 'Kaiser', 'Onyx', 'Vortex', 'Wraith', 'Nyx', 'Reaper', 'Havoc', 'Apex', 'Cipher',
  'Sensei', 'Phantom', 'Zeus', 'Hydra', 'Mamba', 'Tesla', 'Ampere', 'Surge', 'Kilowatt', 'Ohm', 'Arc',
];
const TAGS = ['[PL]', '[EU]', '[RU]', '[ZZ]', '[TTV]', '[GOD]', '[NRG]', 'ツ', '亗', '[VX]', '[K9]'];

const withEmoji = (s) => (chance(0.5) ? `${s} ${pick(EMOJI)}` : `${pick(EMOJI)} ${s}`);

export function botName(type) {
  if (type === 'newbie') {
    const n = pick(NEWBIE);
    return chance(0.2) ? withEmoji(n) : n;
  }
  if (type === 'pro' || type === 'killer') {
    let n = pick(PRO_CORE);
    if (chance(0.4)) n = n.toUpperCase();
    if (chance(0.25)) n += Math.floor(Math.random() * 99);
    if (chance(type === 'pro' ? 0.6 : 0.35)) n = `${pick(TAGS)} ${n}`;
    if (chance(0.15)) n = withEmoji(n);
    return n;
  }
  const r = Math.random();
  if (r < 0.28) {
    const f = pick(FIRST);
    const full = chance(0.35) ? `${f} ${pick(LAST)}` : f;
    return chance(0.45) ? withEmoji(full) : full;
  }
  if (r < 0.36) return `${pick(FIRST)} ${pick(FLAGS)}`;
  let n = pick(CASUAL);
  if (chance(0.3)) n = withEmoji(n);
  if (chance(0.15)) n = n.toUpperCase();
  return n;
}

export function regularName() {
  const n = pick(PRO_CORE);
  return chance(0.4) ? n.toUpperCase() : n;
}
