# Lodariq — Plan Comparison

Status: proposal · Date: 2026-08-17
**Single source for packaging.** Supersedes every partial table in `positioning-and-pricing.md`.
Costing: `cost-model.mjs`. Prices are unvalidated placeholders until design partners test them.

**Status column** is from a scan of `packages/sdk-authoring/src`, not from testing:
**Live** = implemented · **Partial** = exists but incomplete · **Planned** = not in code yet.

---

## Included in every plan, including Free

Not features — the product. None of it is ever gated, at any price.

**Authoring:** your product is the canvas · rich content editor (text, headings, lists, callouts, stats,
media, video with captions, icons, buttons, form fields) · contextual toolbar and inspector · placement
compass · 8-edge resize · filmstrip and reorder · Editing ⇄ Browsing · preview as user.

**Reliability:** semantic targeting with no CSS and no selectors · live match count · plain-language
breadcrumb · automatic page freeze · disambiguation chooser · three verification states · approach
recipes · drift detection and repair proposals.

**Quality:** WCAG AA contrast gate · pre-publish Check report · 44×44 targets, keyboard operability,
screen-reader support.

**Experience types:** tour, announcement, hotspot, checklist, survey — all types, all plans. Volume is
gated; capability is not.

---

## The comparison

|                                                |  Free  |    Starter     |     Growth     |  Scale   |  Business  | Enterprise | Status      |
| ---------------------------------------------- | :----: | :------------: | :------------: | :------: | :--------: | :--------: | :---------- |
| **Price / month**                              | **$0** |    **$99**     |    **$349**    | **$899** | **$1,900** | **quote**  |             |
| Annual, per month (−15%)                       |   —    |      $84       |      $297      |   $764   |   $1,615   |   custom   |             |
| **── Limits ──**                               |        |                |                |          |            |            |             |
| Engaged users / month                          | 1,000  |     15,000     |     75,000     | 300,000  | 1,000,000  |   custom   | Planned     |
| Live experiences                               |   3    |       15       |       60       |    ∞     |     ∞      |     ∞      | Live        |
| Creator seats                                  |   1    |       3        |       10       |    ∞     |     ∞      |     ∞      | Live        |
| Applications                                   |   1    |       1        |       3        |    10    |     ∞      |     ∞      | Partial     |
| Locales                                        |   1    |       2        |       10       |    ∞     |     ∞      |     ∞      | Partial     |
| Environments                                   |   1    | staging + prod |   +1 custom    |    ∞     |     ∞      |     ∞      | Live        |
| Asset size limit                               | 5 MiB  |     5 MiB      |     5 MiB      |  25 MiB  |   25 MiB   |   custom   | Live        |
| Remove Lodariq badge                           |   —    |       ●        |       ●        |    ●     |     ●      |     ●      | Planned     |
| **── Content & interaction ──**                |        |                |                |          |            |            |             |
| Named step styles — copy, paste, apply to many |   —    |       ●        |       ●        |    ●     |     ●      |     ●      | Live        |
| Multiple themes per workspace                  |   —    |       —        |       ●        |    ●     |     ●      |     ●      | Partial     |
| **Form field response capture**                |   —    |       —        |       ●        |    ●     |     ●      |     ●      | **Planned** |
| **Branching & conditional paths**              |   —    |       —        |       ●        |    ●     |     ●      |     ●      | Live        |
| **── Flow & delivery ──**                      |        |                |                |          |            |            |             |
| **Flow map** — visual sequence and branches    |   —    |       ●        |       ●        |    ●     |     ●      |     ●      | Live        |
| Scheduling — start / end dates                 |   —    |       ●        |       ●        |    ●     |     ●      |     ●      | Live        |
| Audience segmentation by attribute             |   —    |       —        |       ●        |    ●     |     ●      |     ●      | Live        |
| Custom user attributes                         |   —    |       —        |       ●        |    ●     |     ●      |     ●      | Partial     |
| Event-based triggers                           |   —    |       —        |       ●        |    ●     |     ●      |     ●      | Partial     |
| **A/B testing across arms**                    |   —    |       —        |       ●        |    ●     |     ●      |     ●      | **Planned** |
| Batch operations across experiences            |   —    |       —        |       ●        |    ●     |     ●      |     ●      | Live        |
| **── Analytics ──**                            |        |                |                |          |            |            |             |
| Completions, drop-off, dismissals              |   ●    |       ●        |       ●        |    ●     |     ●      |     ●      | Partial     |
| Retention window                               | 7 days |    30 days     |     12 mo      |  24 mo   |   24 mo    |   36 mo    | Planned     |
| **Adoption impact** — declared success events  |   —    |       —        |       10       |    50    |     ∞      |     ∞      | **Planned** |
| Form response analytics                        |   —    |       —        |       ●        |    ●     |     ●      |     ●      | **Planned** |
| Segment results by audience                    |   —    |       —        |       ●        |    ●     |     ●      |     ●      | Planned     |
| Funnel across a sequence                       |   —    |       —        |       ●        |    ●     |     ●      |     ●      | Planned     |
| A/B arm comparison                             |   —    |       —        |       ●        |    ●     |     ●      |     ●      | Planned     |
| Cohort / retention curves                      |   —    |       —        |       —        |    ●     |     ●      |     ●      | Planned     |
| CSV export                                     |   —    |       —        |       —        |    ●     |     ●      |     ●      | Planned     |
| Warehouse sync — Snowflake, BigQuery           |   —    |       —        |       —        |    —     |     ●      |     ●      | Planned     |
| Raw event export                               |   —    |       —        |       —        |    —     |     ●      |     ●      | Planned     |
| Full-app session replay                        | never  |     never      |     never      |  never   |   never    |   never    | Excluded    |
| **── AI ──**                                   |        |                |                |          |            |            |             |
| Credits / month                                |   50   |      300       |     1,500      |  5,000   |   15,000   |   pooled   | Planned     |
| **Copy assist** — rewrite verbs, draft step    |   —    |       ●        |       ●        |    ●     |     ●      |     ●      | Live        |
| Ask Lodariq — scoped edits                     |   —    |       —        |       ●        |    ●     |     ●      |     ●      | Partial     |
| **AI auto-translate**                          |   —    |       —        |       ●        |    ●     |     ●      |     ●      | Partial     |
| **AI voice / narration**                       |   —    |       —        |       —        |    ●     |     ●      |     ●      | Partial     |
| Voice cloning                                  |   —    |       —        |       —        |    —     |     —      |     —      | Not offered |
| **AI brand theme generation**                  | 1 run  |       ●        |       ●        |    ●     |     ●      |     ●      | **Planned** |
| Predictive layout QA                           |   —    |       ●        |       ●        |    ●     |     ●      |     ●      | Live        |
| **── Release & governance ──**                 |        |                |                |          |            |            |             |
| Publish, verify, promote, rollback             |   —    |       ●        |       ●        |    ●     |     ●      |     ●      | Live        |
| **Version history**                            | 7 days |    30 days     |     12 mo      |    ∞     |     ∞      |     ∞      | Live        |
| **Recovery** — restore, orphaned assets        |   —    |       ●        |       ●        |    ●     |     ●      |     ●      | Live        |
| Drift alerts — email / webhook                 |   —    |       ●        |       ●        |    ●     |     ●      |     ●      | Partial     |
| **Review & approval workflow**                 |   —    |       —        |       ●        |    ●     |     ●      |     ●      | Live        |
| Required production approval                   |   —    |       —        |       —        |    ●     |     ●      |     ●      | Partial     |
| Audit log                                      |   —    |       —        |       —        |    ●     |     ●      |     ●      | Planned     |
| Change history export                          |   —    |       —        |       —        |    —     |     ●      |     ●      | Planned     |
| **── Collaboration ──**                        |        |                |                |          |            |            |             |
| Presence — who's on which step                 |   —    |       —        |       ●        |    ●     |     ●      |     ●      | Planned     |
| Step-level locks + conflict resolution         |   —    |       —        |       —        |    ●     |     ●      |     ●      | Planned     |
| Comments on steps                              |   —    |       —        |       —        |    ●     |     ●      |     ●      | Planned     |
| **── Security & platform ──**                  |        |                |                |          |            |            |             |
| Roles — member, admin, owner                   |   —    |       ●        |       ●        |    ●     |     ●      |     ●      | Live        |
| **SSO — SAML / OIDC**                          |   —    |       —        |       ●        |    ●     |     ●      |     ●      | Live        |
| SCIM provisioning                              |   —    |       —        |       —        |    —     |     ●      |     ●      | Planned     |
| Custom roles, per-environment permissions      |   —    |       —        |       —        |    —     |     ●      |     ●      | Planned     |
| API + webhooks                                 |   —    |       —        |       ●        |    ●     |     ●      |     ●      | Partial     |
| Data residency                                 |   —    |       —        |       —        |    —     |     —      |     ●      | Planned     |
| DPA, security review, custom terms             |   —    |       —        |       —        |    —     |     ●      |     ●      | —           |
| Uptime SLA                                     |   —    |       —        |       —        |    —     |     —      |     ●      | —           |
| **── Support ──**                              |        |                |                |          |            |            |             |
| Docs, community, AI help                       |   ●    |       ●        |       ●        |    ●     |     ●      |     ●      | —           |
| Email support                                  |   —    |     async      | 1 business day | 8 hours  |  4 hours   |    SLA     | —           |
| Onboarding session                             |   —    |       —        |       —        |    ●     |     ●      |     ●      | —           |
| Named contact / CSM                            |   —    |       —        |       —        |    —     |     —      |     ●      | —           |

