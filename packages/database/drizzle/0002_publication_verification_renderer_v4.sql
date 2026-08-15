-- lodariq-shared-env-destructive-migration-signoff: Mahmoud Shayeb / 2026-08-14 / explicit approval in the Codex tour-authoring CI repair task
-- Renderer-v3 verification evidence is append-only and remains valid. New writes use renderer v4.

begin;

alter table publication_verifications
  drop constraint publication_verifications_report_json_check;

alter table publication_verifications
  add constraint publication_verifications_report_json_check
  check (
    jsonb_typeof(report_json) = 'object'
    and report_json->>'schemaVersion' = '1'
    and report_json->>'rendererContractVersion' in ('3', '4')
    and jsonb_typeof(report_json->'checks') = 'array'
    and jsonb_array_length(report_json->'checks') between 1 and 13
    and (
      (result = 'failed' and report_json->>'status' = 'failed')
      or
      (result = 'passed' and report_json->>'status' in ('passed', 'warning'))
    )
  ) not valid;

alter table publication_verifications
  validate constraint publication_verifications_report_json_check;

commit;
