# 0023. Passkeys, session assurance, and recovery codes

- Status: Accepted
- PRD references: §20
- Plan: `docs/plans/authentication-identity-and-tenant-hardening.md`, Phase 7

## Context

Password authentication alone cannot provide phishing-resistant step-up for
sensitive operations or satisfy a workspace that requires a stronger session.
Adding passkeys without a provider-neutral assurance model would spread method
checks throughout authorization code. Recovery codes also become a second
credential and must not weaken password or passkey controls through plaintext
storage, replay, or an unconfirmed enrollment.

## Decision

Authorization evaluates the session's persisted method, assurance level, and
`authenticatedAt` value. AAL ordering and the 15-minute recent-auth window are
centralized. Workspace selection and every control-plane access decision load
the current workspace policy and fail closed when minimum assurance,
password-allowed, or SSO-required policy is not met. Session rotation preserves
these authentication facts and cannot upgrade them.

Lodariq implements WebAuthn through the reviewed SimpleWebAuthn server/browser
packages. Each deployment binds passkeys to one exact HTTPS dashboard origin and
an RP ID equal to that origin's host. The first-party creator sign-in popup uses
that same dashboard origin and returns the resulting opaque Lodariq session; no
WebAuthn response or session credential is handed to a customer page. Challenges
expire after five minutes, are stored only as SHA-256 digests, carry a purpose,
RP ID, and origin, and are consumed once. Registration requests user
verification, no attestation, and only ES256 or RS256. Authentication requires
user presence and verification. Credential counters advance with compare-and-set
semantics in the same transaction as challenge consumption, session creation,
identity activity, and the append-only security event.

Recovery enrollment generates exactly ten high-entropy, human-readable codes.
Only normalized SHA-256 digests are persisted. A user must prove current/recent
authentication, save the one-time response, and confirm any displayed code
before the set can recover an account. Confirmation does not consume that code.
Each recovery sign-in atomically consumes one code and creates an AAL1 Lodariq
session; replay is generic failure. Generating a new set, explicit removal, a
password change, or account deletion revokes the active set.

TOTP is deliberately not implemented. The plan requires it only when product or
customer evidence shows a need, and no such evidence exists. This avoids adding
a shared-secret authenticator, QR-seed recovery surface, and clock-skew support
without a proven requirement.

## Consequences

- A passkey session is AAL2; password and recovery-code sessions are AAL1.
- A lower-assurance session cannot select or mutate an AAL2 workspace.
- Disabling/unlinking a passkey identity deletes its public credential and
  revokes live sessions; a disabled identity cannot authenticate.
- The database stores public WebAuthn credential material but no private key,
  raw challenge, raw recovery code, provider token, or authenticator secret.
- Passkey enablement is an explicit deployment flag. Shared migration execution,
  real-device browser evidence, and hosted Fly/Neon validation remain operator
  gates and are not claimed by repository tests.
