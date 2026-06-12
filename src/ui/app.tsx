import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ApiPlayer, SimResult } from "../types";
import { useRoute } from "./router";
import { Draft } from "./draft";
import { Matchup } from "./matchup";
import { Replay } from "./replay";

export interface Teams {
  team1: ApiPlayer[];
  team2: ApiPlayer[];
}

export function teamLabel(teams: Teams, team: 1 | 2): string {
  const roster = team === 1 ? teams.team1 : teams.team2;
  return `Team ${team} · ${roster[0]?.year ?? ""}`;
}

const STEPS = ["Build", "Pick", "Results", "Replay"];

function Steps({ stage }: { stage: number }) {
  return (
    <nav className="steps">
      {STEPS.map((label, i) => (
        <span key={label} className={i + 1 === stage ? "on" : i + 1 < stage ? "done" : ""}>
          {label}
        </span>
      ))}
    </nav>
  );
}

function App() {
  const { path, params, navigate } = useRoute();
  const teamsCache = useRef(new Map<string, Teams>());
  const simCache = useRef(new Map<string, SimResult>());
  const [, bump] = useState(0);

  const t1 = params.get("t1");
  const t2 = params.get("t2");
  const key = t1 && t2 ? `${t1}|${t2}` : null;
  const teams = key ? (teamsCache.current.get(key) ?? null) : null;

  useEffect(() => {
    if (!key || teamsCache.current.has(key)) return;
    fetch(`/api/players?ids=${t1},${t2}`)
      .then((r) => r.json())
      .then((players: ApiPlayer[]) => {
        const byId = new Map(players.map((p) => [p.id, p]));
        const pick = (ids: string) =>
          ids.split(",").map((id) => byId.get(id)).filter(Boolean) as ApiPlayer[];
        teamsCache.current.set(key, { team1: pick(t1!), team2: pick(t2!) });
        bump((n) => n + 1);
      });
  }, [key]);

  const validTeams = teams && teams.team1.length === 5 && teams.team2.length === 5;
  const stage = path === "/replay" ? 4 : path === "/matchup" ? (params.get("sim") ? 3 : 2) : 1;

  let view;
  if (path === "/matchup" && key) {
    view = validTeams ? (
      <Matchup teams={teams} params={params} navigate={navigate} simCache={simCache.current} />
    ) : (
      <p className="hint">{teams ? "Invalid matchup URL" : "Loading teams…"}</p>
    );
  } else if (path === "/replay" && key && params.get("seed")) {
    view = validTeams ? (
      <Replay teams={teams} seed={parseInt(params.get("seed")!, 10)} />
    ) : (
      <p className="hint">{teams ? "Invalid replay URL" : "Loading teams…"}</p>
    );
  } else {
    view = (
      <Draft
        onStart={(t) => {
          const ids1 = t.team1.map((p) => p.id).join(",");
          const ids2 = t.team2.map((p) => p.id).join(",");
          teamsCache.current.set(`${ids1}|${ids2}`, t);
          navigate(`/matchup?t1=${ids1}&t2=${ids2}`);
        }}
      />
    );
  }

  return (
    <div className="container">
      <header className="app-header">
        <h1 onClick={() => navigate("/")}>Pickem Basketball</h1>
        <Steps stage={stage} />
      </header>
      {view}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
