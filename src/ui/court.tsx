import { useMemo } from "react";
import type { GameEvent, ShotZone } from "../engine/events";
import { mulberry32 } from "../engine/rng";
import { absTime } from "./playback";

// Half-court, 50ft wide x 47ft deep, basket at the top. Both teams attack the
// same rendered basket; possession color distinguishes them.
const RIM = { x: 25, y: 5.25 };
const CENTER = { x: 25, y: 40 };

function jitter(seq: number, salt: number): [number, number] {
  const r = mulberry32(((seq * 2654435761) ^ salt) >>> 0);
  return [r(), r()];
}

// Deterministic per-event coordinates: same game renders identically everywhere.
export function shotCoord(seq: number, zone: ShotZone): { x: number; y: number } {
  const [a, b] = jitter(seq, 0xc0a7);
  const angle = (0.15 + 0.7 * a) * Math.PI;
  const radius = zone === "rim" ? 1 + 3 * b : zone === "mid" ? 9 + 10 * b : 24 + 3 * b;
  return { x: RIM.x + Math.cos(angle) * radius, y: RIM.y + Math.sin(angle) * radius };
}

function anchorFor(e: GameEvent): { x: number; y: number } | null {
  switch (e.type) {
    case "shot":
      return shotCoord(e.seq, e.zone);
    case "free_throw":
      return { x: 25, y: 19 };
    case "rebound": {
      const [a, b] = jitter(e.seq, 0x9ebd);
      return { x: RIM.x - 3 + 6 * a, y: RIM.y + 1 + 3 * b };
    }
    case "turnover": {
      const [a, b] = jitter(e.seq, 0x7e0f);
      return { x: 10 + 30 * a, y: 24 + 14 * b };
    }
    case "jump_ball":
    case "period_start":
      return CENTER;
    default:
      return null; // ball stays where it was
  }
}

export function Court({ events, t, idx }: { events: GameEvent[]; t: number; idx: number }) {
  const anchors = useMemo(() => {
    const pts: { at: number; x: number; y: number }[] = [{ at: 0, ...CENTER }];
    for (const e of events) {
      const a = anchorFor(e);
      if (a) pts.push({ at: absTime(e), ...a });
    }
    return pts;
  }, [events]);

  // The ball travels from the last reached anchor toward the next one.
  let lo = 0;
  let hi = anchors.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (anchors[mid].at <= t) lo = mid;
    else hi = mid - 1;
  }
  const from = anchors[lo];
  const to = anchors[lo + 1];
  const frac = to && to.at > from.at ? Math.min((t - from.at) / (to.at - from.at), 1) : 0;
  const ball = to
    ? { x: from.x + (to.x - from.x) * frac, y: from.y + (to.y - from.y) * frac }
    : from;

  const current = idx ? events[idx - 1] : null;
  const period = current?.period ?? 1;
  const possession = current?.possession ?? null;
  const shots = events.slice(0, idx).filter((e) => e.type === "shot" && e.period === period);

  return (
    <div className="panel court-panel">
      <div className="court-header">
        <span className="hint-inline">shot chart: this period</span>
        {possession && (
          <span className={`team-name ${possession === "home" ? "t1" : "t2"}`}>
            ● {possession === "home" ? "Team 1" : "Team 2"} ball
          </span>
        )}
      </div>
      <svg viewBox="0 0 50 47" className="court">
        <rect x="0.2" y="0.2" width="49.6" height="46.6" className="line" />
        <rect x="17" y="0.2" width="16" height="18.8" className="line" />
        <circle cx="25" cy="19" r="6" className="line" />
        <line x1="22" y1="4" x2="28" y2="4" className="line" />
        <circle cx={RIM.x} cy={RIM.y} r="0.75" className="line" />
        <path d="M 3 0.2 L 3 5.25 A 22 22 0 0 0 47 5.25 L 47 0.2" className="line" />
        <path d="M 19 46.8 A 6 6 0 0 1 31 46.8" className="line" />
        {shots.map((e) => {
          if (e.type !== "shot") return null;
          const c = shotCoord(e.seq, e.zone);
          return (
            <circle
              key={e.seq}
              cx={c.x}
              cy={c.y}
              r="0.7"
              className={`dot ${e.team} ${e.made ? "made" : "miss"}`}
            />
          );
        })}
        <circle cx={ball.x} cy={ball.y} r="0.9" className="ball" />
      </svg>
    </div>
  );
}
