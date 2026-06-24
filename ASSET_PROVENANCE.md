# Asset Provenance

This repository is licensed under the MIT License unless a file states
otherwise.

## First-party project assets

The application code, project documentation, committed UI/game assets, and
agent skill packs are first-party project material owned by the repository
owner unless a nested license file says otherwise.

Tracked first-party visual assets:

- `build/icon.png`
- `assets/sprites/rw-default/**`
- `.docs/concept-art/**`

The sprite and concept-art assets were created for this project from original
prompts and first-party generation workflows. They should not intentionally
copy named characters, logos, weapons, worlds, mascots, or studio-owned visual
trade dress. When regenerating art, use `.docs/sprite-prompts.md` and keep the
prompts generic.

## User override assets

The following paths are ignored and are intended for local/private drop-ins:

- `assets/sprites/rw/**`
- `assets/sounds/rw/**`
- `local-assets/**`

Do not publish private override assets unless their source and license are
known.

## Dependencies

Third-party package dependencies are declared in `package.json` and locked in
`bun.lock`. Dependency source is not vendored in this repository; use each
package's own license terms when redistributing built artifacts.
