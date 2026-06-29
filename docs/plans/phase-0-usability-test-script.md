# Phase 0 Usability Test Script

Source of truth: `refined-talmeh-prd.md` §16.2.

## Setup

1. Follow `docs/local-sdk-installation.md`.
2. Start `apps/fixture-host`.
3. Reset local Talmeh documents and metrics.
4. Open the fixture host and keep the local metrics panel visible in authoring.
5. After each session, click **Export metrics** and attach the JSON report to
   the Phase 0 sign-off note.

## Participant Task

Give this prompt to each design partner or proxy creator:

> Create a local Talmeh tour that introduces the New project action. Add at
> least one block, attach a target, preview the tour, export the JSON, import it
> again, and replay it.

Do not explain slash commands unless the participant asks.

## Record Per Session

| Field                                     | Value |
| ----------------------------------------- | ----- |
| Participant ID                            |       |
| Role / proxy type                         |       |
| Completed guided authoring test?          |       |
| Understood slash-to-block without docs?   |       |
| First local tour time after SDK install   |       |
| Time to first block                       |       |
| Time to first target                      |       |
| Failed target picks                       |       |
| Preview opened?                           |       |
| Cancel rate                               |       |
| Export/import/replay preserved block IDs? |       |
| Notes                                     |       |

## Sign-Off Checks

- 5-10 participants completed the guided test.
- At least 80% understood slash-to-block insertion without docs.
- First local tour was created in under 10 minutes after SDK install.
- Exported local metrics JSON from every session is attached to the Phase 0
  sign-off note.
