# How to Author and Release with Lodariq

This guide describes the workflow implemented locally through Phase 2 Slice 3.
Current verification status is tracked in `../PROGRESS.md`. Phase 2 is still
incomplete: drift handling, rollback/unpublish, and analytics isolation remain
Slice 4 work.

## 1. Configure the Product Once

In the dashboard, add the product and configure its enabled environments:

- Development, if used.
- Staging.
- Production.

For each environment, add exact allowed origins and configure its authoring and
release access. Production never allows authoring. A production environment can
currently require either zero or one explicit approval before promotion;
rollback policy arrives with Slice 4.

These are customer product environments, not Lodariq's own Fly/Neon deployment
environments.

## 2. Install the SDK Once

Install one permanent Lodariq SDK entry in the application shell. It resolves
the configured environment from its exact origin and environment-scoped
configuration; customers do not add and remove a separate authoring snippet.
The ordinary production path loads only production runtime code. Add
`identify()` and `track()` only for customer values and events the product
explicitly sends to Lodariq.

```html
<script
  src="https://cdn.lodariq.io/loader/v1/lodariq-loader.js"
  data-installation="ins_pub_xxx"
  async
  crossorigin="anonymous"
></script>
```

The installation ID is public configuration identity, not a bearer secret. The
API maps the browser's exact origin to one environment and fails a missing,
disallowed, or ambiguous mapping closed.

Creating the public installation ID, mapping exact origins to environments, or
issuing a compatibility environment token verifies configuration but does not
create, compile, or publish an experience. A browser extension is not the
canonical installation or authoring path.

Product matching can optionally use explicitly registered semantic design
tokens:

```ts
Lodariq.registerBrandTokens({
  schemaVersion: '1',
  sourceId: 'customer-design-system',
  revision: 'token-build-id',
  modes: {
    light: {
      colors: { accent: '#2457ff', onAccent: '#ffffff' },
      typography: { fontFamilies: ['Customer Sans', 'system-ui'] },
    },
  },
});
```

This input is optional. Registered values are kept in memory and are available
only to the authenticated authoring path; the normal production runtime does
not persist or expose them. Explicit semantic tokens take priority over inferred
page styles. Lodariq never accepts or persists arbitrary CSS, selectors,
stylesheet text, HTML snapshots, URLs, class names, or coordinates as Brand
theme data.

## 3. Enter Authoring from the Product

On an authoring-enabled development or staging origin, the SDK starts with no
visible creator UI. Press `Ctrl/⌘ + Shift + L`, or use dashboard **Open in
product**, to reveal the small draggable Lodariq launcher. Its stable actions
stay in the same order:

- `New`.
- `Experiences on this page`.
- `Preview`.
- `Hide Lodariq`.

Each compact icon has an accessible name, a short hover/focus tooltip, and a
touch target of at least 44 by 44 CSS pixels. Hover may temporarily reveal the
controls, but it is optional. Click, tap, Enter, or Space pins the launcher, so
touch and keyboard users never depend on hover. Pointer leave and action
activation preserve pinned state; the launcher toggle, outside click, or
`Escape` collapses it.

If signed out, Lodariq opens a first-party sign-in page in a top-level popup
created by that user gesture. Password, passkey, or SSO entry happens there—not
inside the customer product. The flow does not require a separate Lodariq tab
to already be open. After authentication, Lodariq verifies membership,
environment, requested capability, and the exact opener origin, then returns a
one-time result that the SDK exchanges for a short-lived in-memory activation.
The exact-origin Lodariq editor iframe uses that activation once to create and
own the document-scoped session. The customer page never receives a Lodariq
account credential, long-lived bearer, or the authoring-session bearer.

The dashboard is still used for initial installation, exact-origin and
environment policy, membership, Brand approval, administrative work, and
fallback/recovery if direct activation cannot complete. Ordinary authoring does
not begin with a dashboard context switch.

