# Manual and External Validation Handoff

Last updated: 2026-08-08

This file separates work that cannot be completed truthfully from repository
code alone. Nothing below is evidence that Phase 2, hosted activation, a release
workflow, or the 48/50 product target is complete. Record dated evidence and
link it from `docs/PROGRESS.md` only after the named check has actually run.

## Database Baseline and Live RLS

Owner: engineering/operator with access to an isolated Neon branch and, later,
the shared environment.

1. Apply `packages/database/drizzle/0000_initial_baseline.sql` exactly once to
   an empty isolated branch with an owner connection before initializing any
   shared staging or production database.
2. Exercise the Drizzle release-operation, document-pointer, theme draft/version/
   default, document binding/acknowledgement, and visual-check paths with the
   permanent non-owner runtime role.
3. Verify tenant isolation, forced RLS, append-only approved theme/check rows,
   active/inactive reads, generation compare-and-swap, server-derived staging
   request-hash idempotent replay, conflict behavior, and per-document pointer
   isolation. Confirm the baseline creates no historical rows or backfill.
4. Save baseline-application logs and the extended live-RLS report with secrets
   removed.
5. Request explicit human sign-off before applying any destructive migration to
   a shared environment. The current migration being additive does not grant
   permission for future destructive changes.

Completion evidence: isolated-branch migration output, passing RLS report,
rollback/recovery notes, reviewer name, date, and explicit shared-environment
approval where applicable.

## Fly, DNS, CDN, and Deployment

Owner: deployment operator with access to Fly.io, DNS, TLS, and object-storage
configuration.

- Provision the dashboard, API, and editor on their intended separate Fly.io
  origins; never serve the authoring iframe from the authenticated dashboard
  origin.
- Configure exact canonical origins, DNS, TLS, secret injection, health checks,
  deployment promotion, and recovery using
  `docs/deployment/phase-1-fly.md` as the current runbook.
- Configure Cloudflare R2/CDN only when artifact materialization is enabled.
  Verify fully scoped immutable artifact cache rules separately from private,
  no-store pointer revalidation.
- Run deployed staging smoke checks for dashboard access, ordinary runtime
  loading, authoring-origin isolation, exact-origin rejection, and production's
  zero-authoring-code condition.
- Run exact-theme direct/hosted authoring and document-specific delivery checks,
  then exercise the guarded staging publish path with idempotency replay and a
  stale-generation conflict. This is not evidence of the later real-browser
  verification or production-promotion workflow.
- Do not claim hosted launcher activation or first-party auth from deployment
  availability alone; those flows require their Phase 2 Slice 1 code and
  end-to-end evidence first.

Completion evidence: deployment IDs, redacted configuration inventory, DNS/TLS
checks, health results, cache-header samples, staging smoke report, and recovery
exercise.

## Auth-Email Deliverability and Later SSO

Owner: product/security/operator. Resend-backed verification/reset delivery is
implemented locally but cannot be called production-ready until this gate
passes; SSO remains optional later work.

- Before enabling public signup/recovery, configure and verify the Resend domain,
  SPF, DKIM, DMARC, bounce handling, suppression, rate limits, and representative
  verification/reset inbox delivery. Enable API delivery/signup/recovery and
  matching dashboard modes together only after the initial baseline and
  non-owner live RLS verification pass.
- If enterprise SSO is later sold, complete provider configuration, domain
  verification, membership/role mapping, just-in-time provisioning policy,
  revocation, recovery, audit evidence, and security review.
- Keep the canonical creator sign-in in a first-party top-level Lodariq popup;
  no external configuration may move password fields or long-lived credentials
  onto customer pages.

Completion evidence: provider-neutral test matrix, security approval, dated
delivery/SSO results, and documented recovery path. Until this exists, describe
email and SSO as later capabilities, not available product behavior.

## Usability, Paid Pilots, and Product-Score Evidence

Owner: product/research, with Product Marketing Manager participants and pilot
customers who match the intended buyer.

- Run the moderated checks in
  `docs/plans/phase-2-brand-release-usability-test.md` after the corresponding
  flows are implemented and verified.
- Test dashboard comprehension, returning-creator entry, modeless authoring,
  target selection, no-CSS Brand work, staging verification, exact-artifact
  promotion, and recovery as separate tasks. Do not substitute design opinions
  for task completion evidence.
- Capture time on task, clicks, context switches, completion rate, error and
  recovery rate, confidence, and repeated-use intent. Include keyboard, touch,
  narrow viewport, zoom, and representative host-page conditions.
- Validate proven demand, buyer clarity, usage frequency, willingness to pay,
  distribution channels, and expansion through paid pilots or equivalent
  commercial evidence.
- Re-score both the broad platform and focused PMM wedge against the ten product
  criteria only from cited market, usage, reliability, and commercial evidence.
  The 48/50 total is a gate to prove, not a value documentation can award.

Completion evidence: anonymized participant profile, task-level results,
recorded issues and fixes, paid-pilot or equivalent commercial proof, scorecard
with source links, and an explicit go/no-go decision.

## Global Propagation, Residency, and Legal

Owner: infrastructure/security/legal when production rollout makes the scope
real.

- Measure publication, promotion, rollback, and unpublish propagation from the
  authoritative pointer to each supported delivery region. Do not claim the
  60-second global convergence target from local tests.
- Define supported regions, backup/restore behavior, retention, deletion,
  subprocessors, incident response, and data-residency boundaries before making
  contractual claims.
- Review analytics and authoring data flows for consent, minimization, DPA/privacy
  obligations, cross-border transfer, accessibility commitments, and customer
  security requirements.
- Treat multi-region storage or compute as demand-triggered infrastructure; do
  not add it merely to satisfy a roadmap phrase.

Completion evidence: dated regional propagation measurements, recovery result,
approved residency/data-flow inventory, legal/security sign-off, and public
claims that match the measured scope.

## Evidence Recording Rule

For every completed item, record the environment, timestamp, operator, tested
revision/artifact hash, exact command or scenario, result, and a redacted link
to supporting output. A screenshot or successful deployment alone is not proof
of tenancy, release truth, authentication security, usability, or commercial
demand.
