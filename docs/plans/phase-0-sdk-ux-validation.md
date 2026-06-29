# Phase 0 SDK UX And Integration Validation Plan

Source of truth: `refined-lodariq-prd.md`.

## Goal

Validate and harden the local SDK foundation from Pre-phase before committing to
production backend, dashboard, publication, and billing architecture. (PRD
§16.2)

## Automated Coverage In Place

- [x] Expanded fixture host coverage for routes, drawer, modal, scroll
      containers, repeated labels, lazy-loaded content, skeleton/loading state,
      transforms, and z-index pressure. (PRD §16.2)
- [x] Creator target attachment is verified in route, drawer, modal,
      scroll-container, and lazy-loaded states. (PRD §16.2 acceptance)
- [x] Target picking shows cursor state, selection veil, hover outline,
      mechanical hover label, and blocked Lodariq UI state. (PRD §8.2, §16.2
      acceptance)
- [x] Target chips expose view, change, test, health, remove target, and
      advanced details actions; health/view requests resolve the saved
      fingerprint against the live host page through the bridge, and removal
      marks the affected step incomplete without deleting content. (PRD §8.2,
      §16.2 acceptance, §16.3)
- [x] Nested targets can be cycled with parent/deeper controls, and creators
      can temporarily click through to the product without ending target
      selection. (PRD §8.2)
- [x] Secondary customer-like SDK host exercises runtime install, playback,
      authoring open, step insertion, target attachment, and local metrics to
      reduce overfitting to `apps/fixture-host`. (PRD §16.2)
- [x] Live authoring preview applies semantic bridge patches and renders the
      affected tour step on the selected target before manual compile/reload.
      (PRD §9.5, §16.2 acceptance)
- [x] Button actions use explicit creator controls; incomplete actions save
      locally and survive reload without data loss. (PRD §7.3, §7.7, §16.2
      acceptance)
- [x] Product-click gated steps are represented as a typed button action and
      runtime advances only after the real resolved target click, so host-page
      modal, route, or same-tab page navigation changes can occur before the
      next step resolves. Same-tab navigation is covered by loader resume state
      keyed to the current workspace, environment, manifest version, document
      hash, and step id. (PRD §7.1, §8.6)
- [x] Local metrics for time to first block, time to attach first target, failed
      target picks, preview-open rate, and cancel rate, with exportable JSON
      reports for sign-off evidence. (PRD §16.2)
- [x] Local JSON fixture import/export for repeatable tests. (PRD §16.2)
- [x] Usability test script for 5-10 design partners or proxy creators. (PRD
      §16.2)
- [x] Bridge protocol checks cover exact origins, acknowledgements, timeouts,
      batching through semantic preview patches, and message-size limits. (PRD
      §16.2)
- [x] Host bridge emits route and scroll lifecycle updates with animation-frame
      coalescing and no unbounded queue growth while acknowledgements are
      pending. (PRD §9.5, §16.2)
- [x] SDK-injected runtime, authoring, local-frame, and target-picker stylesheet
      tags honor host-provided CSP nonces; the local install docs explicitly
      document the remaining strict-CSP assumption around dynamic inline overlay
      positioning. (PRD §16.2)
- [x] Browser e2e coverage for Chromium, Firefox, and WebKit; Edge channel is
      opt-in with `LODARIQ_E2E_EDGE=1` when installed. (PRD §16.2)
- [x] Local installation docs for engineering evaluators. (PRD §16.2)
- [x] No backend database, server compiler, authenticated iframe requirement,
      standalone WebSocket service, hosted demo, or production runtime. (PRD
      §16.2)

## Codewise Sign-Off Status

- [x] Phase 0 SDK UX and integration validation is complete for the codewise
      scope as of 2026-06-29. `pnpm verify` covers typecheck, lint,
      package-boundary checks, unit tests, build, bundle-size gates,
      Chromium/Firefox/WebKit Playwright e2e, and `pnpm audit`.

## External Evidence Still Required For Full Product Sign-Off

- [ ] 5-10 design partners or proxy creators complete the guided SDK authoring
      test. (PRD §16.2 acceptance)
- [ ] 80% of tested creators understand slash-to-block insertion without
      documentation. (PRD §16.2 acceptance)
- [ ] First local tour can be created in under 10 minutes after SDK install.
      (PRD §16.2 acceptance)
- [ ] Local metrics from the guided sessions are recorded and attached to the
      Phase 0 sign-off note. (PRD §16.2)

## Verification

```bash
pnpm verify
```

`pnpm verify` runs typecheck, lint, package-boundary checks, unit tests, build,
bundle-size gates, Playwright e2e, and `pnpm audit`.
