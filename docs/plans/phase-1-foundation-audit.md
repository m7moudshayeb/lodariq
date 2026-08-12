# Phase 1 Foundation Evidence Audit

Last audited: 2026-06-30

Source requirements:

- `docs/plans/phase-1-foundation.md`
- `refined-lodariq-prd.md` section 16.3
- Guardrails in `refined-lodariq-prd.md` section 20

This audit tracks implementation evidence. It is not a completion claim until
every item is either proven by current evidence or explicitly accepted as out of
scope.

## Canonical Supersession Note

The rows below preserve evidence for the historical Phase 1 flow: the dashboard
generated a separate creator launch snippet and the hosted editor opened from a
toolbar. That evidence does **not** prove the current canonical target.

The planned target uses one permanent SDK install, a direct draggable launcher
in configured development/staging products, a first-party top-level auth popup
with an exact-origin short-lived exchange, and the same modeless authoring popup
and runtime overlay. The stable actions are `New`, `Experiences on this page`,
and `Preview`; repair/release actions are contextual. The dashboard is
setup/admin/support only, and no browser extension is required for the core
workflow. Phase 2 Slice 1 owns hosted convergence, Phase 2 adds contextual
Brand/release behavior, and Phase 3 expands the broad outcome/type chooser.
This canonical path is planned and is not marked implemented in this audit.

## Local Evidence

| Requirement                                                  | Current evidence                                                                                                                          | Status                                                                           |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Next.js 16 dashboard on Fly, not Vercel                      | `apps/dashboard`, `apps/dashboard/fly*.toml`, `apps/dashboard/Dockerfile`, deployment tests in `packages/tests/deploy/fly-config.test.ts` | Local code ready; live deploy pending                                            |
| Fastify 5 modular API                                        | `apps/api`, `apps/api/src/app.ts`, `apps/api/src/routes/control-plane.ts`                                                                 | Local code ready                                                                 |
| TypeBox/Ajv HTTP boundary                                    | Route schemas in `apps/api/src/routes/control-plane.ts`; API tests validate canonical rejection and SDK authoring wrapper rejection       | Local code ready                                                                 |
| Neon/Drizzle persistence and migrations                      | `packages/database`, `packages/database/drizzle/0000_phase_1_foundation.sql`, `0001_correlation_ids.sql`                                  | Local code ready; live migration evidence recorded in `docs/PROGRESS.md`         |
| Tenant isolation and RLS                                     | Repository workspace scoping, RLS migration, live verifier script, direct document ID cross-workspace API test                            | Local and live smoke evidence present; deployed runtime still pending            |
| Destructive migration guard                                  | `packages/database/scripts/check-migration-safety.mjs`, migration safety tests                                                            | Local code ready                                                                 |
| Clerk thin auth boundary                                     | `apps/api/src/auth`, `apps/dashboard/src/lib/clerk-config.ts`, dashboard provider/proxy/sign-in routes, API Clerk claim tests             | Local code ready; live Clerk smoke pending                                       |
| Dashboard credential forwarding                              | `apps/dashboard/src/lib/api.ts` forwards bearer or `__session`; tests in `packages/tests/dashboard/src/api-integration.test.ts`           | Local code ready                                                                 |
| Document persistence and server-side compilation             | API save/compile/publish routes call `@lodariq/compiler`; repository stores versions/artifacts; API/compiler tests                        | Local code ready                                                                 |
| Publish blocks incomplete critical runtime config            | `findPublishBlocker` in API route; test for incomplete button publish blocking                                                            | Local code ready                                                                 |
| Internal debug JSON view                                     | API debug route plus dashboard debug panel; dashboard action and API-facing tests cover redaction before client state                     | Local code ready                                                                 |
| Staging SDK install flow                                     | Dashboard server action/token panel, staging-only install environment options, generated snippet tests and e2e fixture coverage           | Historical Phase 1 path locally ready; canonical one-install convergence pending |
| Creator authoring gate                                       | Authoring session routes, creator loader snippet, creator installer and toolbar tests                                                     | Historical Phase 1 path locally ready; direct popup/session handshake pending    |
| Production never loads authoring bundle                      | Runtime loader tests for production authoring disablement; bundle boundary checks in SDK size script and dependency-cruiser               | Local code ready                                                                 |
| Iframe editor owns local editing state                       | SDK authoring frame/controller tests cover semantic messages, save, and no keystroke bridge dependency                                    | Local code ready                                                                 |
| Bridge messages versioned, semantic, validated, exact-origin | `packages/schema/src/bridge.ts`, `packages/sdk-authoring/src/bridge`, bridge tests                                                        | Local code ready                                                                 |
| Slash command behavior                                       | SDK authoring/local frame tests for `/button` and ordinary paragraph handling                                                             | Local code ready                                                                 |
| Target chips and target health                               | Local frame UI/controller and authoring tests cover view/change/test/health/remove states                                                 | Local code ready                                                                 |
| Drag reorder updates canonical and preview                   | Fixture-host e2e drag reorder test                                                                                                        | Local code ready                                                                 |
| Pasted content sanitization                                  | SDK authoring tests and schema/block prop allowlists                                                                                      | Local code ready                                                                 |
| Compiler validates block and delivery JSON                   | Compiler tests validate against `CompiledDocument`; API compiles and validates before persistence                                         | Local code ready                                                                 |
| Resolver survives stale CSS                                  | Resolver stale-CSS fixture corpus in `packages/tests/sdk-runtime/src/resolver/resolver.test.ts`                                           | Local code ready                                                                 |
| Coordinates never trigger production clicks                  | Resolver implementation treats coordinates as diagnostic only; guardrail tests and progress evidence                                      | Local code ready                                                                 |
| Runtime lazy-loads renderer                                  | Loader implementation and loader tests                                                                                                    | Local code ready                                                                 |
| Runtime bundle excludes authoring, React, Lexical, dashboard | dependency-cruiser, SDK size/bundle checks, deploy/tests references                                                                       | Local code ready                                                                 |
| No standalone WebSocket gateway                              | Repository search and architecture docs show HTTP plus postMessage only                                                                   | Local code ready                                                                 |
| Five-step flow under five minutes                            | Fixture-host e2e budget test                                                                                                              | Local evidence present                                                           |
| Event ingestion and error reporting                          | User-auth and token-auth routes, runtime batching/beacon, API-side event redaction, SDK runtime error sanitization tests                  | Local code ready                                                                 |

