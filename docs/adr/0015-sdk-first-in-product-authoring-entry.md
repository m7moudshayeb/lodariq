# 0015. SDK-first in-product authoring entry

- Status: Accepted
- Date: 2026-08-06
- PRD references: §6.2, §6.2.1, §7.3, §9.1, §9.4, §9.5, §11.1, §12.5, §16.3, §16.4, §20
- Related: ADR 0001, ADR 0005, ADR 0006, ADR 0011, ADR 0017

## Context

Lodariq should require one permanent SDK installation per customer application.
A public installation ID plus the request's exact origin resolves the customer
environment and its permitted runtime policy server-side. A creator who is
already looking at an allowed development or staging product should be able to
authenticate and begin editing there without installing a browser extension,
replacing the runtime snippet, copying a session-specific snippet, or exposing
control-plane credentials to the customer page.

Historical context at acceptance: the SDK and creator paths did not yet provide
that experience. The
ordinary installation embeds an environment bearer token, while the dashboard
creates a short-lived authoring session and renders a separate
`lodariq-creator.js` snippet whose DOM attributes carry that environment token
and an authoring-session bearer. The user must hand the creator snippet to the
customer page. This preserves the runtime/authoring package boundary and blocks
ordinary viewers from authoring, but both the environment-token installation
and separate creator snippet are migration behavior rather than the accepted
entry architecture.

The target flow must also work when third-party cookies are unavailable.
Lodariq-owned authentication belongs on Lodariq's first-party dashboard origin,
while the customer page receives only a narrow, short-lived grant. Production must remain
incapable of entering authoring even if a client payload, URL parameter, or
customer-page script is tampered with.

Implementation amendment (2026-08-07): the authorization request, popup
exchange, lazy creator loading, and dashboard handoff below are implemented and
locally verified as Phase 2 Slice 1. ADR 0017 replaces the transitional account
provider behind the first-party session; deployed/live evidence remains open.

## Decision

### One Permanent SDK Installation

- The application-scoped loader is the only persistent code a customer
  installs. Its public installation ID is revocable configuration identity, not
  a bearer secret, creator identity, delivery grant, or publication capability.
- Each bootstrap request presents that public ID. The server uses the browser's
  exact `Origin` header to resolve exactly one workspace environment and its
  runtime/authoring policy. A missing, disallowed, or ambiguous origin fails
  closed; client-supplied environment names never select or widen the scope.
- Dashboard changes to origin mappings, pipeline order, or authoring policy do
  not require a second snippet or customer code change.
- A browser extension is not a primary or required authoring path. A future
  optional extension must use the same server-issued scopes and cannot bypass
  this flow.
- SDK bootstrap validates the public installation ID and exact request `Origin`,
  resolves the environment server-side, and returns delivery state independently
  from authoring availability. An unpublished environment must still be able to
  begin an authorized first draft.
- An authoring-enabled development or staging bootstrap returns a short-lived,
  exact-origin bootstrap grant for the authorization-request and exchange
  endpoints. That grant is capability-narrow, held only in memory, and is not
  the canonical installation identifier or a reusable delivery credential.
- Resolving the `available` branch does not display creator chrome. The
  framework-free client keeps the launcher hidden until the creator presses
  `Ctrl/⌘ + Shift + L` or arrives through dashboard **Open in product**. The
  dashboard's non-secret URL intent is display intent only and is removed from
  the visible URL; it never substitutes for authorization.
- Bootstrap does not authenticate a creator, create an authoring session, load
  the authoring module, mutate a document, compile a publication artifact, or
  publish.

Use a closed, discriminated bootstrap contract for authoring activation:

```ts
type AuthoringActivationDescriptor =
  | { state: 'disabled' }
  | {
      state: 'available';
      appOrigin: 'https://app.lodariq.io';
      activationUrl: 'https://app.lodariq.io/authoring/activate';
      authorizationRequestUrl: string;
      exchangeUrl: string;
      bootstrapGrant: string;
      bootstrapGrantExpiresAt: string;
    };
```

Development and staging may receive the `available` branch only when authoring
is enabled for that environment and origin. Production always receives the
`disabled` branch. Its bootstrap response contains no creator module,
activation, dashboard-auth, or editor URL.

