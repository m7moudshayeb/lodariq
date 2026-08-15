# Rich Content Authoring and Media Lifecycle

This guide records the freeform Rich Content capability implemented for Tour
popups on 2026-08-15. It documents the product behavior, the reusable editor
boundary, the canonical data produced by that editor, and the local and hosted
media lifecycles.

## Product model

A Tour popup exposes one **Rich content** field instead of making the creator
assemble separate heading, paragraph, list, media, callout, stat, and icon
blocks from the outer tray. The creator authors a continuous document with a
caret and selection. Lodariq translates that document to safe structured block
JSON at the editor boundary.

CTA buttons are decorator nodes in the same ordered Rich content document. A
CTA can sit anywhere among text and media. Selecting its preview reveals an
inline, contextual panel for label, click behavior, destination when relevant,
and visual recipe; those controls are absent when the CTA is not being edited.
Advanced flow configuration remains available from the canvas action context.
The popup's insertion controls remain visible without requiring hover, but they
open the single Rich content entry point instead of a separate Button workflow.

The component is `RichContentEditor` in
`packages/sdk-authoring/src/editor/rich-content-editor.tsx`. It is a standalone,
reusable authoring component rather than a Tour block component. Its public
boundary is deliberately small:

- `value` is an ordered list of canonical `LodariqBlock` values;
- `onChange` receives the next canonical list;
- `onUploadMedia` is an injected authoring service;
- `onResolveMediaPreview` resolves an opaque asset ID for authoring preview;
- `readOnly` disables editing without changing the stored representation.

The component owns no API credentials, publication behavior, or customer-page
interaction. It can therefore be reused by other experience authoring surfaces
without importing those workflows.

## Editing behavior

Creators can author normal text, headings, bulleted lists, callouts, dividers,
links, emoji, icons, images, GIFs, videos, and CTA buttons in one field. Text
selection stays visible while the toolbar preserves and formats that exact
range. Text color and highlight remain direct toolbar controls; animation opens
in a contextual Floating UI panel without introducing a separate area-selection
mode. A selection can apply:

- bold, italic, and underline;
- a bounded font size;
- text and selection-background colors;
- left, center, or right alignment;
- a safe inline animation recipe, duration, and timing value; and
- a safe navigation link.

The link menu preserves the author selection. Selected copy is always shown in
**Display as**; leaving it unchanged attaches the URL to that copy, while
editing it replaces the selected copy. With no selection, **Display as** is
optional and the full safe URL is used when it is empty. A valid link commits
when focus leaves the menu or Enter blurs its field; there is no Apply button.

The emoji picker uses Frimousse and the icon picker uses Lucide. Selecting an
emoji or icon does not close its picker, so multiple items can be inserted.
Outside pointer interaction closes open toolbar menus. Icon search and color
are authoring controls; the icon's accessible name is retained for assistive
technology but is not rendered as visible popup copy. Canonical icon names
remain a closed allowlist so server compilation and the framework-free runtime
stay deterministic even though the picker artwork comes from Lucide.

Spacing after the active content item is a whole-pixel input from 0 through 96
instead of a small set of subjective presets.

Decorator items—buttons, media, icons, and dividers—can be selected directly.
Backspace or Delete removes a selected decorator, and a collapsed caret removes
the adjacent decorator in the expected direction.

Canonical change delivery is throttled to one trailing update per 200
milliseconds. Lexical still updates its local editing surface synchronously, so
typing and selection remain immediate while persistence and the authored popup
are no longer rebuilt for every keystroke.

## Media authoring

The media menu accepts:

- PNG, JPEG, GIF, and WebP images;
- MP4 and WebM videos; and
- WebVTT captions for the most recently uploaded video.

The optional **Save to media library** choice is persisted as asset metadata.
It prepares an upload for reuse, but selecting an existing library asset is a
future bidirectional library capability and is not implemented by this editor
yet.

An image or video node is inserted immediately with a local object-URL preview.
For video, that preview is the upload thumbnail and controls are enabled after
the asset upload completes. A thin progress line is rendered over the media
itself; the menu contains only the upload actions and status copy.

