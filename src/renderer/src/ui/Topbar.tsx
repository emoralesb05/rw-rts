import { useEffect, useState } from "react";
import { useStore } from "../store";
import { isMuted, toggleMuted } from "../audio/sounds";
import type { HooksStatus } from "@shared/ipc";

export function Topbar() {
  const [status, setStatus] = useState<HooksStatus | null>(null);
  const [muted, setMuted] = useState(isMuted());
  const worldCount = useStore((s) => Object.keys(s.worlds).length);
  const unitCount = useStore((s) => Object.keys(s.units).length);
  const eventCount = useStore((s) => s.eventCount);

  useEffect(() => {
    window.kh.hooksStatus().then(setStatus);
  }, []);

  async function toggleHooks() {
    if (!status) return;
    const next = status.installed
      ? await window.kh.uninstallHooks()
      : await window.kh.installHooks();
    setStatus(next);
  }

  return (
    <div className="topbar">
      <span className="title">⌬ kh-rts</span>
      <span style={{ color: "var(--muted)", fontSize: 12 }}>
        {worldCount} worlds · {unitCount} units · {eventCount} events
      </span>
      <span className="spacer" />
      <select
        className="btn"
        defaultValue=""
        onChange={(e) => {
          const v = e.target.value;
          if (v) {
            void window.kh.playFixture({ scenario: v as never });
            e.target.value = "";
          }
        }}
        title="run a scripted demo (no API tokens used)"
      >
        <option value="" disabled>
          ▶ demo
        </option>
        <option value="demo">demo · all 3 tools</option>
        <option value="claude-starter">claude · starter</option>
        <option value="cursor-turn">cursor · multi-tool turn</option>
        <option value="codex-shell">codex · shell</option>
        <option value="subagent">claude · subagent (Mickey)</option>
        <option value="stress">stress · 30 events</option>
      </select>
      <button
        className="btn"
        onClick={() => setMuted(toggleMuted())}
        title="toggle sound"
      >
        {muted ? "🔇" : "🔊"}
      </button>
      <button className="btn" onClick={toggleHooks} title={status?.socketPath}>
        hooks: {status?.installed ? "on" : "off"}
      </button>
    </div>
  );
}
