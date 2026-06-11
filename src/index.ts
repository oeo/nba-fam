import type { Player, ApiPlayer, SimRequest } from "./types";
import { runSimulations } from "./simulator";
import { simulateGame } from "./engine/game";
import { boxScore } from "./engine/boxscore";
import players from "./data/players.json" with { type: "json" };

const allPlayers = players as Player[];

function resolveTeam(ids: string[] | null | undefined): Player[] | null {
  if (!ids || ids.length !== 5) return null;
  const team = ids.map((id) => allPlayers.find((p) => p.id === id)).filter(Boolean) as Player[];
  return team.length === 5 ? team : null;
}

function toApiPlayer(p: Player): ApiPlayer {
  return {
    id: p.id,
    name: p.name,
    year: p.year,
    position: p.position,
    ppg: p.pts,
    rpg: p.orb + p.drb,
    apg: p.ast,
    fgPct: Math.round((p.fgm / Math.max(p.fga, 1)) * 1000) / 10,
    threePct: Math.round((p.fg3m / Math.max(p.fg3a, 1)) * 1000) / 10,
    ftPct: Math.round((p.ftm / Math.max(p.fta, 1)) * 1000) / 10,
  };
}

Bun.serve({
  port: 3099,
  routes: {
    "/api/years": {
      GET: () => {
        const years = [...new Set(allPlayers.map((p) => p.year))].sort(
          (a, b) => b - a,
        );
        return Response.json(years);
      },
    },
    "/api/players": {
      GET: (req) => {
        const url = new URL(req.url);
        const year = parseInt(url.searchParams.get("year") ?? "", 10);
        const position = url.searchParams.get("position");

        let filtered = allPlayers.filter((p) => p.year === year);
        if (position) {
          filtered = filtered.filter((p) => p.position === position);
        }

        return Response.json(filtered.map(toApiPlayer));
      },
    },
    "/api/simulate": {
      POST: async (req) => {
        const body = (await req.json()) as SimRequest;
        const team1 = resolveTeam(body.team1);
        const team2 = resolveTeam(body.team2);
        if (!team1 || !team2) {
          return new Response("Invalid teams", { status: 400 });
        }

        const result = runSimulations(team1, team2);
        return Response.json(result);
      },
    },
    "/api/game": {
      GET: (req) => {
        const url = new URL(req.url);
        const seed = parseInt(url.searchParams.get("seed") ?? "", 10);
        const team1 = resolveTeam(url.searchParams.get("team1")?.split(","));
        const team2 = resolveTeam(url.searchParams.get("team2")?.split(","));
        if (!Number.isInteger(seed) || !team1 || !team2) {
          return new Response("Invalid game params", { status: 400 });
        }

        // team1 = home, team2 = away; same seed always reproduces the same timeline.
        const events = simulateGame(team1, team2, seed);
        const names = Object.fromEntries([...team1, ...team2].map((p) => [p.id, p.name]));
        return Response.json({ seed, players: names, box: boxScore(events), events });
      },
    },
    "/": {
      GET: () => new Response(Bun.file("index.html")),
    },
  },

  development: process.env.NODE_ENV !== "production",
});
