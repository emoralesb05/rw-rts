import { useCallback, useEffect, useState } from "react";
import { usePanels } from "./panel-store";
import { Button } from "../components/kit/Button";
import { Code } from "../components/kit/Code";
import { Field } from "../components/kit/Field";
import { Input } from "../components/kit/Input";
import { Textarea } from "../components/kit/Textarea";
import { useToast } from "../components/kit/ToastLayer";
import { cn } from "@/lib/cn";
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
    <div className="flex flex-col gap-4 overflow-y-auto p-[18px] font-ui">
      <Field
        htmlFor="settings-workspace-root"
        label="Workspace root"
      >
        <Input
          id="settings-workspace-root"
          type="text"
          className="font-mono"
          value={workspaceRoot}
          onChange={(e) => setWorkspaceRoot(e.target.value)}
          placeholder="~/Github"
          spellCheck={false}
          autoCapitalize="off"
        />
        <span
          className={cn(
            "mt-0.5 font-mono text-[10.5px] tracking-[0.2px]",
            validation
              ? validation.valid
                ? "text-success"
                : "text-warning"
              : "text-muted"
          )}
        >
          {!validation
            ? "checking…"
            : validation.valid
            ? `✓ resolves to ${validation.expanded}`
            : `⚠ ${VALIDATION_REASON[validation.reason ?? "empty"]}`}
        </span>
      </Field>

      <Field
        htmlFor="settings-exclude"
        label="Exclude patterns"
        description="one per line · basename, label, dir/*, /abs/path/*, or full path"
      >
        <Textarea
          id="settings-exclude"
          className="resize-y font-mono"
          value={excludeText}
          onChange={(e) => setExcludeText(e.target.value)}
          rows={8}
          placeholder={"vercel-ai\nforks/*\n~/Github/teradata/*"}
          spellCheck={false}
          autoCapitalize="off"
        />
      </Field>

      <p className="m-0 text-[10.5px] italic text-muted">
        Edits also persist to <Code>~/.keykeeper.json</Code>; you can hand-edit that file
        and the next dropdown render will pick it up.
      </p>

      <div className="-mx-[18px] -mb-[18px] flex justify-end gap-2 border-t border-line bg-black/25 px-[18px] py-3">
        <Button
          type="button"
          onClick={() => closeKind("settings")}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant={canSave ? "primary" : "default"}
          onClick={save}
          disabled={!canSave}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
