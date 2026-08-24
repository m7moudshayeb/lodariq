# Commercial validation plan

Status: internal hypothesis tracker · not customer-facing
Last updated: 2026-08-22

The repository contains packaging and cost hypotheses, not an approved price
sheet. This plan turns the Milestone 4 commercial gate into evidence that can
be reviewed before any marketing or sales claim is published.

## Decisions that are currently open

| Decision                              | Current repository material                                                                                                               | What must be measured or approved                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Self-serve prices and annual discount | [`plan-features.md`](../product-design/plan-features.md) and [`positioning-and-pricing.md`](../product-design/positioning-and-pricing.md) | Design-partner price testing and at least three observed paid quotes or pilots                       |
| Enterprise floor                      | Pricing research explicitly withdraws invented floors                                                                                     | First enterprise conversations, procurement scope, implementation/support cost, and owner approval   |
| Engaged-user allowances               | Proposed packaging defines the metric but no production meter is a commercial truth                                                       | Define an impression/engagement event, measure volume and cost, and approve soft-overage behavior    |
| AI action costs and credits           | Cost model and feature table contain placeholders                                                                                         | Per-action provider/infrastructure cost, regeneration rate, margin floor, and approved credit policy |
| Wildcard origins                      | Exact-origin policy is the current safe default                                                                                           | Separate ADR, tenant/DNS/certificate design, abuse review, and tests before offering it              |
| Support and onboarding tiering        | Proposed support rows are documented as hypotheses                                                                                        | Actual staffing, response-time measurements, escalation coverage, and approved service language      |

## Validation sequence

1. Recruit 8–12 design partners that match the intended PMM buyer and record
   segment, current alternative, application count, engaged-user estimate,
   creator count, and procurement constraints.
2. Run the four Van Westendorp questions for each proposed tier, then quote at
   least three partners at the proposed Growth price. Record objections and
   whether a paid pilot or signature follows; do not treat survey interest as
   willingness to pay.
3. Run the cost model with measured analytics volume, artifact delivery,
   support minutes, and AI calls:

   ```bash
   node docs/product-design/cost-model.mjs --sensitivity
   ```

   Replace estimates only after recording the measurement source and date.

4. Build an AI action ledger for Ask Lodariq, copy suggestions, translation,
   narration, and other enabled actions. Record input size, provider/model,
   retries, cache hit rate, unit cost, and customer-visible credit consumption.
5. Keep exact-origin packaging as the default while wildcard-origin research is
   reviewed. A customer request alone is not authorization to weaken origin
   isolation.
6. Have product, finance, support, security, and legal review the resulting
   claims together. Publish only the rows with an evidence link and an approval
   date.

## Partner interview record

Use one redacted record per partner. Do not store customer secrets or raw
production data here.

| Field                               | Value |
| ----------------------------------- | ----- |
| Partner / segment                   | TBD   |
| Interview date / owner              | TBD   |
| Current alternative and spend       | TBD   |
| Applications / engaged users        | TBD   |
| Creator seats / support expectation | TBD   |
| Price test results                  | TBD   |
| Paid quote or pilot outcome         | TBD   |
| Main objection / recovery action    | TBD   |
| Evidence link                       | TBD   |

## Approval record

| Area                       | Owner | Reviewer | Approved claim     | Evidence link  | Date |
| -------------------------- | ----- | -------- | ------------------ | -------------- | ---- |
| Prices and annual discount | TBD   | TBD      | None               | TBD            | Open |
| Enterprise floor           | TBD   | TBD      | None               | TBD            | Open |
| AI credits                 | TBD   | TBD      | None               | TBD            | Open |
| Engaged-user definition    | TBD   | TBD      | None               | TBD            | Open |
| Wildcard-origin policy     | TBD   | TBD      | Exact origins only | ADR/policy TBD | Open |
| Support commitments        | TBD   | TBD      | None               | TBD            | Open |

Until this table is approved, `plan-features.md` and pricing research remain
internal planning material and must not be copied into public claims.
