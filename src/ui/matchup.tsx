import { useMemo, useState } from "react";
import type { PlayerSimAvg, SimResult } from "../types";
import type { Teams } from "./app";

type TeamNum = 1 | 2;

export interface Picks {
  p1: TeamNum;
  p2: TeamNum;
}

interface Ladder {
  p1: { right: number; wrong: number };
  p2: { right: number; wrong: number };
}

const LADDER_KEY = "pickem-ladder";

function loadLadder(): Ladder {
  try {
    return JSON.parse(localStorage.getItem(LADDER_KEY) ?? "") as Ladder;
  } catch {
    return { p1: { right: 0, wrong: 0 }, p2: { right: 0, wrong: 0 } };
  }
}

interface MatchupProps {
  teams: Teams;
  sim: SimResult | null;
  setSim: (s: SimResult) => void;
  picks: Picks | null;
  setPicks: (p: Picks) => void;
  onReplay: (seed: number) => void;
  onNewDraft: () => void;
}

export function Matchup({ teams, sim, setSim, picks, setPicks, onReplay, onNewDraft }: MatchupProps) {
  const [pending, setPending] = useState<{ p1: TeamNum | null; p2: TeamNum | null }>({ p1: null, p2: null });
  const [loading, setLoading] = useState(false);
  const [ladder, setLadder] = useState<Ladder>(loadLadder);

  const simulate = async () => {
    if (!pending.p1 || !pending.p2) return;
    const locked: Picks = { p1: pending.p1, p2: pending.p2 };
    setPicks(locked);
    setLoading(true);
    const res = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        team1: teams.team1.map((p) => p.id),
        team2: teams.team2.map((p) => p.id),
      }),
    });
    const result: SimResult = await res.json();
    setLoading(false);
    setSim(result);

    const winner: TeamNum = result.team1Wins > result.team2Wins ? 1 : 2;
    const next: Ladder = {
      p1: { ...ladder.p1, [locked.p1 === winner ? "right" : "wrong"]: ladder.p1[locked.p1 === winner ? "right" : "wrong"] + 1 },
      p2: { ...ladder.p2, [locked.p2 === winner ? "right" : "wrong"]: ladder.p2[locked.p2 === winner ? "right" : "wrong"] + 1 },
    };
    setLadder(next);
    localStorage.setItem(LADDER_KEY, JSON.stringify(next));
  };

  return (
    <div className="container">
      <h1>Matchup</h1>
      <div className="roster-strip">
        {([1, 2] as TeamNum[]).map((team) => (
          <div key={team} className="roster-mini">
            <b className={`team-name t${team}`}>Team {team}</b>
            {(team === 1 ? teams.team1 : teams.team2).map((p) => (
              <span key={p.id}>{p.name}</span>
            ))}
          </div>
        ))}
      </div>

      {!sim && (
        <div className="panel">
          <div className="panel-title">Lock your picks</div>
          <div className="picks-grid">
            {(["p1", "p2"] as const).map((who, i) => (
              <div key={who} className="pick-block">
                <span className="pick-who">Player {i + 1} picks</span>
                {([1, 2] as TeamNum[]).map((team) => (
                  <button
                    key={team}
                    className={`btn-pick t${team} ${pending[who] === team ? "selected" : ""}`}
                    onClick={() => setPending((p) => ({ ...p, [who]: team }))}
                  >
                    Team {team}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="btn-center">
            <button className="btn-primary" disabled={!pending.p1 || !pending.p2 || loading} onClick={simulate}>
              {loading ? "Simulating 1000 games…" : "Lock Picks & Simulate"}
            </button>
          </div>
        </div>
      )}

      {sim && picks && <Results sim={sim} picks={picks} ladder={ladder} teams={teams} onReplay={onReplay} />}

      <div className="btn-center">
        <button className="btn-small" onClick={onNewDraft}>New Draft</button>
      </div>
    </div>
  );
}

function Results({ sim, picks, ladder, teams, onReplay }: {
  sim: SimResult;
  picks: Picks;
  ladder: Ladder;
  teams: Teams;
  onReplay: (seed: number) => void;
}) {
  const winner: TeamNum = sim.team1Wins > sim.team2Wins ? 1 : 2;
  const pct1 = Math.round((sim.team1Wins / sim.totalGames) * 100);

  const { bins, closest, blowout } = useMemo(() => {
    const margins = sim.games.map((g) => g.team1Score - g.team2Score);
    const BIN = 5;
    const lo = Math.floor(Math.min(...margins) / BIN) * BIN;
    const hi = Math.ceil(Math.max(...margins) / BIN) * BIN;
    const bins: { from: number; games: typeof sim.games }[] = [];
    for (let b = lo; b < hi; b += BIN) bins.push({ from: b, games: [] });
    sim.games.forEach((g, i) => {
      const idx = Math.min(Math.floor((margins[i] - lo) / BIN), bins.length - 1);
      bins[idx].games.push(g);
    });
    const byAbsMargin = [...sim.games].sort(
      (a, b) => Math.abs(a.team1Score - a.team2Score) - Math.abs(b.team1Score - b.team2Score),
    );
    return { bins, closest: byAbsMargin[0], blowout: byAbsMargin[byAbsMargin.length - 1] };
  }, [sim]);

  const maxBin = Math.max(...bins.map((b) => b.games.length));

  return (
    <>
      <div className="panel">
        <div className="result-headline">
          <span className="team-score t1">{sim.team1AvgScore}</span>
          <span className="result-record">
            {sim.team1Wins} – {sim.team2Wins}
            <small>avg score over {sim.totalGames} games</small>
          </span>
          <span className="team-score t2">{sim.team2AvgScore}</span>
        </div>
        <div className="win-bar">
          <div className="t1" style={{ width: `${pct1}%` }}>{pct1}%</div>
          <div className="t2" style={{ width: `${100 - pct1}%` }}>{100 - pct1}%</div>
        </div>

        <div className="pick-reveal">
          {(["p1", "p2"] as const).map((who, i) => {
            const right = picks[who] === winner;
            return (
              <div key={who} className={`pick-result ${right ? "right" : "wrong"}`}>
                Player {i + 1} picked Team {picks[who]} — {right ? "✓ correct" : "✗ wrong"}
                <small>season: {ladder[who].right}–{ladder[who].wrong}</small>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Margin distribution <small>(Team 1 minus Team 2 — click a bar to replay)</small></div>
        <div className="histogram">
          {bins.map((b) => (
            <button
              key={b.from}
              className={`hist-bar ${b.from >= 0 ? "t1" : "t2"}`}
              disabled={!b.games.length}
              title={`${b.from} to ${b.from + 5}: ${b.games.length} games`}
              onClick={() => b.games.length && onReplay(b.games[0].seed)}
            >
              <div style={{ height: `${(b.games.length / maxBin) * 100}%` }} />
              <span>{b.from}</span>
            </button>
          ))}
        </div>
        <div className="replay-links">
          <button className="btn-small" onClick={() => onReplay(closest.seed)}>
            ▶ Closest game ({closest.team1Score}–{closest.team2Score})
          </button>
          <button className="btn-small" onClick={() => onReplay(blowout.seed)}>
            ▶ Biggest blowout ({blowout.team1Score}–{blowout.team2Score})
          </button>
          <button
            className="btn-small"
            onClick={() => onReplay(sim.games[Math.floor(Math.random() * sim.games.length)].seed)}
          >
            ▶ Random game
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Projected player averages</div>
        <div className="avgs-grid">
          {([1, 2] as TeamNum[]).map((team) => (
            <AvgTable
              key={team}
              team={team}
              avgs={team === 1 ? sim.team1PlayerAvgs : sim.team2PlayerAvgs}
              names={Object.fromEntries((team === 1 ? teams.team1 : teams.team2).map((p) => [p.id, p.name]))}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function AvgTable({ team, avgs, names }: { team: TeamNum; avgs: PlayerSimAvg[]; names: Record<string, string> }) {
  return (
    <table className="player-table">
      <thead>
        <tr>
          <th className={`team-name t${team}`}>Team {team}</th>
          <th className="num">PTS</th>
          <th className="num">REB</th>
          <th className="num">AST</th>
          <th className="num">STL</th>
          <th className="num">BLK</th>
          <th className="num">FG</th>
        </tr>
      </thead>
      <tbody>
        {avgs.map((a) => (
          <tr key={a.playerId}>
            <td>{names[a.playerId] ?? a.playerId}</td>
            <td className="num">{a.pts}</td>
            <td className="num">{a.reb}</td>
            <td className="num">{a.ast}</td>
            <td className="num">{a.stl}</td>
            <td className="num">{a.blk}</td>
            <td className="num">{a.fgm}/{a.fga}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
