import { authoringText } from '../../../../i18n';
import { Hand, MousePointer2, Network, SlidersHorizontal, X } from '../../design-system';

export type TourFlowTool = 'select' | 'pan';

export function TourFlowToolbar({
  findingCount,
  onAutoLayout,
  onClose,
  onOpenBranchSimulation,
  onToolChange,
  simulationOpen,
  stepCount,
  tool,
}: {
  findingCount: number;
  onAutoLayout: () => void;
  onClose: () => void;
  onOpenBranchSimulation: () => void;
  onToolChange: (tool: TourFlowTool) => void;
  simulationOpen: boolean;
  stepCount: number;
  tool: TourFlowTool;
}) {
  return (
    <header className="tour-flow-toolbar">
      <span className="tour-flow-heading">
        <Network size={16} strokeWidth={2} aria-hidden="true" />
        <strong>{authoringText('Flow Map')}</strong>
        <small>
          {authoringText('{count} steps · {findings} findings', {
            count: stepCount,
            findings: findingCount,
          })}
        </small>
      </span>
      <span className="tour-flow-toolbar-actions">
        <span
          className="tour-flow-tool-group"
          role="group"
          aria-label={authoringText('Flow Map tools')}
        >
          <button
            aria-pressed={tool === 'select'}
            onClick={() => onToolChange('select')}
            type="button"
          >
            <MousePointer2 size={14} strokeWidth={2} aria-hidden="true" />
            {authoringText('Select')}
          </button>
          <button aria-pressed={tool === 'pan'} onClick={() => onToolChange('pan')} type="button">
            <Hand size={14} strokeWidth={2} aria-hidden="true" />
            {authoringText('Pan')}
          </button>
        </span>
        <button onClick={onAutoLayout} type="button">
          {authoringText('Auto layout')}
        </button>
        <button aria-pressed={simulationOpen} onClick={onOpenBranchSimulation} type="button">
          <SlidersHorizontal size={14} strokeWidth={2} aria-hidden="true" />
          {authoringText('Branch simulation')}
        </button>
        <button className="tour-flow-return" onClick={onClose} type="button">
          <X size={14} strokeWidth={2} aria-hidden="true" />
          {authoringText('Return to canvas')}
        </button>
      </span>
    </header>
  );
}
