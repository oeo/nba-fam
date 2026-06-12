import { useEffect, useRef, useState } from "react";

interface Track {
  id: number;
  title: string;
  url: string;
}

interface AudioPrefs {
  volume: number;
  muted: boolean;
}

const AUDIO_KEY = "pickem-audio";

function loadPrefs(): AudioPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(AUDIO_KEY) ?? "");
    if (typeof p?.volume === "number") return p;
  } catch {}
  return { volume: 0.5, muted: false };
}

export function MusicPlayer() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [prefs, setPrefs] = useState<AudioPrefs>(loadPrefs);
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    fetch("/api/tracks")
      .then((r) => r.json())
      .then(setTracks);
  }, []);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    a.volume = prefs.volume;
    a.muted = prefs.muted;
    localStorage.setItem(AUDIO_KEY, JSON.stringify(prefs));
  }, [prefs, tracks.length]);

  // Autoplay once tracks arrive; browsers may block until first interaction.
  useEffect(() => {
    if (!tracks.length) return;
    audio.current
      ?.play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
  }, [tracks.length]);

  // Keep playing when the marquee advances to the next track.
  useEffect(() => {
    if (playing) audio.current?.play().catch(() => setPlaying(false));
  }, [current]);

  if (!tracks.length) return null;
  const track = tracks[current];

  const toggle = () => {
    const a = audio.current!;
    if (a.paused) {
      a.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      a.pause();
      setPlaying(false);
    }
  };

  return (
    <div className="music-bar">
      <audio
        ref={audio}
        src={track.url}
        onEnded={() => setCurrent((current + 1) % tracks.length)}
      />
      <button className="btn-small" onClick={toggle} title={playing ? "Pause" : "Play"}>
        {playing ? "⏸" : "▶"}
      </button>
      <div className="music-title">
        <span>{track.title}</span>
      </div>
      <button
        className="btn-small"
        onClick={() => setPrefs((p) => ({ ...p, muted: !p.muted }))}
        title={prefs.muted ? "Unmute" : "Mute"}
      >
        {prefs.muted ? "🔇" : "🔊"}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={prefs.muted ? 0 : prefs.volume}
        onChange={(e) => setPrefs({ volume: parseFloat(e.target.value), muted: false })}
        title="Volume"
      />
    </div>
  );
}
