import { useCallback, useEffect, useState } from "react";
import { usePanels } from "./panel-store";
import { Button } from "../../components/chrome/Button";
import { Code } from "../../components/chrome/Code";
import { Field } from "../../components/chrome/Field";
import { Input } from "../../components/chrome/Input";
import { Textarea } from "../../components/chrome/Textarea";
import { useToast } from "../../components/chrome/ToastLayer";
import type { AppSettings, WorkspaceRootValidation } from "@shared/schemas";

const VALIDATION_REASON: Record<NonNullable<WorkspaceRootValidation["reason"]>, string> = {
  empty: "type a path",
  "not-found": "directory doesn't exist",
  "not-a-directory": "this path is not a directory",
  "stat-failed": "couldn't read this path",
};

type Props = {
  onSaved?: () => void;
};

export function SettingsPanelBody({ onSaved }: Props) {
  const closeKind = usePanels((s) => s.closeKind);
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [excludeText, setExcludeText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState<WorkspaceRootValidation | null>(null);
  const { notify } = useToast();

  useEffect(() => {
    void window.kh.getSettings().then((s: AppSettings) => {
      setWorkspaceRoot(s.workspaceRoot);
      setExcludeText(s.exclude.join("\n"));
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const handle = setTimeout(() => {
      void window.kh.validateWorkspaceRoot(workspaceRoot).then(setValidation);
    }, 200);
    return () => clearTimeout(handle);
  }, [workspaceRoot, loaded]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const exclude = excludeText
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"));
      await window.kh.saveSettings({ workspaceRoot, exclude });
      notify({ title: "Settings saved", tone: "success" });
      onSaved?.();
      closeKind("settings");
    } catch {
      notify({
        title: "Settings save failed",
        description: "Keykeeper could not write the settings file.",
        tone: "danger",
      });
    } finally {
      setSaving(false);
    }
  }, [workspaceRoot, excludeText, onSaved, closeKind, notify]);

  const canSave = loaded && !saving && validation?.valid === true;

  return (
    <div className="settings-body">
      <Field
        className="settings-field"
        htmlFor="settings-workspace-root"
        label="Workspace root"
      >
        <Input
          id="settings-workspace-root"
          type="text"
          className="settings-input font-mono"
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
      </Field>

      <Field
        className="settings-field"
        htmlFor="settings-exclude"
        label="Exclude patterns"
        description="one per line · basename, label, dir/*, /abs/path/*, or full path"
      >
        <Textarea
          id="settings-exclude"
          className="settings-textarea font-mono"
          value={excludeText}
          onChange={(e) => setExcludeText(e.target.value)}
          rows={8}
          placeholder={"vercel-ai\nforks/*\n~/Github/teradata/*"}
          spellCheck={false}
          autoCapitalize="off"
        />
      </Field>

      <p className="settings-footer-note">
        Edits also persist to <Code>~/.keykeeper.json</Code>; you can hand-edit that file
        and the next dropdown render will pick it up.
      </p>

      <div className="settings-footer">
        <Button
          type="button"
          onClick={() => closeKind("settings")}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={save}
          disabled={!canSave}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
