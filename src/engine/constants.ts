export const PERIODS = 4;
export const PERIOD_SECONDS = 720;
export const OT_SECONDS = 300;

export const SHOT_CLOCK = 24;
export const ORB_SHOT_CLOCK = 14;

// Possession action time: clamped gaussian sample in seconds.
export const MEAN_ACTION_SECONDS = 13;
export const SD_ACTION_SECONDS = 4;
export const MIN_ACTION_SECONDS = 4;
export const REBOUND_SECONDS = 2; // max scramble time after a missed shot

// Denominator converting per-game stats into per-possession rates.
export const EST_TEAM_POSSESSIONS = 100;

export const FT_TRIPS_PER_FTA = 0.44;
export const AND_ONE_RATE = 0.07;
export const MISSED_TWOS_PER_GAME = 28; // denominator for block chance per missed two
export const RIM_SHARE_OF_TWOS = 0.55; // presentational zone split only; no location data

export const MAX_STEAL_SHARE = 0.85;
export const MAX_ASSIST_RATE = 0.9;
export const MAX_BLOCK_RATE = 0.5;
