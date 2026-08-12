# 0018. Git-first product localization and authored-content locale variants

- Status: Accepted
- Date: 2026-08-12
- PRD references: §7.1, §11.3, §12.1, §14.2, §20
- Related: ADR 0002, ADR 0003, ADR 0014

## Context

Lodariq has two different kinds of translatable text:

1. Product copy owned by Lodariq, such as dashboard navigation, errors, and
   creator controls.
2. Experience content written by customers, such as tour steps, banners, and
   calls to action.

Treating both as one catalog would mix customer data into the product build,
weaken workspace isolation, and make immutable publication harder to reason
about. Buying a translation-management platform before there is translation
volume would add recurring cost without removing the need for locale contracts,
fallback behavior, RTL support, and build checks.

## Decision

### Lodariq product copy

- Use Lingui with gettext PO catalogs committed to Git. English is the source
  locale.
- Start without a paid translation-management system. Catalog extraction,
  compilation, review, and CI checks run in the repository. Add a hosted TMS
  only when external translators or sustained catalog volume make manual PO
  review the bottleneck.
- Resolve the dashboard locale from the Lodariq locale cookie first, then the
  browser's `Accept-Language` header, and finally English. Store only a supported
  BCP 47 locale identifier in the cookie.
- Keep locale identifiers, direction, labels, resolution, and formatting helpers
  in `@lodariq/i18n`. Individual product surfaces own their message catalogs so
  runtime and authoring bundles do not acquire dashboard or React dependencies.
- Treat the signed-in activation popup's dashboard locale as the authoring UI
  preference. Forward only the supported non-secret locale identifier through
  the exact-source activation result, then load that authoring catalog before
  creating the editor iframe. The customer URL locale remains a startup fallback,
  not the authenticated source of the user's dashboard preference.
- Maintain expanded-Latin and RTL pseudo-locales in development. The RTL
  pseudo-locale deliberately reuses generated pseudo-copy while applying RTL
  document direction, avoiding a second fake catalog.
- Ship a production locale only after its catalog is complete and its automated
  locale-behavior checks pass. A separate linguistic review may be waived by
  explicit product-owner acceptance; missing messages still fail the catalog
  check instead of silently becoming a partial production translation.

### Customer-authored experience content

- Do not put customer-authored text in Lodariq product catalogs or send it to a
  translation vendor merely because a creator changes the selected language.
- Store sparse locale variants in the canonical structured block document.
  Variants are workspace data keyed by canonical block identity and BCP 47
  locale; Markdown is not introduced as an intermediary. The default locale
  owns shared structure and behavior, while variants contain title and leaf
  block copy only.
- Resolve content with an explicit document fallback chain. A publication
  compiles the exact approved default document, locale variants, fallback
  policy, Brand Theme snapshot, and renderer contract into one immutable
  artifact. Promotion and rollback reuse that artifact without recompilation.
- Select delivery copy by exact locale, same-language variant, then document
  default. Selection happens inside the runtime from already compiled content;
  no translation service is called during delivery.
- Include the selected content locale as a bounded analytics dimension. Never
  include the authored copy itself in analytics.
- Machine translation is an explicit authoring-time **Translate missing copy**
  draft action backed by a server-held DeepL API key. It is never a runtime
  dependency, never publishes, and never overwrites existing customer copy.
  Requests are bounded, scoped to the authenticated document, and emit only
  locale and character/count metadata.
- Target resolution may use locale-scoped text only under the existing Target
  Identity rules: matching locale, supporting evidence only, and never as a
  coordinate or interaction locator.

## Consequences

- The initial recurring product-localization tooling cost is zero. Optional
  authored-content translation remains $0 for the first 1,000,000 characters
  included in DeepL API Developer; moving to a paid Growth plan is an explicit
  later operational decision.
- Engineers can implement and validate product localization immediately, while
  translators can edit standard PO files without adopting a proprietary format.
- Lodariq must maintain extraction discipline, translator context, pseudo-locale
  coverage, and a clear wording owner for every production locale.
- All existing Lodariq-owned dashboard, authentication, feature-panel,
  authoring, creator-chrome, runtime, accessibility, and server-feedback copy is
  covered by complete catalogs and strict checks.
- Customer-authored localization remains deliberately separate from product
  catalogs while its schema, authoring, publication, runtime fallback, and
  analytics contracts ship as one release-safe slice.
