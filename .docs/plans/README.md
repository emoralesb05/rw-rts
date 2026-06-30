# Plans

Tactical implementation plans. These are more volatile than architecture docs and should be deleted or rewritten once the work lands.

## Active

No active implementation plans.

## Removed From Active

Completed provider-hardening plans were removed once their decisions shipped.
Durable provider behavior now lives in [`../providers/`](../providers/), and
dated probe evidence lives in [`../providers/probes/`](../providers/probes/).
The provider-neutral permission-rule plan shipped as Realmkeeper-local saved
rules; provider-native config mirroring remains deferred until it can be made an
explicit per-provider opt-in.
