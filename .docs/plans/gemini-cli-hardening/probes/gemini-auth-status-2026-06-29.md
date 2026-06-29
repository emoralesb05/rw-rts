# Probe: Gemini auth status for live policy execution

## Question

Can this machine run a non-interactive Gemini CLI session probe for Realmkeeper's fail-closed policy path?

## Setup

- Installed CLI: `0.47.0`.
- Credential presence check: no `GEMINI_API_KEY`, `GOOGLE_API_KEY`, Vertex/Google Cloud project env, `GOOGLE_APPLICATION_CREDENTIALS`, `gcloud`, or ADC config was present.
- Command: `gemini --list-sessions`.
- Repo: `/Users/ed/Github/emoralesb05/rw-rts`.

## Finding

Gemini found no project sessions, then reached the configured auth path and failed with:

```text
IneligibleTierError: This client is no longer supported for Gemini Code Assist for individuals.
```

The error included reason code `UNSUPPORTED_CLIENT` and directed the user to Antigravity.

## Outcome

The live policy execution probe remains blocked by missing supported auth, not by Realmkeeper code. The next probe needs a supported non-interactive Gemini auth path, such as a throwaway API key, Vertex/GCA environment, or a supported Gemini CLI account tier.
