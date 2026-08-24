# Operational launch readiness

Status: in progress · internal working packet · not customer-facing
Last updated: 2026-08-22

This packet is the repository-side tracker for Milestone 4. It prevents local
implementation evidence from being mistaken for legal approval, production
availability, staffed support, or commercial validation. A gate may move to
`Complete` only when the named owner attaches dated external evidence.

## Gate matrix

| Gate                         | Repository support already available                                                                                                                        | External evidence still required                                                                                                                | Owner                      | State                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------- |
| DPA and custom terms         | Data-minimization guardrails, origin model, tenant isolation, retention boundaries, and the manual validation handoff                                       | Approved DPA, subprocessors/data-flow schedule, transfer terms, custom-terms review, and approval date                                          | Legal · TBD                | Blocked on review                     |
| Security review package      | Authentication threat model, security ADRs, exact-origin bridge, immutable artifacts, redaction, RLS migrations, capability checks, and focused local tests | Independent or named security review, isolated/live RLS evidence, deployment/secrets review, vulnerability disposition, and sign-off            | Security/engineering · TBD | Code evidence ready; external pending |
| Availability and SLA         | Fly deployment runbook, health/probe scripts, release CAS, rollback, unpublish, and recovery procedures                                                     | Production measurement window, exclusions, incident rehearsal, recovery result, supported-region scope, and approved Enterprise SLA             | Infrastructure · TBD       | Draft                                 |
| Support commitments          | Product support boundaries, deployment/auth recovery runbooks, guides, and failure-state contracts                                                          | Staffed queue, escalation owner, response-time measurements, coverage calendar, and approved public support language                            | Support/product · TBD      | Draft                                 |
| Documentation and onboarding | Authoring/release, localization, rich-content, page-cost, and deployment guides                                                                             | Reviewed onboarding session, concise customer docs, implementation checklist, and CSM handoff owner                                             | Product/CSM · TBD          | Draft                                 |
| Commercial packaging         | Plan comparison, cost model, feature-capability inventory, and exact-origin policy                                                                          | Design-partner interviews, paid quotes/pilots, observed support/usage costs, Enterprise floor decision, AI action costs, and packaging approval | Product/PMM · TBD          | Hypotheses only                       |

## Evidence record

Every external record linked from this packet must include:

- gate and environment;
- operator and reviewer;
- timestamp and repository revision or deployed artifact hash;
- exact command, request, scenario, or customer-research instrument;
- result, exclusions, and unresolved follow-ups;
- a redacted link to the supporting report.

Do not put credentials, customer values, raw tokens, private URLs, or raw
database exports into evidence attachments.

## Launch claim rules

- Local tests prove implementation behavior only; they do not prove production
  uptime, tenant isolation on a shared deployment, email delivery, or an SLA.
- Draft prices, engaged-user allowances, AI credits, Enterprise floors, and
  support times remain hypotheses until the commercial owner approves measured
  evidence. Keep them out of public pricing and sales claims.
- The current security posture is exact-origin by default. A wildcard origin is
  not a packaging shortcut; it requires a reviewed threat model, explicit
  tenant mapping, certificate/DNS plan, and regression coverage before it can be
  offered.
- Production enablement remains separate from this packet. The deployment
  runbook and manual validation handoff are prerequisites, not completion
  evidence.

## Owner completion record

| Gate                         | Owner | Reviewer | Evidence link | Decision/date |
| ---------------------------- | ----- | -------- | ------------- | ------------- |
| DPA and custom terms         | TBD   | TBD      | TBD           | Open          |
| Security review package      | TBD   | TBD      | TBD           | Open          |
| Availability and SLA         | TBD   | TBD      | TBD           | Open          |
| Support commitments          | TBD   | TBD      | TBD           | Open          |
| Documentation and onboarding | TBD   | TBD      | TBD           | Open          |
| Commercial packaging         | TBD   | TBD      | TBD           | Open          |

## Related material

- [Security review evidence package](security-review-evidence-package.md)
- [Commercial validation plan](commercial-validation-plan.md)
- [Manual and external validation handoff](../handoffs/manual-and-external-validation.md)
- [Phase 1 Fly deployment runbook](../deployment/phase-1-fly.md)
- [Authoring and release guide](../guides/authoring-and-release.md)