Creator authorization requires an active workspace membership with role
`member`, `admin`, or `owner`. `member` is the current creator tier. A `viewer`
cannot approve an authorization request or receive the creator module.

### First-Party Creator Authentication

The framework-free activation client starts only after the hidden launcher is
revealed and the creator chooses an authoring action:

1. It generates a high-entropy `state` value and PKCE verifier in memory, then
   derives the `S256` challenge.
2. It synchronously opens the canonical first-party popup route at
   `https://app.lodariq.io/authoring/activate`, so browser popup policy is
   evaluated against the creator's click.
3. It calls `POST /v1/sdk/authoring/authorization-requests` with the public
   installation ID, exact customer `Origin`, PKCE challenge, state binding, and
   optional document intent. The request presents the narrow in-memory bootstrap
   grant separately. The server resolves the workspace, environment, origin
   policy, and any document context; it does not trust a client-supplied
   environment or arbitrary document scope.
4. After the activation route reports ready from the exact app origin, the
   opener sends only the opaque request ID and matching state to that exact
   origin. The popup loads the request through an authenticated first-party
   call; no authorization code or session bearer is placed in its URL.
5. The activation route uses its first-party Lodariq session. It requires an
   active membership in the resolved workspace, an active workspace, and the
   explicit authoring capability. It revalidates the exact configured origin,
   resolved environment, and environment authoring policy before approval.
6. The popup returns only a one-time authorization result over `postMessage`.
   It targets the exact customer origin recorded on the request.
7. The opener accepts the result only when `event.source` is the exact popup
   window, `event.origin` is the exact configured Lodariq app origin, and the
   protocol, request ID, and in-memory `state` all match.

The activation route must retain the opener relationship needed for this narrow
handshake. Its browser headers and redirect behavior are covered by end-to-end
tests; redirects must not silently sever the opener or broaden allowed origins.
Neither side uses a wildcard `postMessage` target.

Credential UI, dashboard session tokens, and dashboard cookies never load on or
pass through the customer origin. The popup is an authentication and
authorization surface, not the authoring editor.

### One-Time Code, Activation Grant, and Document Session

The popup authorization result contains an opaque, cryptographically random
authorization code. The code:

- expires in 60 to 120 seconds;
- is stored only as a hash server-side;
- is bound to one authorization request, PKCE challenge, workspace,
  environment, exact customer origin, creator, closed capability set, and any
  server-resolved document intent; and
- is consumed by one atomic compare-and-set operation that requires
  `usedAt IS NULL` and `expiresAt > now()`.

The activation client sends the code and PKCE verifier to
`POST /v1/sdk/authoring/exchange` with the public installation ID, exact request
`Origin`, and the narrow bootstrap grant. The server repeats installation and
origin-to-environment resolution. Concurrent exchanges and replays fail after
exactly one successful consumption. Scope or challenge mismatch fails closed
and does not create a grant or session.

The code is neither an activation grant nor an authoring session. A successful
exchange returns a separate short-lived, memory-only activation grant scoped to
the creator, workspace, resolved environment, exact customer origin, and closed
activation capabilities. It can list/select an eligible document or create a
draft; it cannot read or write an arbitrary document and cannot publish.

After the creator module opens the static editor iframe and completes the exact-
source/origin bridge handshake, the host transfers the activation grant once to
that iframe. The iframe selects or creates a document and calls the document-
scoped authoring-session endpoint. That endpoint revalidates the activation
grant and server-resolved document scope before returning a 10- to 15-minute
authoring-session bearer and closed session context scoped to:

```text
workspace + environment + document + exact customer origin + creator + capabilities
```

The server stores only bootstrap-grant, activation-grant, and session-token
hashes. The editor iframe presents the authoring-session bearer from the exact
`editor.lodariq.io` origin. The server derives workspace, environment, exact
customer parent origin, document, creator, and capability scope from the session
rather than accepting arbitrary IDs. The public installation ID itself grants
no access. The authoring capability set does not imply publish, promote,
rollback, unpublish, theme approval, or environment-administration authority.

