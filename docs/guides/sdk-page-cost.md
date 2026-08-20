# What Lodariq Costs a Page

The answer a platform team asks for, with the numbers CI enforces.

## The short version

Nothing of Lodariq is in your bundle. The install is a
`<script type="module" async crossorigin>` tag served from `cdn.lodariq.io`, so
your bundler never sees us and your build output does not change by a byte.

What a page actually downloads depends on whether there is anything to show:

| What the page is | Downloaded (gzipped) | Network |
| --- | --- | --- |
| No experience targets this page | **~5.4 KB** bootstrap | One cacheable `GET`, then nothing for 5 minutes |
| An experience targets it, but never fires | ~5.4 KB + ~7 KB delivery + ~4 KB runtime | + one `POST` |
| A tour actually runs | + ~48 KB tour renderer | + the artifact |
| Authoring (creator sessions only) | 145–250 KB | Never loaded for your visitors |

The authoring bundles are not "usually" absent from viewer delivery — CI fails
the build if React, Lexical, or any authoring module appears in a production
viewer graph.

## Why the idle number is the one that matters

Most page views of most applications have nothing to show. An application with
one tour on one screen has nineteen other screens, and those are where a
third-party script quietly becomes expensive.

So the bootstrap asks a cacheable question first. `GET
/v1/sdk/installations/{id}/eligibility` returns a small digest listing which URL
patterns, if any, have a live experience behind them. If your page is not one of
them, the SDK stops there — no delivery module, no runtime, no artifact, and no
further request. The digest is cached by the browser for five minutes with a
day-long stale-while-revalidate window, so a visitor clicking through your
application makes one request for the whole session rather than one per page.

The pre-flight fails open, everywhere. Unreachable, slow, malformed, or from a
schema version the loader does not recognise — all of it proceeds to the normal
bootstrap. It can cost you a saved request; it cannot cost you an experience.

## The kill switch

An admin can pause an installation from the dashboard:

```
POST /v1/sdk-installations/{installationId}/suspension  { "suspended": true }
```

A suspended installation stops delivering within the digest freshness window
(up to five minutes) and immediately on the authoritative path. No deploy, no
markup change, no support ticket. Flip it back when you are done.

This is distinct from revoking an installation, which is permanent and requires
issuing a new snippet.

## Not breaking your page

- **Styles are isolated.** The tour card is a custom element with a shadow root.
  Your CSS cannot leak in and ours cannot leak out. Where your page sets a CSP
  nonce, our style elements honor it.
- **Nothing parser-blocking.** `type="module" async` cannot block your parse or
  your first paint.
- **No framework.** The viewer path has no React, no Lexical, no editor. CI
  enforces this, it is not a convention.
- **Errors stay ours.** Every callback we hand to your page — capture-phase
  listeners on your elements, `pagehide` on your window, the auto-install
  itself — is wrapped so it cannot throw into your call stack. A Lodariq bug
  should never land in your error reporter or abort your own click handler.

## Content-Security-Policy

The full set of directives an installation needs:

```
script-src https://cdn.lodariq.io;
connect-src https://api.lodariq.io https://cdn.lodariq.io;
img-src https://api.lodariq.io data:;
```

No `unsafe-inline`, no `unsafe-eval`, no `frame-src` in production.

## Subresource integrity

Deployments may pin a loader digest, in which case the snippet issued by the
dashboard carries `integrity="sha384-…"`. It is opt-in because a pinned digest
means every loader rollout requires re-issuing the snippet — the right trade for
some security reviews and not for others.

## If you cannot add a script tag

Some platforms own the document head, or require every external origin to be
declared in reviewed code. `@lodariq/loader` (~700 bytes gzipped, zero
dependencies) injects the same tag from your application:

```ts
import { installLodariqLoader } from '@lodariq/loader';

installLodariqLoader({ installationId: 'ins_pub_…' });
```

The loader, runtime, and renderers still come from the CDN and are still absent
from your build. Only the injection moves.

## How these numbers stay true

Every figure above is a CI gate in
`packages/sdk-runtime/scripts/check-size.mjs`, not a measurement someone took
once. The build fails if the idle-page bundle grows past its budget, and it
fails if the delivery module or the viewer runtime is ever statically linked
into it — the property that keeps the idle number honest in the first place.

See [ADR 0027](../adr/0027-idle-page-cost-and-kill-switch.md) for the reasoning.
