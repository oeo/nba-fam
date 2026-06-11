import { readFileSync, writeFileSync } from "node:fs";

function parseCsv(content: string): Record<string, string>[] {
  const lines = content.trim().split("\n");
  const headers = lines[0].split(",");
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(",");
    if (vals.length < headers.length) continue;
    const row: any = {};
    headers.forEach((h, j) => (row[h.trim()] = (vals[j] || "").trim()));
    rows.push(row);
  }
  return rows;
}

function parseSeason(s: string): number {
  const parts = s.split("-");
  if (parts.length === 1) return parseInt(parts[0], 10);
  if (parts[1].length === 4) return parseInt(parts[1], 10);
  const firstYear = parseInt(parts[0], 10);
  const shortYear = parseInt(parts[1], 10);
  const century = firstYear - (firstYear % 100);
  let fullYear = century + shortYear;
  if (fullYear < firstYear) fullYear += 100;
  return fullYear;
}

function classifyPosition(
  raw: string,
  ast: number,   // per-game
  pts: number,   // per-game
  reb: number,   // per-game
): string {
  raw = raw.toUpperCase().trim();

  if (raw === "G") return ast > 5 ? "PG" : "SG";
  if (raw === "F") {
    if (reb > pts * 0.5) return "PF";
    if (ast > 3.5 && reb < pts * 0.4) return "SF";
    return reb > 5 ? "PF" : "SF";
  }
  if (raw === "C") return "C";
  if (raw === "G-F" || raw === "F-G") return ast > 5 ? "PG" : "SF";
  if (raw === "F-C" || raw === "C-F") return reb > 5 ? "PF" : "C";
  return "SF";
}

const VALID_POSITIONS = new Set(["PG", "SG", "SF", "PF", "C"]);

console.log("Reading player index...");
const indexRows = parseCsv(readFileSync("data/csv/player_index.csv", "utf-8"));
const posMap = new Map<string, string>();
for (const row of indexRows) {
  const firstName = row.PLAYER_FIRST_NAME || "";
  const lastName = row.PLAYER_LAST_NAME || "";
  const pos = row.POSITION;
  if (firstName && lastName && pos) {
    const fullName = `${firstName} ${lastName}`;
    posMap.set(fullName.toLowerCase(), pos);
  }
}
console.log(`  Mapped ${posMap.size} players to positions`);

console.log("Reading Brescou traditional stats...");
const statsRows = parseCsv(readFileSync("data/csv/player_stats_traditionnal_rs.csv", "utf-8"));
console.log(`  Parsed ${statsRows.length} rows`);

interface PlayerOut {
  name: string;
  year: number;
  position: string;
  gp: number;
  mpg: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  orb: number;
  drb: number;
  ast: number;
  tov: number;
  stl: number;
  blk: number;
  pts: number;
}

const out: PlayerOut[] = [];

for (const row of statsRows) {
  const season = parseSeason(row.SEASON);
  if (season < 1996 || season > 2010) continue;

  const gp = parseFloat(row.GP);
  if (gp < 10) continue;

  const name = row.PLAYER_NAME;
  if (!name || name === "0") continue;

  const pid = row.PLAYER_ID;
  if (!pid) continue;

  const nameLower = name.toLowerCase();
  let rawPos = posMap.get(nameLower);
  if (!rawPos) {
    // Try matching by player index name variations
    const parts = name.split(" ");
    if (parts.length >= 2) {
      rawPos = posMap.get(`${parts[1]} ${parts[0]}`.toLowerCase());
    }
    if (!rawPos) {
      // Fallback when name not found in index
      const pts = parseFloat(row.PTS) || 0;
      const reb = (parseFloat(row.OREB) || 0) + (parseFloat(row.DREB) || 0);
      const ast = parseFloat(row.AST) || 0;
      if (pts > 20 && ast > 6) rawPos = "G";
      else if (reb > 8) rawPos = "F";
      else rawPos = "F";
    }
  }

  const pts = parseFloat(row.PTS) || 0;
  const ast = parseFloat(row.AST) || 0;
  const orb = parseFloat(row.OREB) || 0;
  const drb = parseFloat(row.DREB) || 0;
  const reb = orb + drb;
  const position = classifyPosition(rawPos, ast, pts, reb);
  if (!VALID_POSITIONS.has(position)) continue;

  out.push({
    name,
    year: season,
    position,
    gp,
    mpg: parseFloat(row.MIN) || 0,
    fgm: parseFloat(row.FGM) || 0,
    fga: parseFloat(row.FGA) || 0,
    fg3m: parseFloat(row.FG3M) || 0,
    fg3a: parseFloat(row.FG3A) || 0,
    ftm: parseFloat(row.FTM) || 0,
    fta: parseFloat(row.FTA) || 0,
    orb,
    drb,
    ast,
    tov: parseFloat(row.TOV) || 0,
    stl: parseFloat(row.STL) || 0,
    blk: parseFloat(row.BLK) || 0,
    pts,
  });
}

