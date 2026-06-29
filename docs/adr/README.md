# Architecture Decision Records

ADRs capture the load-bearing decisions locked in **Phase -1** (PRD §16.0) before
broad code generation. Each record is short and traceable back to the PRD.

| #                                                   | Decision                                                        | Status   |
| --------------------------------------------------- | --------------------------------------------------------------- | -------- |
| [0001](0001-runtime-authoring-package-split.md)     | Physical `sdk-runtime` vs `sdk-authoring` split                 | Accepted |
| [0002](0002-schema-and-compiler-ownership.md)       | `@lodariq/schema` + `@lodariq/compiler` shared isomorphic core    | Accepted |
| [0003](0003-server-side-publication-compilation.md) | Real publications compiled server-side; browser is preview-only | Accepted |
| [0004](0004-authoring-editor-boundary.md)           | Lexical confined to `sdk-authoring/src/editor`                  | Accepted |
| [0005](0005-iframe-bridge.md)                       | Versioned iframe `postMessage` bridge (no WebSockets early)     | Accepted |
| [0006](0006-origin-model.md)                        | Dedicated origins for editor, demos, dashboard, API, CDN        | Accepted |
| [0007](0007-dnd-approach.md)                        | Drag-and-drop approach for editor blocks                        | Proposed |
| [0008](0008-resolver-strategy.md)                   | Confidence-scored semantic resolver                             | Accepted |
| [0009](0009-local-test-harness.md)                  | Fixture-host + Vitest/Playwright as the test surface            | Accepted |
| [0010](0010-secrets-management.md)                  | Single secrets manager (Doppler/Infisical)                      | Proposed |
| [0011](0011-tenant-isolation-rls.md)                | `workspaceId` scoping + PostgreSQL RLS                          | Accepted |
| [0012](0012-deferred-vendor-triggers.md)            | Build-vs-buy triggers for Redis, logs, analytics                | Accepted |

See [0000-template.md](0000-template.md) for the format.
