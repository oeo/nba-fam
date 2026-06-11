import type { GameEvent } from "../engine/events";
import { PERIODS, PERIOD_SECONDS, OT_SECONDS } from "../engine/constants";

export function periodLength(period: number): number {
  return period <= PERIODS ? PERIOD_SECONDS : OT_SECONDS;
}

export function periodOffset(period: number): number {
  const regulation = Math.min(period - 1, PERIODS) * PERIOD_SECONDS;
  const overtime = Math.max(period - 1 - PERIODS, 0) * OT_SECONDS;
  return regulation + overtime;
}

// Absolute game-seconds elapsed from tipoff to this event.
export function absTime(e: GameEvent): number {
  return periodOffset(e.period) + (periodLength(e.period) - e.clock);
}

export function duration(events: GameEvent[]): number {
  return events.length ? absTime(events[events.length - 1]) : 0;
}

// Number of events that have occurred at elapsed time t (events are time-ordered).
export function visibleCount(events: GameEvent[], t: number): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (absTime(events[mid]) <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function clockLabel(t: number): string {
  let period = 1;
  let rest = t;
  while (rest > periodLength(period)) {
    rest -= periodLength(period);
    period++;
  }
  const remaining = Math.max(periodLength(period) - rest, 0);
  const m = Math.floor(remaining / 60);
  const s = Math.floor(remaining % 60);
  const label = period <= PERIODS ? `Q${period}` : period === PERIODS + 1 ? "OT" : `${period - PERIODS}OT`;
  return `${label} ${m}:${String(s).padStart(2, "0")}`;
}
