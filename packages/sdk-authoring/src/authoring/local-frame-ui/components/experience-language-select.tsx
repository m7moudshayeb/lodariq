import { useMemo, type ReactNode } from 'react';
import { canonicalContentLocale } from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import { contentLocaleLabel, contentLocaleOptions } from '../../content-locales';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';
import {
  AuthoringIconButton,
  AuthoringSelect,
  Languages,
  LoaderCircle,
  Wand2,
} from '../design-system';

/**
 * Which language the experience's copy is being written in.
 *
 * The list is the document's own languages then common suggestions, and neither
 * is a gate: typing any canonical tag commits it. Choosing a language the
 * document has never had is how a variant gets created — the first edit made
 * while it is selected writes one.
 */
export function ContentLocalePicker({
  className,
  controller,
  disabled,
  leadingIcon,
  onPick,
  size,
  snapshot,
  title,
  triggerLabel,
}: {
  className?: string;
  controller: LocalAuthoringFrameController;
  disabled?: boolean;
  leadingIcon?: ReactNode;
  /** Defaults to switching. `addContentLocale` also creates the variant. */
  onPick?: (locale: string) => void;
  size?: 'default' | 'compact';
  snapshot: LocalAuthoringFrameSnapshot;
  title?: string;
  /** Set when the control is an action ("Add a language") rather than a state. */
  triggerLabel?: string;
}) {
  const defaultLocale = snapshot.documentState.localization?.defaultLocale ?? 'en';
  const options = useMemo(
    () =>
      contentLocaleOptions([
        defaultLocale,
        ...(snapshot.documentState.localization?.variants.map((variant) => variant.locale) ?? []),
      ]),
    [defaultLocale, snapshot.documentState.localization],
  );
  return (
    <AuthoringSelect
      ariaLabel={triggerLabel ?? authoringText('Experience language')}
      {...(className ? { className } : {})}
      dataAction="content-locale"
      dataBlockId={snapshot.documentState.id}
      disabled={disabled}
      {...(leadingIcon ? { leadingIcon } : {})}
      onValueChange={(locale) =>
        onPick ? onPick(locale) : controller.setContentLocale(locale)
      }
      options={options}
      search={{
        emptyLabel: authoringText('No languages found'),
        label: authoringText('Search languages'),
        placeholder: authoringText('Search or type a language tag…'),
        custom: {
          accept: (query) => canonicalContentLocale(query),
          label: (query) => authoringText('Use {language}', { language: contentLocaleLabel(query) }),
        },
      }}
      {...(size ? { size } : {})}
      {...(title ? { title } : {})}
      {...(triggerLabel ? { triggerLabel } : {})}
      value={snapshot.contentLocale}
    />
  );
}

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
        <ContentLocalePicker
          controller={controller}
          {...(studio ? { leadingIcon: <Languages size={16} strokeWidth={2} /> } : {})}
          snapshot={snapshot}
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