console.log(`  Raw: ${out.length} players from Brescou (1996-2009)`);

// Deduplicate by (name, year) - keep highest GP
const byKey = new Map<string, PlayerOut>();
for (const p of out) {
  const key = `${p.name}|${p.year}`;
  const existing = byKey.get(key);
  if (!existing || p.gp > existing.gp) byKey.set(key, p);
}
const deduped = Array.from(byKey.values());

// Round and assign IDs
const final = deduped
  .filter((p) => {
    for (const k of ["mpg", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta", "orb", "drb", "ast", "tov", "stl", "blk", "pts"]) {
      (p as any)[k] = Math.round((p as any)[k] * 10) / 10;
    }
    return p.pts > 0;
  })
  .map((p, i) => ({
    id: "b" + String(i + 1),
    ...p,
  }));

console.log(`  After dedup: ${final.length} players (removed ${out.length - final.length})`);

// Position counts
const posCounts: Record<string, number> = {};
final.forEach((p) => { posCounts[p.position] = (posCounts[p.position] || 0) + 1; });
const years = [...new Set(final.map((p) => p.year))].sort((a, b) => a - b);
console.log(`  Years: ${years[0]}-${years[years.length - 1]} (${years.length} seasons)`);
console.log(`  Positions: ${JSON.stringify(posCounts)}`);

// Merge with existing NocturneBear data
console.log("Merging with existing players.json...");
const existing = JSON.parse(readFileSync("src/data/players.json", "utf-8"));

// Ensure existing IDs don't conflict
const maxExistingId = existing.reduce((max: number, p: any) => {
  const num = parseInt(p.id.replace(/\D/g, ""), 10) || 0;
  return Math.max(max, num);
}, 0);

const existingIds = new Set(existing.map((p: any) => p.id.split("|")[0]));
const merged = [
  ...existing,
  ...final.map(p => ({
    ...p,
    id: p.id + String(maxExistingId),
  })),
];

// Final dedup across both datasets by (name, year) - keep highest GP
const mergedByKey = new Map<string, any>();
for (const p of merged) {
  const key = `${p.name.toLowerCase()}|${p.year}`;
  const existing = mergedByKey.get(key);
  if (!existing || p.gp > existing.gp) mergedByKey.set(key, p);
}

const result = Array.from(mergedByKey.values()).sort((a, b) => {
  if (a.year !== b.year) return b.year - a.year;
  return a.name.localeCompare(b.name);
});

writeFileSync("src/data/players.json", JSON.stringify(result, null, 2));
console.log(`Wrote ${result.length} total players to src/data/players.json`);

// Final verification
const fy = [...new Set(result.map((p: any) => p.year))].sort((a, b) => a - b);
const fp: Record<string, number> = {};
result.forEach((p: any) => { fp[p.position] = (fp[p.position] || 0) + 1; });
console.log(`Final years: ${fy[0]}-${fy[fy.length - 1]} (${fy.length} seasons)`);
console.log(`Final positions: ${JSON.stringify(fp)}`);
