# Maintenance

Realmkeeper tracks current stable project dependencies and explicitly reviewed
repository skills. Preview and nightly releases are opt-in; they are not the
default meaning of "latest."

Compatibility takes precedence over an isolated package's `latest` tag. The
manifest pins TypeScript 6.0.3 because the current `typescript-eslint` release
supports TypeScript `<6.1.0` and rejects TypeScript 7 at startup. Upgrade that
pin once the latest linter supports TypeScript 7 and the full validation suite
passes.

## Repeatable audit

Run:

```bash
bun run maintenance:audit
```

This performs two independent checks:

1. `deps:audit` asks the package registry for dependency drift without changing
   `package.json` or `bun.lock`.
2. `skills:audit` checks every `.agents/skills/*/SKILL.md`, its mirrored
   `.codex/skills` symlink, local Markdown references, provenance membership,
   and the installed package versions against which the skill was reviewed.

The skill provenance lock is
[`../.agents/skills/provenance.json`](../.agents/skills/provenance.json). A skill
must belong to exactly one group. When a compatibility package changes, review
the affected skill content against the new stable API and then update the
group's `reviewedVersions` value and `reviewedAt`. Project-specific guidance
must not be overwritten by a generic upstream skill without reviewing its
Realmkeeper invariants.

`agent-browser` is a special case: the checked-in file is a version-neutral
discovery stub, while the installed CLI serves matching workflow instructions
at runtime. The audit therefore verifies the installed CLI version recorded in
the provenance lock.

## Global agent CLIs

Global provider CLIs are intentionally outside the JavaScript dependency lock.
Audit them independently with their native package manager and `--version`.
Realmkeeper should preserve compatibility adapters while treating supported
successor tools as new providers rather than silently changing an existing
provider's identity.
