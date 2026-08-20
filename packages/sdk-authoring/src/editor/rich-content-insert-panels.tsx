import { AUTHORING_RESOURCE_LIMITS, ICON_RECIPE_VALUES } from '@lodariq/schema';
import { ChevronLeft, Image, Upload } from 'lucide-react';
import { DynamicIcon } from 'lucide-react/dynamic';
import {
  Component,
  lazy,
  Suspense,
  useMemo,
  useState,
  type ErrorInfo,
  type ReactElement,
  type ReactNode,
} from 'react';
import { authoringText } from '../i18n';
import { humanizeIconName } from './rich-content-doc';
import { lucideIconName } from './rich-content-icons';

/**
 * The emoji set is a chunk of its own — thousands of entries nobody should pay
 * for until they ask. That makes it the one panel here that can fail to arrive:
 * a dropped connection, a stale cache, a deploy mid-session.
 *
 * A rejected import throws during render, and with no boundary React unwinds
 * past the whole insert menu. The creator's menu vanished mid-click with nothing
 * said about why, which is how this was found. The boundary keeps the failure
 * the size of the panel and offers the retry that usually fixes it.
 */
class LazyPanelBoundary extends Component<
  { children: ReactNode; onRetry: () => void },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[lodariq] insert panel failed to load', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="rich-content-picker-error" role="alert">
        <span>{authoringText('That picker could not be loaded.')}</span>
        <button
          onClick={() => {
            this.setState({ failed: false });
            this.props.onRetry();
          }}
          onPointerDown={(event) => event.preventDefault()}
          type="button"
        >
          {authoringText('Try again')}
        </button>
      </div>
    );
  }
}

export function RichContentIconPickerPanel({
  color,
  onBack,
  onColorChange,
  onQueryChange,
  onSelect,
  query,
}: {
  color: string;
  onBack?: () => void;
  onColorChange: (color: string) => void;
  onQueryChange: (query: string) => void;
  onSelect: (icon: (typeof ICON_RECIPE_VALUES)[number], label: string, color: string) => void;
  query: string;
}): ReactElement {
  const visibleIcons = ICON_RECIPE_VALUES.filter((name) =>
    humanizeIconName(name).toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <div className="rich-content-icon-menu">
      {onBack ? (
        <button
          className="rich-content-insert-back"
          onClick={onBack}
          onPointerDown={(event) => event.preventDefault()}
          type="button"
        >
          <ChevronLeft size={14} />
          <span>{authoringText('Back')}</span>
        </button>
      ) : null}
      <input
        aria-label={authoringText('Search icons')}
        autoFocus
        onChange={(event) => onQueryChange(event.currentTarget.value)}
        placeholder={authoringText('Search icons')}
        type="search"
        value={query}
      />
      <label className="rich-content-icon-color-control">
        <span>{authoringText('Icon color')}</span>
        <input
          aria-label={authoringText('Icon color')}
          onChange={(event) => onColorChange(event.currentTarget.value)}
          type="color"
          value={color}
        />
      </label>
      <div className="rich-content-icon-grid">
        {visibleIcons.map((name) => (
          <button
            aria-label={humanizeIconName(name)}
            key={name}
            onClick={() => onSelect(name, humanizeIconName(name), color)}
            onPointerDown={(event) => event.preventDefault()}
            title={humanizeIconName(name)}
            type="button"
          >
            <DynamicIcon name={lucideIconName(name)} size={19} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function RichContentEmojiPickerPanel({
  onBack,
  onSelect,
}: {
  onBack?: () => void;
  onSelect: (emoji: string) => void;
}): ReactElement {
  const [attempt, setAttempt] = useState(0);
  // `attempt` is the whole dependency: bumping it is what mints a fresh `lazy`.
  const EmojiPickerChunk = useMemo(() => lazy(() => import('./rich-content-emoji-picker')), [attempt]);
  return (
    <div className="rich-content-emoji-menu">
      {onBack ? (
        <button
          className="rich-content-insert-back"
          onClick={onBack}
          onPointerDown={(event) => event.preventDefault()}
          type="button"
        >
          <ChevronLeft size={14} />
          <span>{authoringText('Back')}</span>
        </button>
      ) : null}
      {/*
        A fresh `lazy` per attempt: the previous one has cached its rejected
        promise, so reusing it would re-throw without ever asking again.
      */}
      <LazyPanelBoundary key={attempt} onRetry={() => setAttempt((count) => count + 1)}>
        <Suspense
          fallback={<span className="rich-content-picker-loading">{authoringText('Loading…')}</span>}
        >
          <EmojiPickerChunk onSelect={onSelect} />
        </Suspense>
      </LazyPanelBoundary>
    </div>
  );
}

export function RichContentMediaInsertPanel({
  captionTargetVideo,
  mediaUploadError,
  onUploadCaptions,
  onUploadMediaFile,
  saveMediaToLibrary,
  setSaveMediaToLibrary,
  uploading,
}: {
  captionTargetVideo: boolean;
  mediaUploadError: string | null;
  onUploadCaptions: (file: File) => void;
  onUploadMediaFile: (kind: 'image' | 'video', file: File) => void;
  saveMediaToLibrary: boolean;
  setSaveMediaToLibrary: (value: boolean) => void;
  uploading: boolean;
}): ReactElement {
  return (
    <div className="rich-content-insert-media">
      <label className="rich-content-library-option">
        <input
          checked={saveMediaToLibrary}
          onChange={(event) => setSaveMediaToLibrary(event.currentTarget.checked)}
          type="checkbox"
        />
        <span>
          <strong>{authoringText('Save to media library')}</strong>
          <small>{authoringText('Reuse this media in other experiences.')}</small>
        </span>
      </label>
      <label className="rich-content-upload-button">
        <Image size={17} />
        <span>{authoringText('Upload image or GIF')}</span>
        <input
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) onUploadMediaFile('image', file);
          }}
          type="file"
        />
      </label>
      <label className="rich-content-upload-button">
        <Upload size={17} />
        <span>
          {captionTargetVideo
            ? authoringText('Upload another video')
            : authoringText('Upload video')}
        </span>
        <input
          accept="video/mp4,video/webm"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) onUploadMediaFile('video', file);
          }}
          type="file"
        />
      </label>
      {captionTargetVideo ? (
        <label className="rich-content-upload-button">
          <Upload size={17} />
          <span>{authoringText('Upload captions')}</span>
          <input
            accept="text/vtt"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) onUploadCaptions(file);
            }}
            type="file"
          />
        </label>
      ) : null}
      {uploading ? <small>{authoringText('Uploading media…')}</small> : null}
      <small>
        {authoringText('Maximum file size: {size} MB.', {
          size: AUTHORING_RESOURCE_LIMITS.assetBytes / 1_048_576,
        })}
      </small>
      {mediaUploadError ? (
        <p className="rich-content-media-error" role="alert">
          {mediaUploadError}
        </p>
      ) : null}
    </div>
  );
}

export function RichContentInsertOption({
  icon,
  label,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  onSelect: () => void;
}): ReactElement {
  return (
    <button
      onClick={onSelect}
      onPointerDown={(event) => event.preventDefault()}
      role="menuitem"
      type="button"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
