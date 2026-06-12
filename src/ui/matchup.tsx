import { useEffect, useMemo, useState } from "react";
import type { ApiPlayer, PlayerSimAvg, SimResult } from "../types";
import { teamLabel, type Teams } from "./app";

type TeamNum = 1 | 2;

export interface Picks {
  p1: TeamNum;
  p2: TeamNum;
}

interface Ladder {
  p1: { right: number; wrong: number };
  p2: { right: number; wrong: number };
  lastSim?: number; // dedupes ladder updates across refreshes of the same run
}

const LADDER_KEY = "pickem-ladder";

function loadLadder(): Ladder {
  try {
    const l = JSON.parse(localStorage.getItem(LADDER_KEY) ?? "");
    if (l?.p1) return l;
  } catch {}
  return { p1: { right: 0, wrong: 0 }, p2: { right: 0, wrong: 0 } };
}

interface MatchupProps {
  teams: Teams;
  params: URLSearchParams;
  navigate: (to: string, replace?: boolean) => void;
  simCache: Map<string, SimResult>;
}

export function Matchup({ teams, params, navigate, simCache }: MatchupProps) {
  const t1 = params.get("t1")!;
  const t2 = params.get("t2")!;
  const simSeed = params.get("sim");
  const picks: Picks | null = simSeed
    ? {
        p1: params.get("p1") === "2" ? 2 : 1,
        p2: params.get("p2") === "2" ? 2 : 1,
      }
    : null;

  const [pending, setPending] = useState<{ p1: TeamNum | null; p2: TeamNum | null }>({ p1: null, p2: null });
  const [sim, setSim] = useState<SimResult | null>(simSeed ? (simCache.get(simSeed) ?? null) : null);
  const [ladder, setLadder] = useState<Ladder>(loadLadder);

  useEffect(() => {
    if (!simSeed) {
      setSim(null);
      return;
    }
    const cached = simCache.get(simSeed);
    if (cached) {
      setSim(cached);
      return;
    }
    let alive = true;
    fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        team1: t1.split(","),
        team2: t2.split(","),
        baseSeed: parseInt(simSeed, 10),
      }),
    })
      .then((r) => r.json())
      .then((result: SimResult) => {
        if (!alive) return;
        simCache.set(simSeed, result);
        setSim(result);

        const l = loadLadder();
        if (l.lastSim !== result.baseSeed && picks) {
          const winner: TeamNum = result.team1Wins > result.team2Wins ? 1 : 2;
          for (const who of ["p1", "p2"] as const) {
            l[who][picks[who] === winner ? "right" : "wrong"]++;
          }
          l.lastSim = result.baseSeed;
          localStorage.setItem(LADDER_KEY, JSON.stringify(l));
          setLadder(l);
        }
      });
    return () => {
      alive = false;
    };
  }, [simSeed]);

  const lockAndSimulate = () => {
    if (!pending.p1 || !pending.p2) return;
    const seed = (Math.random() * 0xffffffff) >>> 0;
    navigate(`/matchup?t1=${t1}&t2=${t2}&sim=${seed}&p1=${pending.p1}&p2=${pending.p2}`);
  };

  return (
    <>
      <div className="vs-grid">
        <TeamCard team={1} roster={teams.team1} label={teamLabel(teams, 1)} />
        <div className="vs">VS</div>
        <TeamCard team={2} roster={teams.team2} label={teamLabel(teams, 2)} />
      </div>

      {!simSeed && (
        <div className="panel">
          <div className="panel-title">Who wins? Lock your picks</div>
          {(["p1", "p2"] as const).map((who, i) => (
            <div key={who} className="picker-row">
              <span className="pick-who">Picker {i + 1}</span>
              <div className="segmented">
                {([1, 2] as TeamNum[]).map((team) => (
                  <button
                    key={team}
                    className={`seg t${team} ${pending[who] === team ? "selected" : ""}`}
                    onClick={() => setPending((p) => ({ ...p, [who]: team }))}
                  >
                    {teamLabel(teams, team)}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="btn-center">
            <button className="btn-primary" disabled={!pending.p1 || !pending.p2} onClick={lockAndSimulate}>
              Lock Picks & Simulate 1000 Games
            </button>
          </div>
        </div>
      )}

      {simSeed && !sim && <p className="hint">Simulating 1000 games…</p>}

      {sim && picks && (
        <Results
          sim={sim}
          picks={picks}
          ladder={ladder}
          teams={teams}
          onReplay={(seed) => navigate(`/replay?t1=${t1}&t2=${t2}&seed=${seed}`)}
        />
      )}

      <div className="btn-center">
        <button className="btn-small" onClick={() => navigate("/")}>← New Draft</button>
      </div>
    </>
  );
}

function TeamCard({ team, roster, label }: { team: TeamNum; roster: ApiPlayer[]; label: string }) {
  return (
    <div className={`team-card t${team}`}>
      <div className={`team-name t${team}`}>{label}</div>
      {roster.map((p) => (
        <div key={p.id} className="card-row">
          <span>{p.name}</span>
          <small>{p.ppg} ppg</small>
        </div>
      ))}
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
                Picker {i + 1} took {teamLabel(teams, picks[who])} — {right ? "✓ correct" : "✗ wrong"}
                <small>season record: {ladder[who].right}–{ladder[who].wrong}</small>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">
          Watch a game <small>(margin distribution, Team 1 minus Team 2 — click a bar to replay)</small>
        </div>
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
              label={teamLabel(teams, team)}
              avgs={team === 1 ? sim.team1PlayerAvgs : sim.team2PlayerAvgs}
              names={Object.fromEntries((team === 1 ? teams.team1 : teams.team2).map((p) => [p.id, p.name]))}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function AvgTable({ team, label, avgs, names }: {
  team: TeamNum;
  label: string;
  avgs: PlayerSimAvg[];
  names: Record<string, string>;
}) {
  return (
    <table className="player-table">
      <thead>
        <tr>
          <th className={`team-name t${team}`}>{label}</th>
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
