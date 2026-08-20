# 0027. Idle-page cost, page scoping, and the SDK kill switch

- Status: Accepted
- PRD references: §6.2, §9.1, §9.2, §20
- Related: ADR 0006, ADR 0014, ADR 0015

## Context

Every digital adoption platform is sold to a product team and vetoed by a
platform team. The veto is rarely about features; it is some version of "we are
not putting another vendor's JavaScript on our hot path". Underneath that
objection sit four distinct worries, and they are worth separating because only
one of them is about bytes:

1. **Bundle size.** Largely a non-issue for us and always has been: the install
   is a CDN `<script type="module" async>` tag, so nothing of ours appears in a
   customer's build output. Their bundler never sees us.
2. **Per-page-view cost.** Real, and it was ours. Bootstrap was a POST to
   `api.lodariq.io` on every single page view, and it resolved eligibility from
   the request `Origin` alone. An application with one tour on one screen paid
   an uncacheable round trip plus ~11 KB of delivery and runtime modules on
   every page, including the nineteen where nothing would ever fire.
3. **Blast radius.** If our script throws inside one of their call stacks, it
   reads as their bug: it lands in their error reporter and, from a
   capture-phase click handler, can abort their own dispatch.
4. **Reversibility.** A customer who suspects us of breaking their page had no
   way to test that hypothesis without a deploy or a support ticket.

Points 2 through 4 are the actual objection. This ADR addresses them.

## Decision

### Page scoping

`/v1/sdk/bootstrap` resolves delivery against the page, not just the origin. A
published document whose trigger is `urlMatch` no longer makes every page in the
application eligible — only the pages its pattern matches.

Scoping **fails open**, deliberately and in three places: page intent that is
absent, unparseable, or origin-mismatched yields the full active set; a trigger
shape the matcher does not recognise stays eligible; and a V1 artifact, which
predates triggers entirely, stays eligible. An optimisation that can hide a live
experience is not an optimisation, it is an outage with a good excuse.

`manual`, `pageLoad`, and `event` triggers keep every page eligible. A manual
document is played by the customer's own code through `playTourById` and an
event document by an arbitrary later `track` call, so no URL can rule either
out. This is the conservative reading and it means workspaces that rely on
manual triggers see no idle-cost saving — the alternative, bootstrapping lazily
at `playTourById` time, would put an API round trip and ~60 KB of module loading
between a customer's function call and anything appearing on screen.

### The eligibility digest

`GET /v1/sdk/installations/:installationId/eligibility` returns a small
cacheable document describing whether the installation is live and which URL
patterns, if any, narrow it. The public bootstrap reads it before it will POST.

The bootstrap POST cannot be cached — it is a POST, it carries page intent, and
it can mint a short-lived authoring grant. That makes it the wrong shape for the
question nearly every page view actually asks, which is "is there anything here
for me?". The digest answers that question in a form the browser's own HTTP
cache can hold: `max-age=300, stale-while-revalidate=86400`, ETag, `Vary:
Origin`. Repeat page views inside the window cost no network at all; an edge
keeps absorbing traffic for a day after that.

The digest is not a security boundary. Everything in it is already visible to
anyone reading the installed page. Every failure path — unreachable, non-OK,
malformed, unknown schema version, wrong installation — proceeds to the
bootstrap.

The cost of this design is one extra request on a visitor's very first page view
of a session. That is the trade being made: a one-time cacheable GET in exchange
for removing an uncacheable POST from every subsequent page view.

### The kill switch

`public_sdk_installations.suspended_at` is a reversible pause, distinct from
`revoked_at`, flipped by an admin through
`POST /v1/sdk-installations/:id/suspension`. A suspended installation reports
`enabled: false` in the digest and `delivery: unavailable` from the bootstrap.

Both paths enforce it. The digest alone would leave a visitor holding a cached
copy from before the pause able to start a tour, so the authoritative path
re-checks. The worst-case delay is therefore the digest freshness window, which
is why that window is measured in minutes.

### The host-safety boundary

`packages/sdk-runtime/src/host-safety.ts` wraps every callback that host code
invokes — capture-phase listeners on customer elements, `pagehide` on their
window, the auto-install — so none of them can throw into a customer's stack.
Errors route to the runtime's reporter instead, and a reporter that itself fails
is swallowed rather than allowed to escalate into the failure it exists to
prevent.

### CI gates

The `public-bootstrap` size check is now explicitly the idle-page budget: it is
what a page with no eligible experience downloads, in full. Two static-code
assertions were added alongside it, forbidding the public delivery module and
the viewer runtime from appearing in the bootstrap's _static_ graph. The whole
design rests on those being reachable only through `import()`, and nothing else
in CI would have noticed a refactor that quietly linked them eagerly.

### The npm shim

`@lodariq/loader` (~700 bytes gzipped) injects the same tag from application
code, for teams whose policy forbids third-party tags in markup. The loader,
runtime, and renderers still come from the CDN; only the injection moves.

**Not yet publishable.** The package is `"private": true` at version `0.0.0`,
like every other package in this monorepo, so today it works only inside the
workspace — no customer can `npm install` it. Shipping it needs a real version,
`private` removed, a `publishConfig`, a README, and a publish step in CI. That
is deliberately deferred until a customer actually asks for it: publishing to a
public registry is a support commitment, and a package nobody has requested is
one more thing to version, deprecate, and answer questions about. The trigger to
revisit is the first prospect whose security review rejects a third-party script
tag in markup.

## Consequences

- A page with no eligible experience costs the bootstrap bundle and, after the
  first view of a session, no network at all.
- Idle cost is a CI-enforced number, so it can be published rather than
  estimated. Competitors publish performance _guidance_; an enforced budget is a
  claim they cannot match.
- Page scoping is only as good as the triggers authors set. A workspace where
  everything is `manual` gets correctness and no saving, which is the right
  default but worth surfacing in the authoring UI.
- The kill switch adds a reversible state an installation can be in. Anything
  reading `revokedAt` to mean "off" must read `suspendedAt` too;
  `isInstallationEnabled` is the single place that decides.
- The digest is one more public route to keep compatible. Its schema version is
  checked by the client precisely so it can be changed later without stranding
  loaders on cached copies.
- Loader SRI is now computable by the deploy pipeline but is **off by default**,
  and that default is load-bearing. `prepare-sdk-assets.mjs` records the
  loader's base64 digest as `manifest.publicLoader`, `write-sdk-outputs.mjs`
  publishes it as a step output, and the deploy passes it to the API as
  `LODARIQ_PUBLIC_LOADER_INTEGRITY` only when the `pin_public_loader_integrity`
  input is `true`.

  The reason for the gate: unlike the creator module, which is content-addressed
  and therefore safe to pin forever, the public loader is served from a stable
  URL with a short cache policy and its bytes change on every deploy. A digest
  pinned into a snippet a customer has already pasted into their page becomes a
  promise that the _next_ loader build will be refused by their browser. Turning
  this on across the board would convert a routine loader rollout into an outage
  for every installed page until each customer re-pastes.

  It is therefore usable today only for a single customer who wants it and
  accepts re-pasting on rollout. Making it safe in general means serving the
  loader from a content-addressed path the way the creator module already is,
  and issuing snippets against that path — worth doing when a security review
  actually demands SRI, and not before.

- `@lodariq/loader` remains unpublished; see the npm shim section above for the
  trigger that should revisit it.
