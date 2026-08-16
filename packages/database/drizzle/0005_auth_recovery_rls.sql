begin;

-- Password-recovery replacement and completion run only after the repository
-- resolves exactly one normalized email and binds its internal user id to the
-- transaction. PostgreSQL requires matching SELECT visibility for UPDATE under
-- RLS; the original update-only policies therefore affected zero prior rows.
-- These policies expose only rows owned by that server-bound user and remain
-- false before the repository establishes the exact internal identity.

do $$
begin
  create policy set_password_challenges_user_lookup
    on set_password_challenges
    for select
    using (
      user_id = current_setting('lodariq.auth_user_id', true)
      and (
        used_at is null
        or used_at = nullif(
          current_setting('lodariq.auth_recovery_mutation_at', true),
          ''
        )::timestamptz
      )
    );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create policy email_verification_challenges_auth_user_lookup
    on email_verification_challenges
    for select
    using (
      user_id = current_setting('lodariq.auth_user_id', true)
      and (
        used_at is null
        or used_at = nullif(
          current_setting('lodariq.auth_recovery_mutation_at', true),
          ''
        )::timestamptz
      )
    );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create policy auth_outbox_auth_user_lookup
    on auth_outbox
    for select
    using (
      user_id = current_setting('lodariq.auth_user_id', true)
      and processed_at is null
      and (
        terminal_at is null
        or terminal_at = nullif(
          current_setting('lodariq.auth_recovery_mutation_at', true),
          ''
        )::timestamptz
      )
    );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create policy set_password_outbox_auth_user_lookup
    on set_password_outbox
    for select
    using (
      user_id = current_setting('lodariq.auth_user_id', true)
      and processed_at is null
      and (
        terminal_at is null
        or terminal_at = nullif(
          current_setting('lodariq.auth_recovery_mutation_at', true),
          ''
        )::timestamptz
      )
    );
exception when duplicate_object then null;
end
$$;

commit;
