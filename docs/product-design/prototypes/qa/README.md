# Prototype ⇄ SDK comparison kit

Tooling and evidence for the authoring chrome migration. Start from
[`../../authoring-chrome-migration-handoff.md`](../../authoring-chrome-migration-handoff.md).

## Tools

| file | what it does |
|---|---|
| `env.mjs` | where output goes and how Playwright is reached — every other script imports `chromium` / `outDir` from here |
| `probe.mjs` | shared measurement helper — `probeProto` / `probeFrame` / `probeShadow` read the same computed properties from either side, `diff` compares them (1px tolerance on numbers, exact on colours, `color-mix()` normalised) |
| `add-i18n.py` | inserts a batch of translations into all 8 non-English catalogs — `python3 add-i18n.py batch.json` where the JSON is `{ "English": { "de": "…", … } }` |

Run them in place — `node docs/product-design/prototypes/qa/t17-behaviour.mjs`.
Nothing needs copying to a scratchpad any more, and no script carries an
absolute path: `env.mjs` resolves the repo from its own URL and finds Playwright
by globbing `node_modules/.pnpm/playwright@*`, so a version bump does not break
the kit.

Screenshots go to `$TMPDIR/lodariq-qa/` by default. Set `LODARIQ_QA_OUT` to send
them somewhere else:

```bash
LODARIQ_QA_OUT=/tmp/my-run node docs/product-design/prototypes/qa/t17-build-shots.mjs
```

They land outside the session scratchpad on purpose — scratchpads are reaped
without warning, and this kit was lost that way once already.

## The two that answer most questions

| file | what it answers |
|---|---|
| `t17-behaviour.mjs` | every Operations section has a head, a lede, a Close and the nav, with **zero legacy classes**; batch selection selects; Esc closes. The fastest read on whether anything regressed |
| `t19-light.mjs` | walks every element in every section and prints anything painting itself light. A clean run reports only the indigo accent |

## The rest

Named per task, matching `../../authoring-chrome-migration-handoff.md` §9:
`t8-*` the target layer, `t10-*` the modal / palette / captions, `t11-*` card
resize, `t16-*` and `t17-*` the Operations sheet, `t19-*`/`t20-*` its palette and
card geometry. `open-authoring.mjs` opens the fixture with authoring running and
leaves the browser up — the quickest way to look at something by hand.

All of them expect the fixture host on `:5177` and a current
`pnpm --filter @lodariq/sdk-authoring build`. Screenshots are evidence for a
report, not artifacts — they are written to `LODARIQ_QA_OUT` and stay out of the
repo.
