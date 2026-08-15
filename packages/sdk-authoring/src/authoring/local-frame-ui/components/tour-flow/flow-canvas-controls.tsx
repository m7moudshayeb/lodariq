import { authoringText } from '../../../../i18n';
import { Minus, Plus, RotateCcw } from '../../design-system';

export function TourFlowCanvasControls({
  onFitView,
  onZoomIn,
  onZoomOut,
  zoom,
}: {
  onFitView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  zoom: number;
}) {
  return (
    <div className="tour-flow-canvas-controls" aria-label={authoringText('Flow Map zoom')}>
      <span className="tour-flow-zoom-group" role="group">
        <button aria-label={authoringText('Zoom out')} onClick={onZoomOut} type="button">
          <Minus size={14} strokeWidth={2} aria-hidden="true" />
        </button>
        <output aria-live="polite">{Math.round(zoom * 100)}%</output>
        <button aria-label={authoringText('Zoom in')} onClick={onZoomIn} type="button">
          <Plus size={14} strokeWidth={2} aria-hidden="true" />
        </button>
      </span>
      <button className="tour-flow-fit-view" onClick={onFitView} type="button">
        <RotateCcw size={14} strokeWidth={2} aria-hidden="true" />
        {authoringText('Fit')}
      </button>
    </div>
  );
}
