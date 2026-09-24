// Haven faction roster: 7 tiers × (base, upgrade, alternate upgrade).
// Stats follow the Tribes of the East ruleset.
//
// model: which low-poly builder to use and how to dress it (see scene/models.js).

export const FACTION = {
  id: 'haven',
  name: 'Орден Порядка',
  nameEn: 'Haven',
  colors: { primary: '#2f5fb3', secondary: '#e8d9a8' },
};

const C = (o) => Object.freeze({ abilities: [], spells: [], shots: 0, mana: 0, ...o });

export const CREATURES = {
  // ── Tier 1 ──────────────────────────────────────────────
  peasant: C({
    tier: 1, variant: 'base', name: 'Крестьянин', nameEn: 'Peasant',
    attack: 1, defense: 1, dmg: [1, 1], hp: 3, speed: 4, initiative: 8,
    growth: 22, cost: { gold: 15 },
    abilities: ['taxpayer'],
    model: { kind: 'humanoid', tunic: 0x8a6b43, pants: 0x5b4a33, head: 'cap', headColor: 0x6e5a3a, weapon: 'pitchfork' },
  }),
  conscript: C({
    tier: 1, variant: 'upgrade', name: 'Ополченец', nameEn: 'Conscript',
    attack: 2, defense: 2, dmg: [1, 2], hp: 6, speed: 4, initiative: 8,
    growth: 22, cost: { gold: 25 },
    abilities: ['taxpayer', 'bash'],
    model: { kind: 'humanoid', tunic: 0x3f67a8, pants: 0x55462f, head: 'kettle', headColor: 0x9aa3ad, weapon: 'flail', trim: 0xd9c38a },
  }),
  brute: C({
    tier: 1, variant: 'alt', name: 'Громила', nameEn: 'Brute',
    attack: 3, defense: 1, dmg: [1, 2], hp: 6, speed: 4, initiative: 8,
    growth: 22, cost: { gold: 25 },
    abilities: ['taxpayer', 'assault'],
    model: { kind: 'humanoid', tunic: 0x7a3b2e, pants: 0x3e3226, head: 'bare', weapon: 'club', bulk: 1.18 },
  }),

  // ── Tier 2 ──────────────────────────────────────────────
  archer: C({
    tier: 2, variant: 'base', name: 'Лучник', nameEn: 'Archer',
    attack: 4, defense: 3, dmg: [2, 4], hp: 7, speed: 4, initiative: 9, shots: 10,
    growth: 12, cost: { gold: 50 },
    abilities: ['shooter', 'scatter_shot'],
    model: { kind: 'humanoid', tunic: 0x4d6e3a, pants: 0x4a3d2b, head: 'hood', headColor: 0x3c5a2c, weapon: 'bow', quiver: true },
  }),
  marksman: C({
    tier: 2, variant: 'upgrade', name: 'Арбалетчик', nameEn: 'Marksman',
    attack: 4, defense: 4, dmg: [2, 8], hp: 10, speed: 4, initiative: 8, shots: 12,
    growth: 12, cost: { gold: 80 },
    abilities: ['shooter', 'precise_shot'],
    model: { kind: 'humanoid', tunic: 0x3a5f9e, pants: 0x4a3d2b, head: 'kettle', headColor: 0xa8b0b8, weapon: 'crossbow', trim: 0xe0cf98, quiver: true },
  }),
  crossbowman: C({
    tier: 2, variant: 'alt', name: 'Стрелок', nameEn: 'Crossbowman',
    attack: 4, defense: 8, dmg: [2, 8], hp: 10, speed: 4, initiative: 8, shots: 6,
    growth: 12, cost: { gold: 80 },
    abilities: ['shooter', 'no_range_penalty'],
    model: { kind: 'humanoid', tunic: 0x7a2f2f, pants: 0x3a3228, head: 'helm', headColor: 0x8d959d, weapon: 'crossbow', shield: 'pavise', shieldColor: 0x8c2a2a },
  }),

  // ── Tier 3 ──────────────────────────────────────────────
  footman: C({
    tier: 3, variant: 'base', name: 'Мечник', nameEn: 'Footman',
    attack: 4, defense: 8, dmg: [2, 4], hp: 16, speed: 4, initiative: 8,
    growth: 10, cost: { gold: 85 },
    abilities: ['large_shield', 'bash'],
    model: { kind: 'humanoid', armor: true, tunic: 0x8f98a2, pants: 0x5d646b, head: 'helm', headColor: 0x9ea6ae, weapon: 'sword', shield: 'kite', shieldColor: 0x355c9e },
  }),
  squire: C({
    tier: 3, variant: 'upgrade', name: 'Латник', nameEn: 'Squire',
    attack: 5, defense: 9, dmg: [2, 5], hp: 26, speed: 4, initiative: 8,
    growth: 10, cost: { gold: 130 },
    abilities: ['large_shield', 'bash', 'shield_allies'],
    model: { kind: 'humanoid', armor: true, tunic: 0xb1b8bf, pants: 0x6a7178, head: 'greathelm', headColor: 0xc0c6cc, weapon: 'sword', shield: 'tower', shieldColor: 0x2c55a0, trim: 0xd8b95a, bulk: 1.08 },
  }),
  vindicator: C({
    tier: 3, variant: 'alt', name: 'Каратель', nameEn: 'Vindicator',
    attack: 8, defense: 7, dmg: [2, 6], hp: 23, speed: 4, initiative: 8,
    growth: 10, cost: { gold: 130 },
    abilities: ['large_shield', 'cleave'],
    model: { kind: 'humanoid', armor: true, tunic: 0x8a9097, pants: 0x4d5258, head: 'greathelm', headColor: 0x7e858c, weapon: 'greatsword', cape: 0x8a2525, trim: 0xc9a44a, bulk: 1.08 },
  }),

  // ── Tier 4 ──────────────────────────────────────────────
  griffin: C({
    tier: 4, variant: 'base', name: 'Грифон', nameEn: 'Griffin',
    attack: 7, defense: 5, dmg: [5, 10], hp: 30, speed: 7, initiative: 15,
    growth: 5, cost: { gold: 250 },
    abilities: ['large', 'flyer', 'unlimited_retaliation'],
    model: { kind: 'griffin', body: 0xa87a45, head: 0xe9e2d0, wing: 0x8c6236, beak: 0xe0b23a },
  }),
  imperial_griffin: C({
    tier: 4, variant: 'upgrade', name: 'Королевский грифон', nameEn: 'Imperial Griffin',
    attack: 9, defense: 8, dmg: [5, 15], hp: 35, speed: 7, initiative: 15,
    growth: 5, cost: { gold: 370 },
    abilities: ['large', 'flyer', 'unlimited_retaliation', 'battle_dive'],
    model: { kind: 'griffin', body: 0xc79a4f, head: 0xf5f1e6, wing: 0xb48a3e, beak: 0xf0c540, crest: 0x3565b8, scale: 1.08 },
  }),
  battle_griffin: C({
    tier: 4, variant: 'alt', name: 'Боевой грифон', nameEn: 'Battle Griffin',
    attack: 9, defense: 9, dmg: [7, 12], hp: 52, speed: 7, initiative: 15,
    growth: 5, cost: { gold: 370 },
    abilities: ['large', 'flyer', 'unlimited_retaliation', 'immune_blind'],
    model: { kind: 'griffin', body: 0x7a5534, head: 0xd6ccb5, wing: 0x5f4128, beak: 0xc99a2e, barding: 0x8a2a2a, scale: 1.1 },
  }),

  // ── Tier 5 ──────────────────────────────────────────────
  priest: C({
    tier: 5, variant: 'base', name: 'Монах', nameEn: 'Priest',
    attack: 12, defense: 12, dmg: [9, 12], hp: 54, speed: 5, initiative: 10, shots: 7,
    growth: 3, cost: { gold: 600 },
    abilities: ['shooter', 'no_melee_penalty'],
    model: { kind: 'humanoid', robe: true, tunic: 0xe6e0cf, head: 'hood', headColor: 0xd9d2bf, weapon: 'staff', trim: 0xc9a44a, orb: 0xfff0a0 },
  }),
  inquisitor: C({
    tier: 5, variant: 'upgrade', name: 'Инквизитор', nameEn: 'Inquisitor',
    attack: 16, defense: 16, dmg: [9, 12], hp: 80, speed: 5, initiative: 10, shots: 7, mana: 10,
    growth: 3, cost: { gold: 850 },
    abilities: ['shooter', 'no_melee_penalty', 'caster'],
    spells: ['Выносливость', 'Отражение снарядов', 'Праведная сила'],
    model: { kind: 'humanoid', robe: true, tunic: 0xf0ead8, head: 'mitre', headColor: 0xf3eee0, weapon: 'staff', trim: 0x2f5fb3, orb: 0xfff4b0, cape: 0x2f5fb3 },
  }),
  zealot: C({
    tier: 5, variant: 'alt', name: 'Ревнитель', nameEn: 'Zealot',
    attack: 20, defense: 14, dmg: [9, 12], hp: 80, speed: 5, initiative: 10, shots: 7, mana: 10,
    growth: 3, cost: { gold: 850 },
    abilities: ['shooter', 'no_melee_penalty', 'caster'],
    spells: ['Регенерация'],
    model: { kind: 'humanoid', robe: true, tunic: 0x8e2b2b, head: 'mitre', headColor: 0xe4dcc6, weapon: 'staff', trim: 0xd8b95a, orb: 0xffb060, cape: 0x3b1d1d },
  }),

  // ── Tier 6 ──────────────────────────────────────────────
  cavalier: C({
    tier: 6, variant: 'base', name: 'Рыцарь', nameEn: 'Cavalier',
    attack: 23, defense: 21, dmg: [20, 30], hp: 90, speed: 7, initiative: 11,
    growth: 2, cost: { gold: 1300 },
    abilities: ['large', 'jousting'],
    model: { kind: 'cavalry', horse: 0x7a5232, mane: 0x2e2218, cloth: 0x2f5fb3, armor: 0xa2aab2, plume: 0xe8e0c8 },
  }),
  paladin: C({
    tier: 6, variant: 'upgrade', name: 'Паладин', nameEn: 'Paladin',
    attack: 24, defense: 24, dmg: [20, 30], hp: 100, speed: 8, initiative: 12,
    growth: 2, cost: { gold: 1700 },
    abilities: ['large', 'jousting', 'lay_hands'],
    model: { kind: 'cavalry', horse: 0xe8e4da, mane: 0xcfc6b0, cloth: 0x2a58b0, armor: 0xd6dbe0, plume: 0x2a58b0, trim: 0xd8b95a },
  }),
  champion: C({
    tier: 6, variant: 'alt', name: 'Чемпион', nameEn: 'Champion',
    attack: 28, defense: 20, dmg: [20, 30], hp: 100, speed: 8, initiative: 12,
    growth: 2, cost: { gold: 1700 },
    abilities: ['large', 'champion_charge'],
    model: { kind: 'cavalry', horse: 0x2d2622, mane: 0x151210, cloth: 0x8a2222, armor: 0x8b929a, plume: 0xb82a2a, trim: 0xc9a44a, barded: true },
  }),

  // ── Tier 7 ──────────────────────────────────────────────
  angel: C({
    tier: 7, variant: 'base', name: 'Ангел', nameEn: 'Angel',
    attack: 27, defense: 27, dmg: [45, 45], hp: 180, speed: 6, initiative: 11,
    growth: 1, cost: { gold: 2800, crystal: 1 },
    abilities: ['large', 'flyer'],
    model: { kind: 'angel', robe: 0xf1ede2, armor: 0xd9dde2, wing: 0xfbf8ef, hair: 0xe6c97a, halo: 0xffe38a, weapon: 0xdfe6ee },
  }),
  archangel: C({
    tier: 7, variant: 'upgrade', name: 'Архангел', nameEn: 'Archangel',
    attack: 31, defense: 31, dmg: [50, 50], hp: 220, speed: 8, initiative: 11,
    growth: 1, cost: { gold: 3500, crystal: 2 },
    abilities: ['large', 'flyer', 'resurrect_allies'],
    model: { kind: 'angel', robe: 0xf6f2e6, armor: 0xe0c060, wing: 0xffffff, hair: 0xf0d890, halo: 0xfff0a0, weapon: 0xfff2c0, scale: 1.1, cape: 0x2f5fb3 },
  }),
  seraph: C({
    tier: 7, variant: 'alt', name: 'Серафим', nameEn: 'Seraph',
    attack: 35, defense: 25, dmg: [50, 50], hp: 220, speed: 8, initiative: 11, mana: 20,
    growth: 1, cost: { gold: 3500, crystal: 2 },
    abilities: ['large', 'flyer', 'caster'],
    spells: ['Слово Света'],
    model: { kind: 'angel', robe: 0xe9e1f2, armor: 0xb99a46, wing: 0xf2e6c8, hair: 0x2b2320, halo: 0xffc86a, weapon: 0xffd48a, scale: 1.1, cape: 0x7a2a3a, sixWings: true },
  }),
};

// Tier → [base, upgrade, alternate]
export const TIERS = [
  ['peasant', 'conscript', 'brute'],
  ['archer', 'marksman', 'crossbowman'],
  ['footman', 'squire', 'vindicator'],
  ['griffin', 'imperial_griffin', 'battle_griffin'],
  ['priest', 'inquisitor', 'zealot'],
  ['cavalier', 'paladin', 'champion'],
  ['angel', 'archangel', 'seraph'],
];

export const VARIANT_LABEL = { base: 'Базовый', upgrade: 'Улучшение', alt: 'Альт. улучшение' };

export function isLarge(id) {
  return CREATURES[id].abilities.includes('large');
}
