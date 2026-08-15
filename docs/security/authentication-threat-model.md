# Authentication Threat Model

**Status:** Active  
**Last reviewed:** 2026-08-15  
**Boundary:** Lodariq-owned authentication, provider-neutral and enterprise
identities, login identifiers, email and account lifecycle, browser BFF, opaque
sessions, tenant selection/administration, OIDC federation, SCIM lifecycle, and
enterprise recovery.

## Protected assets

- password material, email-verification/reset tokens, and opaque sessions;
- the mapping between login identifiers, users, and workspace memberships;
- authorization state, tenant boundaries, and append-only security evidence;
- email-delivery state and account-existence privacy;
- enterprise client/SCIM credentials, verified-domain routing, IdP principals,
  group-role mappings, policy, validation evidence, and break-glass approvals.

Raw credentials and tokens must never enter URLs except one-time email secrets in
the URL fragment, logs, telemetry, DOM text/attributes, or persistent browser
storage. Provider credentials never become Lodariq browser sessions.

## Trust boundaries

1. The browser submits same-origin JSON to the dashboard BFF.
2. The BFF verifies the browser-facing origin and sends a signed pseudonymous
   source envelope to the API.
3. The API validates TypeBox contracts, rate limits source and identity
   dimensions, and uses a restricted PostgreSQL role.
4. Repository transactions bind exact server-derived identity settings before
   RLS exposes or mutates identity rows.
5. The leased outbox sends through Resend; provider acceptance is evidence of
   acceptance, not delivery or user receipt.
6. Okta and Entra OIDC endpoints prove issuer, subject, nonce, audience, and
   assurance; provider tokens are reduced to an internal proof and discarded.
7. SCIM authenticates as a separately revocable machine principal and can mutate
   only its exact validated connection's bounded lifecycle state.
8. A deployment operator, using a dedicated non-runtime PostgreSQL role, records
   non-secret real-tenant validation evidence before a connection can activate.

## Abuse cases and controls

