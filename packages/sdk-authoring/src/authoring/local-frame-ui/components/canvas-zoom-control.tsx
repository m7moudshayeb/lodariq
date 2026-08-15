import { authoringText } from '../../../i18n';
import { Minus, Plus } from '../design-system';
import { CANVAS_ZOOM_LEVELS, DEFAULT_CANVAS_ZOOM } from './tour-sequence-options';

export function CanvasZoomControl({
  onChange,
  value,
}: {
  onChange: (value: number) => void;
  value: number;
}) {
  const currentIndex = CANVAS_ZOOM_LEVELS.findIndex((level) => level === value);
  const minimum = 60;
  const maximum = 120;

  return (
    <div className="storyboard-canvas-zoom" role="group" aria-label={authoringText('Canvas zoom')}>
      <button
        type="button"
        aria-label={authoringText('Zoom out canvas')}
        disabled={value <= minimum}
        onClick={() => onChange(CANVAS_ZOOM_LEVELS[Math.max(0, currentIndex - 1)] ?? minimum)}
      >
        <Minus size={15} strokeWidth={2} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="storyboard-canvas-zoom-value"
        aria-label={authoringText('Reset canvas zoom to {zoom}%', {
          zoom: DEFAULT_CANVAS_ZOOM,
        })}
        title={authoringText('Reset canvas zoom')}
        onClick={() => onChange(DEFAULT_CANVAS_ZOOM)}
      >
        {value}%
      </button>
      <button
        type="button"
        aria-label={authoringText('Zoom in canvas')}
        disabled={value >= maximum}
        onClick={() =>
          onChange(
            CANVAS_ZOOM_LEVELS[Math.min(CANVAS_ZOOM_LEVELS.length - 1, currentIndex + 1)] ??
              maximum,
          )
        }
      >
        <Plus size={15} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}
