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
  const selectWorld = useStore((s) => s.selectWorld);

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
      <span className="title">⌬ keykeeper</span>
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
            // Summon demos land in fresh /tmp worlds. In the unified-map
            // architecture the canvas is always visible behind the side
            // panel, so no view switch is needed — just clear any
            // selection so the new worlds aren't pre-targeted.
            if (v.startsWith("summon-")) {
              selectWorld(null);
            }
            void window.kh.playFixture({ scenario: v as never });
            e.target.value = "";
          }
        }}
        title="run a scripted demo (no API tokens used)"
      >
        <option value="" disabled>
          ▶ demo
        </option>
        <optgroup label="summon">
          <option value="summon-vaelen">summon Vaelen (purple)</option>
          <option value="summon-selene">summon Selene (pink)</option>
          <option value="summon-ryder">summon Ryder (orange)</option>
          <option value="summon-lyris">summon Lyris (cyan)</option>
          <option value="summon-all">summon all 4 wielders</option>
        </optgroup>
        <optgroup label="flows">
          <option value="demo">all 3 tools (claude/cursor/codex)</option>
          <option value="cursor-turn">cursor · multi-tool turn</option>
          <option value="codex-shell">codex · shell</option>
          <option value="subagent">claude · subagent (Final drive)</option>
          <option value="combat">combat · heartless raid</option>
          <option value="stress">stress · 30 events</option>
        </optgroup>
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
