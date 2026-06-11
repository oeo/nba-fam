import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { ApiPlayer, SimResult } from "../types";
import { Draft } from "./draft";
import { Matchup, type Picks } from "./matchup";
import { Replay } from "./replay";

export interface Teams {
  team1: ApiPlayer[];
  team2: ApiPlayer[];
}

function App() {
  const [teams, setTeams] = useState<Teams | null>(null);
  const [sim, setSim] = useState<SimResult | null>(null);
  const [picks, setPicks] = useState<Picks | null>(null);
  const [replaySeed, setReplaySeed] = useState<number | null>(null);

  if (!teams) {
    return <Draft onStart={(t) => setTeams(t)} />;
  }

  if (replaySeed !== null) {
    return <Replay teams={teams} seed={replaySeed} onBack={() => setReplaySeed(null)} />;
  }

  return (
    <Matchup
      teams={teams}
      sim={sim}
      setSim={setSim}
      picks={picks}
      setPicks={setPicks}
      onReplay={setReplaySeed}
      onNewDraft={() => {
        setTeams(null);
        setSim(null);
        setPicks(null);
      }}
    />
  );
}

createRoot(document.getElementById("root")!).render(<App />);
