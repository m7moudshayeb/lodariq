# Security review evidence package

Status: internal draft · evidence index, not a security certification
Last updated: 2026-08-22

This index is the engineering packet for the Milestone 4 security review. It
maps repository controls to evidence that a reviewer can reproduce. A passing
local check is recorded as implementation evidence only; deployment, live
database, provider, and legal checks remain open until a named owner records
them.

## Review scope

- Lodariq API and dashboard control plane;
- editor iframe and exact-origin bridge;
- SDK runtime and authoring package boundary;
- canonical schema, compiler, immutable publication artifacts, and demo links;
- PostgreSQL tenant data, RLS policies, migrations, and runtime roles;
- authentication, session, recovery, identity, and enterprise integration
  boundaries;
- deployment configuration, secrets handling, CDN/editor separation, and
  production authoring fail-closed behavior.

## Control-to-evidence index

| Control                                  | Repository evidence                                                                                                                 | Reproducible local check                                                              | External review still required                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Authentication and session secrecy       | `docs/security/authentication-threat-model.md`, ADRs 0017, 0022–0025, memory-only browser grants, redacted support paths            | Auth/API/dashboard focused suites and package typechecks                              | Real provider configuration, email delivery, recovery, OIDC/SCIM tenant validation, and incident rehearsal |
| Tenant isolation and RLS                 | ADR 0011, additive migrations, restricted runtime-role runbook, tenant-scoped repositories                                          | `pnpm run migrations:check`; disposable PostgreSQL/RLS tests where configured         | Fresh isolated baseline, non-owner live RLS report, backup/restore and shared-environment approval         |
| Exact origins and bridge boundary        | ADRs 0005, 0006, 0028; no wildcard `postMessage`; public demo origin separation                                                     | API origin/cookie/revocation tests; dependency-boundary and browser smoke gates       | Deployed DNS/TLS/CORS probes from allowed and forbidden origins                                            |
| Artifact integrity and data minimization | ADR 0003, ADR 0028, canonical schema/compiler, structured demo redaction                                                            | Schema/compiler/API focused tests; content-hash and immutable-publication checks      | Production artifact inspection, cache behavior, retention/deletion review, and privacy/legal approval      |
| Runtime/authoring separation             | ADRs 0001 and 0004; Lexical restricted to authoring editor; runtime has no creator UI by default                                    | Architecture, dependency-boundary, build, and bundle-size gates                       | Inspect prepared production assets and deployed HTML/headers for authoring metadata                        |
| Release mutation safety                  | ADR 0014; capabilities, idempotency, compare-and-swap pointers, append-only history, rollback/unpublish paths                       | Release/recovery/API integration suites and migration checks                          | Staging publish/promote/rollback rehearsal with redacted deployment evidence                               |
| Input and output safety                  | Closed TypeBox contracts, bounded payloads, allowlisted rich content, no raw HTML/CSS/JS/selectors/coordinates in durable contracts | Schema negatives, malformed-input tests, lint, boundaries, and focused feature suites | Penetration review, dependency triage, and production log/telemetry inspection                             |
| Operational recovery                     | Auth/deployment/recovery runbooks and bounded failure diagnostics                                                                   | Runbook dry-run where local fixtures support it                                       | Named incident commander, escalation tree, recovery-time measurement, and postmortem process               |

## Open evidence requests

The reviewer should not close the package until these records exist:

1. isolated database baseline and restricted-role RLS report;
2. deployed staging exact-origin, authoring-isolation, and immutable-artifact
   smoke report;
3. production asset inspection proving no authoring metadata or dependency;
4. secrets, DNS, TLS, backup, retention, and subprocessor inventory review;
5. dependency vulnerability disposition for the exact release artifact;
6. auth-email and enterprise-provider validation where those capabilities are
   enabled;
7. incident and rollback rehearsal with operator, reviewer, timestamps, and
   redacted output.

## Review sign-off

| Role                    | Name | Scope reviewed                            | Decision | Date | Evidence link |
| ----------------------- | ---- | ----------------------------------------- | -------- | ---- | ------------- |
| Engineering owner       | TBD  | Repository controls and local checks      | Open     | TBD  | TBD           |
| Security reviewer       | TBD  | Threat model and release boundary         | Open     | TBD  | TBD           |
| Infrastructure operator | TBD  | Deployment, RLS, secrets, recovery        | Open     | TBD  | TBD           |
| Legal/privacy reviewer  | TBD  | DPA, data flows, retention, subprocessors | Open     | TBD  | TBD           |

No row above is approval by placeholder completion. Replace `TBD` only with a
named reviewer and a redacted evidence link.
