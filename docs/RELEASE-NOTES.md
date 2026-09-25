# Release notes

## 1.16.1

- Doubled the adviser portrait from 88 × 88 to 176 × 176 pixels.
- Separated facial animation from the resting body and hands.
- Replaced repeated waving and rocking with a subtle breathing movement.
- Passed 33 isolated desktop checks and both TypeScript configurations; visually checked both talking frames and layouts at 1540px and 980px.

## 1.16.0

- Added the Ackbar adviser between probe telemetry and speed.
- Added contextual tips, NASA-sourced universe facts and reports based on the selected probe's latest loaded data.
- Added quiet mode, hiding/restoring, animation controls and reduced-motion support.
- Passed 18 regression suites and 32 isolated desktop checks.

## 1.15.1

- Reliability review covering concurrency, navigation, mining, inventory, desktop recovery and API handling.
- Corrected probe rename responses while preserving detailed telemetry.
- Preserved exact jettison confirmations and unsaved rename/logbook drafts across refreshes.
- Verified accepted mining amounts and resources before issuing further loads.
- Improved cancellation, telemetry validation, rate-limit handling and malformed settings recovery.
- Preserved the documented Engineering `includeAll=1` query.
- Passed 18 regression suites and 238 desktop scenario checks, including shared startup checks.

These tests used simulated game responses and did not perform live game mutations. They do not guarantee the absence of every bug.
