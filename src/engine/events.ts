export type TeamSide = "home" | "away";
export type ShotZone = "rim" | "mid" | "three";

export interface Score {
  home: number;
  away: number;
}

export type EventPayload =
  | { type: "period_start"; team: null }
  | { type: "period_end"; team: null }
  | { type: "game_end"; team: null }
  | { type: "jump_ball"; team: TeamSide }
  | {
      type: "shot";
      team: TeamSide;
      playerId: string;
      value: 2 | 3;
      made: boolean;
      zone: ShotZone;
      assistPlayerId?: string;
      blockPlayerId?: string;
    }
  | { type: "rebound"; team: TeamSide; playerId: string; offensive: boolean }
  | { type: "turnover"; team: TeamSide; playerId: string; stealPlayerId?: string }
  | { type: "foul"; team: TeamSide; playerId: string; shooting: boolean }
  | { type: "free_throw"; team: TeamSide; playerId: string; made: boolean; n: number; of: number }
  // Reserved for future rotation/fatigue/injury work; not emitted by the current engine.
  | { type: "substitution"; team: TeamSide; playerInId: string; playerOutId: string }
  | { type: "injury"; team: TeamSide; playerId: string };

export interface EventBase {
  seq: number;
  period: number; // 1-4, 5+ = overtime
  clock: number; // seconds remaining in the period
  score: Score; // running score after this event
}

export type GameEvent = EventBase & EventPayload;
