begin;

-- lodariq-shared-env-destructive-migration-signoff: user-approved / 2026-08-24 / Codex migration task
-- Replace the immutable baseline's 12-capability check with the current
-- authoring-session contract. The transaction preserves the old constraint if
-- the replacement cannot validate existing rows.
alter table authoring_sessions
  drop constraint if exists authoring_sessions_capabilities_check;

alter table authoring_sessions
  add constraint authoring_sessions_capabilities_check
  check (
    capabilities is null
    or (
      jsonb_typeof(capabilities) = 'array'
      and jsonb_array_length(capabilities) between 1 and 13
      and capabilities <@ '["document:approve-production","document:preview","document:promote-production","document:publish-staging","document:read","document:read-release-state","document:rollback","document:schedule-release","brand:sample-product-style","target:select","document:unpublish","document:verify-staging","document:write"]'::jsonb
      and jsonb_array_length(capabilities) = (
        (case when capabilities @> '["document:approve-production"]'::jsonb then 1 else 0 end)
        + (case when capabilities @> '["document:preview"]'::jsonb then 1 else 0 end)
        + (case when capabilities @> '["document:promote-production"]'::jsonb then 1 else 0 end)
        + (case when capabilities @> '["document:publish-staging"]'::jsonb then 1 else 0 end)
        + (case when capabilities @> '["document:read"]'::jsonb then 1 else 0 end)
        + (case when capabilities @> '["document:read-release-state"]'::jsonb then 1 else 0 end)
        + (case when capabilities @> '["document:rollback"]'::jsonb then 1 else 0 end)
        + (case when capabilities @> '["document:schedule-release"]'::jsonb then 1 else 0 end)
        + (case when capabilities @> '["brand:sample-product-style"]'::jsonb then 1 else 0 end)
        + (case when capabilities @> '["target:select"]'::jsonb then 1 else 0 end)
        + (case when capabilities @> '["document:unpublish"]'::jsonb then 1 else 0 end)
        + (case when capabilities @> '["document:verify-staging"]'::jsonb then 1 else 0 end)
        + (case when capabilities @> '["document:write"]'::jsonb then 1 else 0 end)
      )
    )
  );

commit;
