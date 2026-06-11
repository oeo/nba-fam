import { useEffect, useMemo, useRef, useState } from "react";
import type { GameEvent } from "../engine/events";
import { boxScore, type PlayerLine } from "../engine/boxscore";
import { absTime, clockLabel, duration, visibleCount } from "./playback";
import type { Teams } from "./app";

interface GameResponse {
  seed: number;
  players: Record<string, string>;
  events: GameEvent[];
}

const SPEEDS = [1, 4, 16, 64];

function describe(e: GameEvent, names: Record<string, string>): string | null {
  const n = (id: string) => names[id] ?? id;
  switch (e.type) {
    case "jump_ball":
      return `Jump ball won`;
    case "shot": {
      const shot = e.value === 3 ? "3PT" : e.zone === "rim" ? "layup" : "2PT jumper";
      if (!e.made) {
        return `${n(e.playerId)} misses ${shot}${e.blockPlayerId ? ` — blocked by ${n(e.blockPlayerId)}` : ""}`;
      }
      return `${n(e.playerId)} makes ${shot}${e.assistPlayerId ? ` (${n(e.assistPlayerId)} assists)` : ""}`;
    }
    case "rebound":
      return `${n(e.playerId)} ${e.offensive ? "offensive" : "defensive"} rebound`;
    case "turnover":
      return `${n(e.playerId)} turnover${e.stealPlayerId ? ` — stolen by ${n(e.stealPlayerId)}` : ""}`;
    case "foul":
      return `${n(e.playerId)} shooting foul`;
    case "free_throw":
      return `${n(e.playerId)} ${e.made ? "makes" : "misses"} free throw ${e.n} of ${e.of}`;
    case "period_start":
      return null;
    case "period_end":
      return e.period <= 4 ? `End of Q${e.period}` : `End of overtime`;
    case "game_end":
      return "Final";
    default:
      return null;
  }
}

export function Replay({ teams, seed, onBack }: { teams: Teams; seed: number; onBack: () => void }) {
  const [game, setGame] = useState<GameResponse | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(16);
  const frame = useRef<number>(0);
  const lastTick = useRef<number>(0);

  useEffect(() => {
    const team1 = teams.team1.map((p) => p.id).join(",");
    const team2 = teams.team2.map((p) => p.id).join(",");
    fetch(`/api/game?team1=${team1}&team2=${team2}&seed=${seed}`)
      .then((r) => r.json())
      .then((g: GameResponse) => {
        setGame(g);
        setT(0);
        setPlaying(true);
      });
  }, [seed]);

  const total = game ? duration(game.events) : 0;

  useEffect(() => {
    if (!playing || !game) return;
    lastTick.current = performance.now();
    const tick = (now: number) => {
      const dt = ((now - lastTick.current) / 1000) * speed;
      lastTick.current = now;
      setT((prev) => {
        const next = prev + dt;
        if (next >= total) {
          setPlaying(false);
          return total;
        }
        return next;
      });
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [playing, speed, game, total]);

  const idx = game ? visibleCount(game.events, t) : 0;
  const visible = game ? game.events.slice(0, idx) : [];
  const last = visible[visible.length - 1];
  const score = last?.score ?? { home: 0, away: 0 };
  const box = useMemo(() => boxScore(visible), [idx, game]);

  const feed = useMemo(
    () =>
      visible
        .slice(-30)
        .map((e) => ({ e, text: game ? describe(e, game.players) : null }))
        .filter((x): x is { e: GameEvent; text: string } => x.text !== null)
        .slice(-12)
        .reverse(),
    [idx, game],
  );

  if (!game) {
    return (
      <div className="container">
        <p className="hint">Loading game #{seed}…</p>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="scoreboard">
        <span className="team-score t1">{score.home}</span>
        <span className="game-clock">{t >= total ? "FINAL" : clockLabel(t)}</span>
        <span className="team-score t2">{score.away}</span>
      </div>

      <div className="controls">
        <button className="btn-small" onClick={() => setPlaying(!playing)}>
          {playing ? "⏸ Pause" : t >= total ? "↺ Restart" : "▶ Play"}
        </button>
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={`btn-small ${speed === s ? "selected" : ""}`}
            onClick={() => setSpeed(s)}
          >
            {s}×
          </button>
        ))}
        <button className="btn-small" onClick={() => { setT(total); setPlaying(false); }}>
          ⏭ End
        </button>
        <input
          type="range"
          min={0}
          max={Math.ceil(total)}
          step={1}
          value={Math.min(t, total)}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (playing && v >= total) setPlaying(false);
            setT(v);
          }}
        />
      </div>

      <div className="replay-grid">
        <div className="panel feed">
          {feed.length === 0 && <p className="hint">Tip-off…</p>}
          {feed.map(({ e, text }) => (
            <div key={e.seq} className={`feed-row ${e.team ?? ""}`}>
              <span className="feed-clock">{clockLabel(absTime(e))}</span>
              <span>{text}</span>
              <span className="feed-score">{e.score.home}–{e.score.away}</span>
            </div>
          ))}
        </div>

        <div className="panel">
          {(["home", "away"] as const).map((side, i) => (
            <LiveBox
              key={side}
              team={(i + 1) as 1 | 2}
              lines={box[side]}
              names={game.players}
              roster={i === 0 ? teams.team1 : teams.team2}
            />
          ))}
        </div>
      </div>

      <div className="btn-center">
        <button className="btn-small" onClick={onBack}>← Back to results</button>
      </div>
    </div>
  );
}

function LiveBox({ team, lines, names, roster }: {
  team: 1 | 2;
  lines: PlayerLine[];
  names: Record<string, string>;
  roster: { id: string }[];
}) {
  const byId = new Map(lines.map((l) => [l.playerId, l]));
  return (
    <table className="player-table live-box">
      <thead>
        <tr>
          <th className={`team-name t${team}`}>Team {team}</th>
          <th className="num">PTS</th>
          <th className="num">REB</th>
          <th className="num">AST</th>
          <th className="num">FG</th>
          <th className="num">FT</th>
        </tr>
      </thead>
      <tbody>
        {roster.map((p) => {
          const l = byId.get(p.id);
          return (
            <tr key={p.id}>
              <td>{names[p.id] ?? p.id}</td>
              <td className="num">{l?.pts ?? 0}</td>
              <td className="num">{(l?.orb ?? 0) + (l?.drb ?? 0)}</td>
              <td className="num">{l?.ast ?? 0}</td>
              <td className="num">{l?.fgm ?? 0}/{l?.fga ?? 0}</td>
              <td className="num">{l?.ftm ?? 0}/{l?.fta ?? 0}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