## Remaining External Evidence

These cannot be fully proven by local code inspection:

- Deploy API, dashboard, and editor Fly apps for staging.
- Store non-owner Neon runtime `DATABASE_URL` and Clerk secrets as Fly secrets.
- Run deployed `pnpm live:check-env` shape checks or equivalent release checks.
- Complete a live Clerk sign-in with an active organization and verify dashboard
  requests use Clerk credentials, not development headers.
- Run the browser dashboard flow against deployed staging API and Clerk.
- Run a live creator authoring-session smoke test across dashboard, API, SDK
  token origin allowlist, and hosted editor iframe.
- Upload/stage SDK CDN assets to Cloudflare R2/CDN and verify real public URLs.

## Canonical Convergence Evidence Still Required

- One permanent SDK installation exposes the configured staging/development
  launcher without installing a second creator snippet.
- The launcher remains draggable and modeless, and product controls outside its
  bounds remain selectable.
- A first-party top-level auth popup completes an exact-origin single-use code
  exchange, short-lived activation grant, and document-scoped authoring session,
  including cancel, expiry, and replay failure paths.
- Authoring reuses the same modeless popup and runtime-rendered overlay rather
  than opening a second builder or fixed dock.
- `New`, `Experiences on this page`, and `Preview` remain stable while repair,
  Brand, and release actions appear only when context requires them.
- The normal creator path enters from the customer product; dashboard coverage
  is limited to setup, administration, and support.

## Recent Local Checks

Focused checks run during the current implementation pass:

- `pnpm --filter @lodariq/tests exec vitest run dashboard/src/view-model.test.ts`
- `pnpm --filter @lodariq/dashboard typecheck`
- `pnpm --filter @lodariq/tests exec vitest run api/src/control-plane.test.ts -t "redacts sensitive event"`
- `pnpm --filter @lodariq/api typecheck`
- `pnpm --filter @lodariq/tests typecheck`
- `pnpm exec vitest run sdk-authoring/src/authoring/target-controls.test.ts`

The local shell reported Node `v22.12.0`, so pnpm printed the expected project
engine warning for `>=24.0.0`. Run the final full verification under project
Node 24 before sign-off.
