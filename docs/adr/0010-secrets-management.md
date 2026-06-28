# 0010. Secrets management

- Status: Proposed
- PRD references: §12.1, §16.0

## Context

The vendor surface is multi-provider (Neon, Clerk, Stripe, Cloudflare, Sentry,
Resend/SES, Fly.io). Scattered secrets are a liability.

## Decision

Adopt a single secrets manager — Doppler or Infisical — as the source of truth
for environment configuration across local, CI, and Fly.io. No SDK-phase code
yet; this records the intent so the Phase 1 control plane wires one manager from
the start. `.env*` files are git-ignored and only `.env.example` is committed.

## Consequences

- Provider choice (Doppler vs Infisical) to be finalized at Phase 1 kickoff.
- Clerk is accessed only through a thin internal auth interface to contain
  lock-in (§20).
