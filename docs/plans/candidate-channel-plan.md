# Candidate Channel — Authoring / Live Environment Plan

- Status: Proposed
- Date: 2026-08-21
- Related: ADR 0006 (origin model), ADR 0014 (environment/release pointers),
  ADR 0015 (SDK-first in-product authoring), ADR 0027 (idle page cost)

How to let authoring and live share an origin without giving up the one thing
that separates Lodariq from Pendo: users receive the exact artifact that was
verified.

## The whole plan in one idea

A publication already exists independently of the pointer. `publications` is an
immutable row — artifact, hash, provenance. `document_deployments` is a separate
table whose `active_publication_id` and `generation` decide what users actually
get.

Today publish does both in one step. Split them, and a **candidate publication**
falls out almost for free: a real, compiled, verifiable artifact that no pointer
serves.

Once verification no longer requires exposure, sharing an origin between
authoring and live stops being dangerous — and the environment rename becomes a
straightforward refactor instead of a gamble.

## Phases

Ordered so each phase ships value on its own and the next one is safe to start.
Phases 1 and 2 are worth doing even if the merge is never built.

### Phase 0 — Write the decision down (~1 day)

Six layers currently enforce "production never authors." Loosening that is a
deliberate architectural choice, not a refactor. Record it before touching code.

Changes:

- New ADR: candidate publication channel.
- New ADR: origin capabilities and environment roles.
- Amend 0006 (origin model), 0014 (release pointers), 0015 (SDK-first entry).
- State the weakened guarantee explicitly: origin-enforced becomes
  identity-enforced.

Done when: both ADRs are accepted, with the superseded clauses named line by
line.

Risk: skipping this makes the weaker guarantee an accident rather than a
decision.

### Phase 1 — Decouple publish from the pointer (load-bearing)

Split the current publish operation into `create publication` (compile + append
immutable row, pointer untouched) and `activate` (pointer CAS). Add a `channel`
concept: `candidate` or `live`.

Changes:

- Add `channel` to `publications`; a publication not referenced by
  `document_deployments.active_publication_id` is a candidate.
- Split the publish path in `authoring-operations.ts` into two release actions.
- Keep both steps under the existing idempotency key and expected generation.
- Retention: candidates expire; never let them accumulate per document.
- Existing rows migrate to `channel = 'live'`.

Done when:

- A creator can compile and store an artifact with zero change to what any user
  receives.
- Pointer CAS and append-only history are unchanged.

Risk: two operations where there was one — partial states must be representable
and recoverable.

### Phase 2 — Verify a candidate, not a live publication (unlocks everything after)

Serve a specific candidate artifact to one authenticated creator, run the 13
checks against it, and write the verification record. Nothing reaches an end
user.

Changes:

- Authenticated delivery endpoint that resolves an explicitly requested
  publication ID, not the active one.
- Gate it on the short-lived authoring activation plus membership plus exact
  origin — never the public installation path.
- Drop `environment.kind !== 'staging'` from `createPublicationVerification`;
  require channel plus capability instead.
- Verifier loads the candidate rather than the active publication.
- Promotion evidence points at the verified candidate.

Done when:

- A full verify → promote cycle runs with the candidate never served to a
  non-creator.
- Public delivery cannot be coerced into rendering a candidate — proven by test,
  not by review.

Risk: highest-severity surface in the plan. A candidate leaking to real users is
worse than the problem being solved.

### Phase 3 — Capabilities on origins, roles on environments (the rename)

Replace the three fixed kinds with two roles — Authoring and Live — expressed as
capabilities so "same origin" needs no special case.

Changes:

- Origin holds capabilities: `can_author`, `serves_live`.
- Retire `ENVIRONMENT_PIPELINE_POSITION_BY_KIND`, the 0/1/2 check, and the
  `minItems: 3 / maxItems: 3` policy constraint.
- Widen `AuthoringEnvironment` from a two-literal union to a capability check.
- Redefine `promotion_source` against candidate → live; drop the not-self
  constraint.
- Migration: development + staging become Authoring, production becomes Live.
- Many authoring origins allowed; exactly one live.

Done when:

- A workspace with one authoring origin and one live origin validates and
  releases end to end.
- No `kind === 'production'` string comparisons remain outside the migration.

Risk: touches `@lodariq/schema`, which everything depends on — expect wide,
shallow breakage.

### Phase 4 — Allow one origin to hold both capabilities (the actual feature)

Turn on merged mode, with defaults strict enough that approval can carry the
safety load that origin separation used to.

Changes:

- Remove the four assertions that forbid authoring on a live-serving origin.
- Gate the authoring `import()` on the Ctrl/⌘ + Shift + L keypress plus session
  check — never on page load, or the live page pays an uncacheable request every
  view.
- Merged mode forces stricter policy: approval required,
  `requireSeparateApprover` on.
