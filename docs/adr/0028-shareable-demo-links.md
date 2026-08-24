# ADR 0028: Shareable demos use scoped immutable artifacts on a dedicated origin

- Status: Accepted for Milestone 3
- Date: 2026-08-22
- Scope: Shareable demo links (roadmap 3.7)

## Decision

Shareable demos are delivered from the dedicated public origin
`https://demo.lodariq.io`. A demo link identifies a server-side demo record and
never contains an SDK token, authoring session, bearer credential, signed
payload, customer URL, or customer data. The public handle is only a locator;
the API creates a short-lived, HttpOnly, Secure, SameSite cookie after checking
the link record. The cookie is scoped to the demo origin and is revoked by
deleting or expiring the server-side demo record.

The record pins one already-compiled, immutable publication and the exact
workspace, environment, document, content hash, theme snapshot, renderer
contract, and expiry. Public delivery resolves only that pinned artifact; it
never resolves the active pointer, recompiles a document, proxies a customer
application, or captures/replays customer-page activity.

The artifact is redacted at the structured-document boundary before issuance:
only approved canonical blocks, semantic targets, locale content, and renderer
recipes are included. Customer database values, runtime traits, raw DOM, HTML,
CSS, selectors, coordinates, and URLs are not copied into the demo record.
Analytics use a separate demo scope keyed by the demo record and retain only
bounded events (`viewed`, `step_started`, `completed`, `dismissed`) with no
visitor identity or payload values.

## Access and authorization

- A creator must hold an active authoring session with the explicit share
  capability and must pin the exact publication/content hash when creating a
  link.
- The link is short-lived (5 minutes minimum, 24 hours maximum), revocable,
  and limited to one document, one environment, and one publication.
- Public bootstrap requires the exact `Origin: https://demo.lodariq.io` and a
  valid non-expired record. It issues only the demo-scoped HttpOnly cookie.
- Demo analytics accept only the same demo cookie and the fixed event schema.
- The authenticated dashboard and editor origins never serve a demo page.

## Consequences

This deliberately chooses artifact reuse over a recorded page simulation.
Prospects see the same renderer and copy that passed publication checks, while
the product avoids customer-data capture and the security burden of replaying a
live application. A customer who needs a realistic authenticated environment
must provide an explicitly isolated, scrubbed environment as a separate future
integration; it is not proxied by this feature.

The public handle is discoverable only by possession of the share URL, but it
has no authorization claims and is rate-limited. Authorization is the server
side demo session, never the URL.

## Required tests

- public delivery is rejected on dashboard/editor origins;
- expired and revoked records cannot bootstrap or emit analytics;
- a demo cannot resolve a different workspace, environment, document, or
  publication;
- the URL contains no credential or bearer-token pattern;
- publication bytes and content hash remain unchanged and no compile occurs;
- analytics reject unknown events, identity fields, and out-of-scope cookies.
