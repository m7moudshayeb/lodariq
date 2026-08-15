# Google and Microsoft OIDC rollout

This rollout is disabled by default. Apply migration
`0012_oidc_authorization.sql` to an isolated Neon branch, run the restricted-role
test suite and live RLS verifier, then obtain explicit approval before applying
it to a shared environment.

## Provider registration

Register only the exact callback for the target deployment:

- Development: `https://dev-app.lodariq.io/api/auth/oidc/<provider>/callback`
- Staging: `https://staging-app.lodariq.io/api/auth/oidc/<provider>/callback`
- Production: `https://app.lodariq.io/api/auth/oidc/<provider>/callback`

Do not add wildcard, alternate-domain, localhost, or `lodariq.com` callbacks to
a hosted client. Use distinct provider clients and secrets per environment.

Set `LODARIQ_OIDC_MODE=enabled`, a random secret of at least 32 bytes in
`LODARIQ_OIDC_STATE_SECRET`, and a complete client id, client secret, and exact
redirect URI for each enabled provider. Microsoft also requires
`LODARIQ_MICROSOFT_OIDC_TENANT`; prefer the exact tenant UUID for a tenant-bound
deployment. `organizations`, `consumers`, and `common` are explicit broader
choices, not defaults.

## Verification

For each provider and deployment, verify:

1. dashboard sign-in, sign-up where the provider asserts a verified email,
   cancellation, and a fresh retry;
2. explicit linking from a recently authenticated account and collision with a
   different account;
3. authoring-popup sign-in returns to `/authoring/activate` with the same opaque
   Lodariq cookie and workspace membership checks;
4. callback replay fails and no provider code, ID token, access token, refresh
   token, state, nonce, or PKCE verifier appears in application logs or database
   rows;
5. disabling `LODARIQ_OIDC_MODE` removes provider availability without changing
   existing Lodariq identities or sessions.

Review provider audit logs and Lodariq's correlation-id events during the smoke
test. Roll back by disabling the mode and deploying the preceding application;
leave the additive attempt table in place until the normal retention process
can remove expired rows.
