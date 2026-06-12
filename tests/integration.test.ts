import { test, expect, describe, beforeAll, afterAll } from "bun:test";

const BASE = "http://localhost:3099";
let serverProcess: ReturnType<typeof Bun.spawn>;

beforeAll(async () => {
  serverProcess = Bun.spawn(["bun", "run", "src/index.ts"], {
    env: { ...process.env, NODE_ENV: "production" },
    stdin: "pipe",
  });

  for (let i = 0; i < 30; i++) {
    try {
      await fetch(`${BASE}/api/years`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error("Server failed to start");
});

afterAll(() => {
  serverProcess.kill();
});

async function draftTeams(): Promise<{ team1Ids: string[]; team2Ids: string[] } | null> {
  const years = await (await fetch(`${BASE}/api/years`)).json();
  const allPlayers = await (await fetch(`${BASE}/api/players?year=${years[0]}`)).json();

  const positions = ["PG", "SG", "SF", "PF", "C"];
  const team1Ids = positions
    .map((pos) => allPlayers.find((p: any) => p.position === pos))
    .filter(Boolean)
    .map((p: any) => p.id);
  const team2Ids = positions
    .map((pos) => allPlayers.find((p: any) => p.position === pos && !team1Ids.includes(p.id)))
    .filter(Boolean)
    .map((p: any) => p.id);

  if (team1Ids.length < 5 || team2Ids.length < 5) return null;
  return { team1Ids, team2Ids };
}

describe("API", () => {
  test("GET /api/years returns sorted years", async () => {
    const res = await fetch(`${BASE}/api/years`);
    expect(res.status).toBe(200);
    const years = await res.json();
    expect(Array.isArray(years)).toBe(true);
    expect(years.length).toBeGreaterThan(0);
    for (let i = 1; i < years.length; i++) {
      expect(years[i]).toBeLessThan(years[i - 1]);
    }
  });

  test("GET /api/players returns players for the latest year", async () => {
    const yearsRes = await fetch(`${BASE}/api/years`);
    const years = await yearsRes.json();
    const latestYear = years[0];

    const res = await fetch(`${BASE}/api/players?year=${latestYear}`);
    expect(res.status).toBe(200);
    const players = await res.json();
    expect(players.length).toBeGreaterThan(0);
    expect(players[0]).toHaveProperty("id");
    expect(players[0]).toHaveProperty("name");
    expect(players[0]).toHaveProperty("position");
    expect(players[0]).toHaveProperty("ppg");
  });

  test("GET /api/players filters by year and position", async () => {
    const yearsRes = await fetch(`${BASE}/api/years`);
    const years = await yearsRes.json();
    const latestYear = years[0];

    const res = await fetch(`${BASE}/api/players?year=${latestYear}&position=PG`);
    const players = await res.json();
    expect(players.length).toBeGreaterThan(0);
    players.forEach((p: any) => expect(p.position).toBe("PG"));
  });

  test("POST /api/simulate returns simulation results", async () => {
    const teams = await draftTeams();
    if (!teams) return;

    const res = await fetch(`${BASE}/api/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team1: teams.team1Ids, team2: teams.team2Ids }),
    });

    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result.totalGames).toBe(1000);
    expect(result.team1Wins + result.team2Wins).toBe(1000);
    expect(result.team1AvgScore).toBeGreaterThan(0);
    expect(result.team2AvgScore).toBeGreaterThan(0);
    expect(Array.isArray(result.games)).toBe(true);
    expect(result.games.length).toBe(1000);
    expect(result.games[0]).toHaveProperty("seed");
    expect(result.games[0]).toHaveProperty("team1Score");
    expect(result.games[0]).toHaveProperty("team2Score");
    expect(result.team1PlayerAvgs.length).toBe(5);
    expect(result.team2PlayerAvgs.length).toBe(5);
    expect(result.team1PlayerAvgs[0].pts).toBeGreaterThanOrEqual(0);
  });

  test("GET /api/game replays one game deterministically", async () => {
    const teams = await draftTeams();
    if (!teams) return;

    const url = `${BASE}/api/game?team1=${teams.team1Ids.join(",")}&team2=${teams.team2Ids.join(",")}&seed=7`;
    const res = await fetch(url);
    expect(res.status).toBe(200);
    const game = await res.json();
    expect(game.seed).toBe(7);
    expect(game.events[0].type).toBe("period_start");
    expect(game.events[game.events.length - 1].type).toBe("game_end");
    expect(game.box.finalScore.home).toBeGreaterThan(0);
    expect(game.box.finalScore.away).toBeGreaterThan(0);

    const replay = await (await fetch(url)).json();
    expect(replay).toEqual(game);
  });

  test("GET /api/players resolves ids in order", async () => {
    const teams = await draftTeams();
    if (!teams) return;

    const res = await fetch(`${BASE}/api/players?ids=${teams.team1Ids.join(",")}`);
    expect(res.status).toBe(200);
    const players = await res.json();
    expect(players.map((p: any) => p.id)).toEqual(teams.team1Ids);
  });

  test("POST /api/simulate is deterministic given baseSeed", async () => {
    const teams = await draftTeams();
    if (!teams) return;

    const run = async () =>
      (await fetch(`${BASE}/api/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team1: teams.team1Ids, team2: teams.team2Ids, baseSeed: 42 }),
      })).json();

    const a = await run();
    const b = await run();
    expect(a.baseSeed).toBe(42);
    expect(a.team1Wins).toBe(b.team1Wins);
    expect(a.games[0]).toEqual(b.games[0]);
  });

  test("GET /api/game rejects bad params", async () => {
    const res = await fetch(`${BASE}/api/game?team1=a&team2=b&seed=x`);
    expect(res.status).toBe(400);
  });

  test("POST /api/simulate rejects invalid teams", async () => {
    const res = await fetch(`${BASE}/api/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team1: ["a"], team2: ["b"] }),
    });
    expect(res.status).toBe(400);
  });

  test("GET /api/tracks lists music and serves it", async () => {
    const res = await fetch(`${BASE}/api/tracks`);
    expect(res.status).toBe(200);
    const tracks = await res.json();
    expect(Array.isArray(tracks)).toBe(true);
    if (!tracks.length) return; // music/ is git-ignored; empty checkout is valid

    expect(tracks[0]).toHaveProperty("title");
    const audio = await fetch(`${BASE}${tracks[0].url}`);
    expect(audio.status).toBe(200);
    expect(audio.headers.get("content-type")).toContain("audio");
  });

  test("GET / serves HTML", async () => {
    const res = await fetch(BASE);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<html");
  });
});