| Abuse case                                                       | Required control                                                                                                                                                                         |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account discovery through sign-up, recovery, or resend           | Same public accepted shape and timing class; internal outcomes remain private.                                                                                                           |
| Email bombing or cooldown bypass                                 | Normalized identifier plus authenticated-source rate buckets, repository cooldown, advisory transaction lock, and bounded queue.                                                         |
| Old-link takeover                                                | Atomic supersession, one active challenge, hash-stored token, exact expiry, and single-use consumption.                                                                                  |
| Concurrent replacement race                                      | Per-identifier transaction lock, RLS-scoped invalidation, and restricted PostgreSQL concurrency tests.                                                                                   |
| Token theft from browser state                                   | Fragment-only receipt, immediate history clearing, memory-only use, no rendering/storage/logging.                                                                                        |
| Cross-site credential submission                                 | Exact browser-facing origin, `Sec-Fetch-Site` validation, JSON-only mutations, and `SameSite=Lax` cookies.                                                                               |
| Password-manager interference                                    | Standard autocomplete names, paste allowed, no key interception, and app-owned validation after input.                                                                                   |
| Misleading delivery state                                        | UI says queued/accepted until provider evidence exists and exposes a bounded retry control.                                                                                              |
| Open redirect after authentication                               | Central allowlist-based `safeReturnTo`; every recovery/restart action preserves only the safe value.                                                                                     |
| RLS policy present but behavior broken                           | Fresh-baseline and additive-migration tests plus restricted PostgreSQL behavior, not policy-name assertions alone.                                                                       |
| Token-signing key compromise or unsafe rotation                  | Non-secret key ids on challenges/outbox rows, a bounded server keyring, active-key-only issuance, and retained prior keys.                                                               |
| Cleanup deletes a real tenant                                    | Bounded retention worker; verified accounts, live sessions, shared members, documents, themes, installations, and invitations protect the tenant.                                        |
| Support diagnosis leaks PII or secrets                           | Exact outbox-id lookup returns state, attempts, bounded failure code, and timestamps only—never recipient, payload, or token.                                                            |
| Unicode-confusable or privileged username                        | NFKC input gate, deliberately ASCII-only usernames, case-insensitive uniqueness, a centralized reserved-name set, and database constraints.                                              |
| Username-change account takeover                                 | Verified account, recent session, password confirmation, source/user rate limits, 30-day change interval, and atomic credential recheck.                                                 |
| Provider account collision or unsafe auto-link                   | Stable `(issuer, subject)` uniqueness; provider tenant constraints; email claims are never provider subjects and never authorize auto-linking.                                           |
| Session assurance confused after workspace rotation              | Sessions persist identity id, method, assurance, authentication time, and duration policy; rotation cannot change those authentication facts.                                            |
| Ambiguous legacy email silently merges users                     | The additive identity backfill aborts transactionally when normalized legacy email data is ambiguous.                                                                                    |
| Signup creates an orphaned or partially owned tenant             | Registration persists identity plus a server-owned intent only; verified onboarding creates workspace, policy, membership, and environments atomically.                                  |
| Verification succeeds after onboarding intent expiry             | Expiry stops unverified identity establishment; once verified, `pending_destination` remains resumable and cannot strand the account.                                                    |
| Provider email claim takes over an existing account              | Linking requires an authenticated account or strong-recovery authorization and stable issuer/subject; matching email never links identities.                                             |
| Authenticator unlink locks the owner out                         | Unlink serializes usable identities, rejects the final method, revokes live sessions after a successful unlink, and appends an immutable event.                                          |
| Browser changes an onboarding destination                        | Target workspace/invitation/access intent is stored server-side; public snapshots omit workspace names and clients cannot submit completion state.                                       |
| Browser forges a tenant role or workspace claim                  | API resolves current membership inside a workspace/user-scoped transaction; centralized capabilities and forced RLS independently fail closed.                                           |
| Invitation secret leaks to the inviting administrator            | Production issuance returns no raw token; the outbox reconstructs it from a versioned HMAC key and email receipt uses fragment-only memory handling.                                     |
| Invitation is replayed, guessed, or accepted by another account  | Persistence stores only a digest; direct updates are RLS-denied; a settings-bound database function atomically consumes an unexpired token only for the matching verified primary email. |
| Revoked invitation still sends                                   | Revocation atomically terminalizes an unprocessed outbox row; acceptance independently checks current invitation state.                                                                  |
| Admin escalates itself or manages a peer                         | Admin cannot invite/promote admin, manage admin/owner, transfer ownership, or delete a workspace; owner-only paths remain separate.                                                      |
| Tenant loses its final owner                                     | Serialized membership checks reject final-owner demotion/removal; transfer is an explicit atomic transition.                                                                             |
| Removed member reuses a stale session or authoring grant         | Removal and material downgrade revoke normal sessions, activation grants, and authoring sessions in the same transaction.                                                                |
| Workspace-creation abuse or destructive deletion                 | Per-user advisory serialization, five-active-owned-workspace quota, source/user throttles, soft deletion, and a 30-day retention window.                                                 |
| Tenant history is rewritten                                      | Runtime privileges and RLS allow audit insert/select only; update/delete are denied and behaviorally tested.                                                                             |
| Remember-me checkbox is cosmetic                                 | The submitted choice selects a persisted server duration policy; standard sessions use session cookies and shorter idle/absolute bounds.                                                 |
| Password changes but stale credentials survive                   | Credential CAS, session rotation, recovery/email-proof invalidation, and the durable security event commit atomically.                                                                   |
| Email-change link is stolen or replayed                          | Independent purpose-bound HMAC proofs are hash-stored, expire, work once, require both addresses, and are removed from browser history before rendering.                                 |
| Email change takes over another account                          | Completion rechecks normalized-email uniqueness transactionally and never links identities by a matching email claim.                                                                    |
| Session revocation lacks forensic evidence                       | Revoke-one and revoke-all append immutable account security events in the same transaction as session revocation.                                                                        |
| Device view becomes passive tracking                             | Only coarse privacy-reviewed labels are retained; the account session view stores no IP address or raw user-agent string.                                                                |
| Account deletion strands a tenant or leaves access alive         | Final-owner deletion fails; successful soft deletion atomically revokes normal sessions, authoring access, recovery material, and pending account mail.                                  |
| Retention cleanup deletes an active account                      | Cleanup selects only explicitly soft-deleted users whose retention deadline is past, in bounded batches, with restricted-role behavior tests.                                            |
| Account export leaks credentials or secrets                      | The allowlisted export includes profile, verified addresses, identity metadata, and memberships only—never hashes, tokens, sessions, or rate limits.                                     |
| Passkey assertion is replayed or its counter races               | Purpose-bound five-minute challenges are hash-stored and consumed once; credential counter CAS, session creation, identity activity, and audit append commit atomically.                 |
| Passkey is accepted for the wrong Lodariq surface                | Deployment config binds one exact HTTPS dashboard origin to an RP ID equal to its host; API, editor iframe, CDN, customer, and `lodariq.com` origins are rejected.                       |
| Disabled passkey identity remains usable                         | Credential lookup joins active identities and non-deleted users; unlink deletes the public credential and revokes sessions.                                                              |
| Recovery code is exposed, replayed, or activated unintentionally | Only normalized digests persist; the ten-code set requires recent auth and explicit confirmation, and consumption is single-use CAS with generic failure.                                |
| Recovery method silently bypasses workspace MFA                  | Recovery creates AAL1 only; workspace selection and control-plane authorization independently enforce the stored minimum assurance on every request.                                     |
| Browser or session rotation invents a stronger assurance         | Method, AAL, identity, and authentication time are server-owned session facts; rotation preserves them and centralized rank checks fail closed.                                          |
| OIDC callback is forged, replayed, or swapped between providers  | Exact callback URIs, 256-bit state and nonce, S256 PKCE, AES-GCM attempt/provider binding, forced-RLS state lookup, and consume-before-exchange make every callback single-use.             |
| Provider email silently takes over or merges another account     | Authentication resolves canonical issuer plus subject. Sign-up rejects normalized-email collisions and linking requires a recent authenticated Lodariq session.                         |
| Malicious discovery metadata causes token/JWKS SSRF               | Google and Microsoft authorization, token, issuer, and JWKS endpoints are fixed reviewed constants; arbitrary discovery URLs are not accepted.                                            |
| Provider token or callback secret reaches logs or persistence     | The BFF removes callback parameters after server exchange, API logging redacts code/state fields, and the repository stores only hashes plus an authenticated encrypted PKCE/nonce envelope. |
| Authoring popup bypasses tenant or identity policy                | Popup and dashboard use the same first-party AuthForm, dashboard callback, opaque Lodariq cookie, session repository, and workspace authorization path.                                  |
| Workspace owner self-certifies an untested SSO connection         | Owner creation leaves the connection validation-required; only the dedicated validator role can append matching real-tenant evidence and activate it.                                  |
| Validator capability leaks into the normal API                    | Runtime preflight rejects the validator URL; the app role has no evidence mutation privilege and RLS additionally requires the exact validator database role.                           |
| Enterprise discovery becomes account enumeration                 | Discovery is source-rate-limited and returns only routing metadata for a DNS-verified domain, independent of user or membership existence.                                               |
| DNS proof is replayed from an attacker-controlled domain          | DNS lookup uses the pending server-owned record name, not a browser-supplied domain, and atomic consumption matches the stored proof digest and exact workspace/domain id.               |
| Enterprise OIDC discovery causes SSRF or issuer substitution      | Supported Okta/Entra issuer hosts are allowlisted, HTTPS and default ports are required, redirects fail, discovered issuer must match exactly, and endpoints stay on reviewed hosts.     |
| Company-domain or provider email silently links an account        | DNS verification controls routing only; stable connection/issuer/subject/external principal controls identity, and any existing email collision requires administrator reconciliation.  |
| Consumer OIDC or password bypasses required enterprise SSO        | Workspace selection, every control-plane decision, and creator-popup approval require an active principal bound to the exact validated connection in addition to method/AAL checks.     |
| JIT bypasses invitation-only policy or grants owner               | Provisioning mode is stored per connection; invitation-only requires a current invitation, and IdP/SCIM mappings allow only admin, member, or viewer.                                    |
| Stolen or overpowered SCIM token exposes the directory            | Only a digest persists; tokens are shown once and revocable, lookup requires an exact bounded filter, bulk is disabled, schemas are strict, and writes stay connection-scoped.            |
| SCIM deprovisioning leaves stale access                           | Membership removal plus normal-session, authoring-grant, and authoring-session revocation commit atomically; disabled connections/tokens fail closed immediately.                       |
| Break-glass becomes a password fallback or replay path            | It requires two distinct owners with recent AAL2 non-password sessions, expires in 15 minutes, is request/workspace-bound, is single-use, and changes policy only.                       |
| Enterprise audit or telemetry leaks provider secrets or PII       | Audit events are append-only and metadata is allowlisted; operations emit correlation and opaque ids, never credentials, callback material, email/domain claims, or SCIM payloads.      |

## Phase-change review rule

Every later identity, onboarding, tenant-admin, session, passkey, OAuth/OIDC, SSO,
or SCIM phase must update this model with its new issuer, callback, provisioning,
assurance, recovery, and deprovisioning boundaries before its release gate can
pass.
