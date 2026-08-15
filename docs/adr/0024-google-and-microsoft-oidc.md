# 0024. Google and Microsoft OIDC

- Status: Accepted
- PRD references: §20
- Plan: `docs/plans/authentication-identity-and-tenant-hardening.md`, Phase 8

## Context

Social sign-in must not introduce a second Lodariq session model, make email an
implicit account-linking credential, or leak provider credentials through the
browser, logs, URLs, or persistence. The first-party authoring popup must use the
same identity and tenant authorization as the dashboard.

## Decision

Google and Microsoft implement one provider-neutral proof adapter. Provider
endpoints and JWKS URLs are compiled trusted constants; configuration cannot
introduce an arbitrary discovery or token URL. Each deployment registers one
exact dashboard callback URI for each provider. Authorization uses Code flow,
S256 PKCE, 256-bit state, and a separate 256-bit nonce.

The server persists only the state and nonce SHA-256 digests plus an AES-256-GCM
envelope containing the PKCE verifier and nonce. The envelope's authenticated
data binds the attempt id and provider id. Forced-RLS policies bind insert,
lookup, and consume to the exact state digest. A callback consumes its attempt
before token exchange, so cancellation, concurrency, and replay require a new
authorization. A failed exchange is intentionally not retryable with the same
attempt.

ID tokens are verified with the provider's remote JWKS, an algorithm allowlist,
the configured client audience, issuer, expiry, issued-at age, and the exact
nonce. Microsoft additionally requires a valid tenant id and enforces a
configured tenant when one is pinned. Google issuer variants are normalized to
one canonical issuer after verification. Lodariq keys identity by canonical
issuer plus provider subject. It never auto-links an email collision.

The token endpoint response is reduced immediately to a verified external
identity. Provider access and refresh tokens are ignored and never reach the
repository. New-account creation requires a provider-verifiable email; this
supports Google directly. Microsoft identities without an `email_verified`
claim may be explicitly linked to a recent Lodariq session and subsequently
used to sign in, but cannot mark an email verified. A later enterprise
provisioning policy may establish email ownership through a separately reviewed
flow.

Both dashboard and authoring-popup entry render the same `AuthForm`. Their
provider callback terminates at the dashboard BFF, which exchanges the code
server-side, forwards only the opaque Lodariq cookie, removes provider
parameters from the redirect, and admits only an allowlisted local return path.

## Consequences

- Password, passkey, recovery, Google, and Microsoft identities create the same
  opaque Lodariq session record and use the same workspace authorization.
- Explicit linking requires a recent authenticated session; a matching email is
  never sufficient.
- OIDC sessions are AAL1 until a reviewed provider/enterprise policy proves a
  stronger assurance.
- Provider disablement is fail-closed and provider credentials are deployment
  secrets, never database data.
- Real hosted provider consent and tenant validation remain an operator rollout
  gate and are not inferred from deterministic repository tests.
