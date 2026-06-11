import { useEffect, useMemo, useState } from "react";
import type { ApiPlayer, Position } from "../types";
import { POSITIONS } from "../types";
import type { Teams } from "./app";

type TeamNum = 1 | 2;
type Roster = Partial<Record<Position, ApiPlayer>>;

interface SavedRoster {
  name: string;
  year: number;
  ids: Record<Position, string>;
}

const SAVED_KEY = "pickem-rosters";

function loadSaved(): SavedRoster[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]");
  } catch {
    return [];
  }
}

const STAT_COLS = [
  { key: "ppg", label: "PPG" },
  { key: "rpg", label: "RPG" },
  { key: "apg", label: "APG" },
  { key: "fgPct", label: "FG%" },
  { key: "threePct", label: "3P%" },
  { key: "ftPct", label: "FT%" },
] as const;

type SortKey = (typeof STAT_COLS)[number]["key"] | "name";

export function Draft({ onStart }: { onStart: (teams: Teams) => void }) {
  const [years, setYears] = useState<number[]>([]);
  const [teamYears, setTeamYears] = useState<Record<TeamNum, number | null>>({ 1: null, 2: null });
  const [pools, setPools] = useState<Record<number, ApiPlayer[]>>({});
  const [rosters, setRosters] = useState<Record<TeamNum, Roster>>({ 1: {}, 2: {} });
  const [active, setActive] = useState<{ team: TeamNum; pos: Position }>({ team: 1, pos: "PG" });
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "ppg", dir: -1 });
  const [saved, setSaved] = useState<SavedRoster[]>(loadSaved);

  useEffect(() => {
    fetch("/api/years")
      .then((r) => r.json())
      .then((ys: number[]) => {
        setYears(ys);
        setTeamYears({ 1: ys[0], 2: ys[0] });
      });
  }, []);

  const ensurePool = (year: number) => {
    if (pools[year]) return;
    fetch(`/api/players?year=${year}`)
      .then((r) => r.json())
      .then((players: ApiPlayer[]) => setPools((p) => ({ ...p, [year]: players })));
  };

  useEffect(() => {
    if (teamYears[1]) ensurePool(teamYears[1]);
    if (teamYears[2]) ensurePool(teamYears[2]);
  }, [teamYears]);

  const usedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const team of [1, 2] as TeamNum[]) {
      for (const p of Object.values(rosters[team])) ids.add(p.id);
    }
    return ids;
  }, [rosters]);

  const activeYear = teamYears[active.team];
  const candidates = useMemo(() => {
    const pool = activeYear ? (pools[activeYear] ?? []) : [];
    const q = query.trim().toLowerCase();
    return pool
      .filter((p) => p.position === active.pos && !usedIds.has(p.id))
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const va = a[sort.key];
        const vb = b[sort.key];
        const cmp = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
        return cmp * sort.dir;
      });
  }, [pools, activeYear, active.pos, usedIds, query, sort]);

  const pickPlayer = (player: ApiPlayer) => {
    const next = { ...rosters, [active.team]: { ...rosters[active.team], [active.pos]: player } };
    setRosters(next);
    setQuery("");
    // Advance to the next empty slot: rest of this team first, then the other team.
    for (const team of [active.team, active.team === 1 ? 2 : 1] as TeamNum[]) {
      for (const pos of POSITIONS) {
        if (!next[team][pos]) {
          setActive({ team, pos });
          return;
        }
      }
    }
  };

  const setYear = (team: TeamNum, year: number) => {
    setTeamYears((y) => ({ ...y, [team]: year }));
    setRosters((r) => ({ ...r, [team]: {} })); // players belong to a season; year change resets the roster
  };

  const saveRoster = (team: TeamNum) => {
    const roster = rosters[team];
    const year = teamYears[team];
    if (!year || POSITIONS.some((pos) => !roster[pos])) return;
    const name = prompt("Roster name?");
    if (!name) return;
    const ids = Object.fromEntries(POSITIONS.map((pos) => [pos, roster[pos]!.id])) as Record<Position, string>;
    const next = [...saved.filter((s) => s.name !== name), { name, year, ids }];
    setSaved(next);
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
  };

  const loadRoster = async (team: TeamNum, name: string) => {
    const entry = saved.find((s) => s.name === name);
    if (!entry) return;
    const pool: ApiPlayer[] =
      pools[entry.year] ?? (await (await fetch(`/api/players?year=${entry.year}`)).json());
    setPools((p) => ({ ...p, [entry.year]: pool }));
    const roster: Roster = {};
    for (const pos of POSITIONS) {
      const player = pool.find((p) => p.id === entry.ids[pos]);
      if (player) roster[pos] = player;
    }
    setTeamYears((y) => ({ ...y, [team]: entry.year }));
    setRosters((r) => ({ ...r, [team]: roster }));
  };

  const complete = POSITIONS.every((pos) => rosters[1][pos] && rosters[2][pos]);

  const start = () => {
    onStart({
      team1: POSITIONS.map((pos) => rosters[1][pos]!),
      team2: POSITIONS.map((pos) => rosters[2][pos]!),
    });
  };

  const sortBy = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === "name" ? 1 : -1 }));

  return (
    <div className="container">
      <h1>Pickem Basketball</h1>
      <p className="subtitle">Build two rosters, lock your picks, simulate 1000 games</p>

      <div className="draft-grid">
        {([1, 2] as TeamNum[]).map((team) => (
          <div key={team} className={`panel team-panel t${team}`}>
            <div className="team-header">
              <span className={`team-name t${team}`}>Team {team}</span>
              <select
                value={teamYears[team] ?? ""}
                onChange={(e) => setYear(team, parseInt(e.target.value, 10))}
              >
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            {POSITIONS.map((pos) => {
              const player = rosters[team][pos];
              const isActive = active.team === team && active.pos === pos;
              return (
                <button
                  key={pos}
                  className={`slot ${isActive ? "active" : ""} ${player ? "filled" : ""}`}
                  onClick={() => setActive({ team, pos })}
                >
                  <span className="slot-pos">{pos}</span>
                  {player ? (
                    <span className="slot-player">
                      {player.name}
                      <small>{player.ppg} pts · {player.rpg} reb · {player.apg} ast</small>
                    </span>
                  ) : (
                    <span className="slot-empty">click to fill</span>
                  )}
                </button>
              );
            })}
            <div className="roster-actions">
              <button className="btn-small" onClick={() => saveRoster(team)}>Save</button>
              {saved.length > 0 && (
                <select value="" onChange={(e) => e.target.value && loadRoster(team, e.target.value)}>
                  <option value="">Load…</option>
                  {saved.map((s) => (
                    <option key={s.name} value={s.name}>{s.name} ({s.year})</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="browser-header">
          <span>
            Picking <b className={`team-name t${active.team}`}>Team {active.team}</b> · <b>{active.pos}</b> · {activeYear}
          </span>
          <input
            type="search"
            placeholder="Search players…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        <table className="player-table">
          <thead>
            <tr>
              <th onClick={() => sortBy("name")}>Player</th>
              {STAT_COLS.map((c) => (
                <th key={c.key} onClick={() => sortBy(c.key)} className="num">
                  {c.label}{sort.key === c.key ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {candidates.slice(0, 30).map((p) => (
              <tr key={p.id} onClick={() => pickPlayer(p)}>
                <td>{p.name}</td>
                {STAT_COLS.map((c) => (
                  <td key={c.key} className="num">{p[c.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {candidates.length > 30 && <p className="hint">{candidates.length - 30} more — refine your search</p>}
      </div>

      <div className="btn-center">
        <button className="btn-primary" disabled={!complete} onClick={start}>
          Lock Rosters → Make Picks
        </button>
      </div>
    </div>
  );
}
