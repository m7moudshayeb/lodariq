import { authoringText } from '../../../i18n';
import type { BrandThemeOffer, BrandVariantId, BrandVariantOffer } from '../../brand-theme-offer';
import { Check } from '../design-system';

/**
 * The §7.1 choice: **Blends in**, **Stands out**, or **Start plain**.
 *
 * Asking "what colours?" is unanswerable; asking "blend in or stand out?" is a
 * preference anyone can express in one click. Both generated options meet AA by
 * construction, so neither choice can produce an unreadable card.
 */
export function BrandVariantChoice({
  chosen,
  offer,
  onChoose,
}: {
  chosen: BrandVariantId | null;
  offer: BrandThemeOffer;
  onChoose: (variant: BrandVariantId) => void;
}) {
  return (
    <section className="brand-variant-choice" aria-labelledby="brand-variant-choice-title">
      <div className="panel-mode-section-heading">
        <span>
          <small>{authoringText('Sampled from this product')}</small>
          <strong id="brand-variant-choice-title">{authoringText('Pick a starting point')}</strong>
        </span>
      </div>
      <ul className="brand-variant-list">
        {offer.variants.map((variant) => (
          <li key={variant.id}>
            <button
              type="button"
              aria-pressed={chosen === variant.id}
              data-brand-variant={variant.id}
              onClick={() => onChoose(variant.id)}
            >
              <BrandVariantPreview variant={variant} />
              <span className="brand-variant-copy">
                <strong>{VARIANT_LABELS[variant.id].name}</strong>
                <small>{VARIANT_LABELS[variant.id].detail}</small>
              </span>
              {chosen === variant.id ? (
                <Check size={16} strokeWidth={2.4} aria-hidden="true" />
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A miniature of the card the variant would produce: surface, text, one action. */
function BrandVariantPreview({ variant }: { variant: BrandVariantOffer }) {
  const { preview } = variant;
  return (
    <span
      aria-hidden="true"
      className="brand-variant-preview"
      style={{
        background: preview.surface,
        borderColor: preview.border,
        borderRadius: `${Math.min(preview.radiusPx, 12)}px`,
      }}
    >
      <span className="brand-variant-preview-line" style={{ background: preview.text }} />
      <span className="brand-variant-preview-line short" style={{ background: preview.muted }} />
      <span
        className="brand-variant-preview-action"
        style={{
          background: preview.accent,
          color: preview.onAccent,
          borderRadius: `${Math.min(preview.radiusPx, 8)}px`,
        }}
      />
    </span>
  );
}

const VARIANT_LABELS: Record<BrandVariantId, { name: string; detail: string }> = {
  blended: {
    name: authoringText('Blends in'),
    detail: authoringText('Looks like part of the product.'),
  },
  distinct: {
    name: authoringText('Stands out'),
    detail: authoringText('Reads clearly as guidance, in the product’s palette.'),
  },
};
