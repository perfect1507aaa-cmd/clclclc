// Base stats per node archetype. All numbers are "level 0 / no upgrades".
export const NODE_TYPES = {
  // "output" is a node's raw send capacity, spent 25% per active channel
  // (see CHANNEL_SHARE). Generating types are tuned so that ONE open
  // channel sits close to break-even with generation — pushing costs you
  // buffer only once you stack multiple channels or upgrade NIC further.
  // The router is the deliberate exception: it never generates, so any
  // channel it opens is a pure drain unless fed by an ally.
  workstation: {
    label: 'WORKSTATION',
    generation: 1.0,
    bufferMax: 90,
    output: 4.0,
    defense: 0,
    upgradeCostMult: 1,
    cableMultiplier: 1,
  },
  server: {
    label: 'SERVER',
    generation: 0.45,
    bufferMax: 260,
    output: 1.8,
    defense: 6,
    upgradeCostMult: 0.55,
    cableMultiplier: 1,
  },
  router: {
    label: 'ROUTER',
    generation: 0,
    bufferMax: 140,
    output: 16,
    defense: 8,
    upgradeCostMult: 1,
    cableMultiplier: 2,
  },
  firewall: {
    label: 'FIREWALL',
    generation: 0.65,
    bufferMax: 190,
    output: 1.6,
    defense: 28,
    upgradeCostMult: 1,
    cableMultiplier: 1,
  },
  mainframe: {
    label: 'MAINFRAME',
    generation: 2.2,
    bufferMax: 620,
    output: 8.0,
    defense: 16,
    upgradeCostMult: 1,
    cableMultiplier: 1,
  },
};