---

## Definitions

**Engaged user** — a person actually _shown_ an experience this month. Not everyone who logged in. Soft
overage: nothing breaks, you're notified, any upgrade starts next cycle, never retroactively.

**Live experience** — published and currently serving, counted as a _stock_ at any moment. Not monthly,
not lifetime. Archive one and the slot frees instantly.

| Consumes a slot?                  |                         |
| --------------------------------- | ----------------------- |
| Published and serving             | **Yes**                 |
| Draft, archived or paused         | No                      |
| Prior versions in release history | No                      |
| Same tour in 5 locales            | **No — one experience** |
| Two arms of an A/B test           | **No — one experience** |
| Live on staging _and_ production  | No                      |

Hitting the cap blocks the next _publish_ only. Nothing already live ever stops serving.

**Application** — one product your customers use, defined as _one brand theme plus one content library_.
Not a hostname, not an environment.

|                                         | Counts as                     |
| --------------------------------------- | ----------------------------- |
| `app.acme.com` + `staging.acme.com`     | 1 — environments are separate |
| Acme CRM + Acme Analytics               | 2                             |
| `eu.` + `us.` subdomains of one product | 1                             |
| 500 white-label tenant subdomains       | **1**                         |

---

## What has to be built before this plan can ship

Six rows carry real commercial weight and are **Planned**, not Live:

