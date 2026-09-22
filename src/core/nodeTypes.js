// Base stats per node archetype. All numbers are "tier 1 / no bonuses".
// generation/output are tuned so a single tier-1 connection sits close to
// break-even with the source's own generation (see Node.channelShareOutput).
export const NODE_TYPES = {
  workstation: {
    label: 'WORKSTATION',
    generation: 1.0,
    bufferMax: 90,
    output: 4.0,
    defense: 0,
    flowBoost: 1,
  },
  server: {
    label: 'SERVER',
    generation: 0.45,
    bufferMax: 260,
    output: 1.8,
    defense: 6,
    flowBoost: 1,
  },
  router: {
    label: 'ROUTER',
    generation: 0,
    bufferMax: 140,
    output: 16,
    defense: 8,
    flowBoost: 1.8, // never generates its own traffic, but moves everyone else's fast
  },
  firewall: {
    label: 'FIREWALL',
    generation: 0.65,
    bufferMax: 190,
    output: 1.6,
    defense: 28,
    flowBoost: 1,
  },
  mainframe: {
    label: 'MAINFRAME',
    generation: 2.2,
    bufferMax: 620,
    output: 8.0,
    defense: 16,
    flowBoost: 1,
  },
};
