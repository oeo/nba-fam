import { test, expect, describe } from "bun:test";
import players from "../src/data/players.json" with { type: "json" };
import type { Player } from "../src/types";
import { POSITIONS } from "../src/types";
import { simulateGame } from "../src/engine/game";
import { boxScore } from "../src/engine/boxscore";
import { runSimulations } from "../src/simulator";
import { PERIOD_SECONDS, OT_SECONDS, PERIODS } from "../src/engine/constants";

const all = players as Player[];
const latestYear = Math.max(...all.map((p) => p.year));
const pool = all.filter((p) => p.year === latestYear);

function draft(rank: number): Player[] {
  return POSITIONS.map(
    (pos) => pool.filter((p) => p.position === pos).sort((a, b) => b.mpg - a.mpg)[rank],
  );
}

const team1 = draft(0);
const team2 = draft(1);

describe("engine", () => {
  const events = simulateGame(team1, team2, 42);
  const box = boxScore(events);

  test("same seed reproduces the identical timeline", () => {
    expect(simulateGame(team1, team2, 42)).toEqual(events);
    expect(simulateGame(team1, team2, 43)).not.toEqual(events);
  });

  test("timeline structure is well-formed", () => {
    expect(events[0].type).toBe("period_start");
    expect(events[events.length - 1].type).toBe("game_end");
    events.forEach((e, i) => expect(e.seq).toBe(i));

    for (let i = 1; i < events.length; i++) {
      const e = events[i];
      const prev = events[i - 1];
      if (e.period === prev.period) {
        expect(e.clock).toBeLessThanOrEqual(prev.clock);
      }
      const limit = e.period <= PERIODS ? PERIOD_SECONDS : OT_SECONDS;
      expect(e.clock).toBeGreaterThanOrEqual(0);
      expect(e.clock).toBeLessThanOrEqual(limit);
    }
  });

  test("embedded running score matches the derived box score", () => {
    const pts = (lines: { pts: number }[]) => lines.reduce((s, l) => s + l.pts, 0);
    const final = events[events.length - 1].score;
    expect(pts(box.home)).toBe(final.home);
    expect(pts(box.away)).toBe(final.away);
    expect(box.finalScore).toEqual(final);
  });

  test("box score lines are internally consistent", () => {
    for (const l of [...box.home, ...box.away]) {
      expect(l.fgm).toBeLessThanOrEqual(l.fga);
      expect(l.fg3m).toBeLessThanOrEqual(l.fg3a);
      expect(l.fg3a).toBeLessThanOrEqual(l.fga);
      expect(l.ftm).toBeLessThanOrEqual(l.fta);
      expect(l.pts).toBe((l.fgm - l.fg3m) * 2 + l.fg3m * 3 + l.ftm);
    }
  });

  test("every rebound immediately follows a missed shot or free throw", () => {
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e.type !== "rebound") continue;
      const prev = events[i - 1];
      const missedShot = prev.type === "shot" && !prev.made;
      const missedFt = prev.type === "free_throw" && !prev.made;
      expect(missedShot || missedFt).toBe(true);
    }
  });

  test("games never end tied (overtime resolves)", () => {
    for (let seed = 0; seed < 50; seed++) {
      const evs = simulateGame(team1, team2, seed);
      const s = evs[evs.length - 1].score;
      expect(s.home).not.toBe(s.away);
    }
  });

  test("calibration: realistic NBA scoring over 200 games", () => {
    const sim = runSimulations(team1, team2, 200, 12345);
    expect(sim.team1Wins + sim.team2Wins).toBe(200);
    for (const avg of [sim.team1AvgScore, sim.team2AvgScore]) {
      expect(avg).toBeGreaterThan(85);
      expect(avg).toBeLessThan(135);
    }
    // Monte Carlo runs are reproducible from the base seed.
    expect(runSimulations(team1, team2, 1, 12345).games[0]).toEqual(sim.games[0]);
  });
});
