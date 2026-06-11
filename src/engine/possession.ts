import type { Player } from "../types";
import type { Rng } from "./rng";
import type { EventPayload, ShotZone, TeamSide } from "./events";
import {
  SHOT_CLOCK,
  ORB_SHOT_CLOCK,
  MEAN_ACTION_SECONDS,
  SD_ACTION_SECONDS,
  MIN_ACTION_SECONDS,
  REBOUND_SECONDS,
  EST_TEAM_POSSESSIONS,
  FT_TRIPS_PER_FTA,
  AND_ONE_RATE,
  MISSED_TWOS_PER_GAME,
  RIM_SHARE_OF_TWOS,
  MAX_STEAL_SHARE,
  MAX_ASSIST_RATE,
  MAX_BLOCK_RATE,
} from "./constants";

export interface PlayerRates {
  threeRate: number;
  twoPct: number;
  threePct: number;
  ftPct: number;
  foulDrawRate: number;
}

// The single source of per-player probabilities; future fatigue scales its inputs.
export function computeRates(p: Player): PlayerRates {
  const twoPA = p.fga - p.fg3a;
  const twoPM = p.fgm - p.fg3m;
  return {
    threeRate: p.fg3a / Math.max(p.fga, 1),
    twoPct: twoPM / Math.max(twoPA, 1),
    threePct: p.fg3m / Math.max(p.fg3a, 1),
    ftPct: p.ftm / Math.max(p.fta, 1),
    foulDrawRate: (p.fta / Math.max(p.fga, 1)) * FT_TRIPS_PER_FTA,
  };
}

export interface Lineup {
  side: TeamSide;
  players: Player[]; // on court; future rotation logic swaps these
  rates: PlayerRates[];
}

export function makeLineup(side: TeamSide, roster: Player[]): Lineup {
  const players = roster.slice(0, 5);
  return { side, players, rates: players.map(computeRates) };
}

export interface TimedEvent {
  dt: number; // seconds elapsed since the previous event
  payload: EventPayload;
}

function sum(l: Lineup, stat: (p: Player) => number): number {
  return l.players.reduce((s, p) => s + stat(p), 0);
}

function pick(l: Lineup, weight: (p: Player) => number, rng: Rng): number {
  const ws = l.players.map((p) => Math.max(weight(p), 0) + 1e-3);
  let r = rng() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ws.length; i++) {
    r -= ws[i];
    if (r <= 0) return i;
  }
  return ws.length - 1;
}

function gauss(rng: Rng): number {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

function actionTime(rng: Rng, maxSeconds: number): number {
  const t = Math.min(
    Math.max(MEAN_ACTION_SECONDS + gauss(rng) * SD_ACTION_SECONDS, MIN_ACTION_SECONDS),
    SHOT_CLOCK,
  );
  return Math.max(Math.min(t, maxSeconds), 0);
}

export function runPossession(
  offense: Lineup,
  defense: Lineup,
  remaining: number,
  rng: Rng,
): TimedEvent[] {
  const events: TimedEvent[] = [];
  let shotClock = SHOT_CLOCK;

  while (true) {
    let pending = actionTime(rng, Math.min(shotClock, remaining));
    remaining -= pending;
    const push = (payload: EventPayload) => {
      events.push({ dt: pending, payload });
      pending = 0;
    };

    if (rng() < sum(offense, (p) => p.tov) / EST_TEAM_POSSESSIONS) {
      const stealShare = Math.min(
        sum(defense, (p) => p.stl) / Math.max(sum(offense, (p) => p.tov), 1),
        MAX_STEAL_SHARE,
      );
      push({
        type: "turnover",
        team: offense.side,
        playerId: offense.players[pick(offense, (p) => p.tov, rng)].id,
        stealPlayerId: rng() < stealShare ? defense.players[pick(defense, (p) => p.stl, rng)].id : undefined,
      });
      return events;
    }

    const si = pick(offense, (p) => p.fga, rng);
    const shooter = offense.players[si];
    const r = offense.rates[si];
    const isThree = rng() < r.threeRate;
    const value: 2 | 3 = isThree ? 3 : 2;
    const zone: ShotZone = isThree ? "three" : rng() < RIM_SHARE_OF_TWOS ? "rim" : "mid";

    const shotPayload = (made: boolean, blockPlayerId?: string): EventPayload => {
      let assistPlayerId: string | undefined;
      if (made) {
        const assistRate = Math.min(
          sum(offense, (p) => p.ast) / Math.max(sum(offense, (p) => p.fgm), 1),
          MAX_ASSIST_RATE,
        );
        if (rng() < assistRate) {
          const ai = pick(offense, (p) => (p.id === shooter.id ? 0 : p.ast), rng);
          if (ai !== si) assistPlayerId = offense.players[ai].id;
        }
      }
      return { type: "shot", team: offense.side, playerId: shooter.id, value, made, zone, assistPlayerId, blockPlayerId };
    };

    const orbContest = (): boolean => {
      const orbChance =
        sum(offense, (p) => p.orb) /
        Math.max(sum(offense, (p) => p.orb) + sum(defense, (p) => p.drb), 1);
      if (rng() < orbChance) {
        push({
          type: "rebound",
          team: offense.side,
          playerId: offense.players[pick(offense, (p) => p.orb, rng)].id,
          offensive: true,
        });
        return true;
      }
      push({
        type: "rebound",
        team: defense.side,
        playerId: defense.players[pick(defense, (p) => p.drb, rng)].id,
        offensive: false,
      });
      return false;
    };

    if (rng() < r.foulDrawRate) {
      const andOne = rng() < AND_ONE_RATE;
      if (andOne) push(shotPayload(true));
      push({
        type: "foul",
        team: defense.side,
        playerId: defense.players[Math.floor(rng() * defense.players.length)].id,
        shooting: true,
      });
      const fts = andOne ? 1 : value;
      let lastMade = false;
      for (let n = 1; n <= fts; n++) {
        lastMade = rng() < r.ftPct;
        push({ type: "free_throw", team: offense.side, playerId: shooter.id, made: lastMade, n, of: fts });
      }
      if (lastMade) return events;
      if (!orbContest() || remaining <= 0) return events;
      shotClock = ORB_SHOT_CLOCK;
      continue;
    }

    if (rng() < (isThree ? r.threePct : r.twoPct)) {
      push(shotPayload(true));
      return events;
    }

    let blockPlayerId: string | undefined;
    if (!isThree && rng() < Math.min(sum(defense, (p) => p.blk) / MISSED_TWOS_PER_GAME, MAX_BLOCK_RATE)) {
      blockPlayerId = defense.players[pick(defense, (p) => p.blk, rng)].id;
    }
    push(shotPayload(false, blockPlayerId));

    pending = Math.min(0.5 + rng() * REBOUND_SECONDS, Math.max(remaining, 0));
    remaining -= pending;
    if (!orbContest() || remaining <= 0) return events;
    shotClock = ORB_SHOT_CLOCK;
  }
}
