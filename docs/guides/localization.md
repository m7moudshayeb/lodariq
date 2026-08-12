# Localization

Lodariq uses a Git-first localization workflow. Product copy uses Lingui PO
catalogs; customer-authored experience content is a separate product-data
concern and is not part of those catalogs.

## Current implementation

The implemented localization system provides:

- Shared locale contracts and formatters in `@lodariq/i18n`.
- Cookie and `Accept-Language` locale resolution for the dashboard.
- Product locales for English (`en`), German (`de`), French (`fr`), Spanish
  (`es`), Portuguese (`pt`), Arabic (`ar`), Turkish (`tr`), Italian (`it`), and
  Belgian Dutch (`nl-BE`). Spanish uses its standard BCP 47 code `es`; Belgian
  Dutch uses `nl-BE` because French and German are already shared locales.
- Expanded pseudo-English (`en-XA`) and pseudo-RTL (`ar-XB`) for development.
- Correct root `lang` and `dir` attributes.
- A design-system language switcher in expanded and collapsed navigation.
- Localized dashboard, authentication, analytics, release, environment,
  SDK-installation, Brand-system, editor, authoring, creator-chrome, and runtime
  surfaces, including accessibility labels and empty/loading/error states.
- Stable API/release error-code mapping and request-locale server feedback. Raw
  upstream or persisted error prose is never used as customer-facing copy.
- Request-locale translation for server-rendered metadata, pages, BFF responses,
  and server mutations.
- The signed-in activation popup passes the dashboard user's current locale as
  non-secret metadata to the customer-page SDK and exact
  `editor.lodariq.io` iframe. **Open in product** also carries the locale as a
  startup fallback, so keyboard launches and customer routers that rewrite the
  URL still use the dashboard UI language. Locale metadata never shares a
  storage mechanism with authoring credentials.
- Complete source-controlled catalogs: 839 dashboard messages, 1,098 authoring
  messages, and 29 runtime messages for every product locale.
- Authoring locale catalogs are separate on-demand chunks, so an authoring
  session downloads only its selected language. Production viewer/runtime
  bundles keep their independent ES2020 compatibility target.
- Strict catalog, placeholder, locale-resolution, pseudo-locale, and translated
  surface tests.
- An explicit authoring-time **Translate missing copy** action backed by the
  DeepL API. It updates only missing fields in the selected experience language,
  keeps existing manual translations, and returns a mutable draft without
  saving or publishing it as a side effect.

Pseudo-locales are intentionally available only outside production. Production
rejects pseudo-locale cookie updates and falls back to English if an old pseudo
cookie is present.

## Repository commands

Run commands from the repository root:

```sh
pnpm --filter @lodariq/dashboard i18n:extract
pnpm --filter @lodariq/dashboard i18n:compile
pnpm i18n:check
```

`i18n:extract` updates dashboard PO files after Lingui descriptors change.
`i18n:compile` generates dashboard TypeScript catalogs. The root `i18n:check`
performs a clean, strict dashboard compile and verifies that every authoring and
runtime source message exists in all eight non-English plain catalogs, has a
non-empty translation, and preserves its interpolation placeholders.

## Adding product copy

Use Lingui message descriptors for dashboard/server code and `useLingui()` for
dashboard client components. Use `authoringText()` or `runtimeText()` only in
their respective SDK package. Provide translator context for short or ambiguous
strings. Keep variables as message parameters rather than concatenating
translated fragments.

After adding or changing messages:

1. Extract the dashboard catalogs, or add the authoring/runtime source string to
   its source-controlled plain catalog.
2. Review the English source entry and its context.
3. Translate the entry in every product locale and compile with `--strict`.
4. Test both pseudo-locales for overflow, mirroring, focus order, and logical
   placement.

Prefer CSS logical properties (`start`, `end`, `border-e`, `ps`, and `pe`) for
direction-sensitive layout. Directional icons must switch deliberately; brand
marks, media controls, charts, and code should not be mirrored blindly.

## Adding a real locale

To add a production locale:

1. Add its BCP 47 identifier and native label to `@lodariq/i18n`.
2. Add the locale to the dashboard Lingui configuration and catalog loader.
3. Extract and translate every required message with clear, human wording.
4. Add number, date, plural, long-copy, and RTL tests as applicable.
5. Make the locale visible in production only after the strict catalog and
   locale-behavior checks pass. A separate linguistic review is optional when
   the product owner explicitly accepts the translation wording.

No vendor account is required. If translation volume later justifies a hosted
TMS, it must synchronize the same PO catalogs so the repository remains the
source of truth.

The initial non-English product catalogs were generated once and committed. No
translation API, paid vendor, translation cache, or runtime network dependency
is used for Lodariq-owned product copy. Future wording changes are normal
source changes and the strict check prevents partial locale coverage.

## Customer-authored experiences

Text entered by customers is localized as product data, not in Lodariq's PO
catalogs. The authoring language selector edits sparse title and leaf-block copy
variants beside the canonical structured document. The default language owns
the shared block structure and behavior; switch back to it before adding,
removing, moving, duplicating, or changing block types.

Every variant has an explicit fallback locale. Missing translated fields are
resolved through that chain and finally through the document default. Saving a
draft validates block identities, rich-text consistency, fallback existence,
and fallback cycles. Invalid localization data fails closed before compilation.

Server publication compiles the default view and every fully resolved locale
view into one content-addressed artifact. The runtime selects an exact locale,
then a same-language variant, then the artifact default using the customer
page's language or an explicit playback locale. It makes no translation API
call and does not recompile. Promotion and rollback continue to reuse the same
immutable artifact.

Runtime Tour analytics include the selected content locale, and analytics reads
can filter or group by it without adding customer copy to telemetry. Existing
documents are normalized to English as their default with no database migration
because localization remains inside the canonical structured JSON.

Do not duplicate customer documents per locale, add Markdown translation
syntax, or translate at runtime. Customer content is sent to DeepL only after
an authenticated creator explicitly chooses **Translate missing copy**. The API
key stays on the Lodariq server, requests are bounded to 50,000 source
characters, existing localized fields are never overwritten, and only metadata
counts—not authored copy—are recorded in observability events. See ADR 0018 for
the boundary and release invariants.

Lodariq-owned starter text for a newly created experience is localized once at
creation time. After creation it is authored product data: changing the selected
language does not silently rewrite it. Translation happens only through the
explicit draft action.

## Configuring authoring auto-translation

Create a DeepL API Developer key and set it only on the API process:

```sh
LODARIQ_DEEPL_API_KEY='<server-only-key>'
```

For the full local stack, pass the key through Turbo's strict environment mode:

```sh
LODARIQ_DEEPL_API_KEY='<server-only-key>' pnpm exec turbo run dev --env-mode=loose
```

Restart the stack and reopen authoring after adding the key. Translation
availability is stamped into the authenticated authoring session when it is
created.

Current Developer/Growth keys use `api.deepl.com`. Existing legacy Free keys,
which end in `:fx`, automatically use `api-free.deepl.com`.

Use the zero-cost Developer allowance for evaluation and non-personal authored
copy. Before enabling translation for workspaces that may put personal data in
experience content, confirm the applicable DeepL plan and data-processing terms;
use Growth or Enterprise when those guarantees are required.
Do not expose this variable through Vite, Next.js public variables, the editor
bundle, URLs, or browser storage. The authoring-session response exposes only an
`available` service flag. When the variable is absent, manual authoring
localization continues to work and the translate action is shown as unavailable.
