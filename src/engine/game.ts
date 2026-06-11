import type { Player } from "../types";
import { mulberry32 } from "./rng";
import type { EventPayload, GameEvent, Score, TeamSide } from "./events";
import { makeLineup, runPossession } from "./possession";
import { PERIODS, PERIOD_SECONDS, OT_SECONDS } from "./constants";

function pointsOf(p: EventPayload): number {
  if (p.type === "shot" && p.made) return p.value;
  if (p.type === "free_throw" && p.made) return 1;
  return 0;
}

export function simulateGame(homeRoster: Player[], awayRoster: Player[], seed: number): GameEvent[] {
  const rng = mulberry32(seed);
  const home = makeLineup("home", homeRoster);
  const away = makeLineup("away", awayRoster);
  const score: Score = { home: 0, away: 0 };
  const events: GameEvent[] = [];
  let seq = 0;
  let period = 0;
  let clock = 0;

  const emit = (payload: EventPayload) => {
    if (payload.team) score[payload.team] += pointsOf(payload);
    events.push({ seq: seq++, period, clock, score: { ...score }, ...payload } as GameEvent);
  };

  const tipWinner: TeamSide = rng() < 0.5 ? "home" : "away";
  const tipLoser: TeamSide = tipWinner === "home" ? "away" : "home";

  while (true) {
    period++;
    clock = period <= PERIODS ? PERIOD_SECONDS : OT_SECONDS;
    emit({ type: "period_start", team: null });

    let offense: TeamSide;
    if (period === 1 || period > PERIODS) {
      offense = period === 1 ? tipWinner : rng() < 0.5 ? "home" : "away";
      emit({ type: "jump_ball", team: offense });
    } else {
      // NBA rule: loser of the opening tip starts Q2 and Q3, winner starts Q4.
      offense = period === PERIODS ? tipWinner : tipLoser;
    }

    while (clock > 0) {
      const off = offense === "home" ? home : away;
      const def = offense === "home" ? away : home;
      for (const t of runPossession(off, def, clock, rng)) {
        clock = Math.max(0, clock - t.dt);
        emit(t.payload);
      }
      offense = offense === "home" ? "away" : "home";
    }
    emit({ type: "period_end", team: null });
    if (period >= PERIODS && score.home !== score.away) break;
  }

  emit({ type: "game_end", team: null });
  return events;
}
