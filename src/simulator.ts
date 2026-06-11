import type { Player, GameResult, PlayerSimAvg, SimResult } from "./types";
import { simulateGame } from "./engine/game";
import { boxScore, type PlayerLine } from "./engine/boxscore";

// Golden-ratio stride decorrelates sequential per-game seeds.
const SEED_STRIDE = 0x9e3779b9;

type StatTotals = Omit<PlayerSimAvg, "playerId">;

const STAT_KEYS = ["pts", "reb", "ast", "stl", "blk", "tov", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta"] as const;

function accumulate(map: Map<string, StatTotals>, lines: PlayerLine[]): void {
  for (const l of lines) {
    const t = map.get(l.playerId) ?? { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0 };
    t.pts += l.pts;
    t.reb += l.orb + l.drb;
    t.ast += l.ast;
    t.stl += l.stl;
    t.blk += l.blk;
    t.tov += l.tov;
    t.fgm += l.fgm;
    t.fga += l.fga;
    t.fg3m += l.fg3m;
    t.fg3a += l.fg3a;
    t.ftm += l.ftm;
    t.fta += l.fta;
    map.set(l.playerId, t);
  }
}

function toAverages(roster: Player[], map: Map<string, StatTotals>, games: number): PlayerSimAvg[] {
  return roster.map((p) => {
    const t = map.get(p.id);
    const avg = { playerId: p.id } as PlayerSimAvg;
    for (const k of STAT_KEYS) {
      avg[k] = t ? Math.round((t[k] / games) * 10) / 10 : 0;
    }
    return avg;
  });
}

export function runSimulations(
  team1: Player[],
  team2: Player[],
  totalGames: number = 1000,
  baseSeed: number = (Math.random() * 0xffffffff) >>> 0,
): SimResult {
  let team1Wins = 0;
  let team2Wins = 0;
  let team1Total = 0;
  let team2Total = 0;
  const games: GameResult[] = [];
  const team1Stats = new Map<string, StatTotals>();
  const team2Stats = new Map<string, StatTotals>();

  for (let i = 0; i < totalGames; i++) {
    const seed = (baseSeed + i * SEED_STRIDE) >>> 0;
    const events = simulateGame(team1, team2, seed);
    const box = boxScore(events);
    accumulate(team1Stats, box.home);
    accumulate(team2Stats, box.away);

    const { home, away } = box.finalScore;
    games.push({ seed, team1Score: home, team2Score: away });
    team1Total += home;
    team2Total += away;
    if (home > away) team1Wins++;
    else team2Wins++;
  }

  return {
    team1Wins,
    team2Wins,
    team1AvgScore: Math.round((team1Total / totalGames) * 10) / 10,
    team2AvgScore: Math.round((team2Total / totalGames) * 10) / 10,
    totalGames,
    games,
    team1PlayerAvgs: toAverages(team1, team1Stats, totalGames),
    team2PlayerAvgs: toAverages(team2, team2Stats, totalGames),
  };
}
