# Enterprise authentication break-glass

This procedure changes workspace authentication policy during an IdP incident.
It does not bypass sign-in, create a session, provision an identity, restore a
membership, or enable an implicit password fallback.

## Preconditions

- The incident is declared and has an opaque incident/correlation reference.
- The workspace has two different active owners.
- Both owners have recent AAL2 sessions established with a non-password method.
- The requested policy change and rollback time are written in the incident
  record. Never put credentials, email addresses, raw tokens, provider claims, or
  customer data in the reason.

If these conditions cannot be met, stop. Restore the IdP/SCIM service or use a
separately reviewed support-recovery process; do not add a temporary API,
database flag, shared password, or manually forged session.

## Procedure

1. Owner A opens Enterprise identity settings and creates a break-glass request
   with a reason of at least 20 characters referencing the incident.
2. Owner B reviews the exact workspace, requested policy, incident, and current
   authentication state. Owner B approves only from a recent AAL2 non-password
   session. The requester cannot self-approve.
3. Owner A applies the minimum policy change needed. The dashboard sends the
   approved request id in `x-lodariq-break-glass-request-id`; it is not a bearer
   credential and is valid only for the requesting owner and workspace.
4. The API atomically consumes the approval and appends both
   `break_glass_consumed` and `workspace_auth_policy_updated`. The approval
   expires after 15 minutes and cannot be replayed.
5. Verify workspace selection, control-plane access, creator-popup authorization,
   and enterprise audit visibility. Confirm no unrelated membership, connection,
   or assurance setting changed.

Password sessions cannot request or approve break-glass. A request cannot lower
the current policy unless the actor already owns a valid non-password AAL2
session and a second owner approves. The resulting policy still applies on every
authorization decision.

## Closeout

After the IdP is healthy:

1. validate enterprise sign-in and SCIM lifecycle in the target environment;
2. restore the approved workspace policy using normal owner controls;
3. revoke incident-created sessions if their continued use is unnecessary;
4. review the append-only request, approval, consumption, and policy-change
   events by correlation id; and
5. close the incident with times, owner ids, policy before/after, and verification
   outcome—never raw credentials or tokens.

Any expired, rejected, or unused request remains audit evidence. Do not delete or
rewrite it during incident cleanup.
