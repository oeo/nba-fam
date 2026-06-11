import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

interface RawRow {
  gameId: string;
  season_year: string;
  personName: string;
  position: string;
  comment: string;
  minutes: string;
  fieldGoalsMade: string;
  fieldGoalsAttempted: string;
  threePointersMade: string;
  threePointersAttempted: string;
  freeThrowsMade: string;
  freeThrowsAttempted: string;
  reboundsOffensive: string;
  reboundsDefensive: string;
  assists: string;
  steals: string;
  blocks: string;
  turnovers: string;
  foulsPersonal: string;
  points: string;
}

interface Aggregated {
  personName: string;
  personId: string;
  season: number;
  rawPosition: string;
  games: Set<string>;
  totalMinutes: number;
  totalFGM: number;
  totalFGA: number;
  total3PM: number;
  total3PA: number;
  totalFTM: number;
  totalFTA: number;
  totalORB: number;
  totalDRB: number;
  totalAST: number;
  totalTOV: number;
  totalSTL: number;
  totalBLK: number;
  totalPTS: number;
}

function parseCsv(content: string): RawRow[] {
  const lines = content.trim().split("\n");
  const headers = lines[0].split(",");
  const rows: RawRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(",");
    if (vals.length < headers.length) continue;
    const row: any = {};
    headers.forEach((h, j) => (row[h] = vals[j]));
    rows.push(row);
  }
  return rows;
}

function toId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .substring(0, 8);
}

function parseSeason(seasonStr: string): number {
  const parts = seasonStr.split("-");
  const year = parseInt(parts[1] || parts[0], 10);
  return year < 100 ? 2000 + year : year;
}

function classifyPosition(raw: string, g: number, totalAST: number, totalPTS: number, totalORB: number, totalDRB: number): string {
  raw = raw.trim().toUpperCase();
  const ast = totalAST / g;
  const pts = totalPTS / g;
  const reb = (totalORB + totalDRB) / g;

  if (raw === "G") {
    return ast > 5 ? "PG" : "SG";
  }
  if (raw === "F") {
    if (reb > pts * 0.5) return "PF";
    if (ast > 3.5 && reb < pts * 0.4) return "SF";
    return reb > 5 ? "PF" : "SF";
  }
  if (raw === "C" || raw.includes("CENTER")) return "C";
  if (raw.includes("GUARD") || raw === "G-F") return ast > 5 ? "PG" : "SG";
  if (raw.includes("FORWARD") || raw === "F-C" || raw === "F-G") return reb > 5 ? "PF" : "SF";
  return "SF";
}

