# 0009. Local test harness

- Status: Accepted
- PRD references: §16.0, §16.1, §16.2

## Context

The SDK is the first product surface and must be proven locally before any
backend exists.

## Decision

`apps/fixture-host` is the primary SaaS-like integration surface (routes, scroll
container, drawer, repeated labels, lazy content). Unit/contract tests run on
Vitest (jsdom where DOM is needed); end-to-end authoring + playback run on
Playwright against the fixture host. `apps/sdk-playground` exercises compile and
playback in isolation.

## Consequences

- CI runs typecheck, lint, dependency-cruiser boundaries, tests, and bundle-size
  checks.
- No backend database, server compiler, or hosted demo in Pre-phase / Phase 0.
