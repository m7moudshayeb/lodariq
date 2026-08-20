import { AUTHORING_RESOURCE_LIMITS, ICON_RECIPE_VALUES } from '@lodariq/schema';
import { ChevronLeft, Image, Upload } from 'lucide-react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { lazy, Suspense, type ReactElement, type ReactNode } from 'react';
import { authoringText } from '../i18n';
import { humanizeIconName } from './rich-content-doc';
import { lucideIconName } from './rich-content-icons';

const RichContentEmojiPicker = lazy(() => import('./rich-content-emoji-picker'));

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
      <Suspense
        fallback={<span className="rich-content-picker-loading">{authoringText('Loading…')}</span>}
      >
        <RichContentEmojiPicker onSelect={onSelect} />
      </Suspense>
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
