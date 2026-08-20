begin;

-- The SDK kill switch (ADR-0027).
--
-- Separate from `revoked_at` on purpose. Revocation retires an installation
-- identity permanently: the snippet on the customer's page stops resolving and
-- a new one has to be issued. Suspension is the reversible version — a pause a
-- customer can flip on when Lodariq looks implicated in a problem on their
-- site, and flip back off once it is cleared, without touching their markup or
-- waiting on one of their deploys.
--
-- Nullable and defaulting to null, so every existing installation stays live.
alter table public_sdk_installations
  add column if not exists suspended_at timestamptz;

-- Suspension is read on the hot bootstrap and eligibility paths, but only ever
-- for a single already-keyed installation row, so no additional index earns its
-- write cost here.

commit;
