# 0031. First billing, residency, and warehouse providers

- Status: Accepted for adapter implementation
- Date: 2026-08-23
- PRD references: §1.11, §3.3, §10.2, §17.3, §20
- Related: ADR 0010 (secrets management), ADR 0011 (tenant isolation), ADR 0012 (deferred vendor triggers)

## Context

The control plane already has provider-neutral boundaries for commercial
billing, data-residency execution, and analytics warehouse delivery. H2 cannot
be closed by constructing arbitrary clients from environment variables: the
provider choices determine webhook formats, regional guarantees, credential
ownership, and the operational failure model.

The repository also has two different documents with billing language. The
refined PRD names Stripe as the baseline, while the pricing cost-model names
Paddle as a financial scenario. Stripe is not a deployable first choice for a
seller operating from Palestine, so seller-jurisdiction availability is a hard
constraint on the initial adapter.

## Decision

### Billing: Paddle first; PayPro Global fallback

Paddle is the first `CommercialBillingProvider` implementation target. It owns
checkout, customer portal, subscription/invoice webhooks, signature
verification, tax handling where applicable, and aggregated metered usage
submission. Lodariq remains the authority for workspace entitlements and plan
snapshots; Paddle facts are accepted only through verified, replay-protected
provider events.

Paddle must pass account approval plus a real end-to-end checkout and webhook
test for Lodariq's seller jurisdiction and Palestine buyer flows before billing
is enabled. If Paddle rejects that account or flow, PayPro Global is the
fallback adapter. PayPro's IP-allowlisted API becomes a rollout prerequisite,
so its use requires a stable approved egress arrangement for the Fly
deployment.

The adapter uses deployment-scoped provider credentials and webhook secrets. It
must never put provider credentials, raw provider payloads, or customer payment
data in workspace rows, browser responses, logs, or URLs.

### Residency: regional Neon projects plus jurisdictioned Cloudflare R2

The primary regional data plane is one Neon PostgreSQL project per supported
residency route (`primary-us`, `primary-eu`, and a future `primary-apac`), with
Fly API/worker placement in the corresponding region. A residency migration
copies, verifies, and cuts over the complete tenant data route using the
existing evidence and compare-and-swap contracts.

Customer-owned and generated objects use Cloudflare R2 buckets created with an
explicit jurisdiction where one exists. EU and US object residency are
supported by jurisdictioned R2 buckets. APAC is not advertised as a guaranteed
residency option until the object provider and deployment topology provide a
contractual APAC boundary; a location hint alone is not sufficient.

The residency adapter is therefore a Lodariq-owned orchestration adapter over
regional Neon and R2 resources, not a generic "copy any URL" capability. It
stores only route references and value-free digests/counts in evidence rows.

### Warehouse: BigQuery first, Snowflake later

BigQuery is the first `AnalyticsWarehouseProvider` implementation because it
provides a regional dataset boundary and a bounded server-side ingestion API
without adding a database service to Lodariq's control plane. The adapter uses
workspace-owned dataset mappings and credential references, batches the
versioned warehouse contract, and honors the existing idempotency key.

Snowflake remains the next adapter for enterprise demand. ClickHouse remains
deferred as required by the PRD; it is not introduced merely to make warehouse
sync appear complete.

## Consequences

- H2 now has an explicit vendor target, but the features remain fail-closed
  until the corresponding adapter and environment credentials are present.
- No provider client belongs in the dashboard, SDK runtime, or customer page.
- Each environment and residency route gets separate credentials and data
  resources; provider secrets are never shared between Development, Staging,
  and Production.
- The refined PRD's Stripe baseline is superseded for the first billing
  adapter by the seller-jurisdiction constraint; the pricing model's Paddle
  assumption is now aligned with the implementation target.
- A new adapter requires a new decision or an amendment covering verification,
  regional guarantees, idempotency, retries, and deletion/erasure behavior.
