# Probe: Gemini auth status for live policy execution

## Question

Can this machine run a non-interactive Gemini CLI session probe for Realmkeeper's fail-closed policy path?

## Setup

- Installed CLI: `0.47.0`.
- Command: `gemini --list-sessions`.
- Repo: `/Users/ed/Github/emoralesb05/rw-rts`.

## Finding

Gemini found no project sessions, then reached the configured auth path and failed with:

```text
IneligibleTierError: This client is no longer supported for Gemini Code Assist for individuals.
```

The error included reason code `UNSUPPORTED_CLIENT` and directed the user to Antigravity.

## Outcome

The live policy execution probe remains blocked. The next probe needs a supported non-interactive Gemini auth path, such as a throwaway API key, Vertex/GCA environment, or a supported Gemini CLI account tier.