## 4. Approve the Workspace Brand

Lodariq applies the document's acknowledged approved Brand Theme automatically.
If the workspace has none, the implemented dashboard Brand setup starts from an
accessible Lodariq foundation and asks an authorized creator to adjust five
essentials: accent, surface, text, font family, and card radius. The creator
saves the draft, reviews the before/after Tour preview and affected experiences,
then an authorized admin/owner approves an immutable version. The first approved
theme becomes the workspace default; later default changes are explicit.

`Match product` is implemented locally in the Appearance workflow. Lodariq uses
registered tokens when available; otherwise it samples a bounded set of
resolved semantic values from the current target or a product element selected
by the creator. It produces a source/confidence proposal rather than copying
CSS. Lower-confidence proposals require creator confirmation before they are
saved.

Applying a product match updates only the mutable workspace theme draft and
appends privacy-safe provenance for its contributing sources. It does not
approve a theme version or mutate a published artifact. The current limitation
is that the authoring iframe keeps the theme snapshot loaded when its session
started, so a refreshed authoring session is needed to see the newly saved
theme snapshot immediately.

Raw selectors, class names, CSS declarations, HTML, and font URLs are never
creator inputs.

## 5. Create or Find an Experience

Use `New` for the currently implemented creation flow, or `Experiences on this
page` to edit relevant existing work without leaving the product. Phase 3
expands `New` into an outcome-first and type catalog. It will ask what the
launch should accomplish:

Choose what the launch should accomplish:

- Introduce a new feature.
- Guide a first action.
- Point out something new.
- Announce a change.
- Collect feedback or build an onboarding sequence when those renderers are
  enabled.

Lodariq recommends an implemented format and creates a useful rendered default.
Experienced creators can browse formats directly.

## 6. Author in the Live Product

For contextual experiences, select the real product element. Edit content
inside the rendered tooltip, modal, banner, or hotspot. Add actions, audience,
trigger, or lifecycle behavior through short creator-facing controls.

Local and hosted direct authoring use the compact modeless draggable popup and
the real runtime overlay. Only
the popup's visible bounds intercept input, so the surrounding customer product
remains clickable. When choosing or repairing a target, the popup automatically
collapses to a small movable instruction chip; the selected click is captured
without firing the host product action. Escape cancels selection and restores
the prior editing state.

The launcher keeps only its four stable actions. Autosave recovery,
target repair, Brand readiness, the derived release action, and release history
appear contextually when relevant instead of becoming permanent controls.

The canonical document remains structured block JSON, but creators do not edit
JSON, raw attributes, selectors, or a custom Markdown language.

## 7. Preview and Repair

Preview runs through the real tokenized Tour renderer and exact approved Brand
Theme snapshot. The current deterministic basic preflight checks:

- Content/action completeness and URL safety.
- Artifact and theme identity.
- Renderer/theme contract compatibility.
- Semantic text/control/focus color contrast.
- Long-copy risk and estimated density at a 320 px viewport.

After staging publication, the locally implemented browser verifier runs the
exact published artifact through the real renderer and records the closed
artifact, renderer, target, clipping, stacking, font, responsive, dark-mode,
RTL, reduced-motion, and 200% zoom checks described below. It does not collect
DOM snapshots or arbitrary browser diagnostics.

Draft autosave remains available when incomplete. Critical publication blockers
show one focused repair action nearest the problem.

## 8. Publish to Staging

When release context is relevant, direct and hosted authoring derive the current
staging state and one next action from saved artifact/pointer truth. They do not
ask the creator to select an environment on every publish.

```text
Staging release · Ready for staging
```

After a successful publish it reads **Current in staging**. It changes to
**Verified** only after the browser check creates a real verification record for
that exact active publication and content hash.

When the draft is ready, choose `Publish to Staging`. Lodariq:

1. Requires the configured staging environment and an explicitly reviewed,
   immutable server-compiled document/theme artifact.
