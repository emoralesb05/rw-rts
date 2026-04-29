import { useCallback, useEffect, useState } from "react";
import type { AppSettings, WorkspaceRootValidation } from "@shared/ipc";

type Props = {
  onClose: () => void;
  onSaved: () => void;
};

const VALIDATION_REASON: Record<NonNullable<WorkspaceRootValidation["reason"]>, string> = {
  empty: "type a path",
  "not-found": "directory doesn't exist",
  "not-a-directory": "this path is not a directory",
  "stat-failed": "couldn't read this path",
};

export function SettingsModal({ onClose, onSaved }: Props) {
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [excludeText, setExcludeText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState<WorkspaceRootValidation | null>(null);

  // Load current settings on mount.
  useEffect(() => {
    void window.kh.getSettings().then((s: AppSettings) => {
      setWorkspaceRoot(s.workspaceRoot);
      setExcludeText(s.exclude.join("\n"));
      setLoaded(true);
    });
  }, []);

  // Live-validate the workspace root field with a tiny debounce so we
  // don't spam fs.stat() on every keystroke.
  useEffect(() => {
    if (!loaded) return;
    const handle = setTimeout(() => {
      void window.kh.validateWorkspaceRoot(workspaceRoot).then(setValidation);
    }, 200);
    return () => clearTimeout(handle);
  }, [workspaceRoot, loaded]);

  // Esc to dismiss.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const exclude = excludeText
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"));
      await window.kh.saveSettings({ workspaceRoot, exclude });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }, [workspaceRoot, excludeText, onSaved, onClose]);

  const canSave = loaded && !saving && validation?.valid === true;

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Settings">
        <header className="settings-header">
          <h2>Settings</h2>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </header>

        <div className="settings-body">
          <label className="settings-field">
            <span className="settings-label">Workspace root</span>
            <input
              type="text"
              className="settings-input"
              value={workspaceRoot}
              onChange={(e) => setWorkspaceRoot(e.target.value)}
              placeholder="~/Github"
              spellCheck={false}
              autoCapitalize="off"
            />
            <span
              className={
                "settings-validation " +
                (validation
                  ? validation.valid
                    ? "ok"
                    : "warn"
                  : "muted")
              }
            >
              {!validation
                ? "checking…"
                : validation.valid
                ? `✓ resolves to ${validation.expanded}`
                : `⚠ ${VALIDATION_REASON[validation.reason ?? "empty"]}`}
            </span>
          </label>

          <label className="settings-field">
            <span className="settings-label">
              Exclude patterns
              <span className="settings-hint">
                one per line · basename, label, dir/*, /abs/path/*, or full path
              </span>
            </span>
            <textarea
              className="settings-textarea"
              value={excludeText}
              onChange={(e) => setExcludeText(e.target.value)}
              rows={8}
              placeholder={"vercel-ai\nforks/*\n~/Github/teradata/*"}
              spellCheck={false}
              autoCapitalize="off"
            />
          </label>

          <p className="settings-footer-note">
            Edits also persist to <code>~/.keykeeper.json</code>; you can hand-edit that file
            and the next dropdown render will pick it up.
          </p>
        </div>

        <footer className="settings-footer">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={save}
            disabled={!canSave}
            title={!canSave && validation && !validation.valid ? "fix the workspace root first" : undefined}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}
