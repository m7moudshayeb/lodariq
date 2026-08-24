import { authoringText } from '../../../i18n';
import { Minus, Plus } from '../design-system';
import {
  CANVAS_ZOOM_LEVELS,
  CANVAS_ZOOM_LIMITS,
  DEFAULT_CANVAS_ZOOM,
  nearestCanvasZoomIndex,
} from '../canvas-zoom';

export function CanvasZoomControl({
  onChange,
  value,
}: {
  onChange: (value: number) => void;
  value: number;
}) {
  /* findIndex returned -1 for any percent off the ladder — the pill can now set
     one — which stepped "zoom out" to the largest level. */
  const currentIndex = nearestCanvasZoomIndex(value);
  const minimum = CANVAS_ZOOM_LIMITS.min;
  const maximum = CANVAS_ZOOM_LIMITS.max;

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
