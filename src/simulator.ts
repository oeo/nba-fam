import type { Player, GameResult, SimResult } from "./types";
import { simulateGame } from "./engine/game";

// Golden-ratio stride decorrelates sequential per-game seeds.
const SEED_STRIDE = 0x9e3779b9;

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

  for (let i = 0; i < totalGames; i++) {
    const seed = (baseSeed + i * SEED_STRIDE) >>> 0;
    const events = simulateGame(team1, team2, seed);
    const { home, away } = events[events.length - 1].score;
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
  };
}