export function buildPlayers(csvPaths: string[], outputPath: string): void {
  const map = new Map<string, Aggregated>();

  for (const csvPath of csvPaths) {
    if (!existsSync(csvPath)) {
      console.warn(`Skipping missing file: ${csvPath}`);
      continue;
    }
    console.log(`Reading ${csvPath}...`);
    const content = readFileSync(csvPath, "utf-8");
    const rows = parseCsv(content);
    console.log(`  Parsed ${rows.length} rows`);

    for (const row of rows) {
      if (!row.personName || !row.position) continue;
      const comment = (row.comment || "").toLowerCase();
      if (comment.includes("dnp") || comment.includes("dnd") || comment.includes("nwt")) continue;

      const minutes = parseFloat(row.minutes);
      if (minutes <= 0) continue;

      const rawPos = row.position.trim().toUpperCase();
      if (!["G", "F", "C", "G-F", "F-C", "F-G", "GUARD", "FORWARD", "CENTER"].some(t => rawPos.startsWith(t))) continue;

      const season = parseSeason(row.season_year);
      const key = `${row.personName}|${season}`;
      const existing = map.get(key);

      if (existing) {
        existing.games.add(row.gameId || "");
        existing.totalMinutes += minutes;
        existing.totalFGM += parseInt(row.fieldGoalsMade) || 0;
        existing.totalFGA += parseInt(row.fieldGoalsAttempted) || 0;
        existing.total3PM += parseInt(row.threePointersMade) || 0;
        existing.total3PA += parseInt(row.threePointersAttempted) || 0;
        existing.totalFTM += parseInt(row.freeThrowsMade) || 0;
        existing.totalFTA += parseInt(row.freeThrowsAttempted) || 0;
        existing.totalORB += parseInt(row.reboundsOffensive) || 0;
        existing.totalDRB += parseInt(row.reboundsDefensive) || 0;
        existing.totalAST += parseInt(row.assists) || 0;
        existing.totalTOV += parseInt(row.turnovers) || 0;
        existing.totalSTL += parseInt(row.steals) || 0;
        existing.totalBLK += parseInt(row.blocks) || 0;
        existing.totalPTS += parseInt(row.points) || 0;
      } else {
        map.set(key, {
          personName: row.personName,
          personId: toId(row.personName),
          season,
          rawPosition: rawPos,
          games: new Set([row.gameId || ""]),
          totalMinutes: minutes,
          totalFGM: parseInt(row.fieldGoalsMade) || 0,
          totalFGA: parseInt(row.fieldGoalsAttempted) || 0,
          total3PM: parseInt(row.threePointersMade) || 0,
          total3PA: parseInt(row.threePointersAttempted) || 0,
          totalFTM: parseInt(row.freeThrowsMade) || 0,
          totalFTA: parseInt(row.freeThrowsAttempted) || 0,
          totalORB: parseInt(row.reboundsOffensive) || 0,
          totalDRB: parseInt(row.reboundsDefensive) || 0,
          totalAST: parseInt(row.assists) || 0,
          totalTOV: parseInt(row.turnovers) || 0,
          totalSTL: parseInt(row.steals) || 0,
          totalBLK: parseInt(row.blocks) || 0,
          totalPTS: parseInt(row.points) || 0,
        });
      }
    }
  }

  let idCounter = 1;
  const players = Array.from(map.values())
    .filter((a) => a.games.size >= 10)
    .map((a) => {
      const g = a.games.size;
      const position = classifyPosition(
        a.rawPosition, g,
        a.totalAST, a.totalPTS,
        a.totalORB, a.totalDRB,
      );
      return {
        id: a.personId + String(idCounter++),
        name: a.personName,
        year: a.season,
        position: position,
        gp: g,
        mpg: Math.round((a.totalMinutes / g) * 10) / 10,
        fgm: Math.round((a.totalFGM / g) * 10) / 10,
        fga: Math.round((a.totalFGA / g) * 10) / 10,
        fg3m: Math.round((a.total3PM / g) * 10) / 10,
        fg3a: Math.round((a.total3PA / g) * 10) / 10,
        ftm: Math.round((a.totalFTM / g) * 10) / 10,
        fta: Math.round((a.totalFTA / g) * 10) / 10,
        orb: Math.round((a.totalORB / g) * 10) / 10,
        drb: Math.round((a.totalDRB / g) * 10) / 10,
        ast: Math.round((a.totalAST / g) * 10) / 10,
        tov: Math.round((a.totalTOV / g) * 10) / 10,
        stl: Math.round((a.totalSTL / g) * 10) / 10,
        blk: Math.round((a.totalBLK / g) * 10) / 10,
        pts: Math.round((a.totalPTS / g) * 10) / 10,
      };
    });

  const dir = outputPath.split("/").slice(0, -1).join("/");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(outputPath, JSON.stringify(players, null, 2));
  console.log(`Wrote ${players.length} players to ${outputPath}`);
}

const csvDir = process.argv[2] || "data/csv";
const csvFiles = [
  join(csvDir, "regular_season_box_scores_2010_2024_part_1.csv"),
  join(csvDir, "regular_season_box_scores_2010_2024_part_2.csv"),
  join(csvDir, "regular_season_box_scores_2010_2024_part_3.csv"),
];
buildPlayers(csvFiles, "src/data/players.json");