2. Runs publication readiness and deterministic basic visual preflight.
3. Derives the canonical request hash on the server and requires an idempotency
   key plus expected deployment generation.
4. Appends the release operation/publication and atomically advances only this
   document's staging pointer.

Publishing another document does not replace this one.

## 9. Verify the Exact Staging Artifact

Choose `Verify on Staging` from the release action while on the exact configured
staging origin. Lodariq temporarily removes creator chrome, loads the exact
active staging artifact, and runs all 13 closed checks:

- Artifact integrity and renderer readiness.
- Resolution of every target used by the compiled steps.
- Overflow, primary-action clipping, and target collision.
- Font fallback and stacking context.
- Responsive width and dark-mode support.
- RTL, reduced-motion, and 200% zoom behavior.

The browser sends only those closed check codes and statuses. The authenticated
server stamps the workspace, environment, document, active publication,
artifact/theme pins, actor, and exact allowlisted origin, then appends the
verification record. A failed report blocks production promotion; a complete
passed or warning report is eligible for promotion.

Any content, behavior, target, or theme change creates a new hash and requires a
new staging publication/verification.

## 10. Promote to Production

When staging is current and verified, the derived primary action becomes
`Promote to Production`.

The confirmation shows source/destination, exact artifact/hash, meaningful
changes, audience/trigger summary, target/brand health, and approval status.
Promotion begins only from an explicit creator request. The request identifies
the verified staging publication and production environment and carries an
idempotency key plus the expected production pointer generation; it does not
allow the browser to choose artifact bytes or a different hash.

With a production approval requirement of zero, the guarded request promotes
immediately. With a requirement of one, it creates an awaiting-approval release
operation. An authorized approver must then choose `Approve & promote`
explicitly; requesting approval never approves it automatically. A rejection is
an immutable terminal decision for that operation.

In both cases the server reuses the staging publication's exact immutable
compiled artifact, content hash, approved Brand Theme snapshot, and renderer
contract. Promotion advances the production document pointer with
compare-and-swap protection and append-only history. It does not copy the
document, create an environment-specific document/theme version, or invoke the
compiler again.

## 11. Monitor, Repair, or Roll Back

These production analytics, drift, rollback, and unpublish actions remain Slice
4 work.

Production analytics remain separate from staging. Monitor exposure,
completion, target health, Brand drift, SDK errors, and release operations.

- Target or Brand drift creates a reviewable repair proposal and a new draft.
- `Restore previous` creates a new rollback release referencing the older
  artifact and atomically moves the production pointer.
- `Take offline` creates an auditable inactive release.
- Neither action deletes release or analytics history.

## Current Implementation Note

Phase 0/1's local evaluator, hosted tour-session path, persistence, server
compilation, environment tokens, publication records, target readiness, and
runtime foundation remain completed historical work. The direct-entry decision
amends and supersedes the earlier dashboard-first hosted entry architecture; it
does not erase that foundation.

Slice 1's permanent SDK launcher, first-party popup authentication, short-lived
exact-origin exchange, hosted browse, and modeless authoring shell are locally
verified. Slice 2 implements the tokenized Tour renderer, persisted theme
drafts/immutable approvals/defaults/impact, document binding and
acknowledgement, exact-theme direct/hosted authoring, document-specific
delivery, deterministic basic preflight, release state, and guarded staging
publication.

Slice 3 is now implemented locally: optional registered Brand tokens, bounded
product sampling and provenance, confidence/confirmation UX, exact 13-check
browser verification records, same-artifact production promotion, and an
optional zero/one explicit approval policy. Its consolidated milestone gate is
tracked in `../PROGRESS.md`; this local implementation does not make Phase 2
complete. Slice 4 still owns drift, rollback/unpublish, and staging/production
analytics isolation. Phase 3 then expands `New` into the broader outcome/type
catalog and adds later renderers as their dependencies are ready.