After upload, media has eight resize edges. The hover/selected treatment exposes
the dashed frame and resize cursors without permanently drawing authoring chrome
over the content. Pointer movement updates local draft dimensions at most once
per animation frame and commits one canonical size change when the gesture
finishes, which prevents the editor and video element from remounting during a
drag. Keyboard users can resize a focused item with arrow keys; Shift uses the
larger step, and Home/End select the minimum/maximum width.

Canonical limits are 20–100 percent width and 64–800 pixels height. The framing
control uses creator-facing labels:

- **Fit entire media** (`contain`);
- **Fill the frame** (`cover`); and
- **Stretch to frame** (`fill`).

Backspace or Delete removes focused or selected media.

Stored width, height, and framing values are applied by all three surfaces: the
rich editor, the authored canvas popup, and the framework-free runtime popup. A
custom height is not capped by the canvas's default thumbnail height. The media
accessibility name remains available to assistive technology but is not rendered
as a visible filename or caption beneath the media.

## Persistence and preview lifecycle

The canonical document stores only an opaque asset ID plus bounded presentation
metadata. It never stores a file URL, object URL, raw bytes, or creator-supplied
`src` attribute.

Hosted authoring uploads bytes through the authenticated authoring API. The
server validates kind, MIME type, signature, size, and document references;
authoring preview resolves the authenticated download path. Publication still
compiles server-side and public delivery exposes only published immutable
assets.

Local authoring uses an origin-scoped IndexedDB database named
`lodariq-local-authoring`. Metadata and Blob records are written in one
transaction before upload progress reaches 100 percent. When a new editor
iframe mounts, it loads the small metadata records before constructing the
controller. Preview resolution fetches the matching Blob on demand and creates
an iframe-owned object URL. This separation keeps large media bytes out of
`localStorage` and avoids loading every media Blob when the editor opens.

IndexedDB is a durable local-preview cache, not an unlimited media store. The
current canonical and hosted-upload contract limits one asset to 5 MiB. Local
authoring enforces the same limit before reading or hashing the file, verifies
that metadata and Blob sizes agree, checks `navigator.storage.estimate()` when
available, and turns `QuotaExceededError` into creator-facing copy. Browser
quota is origin- and device-dependent and may be evicted, especially in private
browsing or under storage pressure. Durable reusable media therefore belongs in
the hosted media library; increasing the production video limit requires a
streaming/object-storage upload design rather than simply accepting larger
IndexedDB Blobs or base64 request bodies.

Object URLs are preview-only and are revoked with the owning authoring
lifecycle. Closing and reopening the editor must therefore recreate an object
URL from the durable Blob rather than retaining an iframe URL.

Media uploaded in a local session before durable Blob storage was introduced
cannot be recovered from its orphaned asset ID and must be uploaded once again.

## Canonical and runtime boundary

Lexical is used only inside `packages/sdk-authoring/src/editor`. The editor
serializes to heading, paragraph, list, callout, divider, icon, media, and button
blocks plus bounded `contentRuns` for inline marks, color, highlight, animation,
and links. Lexical node keys, toolbar state, open menus, upload progress, local
preview URLs, and selection state are never canonical data.

The compiler validates this structured JSON and the runtime renders the same
ordered content. Runtime media resolution applies the stored dimensions and
framing recipe, videos expose controls and optional captions/poster assets, and
inline links are resolved through the safe-navigation policy. No raw HTML,
arbitrary CSS, JavaScript, or custom icon SVG enters the document.

## Current verification boundary

Focused rich-content/canvas tests, the local-dev suite, SDK authoring typecheck,
lint, formatting, and build pass. In-app verification covers the single entry
point, contextual animation and CTA editing, outside dismissal, non-native
selects, footer collision avoidance, and authored popup updates. A focused
Lexical/DOM regression selects only four characters and verifies that text color,
highlight, and animation serialize on that exact range. Automated coverage also
verifies IndexedDB Blob round trips across independent reads, early rejection of
invalid oversized records, persisted media dimensions in the authored canvas,
and runtime dimensions. No new E2E coverage was added or run during this
requested UX-sharpening pass.
