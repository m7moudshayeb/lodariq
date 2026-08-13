-- lodariq-shared-env-destructive-migration-signoff: Mahmoud Shayeb / 2026-08-13 / explicit approval in the Codex staging deployment thread
-- Staging inspection immediately before approval found zero publication_verifications rows.

begin;

alter table publication_verifications
  drop constraint publication_verifications_report_json_check;

alter table publication_verifications
  add constraint publication_verifications_report_json_check
  check (
    jsonb_typeof(report_json) = 'object'
    and report_json->>'schemaVersion' = '1'
    and report_json->>'rendererContractVersion' = '3'
    and jsonb_typeof(report_json->'checks') = 'array'
    and jsonb_array_length(report_json->'checks') between 1 and 13
    and (
      (result = 'failed' and report_json->>'status' = 'failed')
      or
      (result = 'passed' and report_json->>'status' in ('passed', 'warning'))
    )
  );

commit;
