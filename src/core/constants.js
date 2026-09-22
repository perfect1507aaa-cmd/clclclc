// Core tunable constants for the NETSPLIT simulation.

export const CHANNEL_MAX = 4;               // max simultaneous outgoing connections per node
export const CHANNEL_SHARE = 0.25;          // each connection carries this fraction of node output

// Connections are pipes: packets drawn from the source accumulate as
// "in-transit" mass and leak toward the destination over a travel time
// derived from on-screen distance. Longer connections hold more mass in
// flight at any moment — which is exactly what a cut releases.
export const TRAVEL_TIME_SCALE = 4.2;       // seconds of travel per unit of normalized distance
export const TRAVEL_TIME_MIN = 0.35;

export const DORMANT_CLAIM_COST = 25;
export const DORMANT_INITIAL_BUFFER = 15;

// Node tiers are purely a function of the current buffer's digit count —
// "the more digits, the cooler" — and grant automatic, reversible bonuses.
// No manual purchases: a node that drains back below a threshold loses
// the bonus immediately.
export const TIER_THRESHOLDS = [0, 10, 100]; // tier 1 / 2 / 3 floors
export const TIER_STATS = {
  1: { generation: 1, output: 1, defense: 1, radius: 1 },
  2: { generation: 1.5, output: 1.3, defense: 0.8, radius: 1.18 },
  3: { generation: 2.3, output: 1.8, defense: 0.6, radius: 1.4 },
};

export const TRACE_MAX = 100;
export const TRACE_DECAY_PER_SEC = 4;
export const TRACE_GAIN_PER_DAMAGE = 0.9;
export const TRACE_ICE_BUFFER_LOSS = 0.66;  // fraction of buffer lost on trace ICE strike
export const TRACE_RESET_TO = 50;

export const CAPTURE_FLASH_DURATION = 0.6;
export const COLLISION_FLASH_DECAY = 3;

export const CUT_HIT_RADIUS = 16; // px, how close the RMB click must land to a beam to cut it

export const OWNER = {
  PLAYER: 'player',
  ENEMY: 'enemy',
  NEUTRAL: 'neutral',
  DORMANT: 'dormant',
};
