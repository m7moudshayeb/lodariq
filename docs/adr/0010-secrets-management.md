# 0010. Secrets management

- Status: Proposed
- PRD references: §12.1, §16.0

## Context

The vendor surface is multi-provider (Neon, Stripe, Cloudflare, Sentry,
Resend/SES, Fly.io). Lodariq also has an internal dashboard/API BFF source
secret. Scattered secrets are a liability.

## Decision

Adopt a single secrets manager — Doppler or Infisical — as the source of truth
for environment configuration across local, CI, and Fly.io. No SDK-phase code
yet; this records the intent so the Phase 1 control plane wires one manager from
the start. `.env*` files are git-ignored and only `.env.example` is committed.

## Consequences

- Provider choice (Doppler vs Infisical) to be finalized at Phase 1 kickoff.
- API and dashboard receive the same strong
  `LODARIQ_AUTH_BFF_SOURCE_SECRET` through their separate Fly secret sets. It is
  server-only, rotated as one coordinated credential, and never exposed through
  `NEXT_PUBLIC_*`, browser storage, logs, or customer-page code.
- Owned auth session tokens are random opaque values; only hashes are persisted,
  so there is no reusable session-signing secret to distribute.
- Enabling auth email requires environment-specific `RESEND_API_KEY`,
  `LODARIQ_AUTH_EMAIL_TOKEN_SECRET`, `LODARIQ_AUTH_EMAIL_FROM`, and
  `LODARIQ_APP_BASE_URL`. The API key and token secret are server-only; the
  delivery/signup/recovery capability flags are configuration and must be
  enabled coherently in API and dashboard only after the provider/domain is
  ready.
