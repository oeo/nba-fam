import type { GameEvent, Score, TeamSide } from "./events";

export interface PlayerLine {
  playerId: string;
  pts: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  orb: number;
  drb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
}

export interface BoxScore {
  home: PlayerLine[];
  away: PlayerLine[];
  finalScore: Score;
}

const opp = (s: TeamSide): TeamSide => (s === "home" ? "away" : "home");

export function boxScore(events: GameEvent[]): BoxScore {
  const sides: Record<TeamSide, Map<string, PlayerLine>> = { home: new Map(), away: new Map() };

  const line = (side: TeamSide, playerId: string): PlayerLine => {
    let l = sides[side].get(playerId);
    if (!l) {
      l = { playerId, pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0 };
      sides[side].set(playerId, l);
    }
    return l;
  };

  for (const e of events) {
    switch (e.type) {
      case "shot": {
        const l = line(e.team, e.playerId);
        l.fga++;
        if (e.value === 3) l.fg3a++;
        if (e.made) {
          l.fgm++;
          l.pts += e.value;
          if (e.value === 3) l.fg3m++;
        }
        if (e.assistPlayerId) line(e.team, e.assistPlayerId).ast++;
        if (e.blockPlayerId) line(opp(e.team), e.blockPlayerId).blk++;
        break;
      }
      case "free_throw": {
        const l = line(e.team, e.playerId);
        l.fta++;
        if (e.made) {
          l.ftm++;
          l.pts++;
        }
        break;
      }
      case "rebound": {
        const l = line(e.team, e.playerId);
        if (e.offensive) l.orb++;
        else l.drb++;
        break;
      }
      case "turnover": {
        line(e.team, e.playerId).tov++;
        if (e.stealPlayerId) line(opp(e.team), e.stealPlayerId).stl++;
        break;
      }
      case "foul":
        line(e.team, e.playerId).pf++;
        break;
    }
  }

  const finalScore = events[events.length - 1]?.score ?? { home: 0, away: 0 };
  return { home: [...sides.home.values()], away: [...sides.away.values()], finalScore };
}
