# NBA Draft & Simulator

Draft teams of NBA players from any season and simulate games against each other using an event-sourced, deterministic game engine.

## Quick Start

```sh
bun install
bun run dev
```

Open `http://localhost:3099` — both players pick a year, snake draft 5 players (PG/SG/SF/PF/C), then simulate 1000 games.

## Commands

| Command | Purpose |
|---------|---------|
| `bun run dev` | Start dev server with hot reload |
| `bun test` | Run integration tests |
| `bun run build-data` | Rebuild `players.json` from CSVs |

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/years` | All available seasons |
| `GET` | `/api/players?year=2024&position=PG` | Players filtered by year and position |
| `POST` | `/api/simulate` | Run 1000 simulations. Body: `{ team1: ["id1",...], team2: ["id1",...] }` |
| `GET` | `/api/game?team1=id1,...&team2=id1,...&seed=N` | Re-simulate one game, returning its full event timeline and box score |

## Data

9,243 players across 28 seasons (1997–2024). Sources:

- **1997–2010:** Brescou/NBA-dataset-stats-player-team
- **2011–2024:** NocturneBear/NBA-Data-2010-2024

Players with fewer than 10 games in a season are excluded.

## Simulation Detail

The engine (`src/engine/`) is event-sourced: each game is a timeline of timestamped events (shots, rebounds, assists, steals, blocks, turnovers, fouls, free throws) with the running score and game clock embedded in every event. Box scores and results are derived by folding over the timeline.

- **Real clock:** 4 × 12-minute quarters, 5-minute overtimes until a winner. Possessions emerge from sampled action times under a 24s shot clock; offensive rebounds reset to 14s.
- **Deterministic:** every game is seeded — the same matchup and seed reproduce the identical timeline. `POST /api/simulate` plays 1000 seeded games and reports win probability, average scores, and per-game `{seed, scores}`; `GET /api/game` replays any of them in full (team1 = home).
- **Attribution:** shooters by FGA share, assists by AST share, steals/blocks/rebounds contested via individual rates. Tuning knobs live in `src/engine/constants.ts`.
