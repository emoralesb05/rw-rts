# Probe: Gemini auth status for live policy execution

## Question

Can this machine run a non-interactive Gemini CLI session probe for Realmkeeper's fail-closed policy path?

## Setup

- Installed CLI: `0.47.0`; npm `latest` checked through `npx -y @google/gemini-cli@latest` as `0.49.0`.
- Local settings: `security.auth.selectedType` is `oauth-personal`, and cached OAuth files are present.
- Credential presence check: no `GEMINI_API_KEY`, `GOOGLE_API_KEY`, Vertex/Google Cloud project env, `GOOGLE_APPLICATION_CREDENTIALS`, `gcloud`, or ADC config was present.
- Command: `gemini --list-sessions`.
- Command: `gemini --prompt "Reply with exactly realmkeeper-gemini-auth-smoke" --output-format stream-json --approval-mode plan --skip-trust`.
- Command: `npx -y @google/gemini-cli@latest --prompt "Reply with exactly realmkeeper-gemini-latest-auth-smoke" --output-format stream-json --approval-mode plan --skip-trust`.
- Repo: `/Users/ed/Github/emoralesb05/rw-rts`.

## Finding

Gemini found no project sessions, then reached the configured OAuth auth path and failed with:

```text
IneligibleTierError: This client is no longer supported for Gemini Code Assist for individuals.
```

The error included reason code `UNSUPPORTED_CLIENT` and directed the user to Antigravity. A minimal headless prompt failed with the same error on the installed CLI, and the same prompt failed with the same error on npm `latest` (`0.49.0`) through `npx`.

## Outcome

The live policy execution probe remains blocked by the account tier attached to
the configured OAuth cache, not by Realmkeeper code and not by missing OAuth
configuration. This does not prove every paid Google sign-in fails; the next
probe needs a supported non-interactive Gemini auth path, such as a throwaway
API key, Vertex/GCA environment, or a verified Google AI Pro/Ultra or Workspace
account.
