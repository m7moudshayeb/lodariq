# 0019. Provider-neutral identity and authentication model

- Status: Accepted
- PRD references: §20
- Plan: `docs/plans/authentication-identity-and-tenant-hardening.md`, Phase 3

## Context

The original owned-auth model attached one email and one password credential
directly to a Lodariq user. `AuthProvider` authenticated an existing HTTP request,
but did not represent identity proof, provider callbacks, enrollment, linking,
unlinking, assurance, or workspace policy. Extending that shape directly for
passkeys or SSO would couple account ownership to whichever provider authenticated
most recently and would make unsafe email-based auto-linking tempting.

## Decision

`users` remains the stable Lodariq person/account record. Login identifiers and
authenticators are additive records:

- `user_emails` owns normalized, verified, primary-email state;
- `usernames` owns a globally unique first-party login identifier;
- `auth_identities` owns stable `(issuer, subject)` identities independently of
  mutable provider email claims;
- `auth_sessions` records the exact identity, method, assurance, authentication
  time, and duration policy used to establish the session;
- `workspace_auth_policies` and `sso_connections` are tenant-scoped foundations
  for later policy enforcement and federation.

The existing `users.email`, `users.email_verified_at`, and password-credential
email fields remain during the expand/contract window. New writes dual-write the
canonical identity records; existing rows are backfilled additively. A future
contract migration may remove legacy columns only after production evidence and
explicit approval.

`AuthProvider` continues to authorize an already-created Lodariq request. The
separate `IdentityProviderAdapter` covers begin, callback verification,
enrollment, linking, unlinking, and assurance. Adapter calls never create a user,
workspace, membership, or Lodariq session as an implicit side effect.

External identities are unique by issuer and immutable provider subject. OIDC or
SAML email claims may support a reviewed enrollment decision but are never used
as the permanent subject and never auto-link accounts. External identities carry
the provider tenant identifier; first-party password/passkey identities do not.

Usernames are ASCII-only after NFKC normalization, case-insensitive, reserved-name
checked, and globally unique. This deliberately narrow policy prevents Unicode
confusable identifiers. Username changes require a recent authenticated session,
password confirmation while password auth exists, and a bounded change interval.
Account recovery remains anchored to a verified email, not a username.

## Security and rollback consequences

- Every new table has forced RLS. Public login lookups are exact-value,
  transaction-scoped operations; user-owned and workspace-owned reads are
  separately scoped.
- Backfill aborts on ambiguous normalized email data rather than selecting an
  arbitrary account.
- Existing sessions and legacy columns remain readable during rollback. Sessions
  without an identity id are tolerated only during the expansion window and are
  replaced on the next authentication or rotation.
- Linking and unlinking require authenticated or strong-recovery authorization;
  provider email equality is insufficient.
- Workspace policy enforcement and provider implementations are deliberately
  staged in later phases, but their persistence contracts are established here.