1. **Engaged-user metering** — the billing dimension itself. Nothing meters today.
2. **Adoption impact** (declared success events) — the single feature that justifies Growth over Starter.
3. **Form field response capture** — fields render, but nothing captures what users submit. A form you
   can't read is not a feature.
4. **A/B testing** — priced into Growth, does not exist.
5. **AI brand theme generation** — priced from Free, does not exist. The in-page style sampler exists;
   the two-variant generation on top of it does not.
6. **Analytics beyond completions** — retention windows, funnels, cohorts, export.

**Do not publish a pricing page listing these until they exist.** Everything else on the table is Live or
Partial and can be sold today.

---

## Never gated, as policy

These will come under commercial pressure. The answer is no each time.

1. **Reliability** — targeting, verification, approach recipes, drift repair. A free user's tour breaking
   silently makes the central claim false.
2. **No-code** — no "advanced targeting" tier requiring selectors, no CSS escape hatch as an upgrade.
3. **Accessibility** — contrast gate, tap targets, keyboard operability.
4. **Evidence it worked** — every tier sees completions and drop-off. Gate that and customers churn
   instead of upgrading.
5. **Experience types** — all of them, everywhere.

---

## Open

- Every price is a placeholder. Validate with design partners before publishing.
- AI credit costs per action are unset pending a cost model.
- Enterprise floor undecided — derive from your first three enterprise conversations.
- **Wildcard origin support** for white-label applications needs an ADR decision (ADR-0006 / ADR-0015).
  Blocks the first multi-tenant customer.
- Checklist and survey types exist in schema with definitions in `authoring/experiences/built-in.ts`, but
  their editors are thinner than tour's. Verify before advertising them as equals.
