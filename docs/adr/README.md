# Architecture Decision Records

ADRs capture Lodariq's load-bearing architecture decisions. Records 0001-0012
began with the Phase -1 foundation; later accepted decisions extend that
foundation without rewriting project history. Each record is traceable to the
PRD.

| #                                                     | Decision                                                         | Status   |
| ----------------------------------------------------- | ---------------------------------------------------------------- | -------- |
| [0001](0001-runtime-authoring-package-split.md)       | Physical `sdk-runtime` vs `sdk-authoring` split                  | Accepted |
| [0002](0002-schema-and-compiler-ownership.md)         | `@lodariq/schema` + `@lodariq/compiler` shared isomorphic core   | Accepted |
| [0003](0003-server-side-publication-compilation.md)   | Real publications compiled server-side; browser is preview-only  | Accepted |
| [0004](0004-authoring-editor-boundary.md)             | Lexical confined to `sdk-authoring/src/editor`                   | Accepted |
| [0005](0005-iframe-bridge.md)                         | Versioned iframe `postMessage` bridge (no WebSockets early)      | Accepted |
| [0006](0006-origin-model.md)                          | Dedicated origins for editor, demos, dashboard, API, CDN         | Accepted |
| [0007](0007-dnd-approach.md)                          | Drag-and-drop approach for editor blocks                         | Proposed |
| [0008](0008-resolver-strategy.md)                     | Confidence-scored semantic resolver                              | Accepted |
| [0009](0009-local-test-harness.md)                    | Fixture-host + Vitest/Playwright as the test surface             | Accepted |
| [0010](0010-secrets-management.md)                    | Single secrets manager (Doppler/Infisical)                       | Proposed |
| [0011](0011-tenant-isolation-rls.md)                  | `workspaceId` scoping + PostgreSQL RLS                           | Accepted |
| [0012](0012-deferred-vendor-triggers.md)              | Build-vs-buy triggers for Redis, logs, analytics                 | Accepted |
| [0013](0013-safe-brand-system.md)                     | Safe semantic Brand System + compiled theme snapshots            | Accepted |
| [0014](0014-environment-document-release-pointers.md) | Per-document environment pointers + exact-artifact promotion     | Accepted |
| [0015](0015-sdk-first-in-product-authoring-entry.md)  | One-install in-product launcher + first-party auth exchange      | Accepted |
| [0016](0016-target-identity-v2.md)                    | Selector-free multi-evidence target identity                     | Accepted |
| [0017](0017-lodariq-owned-authentication.md)          | Owned credentials, recovery, email outbox, sessions, and tenancy | Accepted |
| [0018](0018-localization-boundaries.md)               | Git-first product catalogs + authored-content locale variants    | Accepted |
| [0019](0019-provider-neutral-identity-model.md)       | Provider-neutral identities, identifiers, and session facts      | Accepted |
| [0020](0020-resumable-identity-onboarding.md)         | Server-owned resumable account onboarding                        | Accepted |
| [0021](0021-authoritative-tenant-administration.md)   | Authoritative tenant administration and invitation delivery      | Accepted |
| [0022](0022-account-and-session-security.md)          | Account and session security lifecycle                           | Accepted |
| [0023](0023-passkeys-assurance-and-recovery-codes.md) | Passkeys, session assurance, and recovery codes                  | Accepted |
| [0024](0024-google-and-microsoft-oidc.md)              | Google and Microsoft OIDC with one Lodariq session               | Accepted |
| [0025](0025-enterprise-identity-boundary.md)           | Enterprise OIDC, SCIM, policy, and recovery boundary             | Accepted |

See [0000-template.md](0000-template.md) for the format.
