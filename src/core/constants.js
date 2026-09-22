// Core tunable constants for the NETSPLIT simulation.

export const CABLE_BASE_BANDWIDTH = 6;      // packets/s a stock cable can carry per direction
export const CHANNEL_MAX = 4;               // max simultaneous outgoing channels per node
export const CHANNEL_SHARE = 0.25;          // each channel carries this fraction of node output

export const UPGRADE_BASE_COST = 20;        // packets for level 1 in any branch
export const UPGRADE_MAX_LEVEL = 3;
export const UPGRADE_COST_GROWTH = 2;       // cost doubles per level

export const CPU_GEN_PER_LEVEL = 0.6;       // +60% generation per CPU level
export const RAM_BUF_PER_LEVEL = 0.6;       // +60% buffer cap per RAM level
export const NIC_OUT_PER_LEVEL = 0.45;      // +45% output per NIC level
export const ICE_DMG_MULT_PER_LEVEL = 0.55; // incoming damage *= 0.55 per ICE level

export const DORMANT_CLAIM_COST = 25;
export const DORMANT_INITIAL_BUFFER = 15;

export const TRACE_MAX = 100;
export const TRACE_DECAY_PER_SEC = 4;
export const TRACE_GAIN_PER_DAMAGE = 0.9;
export const TRACE_ICE_BUFFER_LOSS = 0.66;  // fraction of buffer lost on trace ICE strike
export const TRACE_RESET_TO = 50;

export const CAPTURE_FLASH_DURATION = 0.6;
export const COLLISION_FLASH_DECAY = 3;

export const OWNER = {
  PLAYER: 'player',
  ENEMY: 'enemy',
  NEUTRAL: 'neutral',
  DORMANT: 'dormant',
};