The host activation client retains bootstrap grant, PKCE verifier,
authorization code, and activation grant only in memory and erases the
activation grant after the one-time iframe handoff. The editor iframe alone
retains the authoring-session bearer in its memory. None of those credentials,
nor any Lodariq account/session credential, may appear in a URL, DOM attribute, HTML snippet,
`localStorage`, `sessionStorage`, analytics payload, error message, or log. The
public installation ID may remain in the permanent loader markup because it is
explicitly non-secret. Closing authoring performs best-effort session
revocation; server-side expiry is authoritative. There is no authoring refresh
token. Renewal repeats the first-party authorization flow.

### Lazy Authoring Module

The normal loader, runtime, and renderer bundles remain framework-free and do
not import `@lodariq/sdk-authoring`, React, or Lexical. The activation client may
implement the small popup handshake, but it contains no editor, bridge, picker,
style sampler, React, or Lexical code.

Only after a successful exchange, and only for development or staging, the
server returns a creator-module descriptor containing a content-addressed CDN
URL, module version, and integrity metadata. The SDK validates the exact Lodariq
CDN origin and descriptor before loading it. The creator module installs the
host bridge and opens a credential-free sandboxed `editor.lodariq.io` iframe.
After the iframe proves its exact origin/source and the negotiated request/state,
the host sends the activation grant once with an exact `postMessage` target.
The iframe creates and owns the document-scoped session; the host bridge receives
only opaque session/document context required to validate semantic messages,
never the authoring-session bearer.

The creator entry accepts a programmatic, validated session context. It does not
discover credentials from a script element or persist them in the DOM. The
runtime package may expose a generic remote-module activation boundary, but it
must not gain a static or bundled dependency on the authoring package.

### Production Prohibition

Production authoring is rejected independently at every layer:

- environment configuration forces authoring off for production;
- production bootstrap returns `state: 'disabled'` without activation, creator,
  app-auth, or editor URLs;
- authorization-request, code-issue, code-exchange, and session-creation paths
  reject production before writing state;
- repositories reject production authoring even if an API caller is defective;
- the browser loader ignores a forged permissive authoring payload when its
  resolved environment is production; and
- production network and bundle gates prove no creator, editor, React, Lexical,
  sampling, or authoring asset is requested or bundled.

URL flags and query parameters are authoring intent only. They can never enable
authoring, select a wider scope, or substitute for the exchange.

### Dashboard Entry and Fallback

Dashboard **Open in product** opens the exact configured customer origin with a
non-secret launcher-display intent. The loader consumes that intent, reveals
the launcher for the tab's session, and removes the intent from the visible URL.
The creator must still complete the same authorization-request, one-time-code,
exchange, and session model. The dashboard does not mint a bearer credential,
render a creator snippet, place a session bearer in a URL, or introduce a second
authorization model. Viewer-role dashboards do not expose this entry action.

If a popup is blocked, the in-product entry offers a safe retry and a
`Continue in Lodariq` fallback. If the customer page cannot load, the dashboard
keeps document editing and diagnostics available, but in-product target picking
and preview remain unavailable rather than being simulated unreliably.

### No Implicit Publication

SDK installation, bootstrap, authorization-request creation, popup approval,
code exchange, authoring-session creation or revocation, creator-module load,
editor open, and draft save are configuration or authoring operations only.
None publishes or advances an environment/document release pointer. Release
mutations continue to require their own explicit capability, user action,
idempotency key, and compare-and-swap state under ADR 0014.

## Persistence and API Boundaries

Public installation records and exact-origin-to-environment mappings are
workspace-scoped tenant configuration protected by PostgreSQL RLS under ADR 0011. Authorization requests/codes, bootstrap and activation grants, and
authoring sessions are workspace-scoped tenant records as well. At minimum,
persistence must support the public installation ID, exact origin mapping, code
hash, PKCE challenge, creator and optional document intent, closed capabilities,
expiry, atomic consumption time, grant/session-token hashes, document-session
scope, and revocation time. Raw codes, grants, and session bearers are never
persisted.

The public-installation entry path may read only the matching installation and
exact-origin environment mapping before the workspace is known. The public ID
alone exposes no workspace data. After exact-origin resolution, creation or
consumption of bootstrap grants, authorization state, activation grants, and
document sessions occurs inside the resolved workspace transaction. The
first-party popup uses authenticated workspace scope. Neither path creates a
general pre-workspace tenant-read bypass.

The existing environment-token lookup remains an explicitly historical
migration path until public-installation bootstrap is deployed; it is not a
second canonical installation model.

