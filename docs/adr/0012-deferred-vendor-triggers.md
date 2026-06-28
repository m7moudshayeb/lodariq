# 0012. Build-vs-buy triggers for deferred vendors

- Status: Accepted
- PRD references: §12.1, §12.2, §19 (open decision 8), §20

## Context

Adding infrastructure too early is a primary failure mode. Several vendors are
deliberately deferred and need explicit trigger conditions.

## Decision

Defer these until a concrete trigger appears:

- **Redis / queue**: introduce only when a real async job exists (compilation,
  screenshots, exports, webhooks). Then prefer self-hosted Redis/Valkey on
  Fly.io (or Upstash on a fixed plan) for BullMQ; every job is idempotent.
  Move to Cloudflare Queues / SQS / Temporal only when durability, throughput,
  or cost demands it.
- **Dedicated log aggregation** (Axiom or self-hosted Loki/Grafana): defer until
  Sentry + structured logs are insufficient.
- **Internal product analytics** (PostHog): dogfood the event pipeline first.
- **ClickHouse**: only when PostgreSQL analytics becomes a bottleneck.

## Consequences

- No Redis, log aggregation, separate analytics vendor, or ClickHouse before a
  real need (§20).
- Each trigger is revisited as its precondition is met.
