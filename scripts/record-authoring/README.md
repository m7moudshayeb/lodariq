# Authoring clip

The faded authoring footage behind the marketing hero.

## The short way

```sh
pnpm --filter @lodariq/fixture-host run dev
```

Open the app, then: **Open Lodariq actions → Experiences on this page → Open
Welcome tour**. Record the window with Cmd+Shift+5 (or ScreenStudio), edit a
step or two, stop.

Then convert the take:

```sh
node scripts/record-authoring/post-process.mjs ~/Desktop/authoring.mov
```

That writes `authoring.mp4`, `authoring.webm` and `authoring-poster.jpg` into
`apps/marketing/public/media/`. Trim points are env vars, and re-running is
cheap, so find them by eye:

```sh
TRIM_START=2.4 TRIM_DURATION=14 POSTER_AT=6 node scripts/record-authoring/post-process.mjs ~/Desktop/authoring.mov
```

Only fixture-host needs to be running. The authoring surface is entirely local —
`mountLocalAuthoringDevFrame` plus `lodariq-local-dev` persistence — so no API
and no database are involved.

## Why the conversion step exists at all

A raw QuickTime take is a 40 MB ProRes-ish `.mov` with an audio track. Three
things have to change before it can sit on the hero:

- **The audio track is removed, not muted.** A video with no audio track
  autoplays under every browser policy; a muted track that still exists does not.
- **Two codecs.** Safari still needs H.264, everything else is smaller in VP9.
- **A poster frame**, so the hero's first paint is not an empty box.

## The scripted alternative

`authoring-clip.spec.ts` + `playwright.config.ts` drive the same session
automatically and record it, so a re-record after a UI change is one command.
It is optional — it exists because this footage goes stale whenever the
authoring UI changes. If you are only ever recording this once, ignore it, or
delete both files and keep `post-process.mjs`.

```sh
pnpm run record:authoring
```

Its bootstrap is kept identical to
`packages/tests/e2e/authoring-accessibility.spec.ts`, which is the flow already
proven to open the panel. If that changes there, change it here.

## Putting it on the hero

The clip is decoration carrying information, so it must not behave like a hero
video:

- `preload="none"` until the page is idle; the poster carries the first paint.
- Pause it when it scrolls out of view.
- Serve the poster instead of the video for `prefers-reduced-motion: reduce`
  and for `Save-Data`.
- Give viewers a pause control. It is motion over five seconds, so that is a
  requirement rather than a nicety.
- Keep it the only thing on the first screen that moves, besides the tour card
  arriving.
