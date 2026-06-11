export interface Player {
  id: string;
  name: string;
  year: number;
  position: Position;
  gp: number;
  mpg: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  orb: number;
  drb: number;
  ast: number;
  tov: number;
  stl: number;
  blk: number;
  pts: number;
}

export type Position = "PG" | "SG" | "SF" | "PF" | "C";

export interface Team {
  year: number;
  players: Player[];
}

export interface GameResult {
  seed: number;
  team1Score: number;
  team2Score: number;
}

export interface PlayerSimAvg {
  playerId: string;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
}

export interface SimResult {
  team1Wins: number;
  team2Wins: number;
  team1AvgScore: number;
  team2AvgScore: number;
  totalGames: number;
  games: GameResult[];
  team1PlayerAvgs: PlayerSimAvg[];
  team2PlayerAvgs: PlayerSimAvg[];
}

export interface SimRequest {
  team1: string[];
  team2: string[];
}

export interface ApiPlayer {
  id: string;
  name: string;
  year: number;
  position: Position;
  ppg: number;
  rpg: number;
  apg: number;
  fgPct: number;
  threePct: number;
  ftPct: number;
}

export const POSITIONS: Position[] = ["PG", "SG", "SF", "PF", "C"];