`POST /v1/sdk/authoring/authorization-requests` and
`POST /v1/sdk/authoring/exchange` are the accepted public SDK boundaries. The
canonical app UI route is `https://app.lodariq.io/authoring/activate`; it may
use private dashboard-to-API calls to approve the existing request, but it does
not replace the SDK exchange endpoint or return a long-lived credential.

## Required Test Gates

- Schema tests validate closed activation/session unions and prove the
  production branch cannot carry activation, creator, app-auth, or editor URLs.
- API and repository tests cover public-ID plus exact-origin environment
  resolution, missing/disallowed/ambiguous origins, bootstrap-grant scope,
  membership/capability checks, state and PKCE validation, 60- to 120-second
  code expiry, every scope mismatch, hash-only credential storage, atomic
  concurrent consumption, replay rejection, activation/session
  expiry/revocation, and no-publication side effects.
- API, repository, loader, and dashboard tests independently reject production
  authorization-request, code issue, exchange, session creation, and activation.
- Browser tests accept popup results only from the exact source and app origin
  with matching request/state; they cover wrong source, wrong origin, stale
  state, duplicate clicks, popup blocking, and failure recovery.
- Iframe tests accept the activation grant only once after exact host/source,
  editor-origin, protocol, request, and state validation. They prove the host
  erases it after handoff, cannot read the resulting session bearer, and cannot
  send pre-session messages after session establishment.
- Credential-leak tests assert no persistent bearer appears in the permanent
  installation and that bootstrap grants, authorization codes, PKCE verifiers,
  activation grants, session bearers, and Lodariq account/session credentials never enter URLs,
  DOM, browser storage, analytics, logs, or errors. The public installation ID
  is explicitly allowed because it is non-secret. The customer-page host never
  receives or can read the iframe's authoring-session bearer.
- Lazy-load tests prove no creator-module request occurs before a successful
  exchange and that a failed or expired exchange leaves ordinary runtime
  playback operational.
- Dependency and built-bundle gates keep runtime free of authoring, React,
  Lexical, and dashboard code, and apply a separate size budget to any
  framework-free activation client.
- Staging Playwright coverage proves popup authentication, exchange, lazy
  creator load, iframe authoring, draft save, and close/revoke. It also proves
  the dashboard fallback completes without copying or installing a creator
  snippet and that a code cannot move between two allowlisted customer origins.
- Production Playwright coverage asserts no Edit UI and zero requests to the
  app activation route, creator CDN asset, or editor origin, including with
  malicious intent parameters and a permissive mocked bootstrap response.

## Migration

1. Add the public application-installation and exact-origin environment mapping,
   then add closed TypeBox bootstrap, authorization-request, exchange,
   activation-grant, and document-session contracts plus workspace-scoped
   persistence and repository methods.
2. Implement origin-resolved public-installation bootstrap, the first-party
   activation route, and atomic API exchange while retaining legacy delivery
   compatibility.
3. Add the framework-free activation client and programmatic lazy creator entry;
   preserve the physical runtime/authoring package split.
4. Move dashboard `Edit on staging` to the same exact-origin handoff.
5. Keep the existing environment-token installation and separate creator snippet
   behind explicit migration flags only while the SDK-first path is being rolled
   out. Mark both deprecated, do not extend them with new capabilities, and
   remove them after deployed compatibility coverage passes.

Until these steps land, documentation and UI must describe the environment-token
installation and separate creator snippet as current migration behavior, not as
the completed public-installation popup flow.

## Consequences

- The customer installs the product SDK once per application; exact origin maps
  the same public installation to the correct environment without a persistent
  bearer in the snippet.
- Creators normally enter authoring from the product they are editing.
- First-party authentication works without granting account or dashboard
  credentials to customer-page JavaScript.
- A stolen one-time code has a very small lifetime and cannot be replayed or
  moved to another workspace, environment, creator, or origin; the resulting
  document session cannot move to another document.
- The heavier authoring stack is absent from ordinary viewer traffic and all
  production traffic.
- Popup policies, opener-preserving headers, CSP/CDN configuration, expiry, and
  mid-session failure become explicit product states with test coverage.
- Dashboard editing remains a reliable fallback without creating a parallel
  security or session model.
