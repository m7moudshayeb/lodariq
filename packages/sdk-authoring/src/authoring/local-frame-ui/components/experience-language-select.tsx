import { PRODUCT_LOCALES, localeOption, type ProductLocale } from '@lodariq/i18n';
import { authoringText } from '../../../i18n';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';
import {
  AuthoringIconButton,
  AuthoringSelect,
  Languages,
  LoaderCircle,
  Wand2,
} from '../design-system';

const CONTENT_LOCALE_SEARCH_NAMES = {
  en: 'English',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  pt: 'Portuguese',
  ar: 'Arabic',
  tr: 'Turkish',
  it: 'Italian',
  'nl-BE': 'Belgian Dutch Flemish Belgium',
} as const satisfies Record<ProductLocale, string>;

const CONTENT_LOCALE_OPTIONS = PRODUCT_LOCALES.map((locale) => ({
  value: locale,
  label: localeOption(locale).label,
  searchText: CONTENT_LOCALE_SEARCH_NAMES[locale],
}));

export function ExperienceLanguageSelect({
  controller,
  presentation = 'compact',
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  presentation?: 'compact' | 'studio';
  snapshot: LocalAuthoringFrameSnapshot;
}) {
  const defaultLocale = snapshot.documentState.localization?.defaultLocale ?? 'en';
  const studio = presentation === 'studio';
  const translating = snapshot.translation.state === 'translating';
  const translateLabel = translating
    ? authoringText('Translating missing copy…')
    : authoringText('Translate missing copy');
  const translateTooltip = translationTooltip(snapshot, defaultLocale);
  const translateButton = (
    <AuthoringIconButton
      className="experience-translate-button"
      disabled={
        !snapshot.translation.available || snapshot.contentLocale === defaultLocale || translating
      }
      label={translateLabel}
      onClick={() => void controller.translateMissingCopy()}
      size={studio ? 'default' : 'compact'}
      tooltip={translateTooltip}
    >
      {translating ? (
        <LoaderCircle className="tour-release-spinner" size={16} aria-hidden="true" />
      ) : (
        <Wand2 size={16} aria-hidden="true" />
      )}
    </AuthoringIconButton>
  );
  const status = experienceLanguageStatus(snapshot, defaultLocale);

  return (
    <div className={`experience-language-picker ${studio ? 'studio' : 'compact'}`}>
      <div className="experience-language-controls">
        <AuthoringSelect
          ariaLabel={authoringText('Experience language')}
          dataAction="content-locale"
          dataBlockId={snapshot.documentState.id}
          leadingIcon={studio ? <Languages size={16} strokeWidth={2} /> : undefined}
          onValueChange={(locale) => controller.setContentLocale(locale)}
          options={CONTENT_LOCALE_OPTIONS}
          search={
            studio
              ? {
                  emptyLabel: authoringText('No languages found'),
                  label: authoringText('Search languages'),
                  placeholder: authoringText('Search languages'),
                }
              : undefined
          }
          value={snapshot.contentLocale}
        />
        {studio ? (
          <div className="experience-translate-action">
            {translateButton}
            <span className="experience-translate-label">{authoringText('Translate')}</span>
          </div>
        ) : (
          translateButton
        )}
      </div>
      {studio ? (
        <div
          aria-live="polite"
          className={`experience-language-status ${status.tone}`}
          role="status"
        >
          <span className="experience-language-status-dot" aria-hidden="true" />
          <span>{status.label}</span>
        </div>
      ) : null}
    </div>
  );
}

function experienceLanguageStatus(
  snapshot: LocalAuthoringFrameSnapshot,
  defaultLocale: string,
): { label: string; tone: 'ready' | 'progress' | 'error' } {
  if (snapshot.translation.state === 'translating') {
    return { label: authoringText('Translating missing copy…'), tone: 'progress' };
  }
  if (snapshot.translation.state === 'error') {
    return { label: authoringText('Translation failed. Try again.'), tone: 'error' };
  }
  if (snapshot.contentLocale === defaultLocale) {
    return {
      label: `${authoringText('Source language')} · ${authoringText('Manual copy protected')}`,
      tone: 'ready',
    };
  }
  return { label: authoringText('Manual copy protected'), tone: 'ready' };
}

function translationTooltip(snapshot: LocalAuthoringFrameSnapshot, defaultLocale: string): string {
  if (!snapshot.translation.available) {
    return authoringText('Automatic translation is not configured');
  }
  if (snapshot.contentLocale === defaultLocale) {
    return authoringText('Select another experience language to translate');
  }
  if (snapshot.translation.state === 'translating') {
    return authoringText('Translating missing copy…');
  }
  return authoringText('Translate missing copy');
}