- Raise the DB ceiling on `required_approval_count` above 1.
- Persistent "you are authoring on your live site" banner while a session is
  open.
- Kill-switch carve-out: suspending delivery must not disable the authoring
  surface needed to fix it.

Done when:

- An unauthenticated visitor to a merged origin downloads zero authoring bytes,
  verified against a real network trace.
- Idle-page cost is unchanged from the ADR-0027 baseline.

Risk: a creator navigating a real production account can fire real actions; no
code fix, only affordances.

### Phase 5 — Clean up what the merge contaminates (not optional)

Two environments were doing quiet work beyond safety. Replace it explicitly.

Changes:

- Analytics: events are keyed by `environment_id`. Add channel and
  had-authoring-session so creator self-views never enter exposure or completion
  numbers.
- Dashboard: environment setup, release state copy, the derived next action.
- Rewrite `docs/guides/authoring-and-release.md` sections 1, 8, 9, 10.
- Marketing: the pitch changes from "promote between environments" to "promote a
  verified artifact".

Done when: a merged-origin workspace reports the same numbers a separated one
would.

Risk: easy to defer, and silently wrong analytics is the hardest bug class to
notice.

## Enforcement inventory

Every place the codebase currently asserts that production cannot author. Each
is a line item, not a search-and-replace.

| Layer        | Where                       | What it does                                                                               | Phase |
| ------------ | --------------------------- | ------------------------------------------------------------------------------------------ | ----- |
| Type         | `schema/src/sdk.ts`         | `AuthoringEnvironment` is `'development' \| 'staging'` — production is unrepresentable     | 03    |
| Database     | `schema/environments.ts`    | `environments_pipeline_position_check` requires production to have `not authoring_enabled` | 03    |
| Policy       | `environment-policy.ts`     | `production_authoring_forbidden` and `canAuthorInEnvironment()`                            | 03    |
| API          | `authoring-policy.ts`       | Two assertions throwing `authoring cannot be enabled for a production environment`         | 04    |
| Session      | `in-memory/analytics.ts`    | Three `kind === 'production'` rejections, including revalidation on every session resolve  | 04    |
| Runtime      | `public-bootstrap.ts`       | Gates `import('./authoring-activation')`; re-throws on refresh                             | 04    |
| Verification | `drizzle/release-checks.ts` | Hard-requires `environment.kind === 'staging'`                                             | 02    |

## Risk register

| Risk                                     | Severity | Mitigation                                                                                                                            |
| ---------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Candidate artifact reaches a real user   | Critical | Candidate delivery only through the authenticated path; public delivery resolves the pointer and nothing else; adversarial test in CI |
| Authoring bytes load for a visitor       | Critical | Import gated on keypress plus session; assert zero authoring bytes in an unauthenticated network trace                                |
| Idle-page cost regresses                 | High     | No page-load capability request; re-run the ADR-0027 measurements as a gate                                                           |
| Creator fires real actions in production | High     | Persistent banner; selection-mode suppression already exists; no technical fix beyond that                                            |
| Analytics contaminated by creator views  | High     | Channel and session attribution on events, landed in the same phase as the merge                                                      |
| Kill switch disables the repair tool     | Medium   | Suspension applies to delivery only, never to the authoring surface                                                                   |
| Candidate rows accumulate forever        | Low      | Expiry and per-document cap in phase 1                                                                                                |
| Schema churn breaks dependents           | Low      | Wide but shallow; `pnpm verify` and boundaries catch it                                                                               |

## Rules to hold to

Do:

- Ship phases 1 and 2 first. They improve the separated-origin product on their
  own — verification stops exposing content even to staging users.
- Keep separated origins the recommended default. Merged mode is an
  accommodation. Regulated buyers will want the split.
- Make merged mode visible in the product: a banner while authoring, and a line
  in release history recording that the artifact was verified on the live origin.
- Treat phase 2 as a security change, not a feature — adversarial tests, not
  review comments.

Don't:

- Don't merge origins before candidates exist. Verification would then require
  exposure, which is Pendo's model and the end of the positioning.
- Don't decide capability at page load. One network call per view on a
  customer's live site undoes ADR-0027.
- Don't delete the three-kind model without a migration. Map it; don't drop it.
- Don't let approval silently stay at 0-or-1 once it is the primary safety
  mechanism.

## Stop rule

If phase 2 cannot deliver a candidate to a creator without any path by which a
normal visitor could receive it, stop. Ship phases 1 and 3 — the schema is
cleaner and the naming is better either way — and keep separated origins as the
only supported model. The onboarding win is not worth the claim it would cost.

## Grounding

`packages/database/src/schema/releases.ts`,
`packages/database/src/schema/environments.ts`,
`packages/schema/src/environment-policy.ts`,
`packages/sdk-runtime/src/activation/public-bootstrap.ts`,
`packages/database/src/drizzle/release-checks.ts`, and
ADR 0006 / 0014 / 0015 / 0027.
