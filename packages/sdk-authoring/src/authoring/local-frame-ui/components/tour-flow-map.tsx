import type { LodariqBlock, LodariqDocument, StepTransitionDestination } from '@lodariq/schema';
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type AriaLabelConfig,
  type EdgeMouseHandler,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { authoringText } from '../../../i18n';
import {
  deriveTourFlowMap,
  type DerivedTourFlowNode,
  type TourFlowFindingCode,
} from '../../tour-flow-map';
import type { LocalAuthoringFrameController } from '../controller';
import { Eye } from '../design-system';
import { targetIdOf, targetLabelOf } from '../utils';
import {
  buildTourFlowElements,
  type TourFlowCanvasEdge,
  type TourFlowCanvasNode,
} from './tour-flow/flow-elements';
import { TourFlowNode } from './tour-flow/flow-node';
import { TourFlowCanvasControls } from './tour-flow/flow-canvas-controls';
import { TourFlowSettings } from './tour-flow/flow-settings';
import { TourFlowToolbar, type TourFlowTool } from './tour-flow/flow-toolbar';
import { TourFlowWorkbench, type TourFlowWorkbenchMode } from './tour-flow/flow-workbench';

const NODE_TYPES = { tour: TourFlowNode } as const;
const FLOW_MOVE_DIRECTION_LABELS: Readonly<Record<string, string>> = {
  down: authoringText('Below'),
  left: authoringText('Left'),
  right: authoringText('Right'),
  up: authoringText('Above'),
};
const FLOW_ARIA_LABEL_CONFIG = {
  'edge.a11yDescription.default': authoringText(
    'Select a flow path with Enter or Space, then press Escape to cancel.',
  ),
  'handle.ariaLabel': authoringText('Flow connection'),
  'node.a11yDescription.ariaLiveMessage': ({ direction }) =>
    authoringText('Moved selected flow item {direction}.', {
      direction: FLOW_MOVE_DIRECTION_LABELS[direction] ?? direction,
    }),
  'node.a11yDescription.default': authoringText(
    'Select a flow item with Enter or Space. Use the arrow keys to move it, then press Escape to cancel.',
  ),
  'node.a11yDescription.keyboardDisabled': authoringText(
    'Select a flow item with Enter or Space, then press Escape to cancel.',
  ),
} satisfies Partial<AriaLabelConfig>;
const FINDING_LABELS = {
  invalid_flow_edge: authoringText('Flow points to a missing step'),
  unreachable_step: authoringText('Step is unreachable'),
  non_terminating_flow: authoringText('Path has no terminal completion'),
  missing_terminal_completion: authoringText('Path has no terminal completion'),
} as const satisfies Record<TourFlowFindingCode, string>;

export function TourFlowMap({
  controller,
  document,
  initialActionBlockId,
  initialStepId,
  initialWorkbenchMode = 'sequence',
  onClose,
  steps,
}: {
  controller: LocalAuthoringFrameController;
  document: LodariqDocument;
  initialActionBlockId?: string | null;
  initialStepId?: string | null;
  initialWorkbenchMode?: TourFlowWorkbenchMode;
  onClose: () => void;
  steps: readonly LodariqBlock[];
}) {
  const completionStepId =
    document.completion?.type === 'showStep' ? document.completion.stepId : undefined;
  const flow = useMemo(
    () => deriveTourFlowMap(steps, { ...(completionStepId ? { completionStepId } : {}) }),
    [completionStepId, steps],
  );
  const elements = useMemo(() => buildTourFlowElements(flow, steps), [flow, steps]);
  const [nodes, setNodes, onNodesChange] = useNodesState<TourFlowCanvasNode>(elements.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<TourFlowCanvasEdge>(elements.edges);
  const [instance, setInstance] = useState<ReactFlowInstance<
    TourFlowCanvasNode,
    TourFlowCanvasEdge
  > | null>(null);
  const [tool, setTool] = useState<TourFlowTool>('select');
  const [zoom, setZoom] = useState(1);
  const [simulationOpen, setSimulationOpen] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState(
    initialStepId && flow.nodes.some((node) => node.id === initialStepId)
      ? initialStepId
      : (flow.nodes[0]?.id ?? null),
  );
  const [selectedActionBlockId, setSelectedActionBlockId] = useState(initialActionBlockId ?? null);
  const [workbenchMode, setWorkbenchMode] = useState<TourFlowWorkbenchMode>(initialWorkbenchMode);

  useEffect(() => {
    setNodes((current) => reconcileNodePositions(current, elements.nodes));
    setEdges(elements.edges);
  }, [elements, setEdges, setNodes]);

  useEffect(() => {
    if (!instance) return;
    const frame = window.requestAnimationFrame(() => {
      void instance.fitView({ duration: 220, maxZoom: 1, padding: 0.16 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [instance]);

  const selectedFlowNode = flow.nodes.find((node) => node.id === selectedStepId) ?? null;
  const selectedStep = steps.find((step) => step.id === selectedStepId) ?? null;
  const selectedActionBlock =
    selectedActionBlockId && selectedStep
      ? findNestedBlock(selectedStep, selectedActionBlockId)
      : selectedActionBlockId
        ? findNestedBlockAcrossSteps(steps, selectedActionBlockId)
        : null;
  const actionOwningStep = selectedActionBlock
    ? (steps.find((step) => blockIsInside(step, selectedActionBlock.id)) ?? null)
    : null;
  const actionTooltip = actionOwningStep ? firstBlockOfType(actionOwningStep, 'tooltip') : null;
  const selectedFindings = flow.findings.filter((finding) => finding.stepId === selectedStepId);

  const openActionWorkbench = useCallback(
    (actionBlockId: string, stepId: string, mode: TourFlowWorkbenchMode) => {
      setSelectedStepId(stepId);
      setSelectedActionBlockId(actionBlockId);
      setWorkbenchMode(mode);
      setSimulationOpen(false);
    },
    [],
  );

  const onNodeClick: NodeMouseHandler<TourFlowCanvasNode> = useCallback(
    (_event, node) => {
      if (node.data.stepId) setSelectedStepId(node.data.stepId);
      if (node.data.actionBlockId && node.data.stepId) {
        openActionWorkbench(node.data.actionBlockId, node.data.stepId, 'sequence');
        return;
      }
      setSelectedActionBlockId(null);
    },
    [openActionWorkbench],
  );

  const onEdgeClick: EdgeMouseHandler<TourFlowCanvasEdge> = useCallback(
    (_event, edge) => {
      const actionBlockId = edge.data?.actionBlockId;
      const stepId = edge.data?.stepId;
      if (!actionBlockId || !stepId) return;
      openActionWorkbench(actionBlockId, stepId, edge.data?.branch ? 'branch' : 'sequence');
    },
    [openActionWorkbench],
  );

  const fitView = useCallback(() => {
    void instance?.fitView({ duration: 220, maxZoom: 1, padding: 0.16 });
  }, [instance]);

  const autoLayout = useCallback(() => {
    setNodes(elements.nodes);
    window.requestAnimationFrame(fitView);
  }, [elements.nodes, fitView, setNodes]);

  return (
    <section className="tour-flow-map-workspace" aria-label={authoringText('Flow Map')}>
      <TourFlowToolbar
        findingCount={flow.findings.length}
        onAutoLayout={autoLayout}
        onClose={onClose}
        onOpenBranchSimulation={() => {
          setSimulationOpen((open) => !open);
          setSelectedActionBlockId(null);
        }}
        onToolChange={setTool}
        simulationOpen={simulationOpen}
        stepCount={flow.nodes.length}
        tool={tool}
      />

      <div className="tour-flow-canvas" data-tool={tool}>
        <ReactFlow<TourFlowCanvasNode, TourFlowCanvasEdge>
          aria-label={authoringText('Flow Map')}
          ariaLabelConfig={FLOW_ARIA_LABEL_CONFIG}
          deleteKeyCode={null}
          edges={edges}
          elementsSelectable={tool === 'select'}
          elevateEdgesOnSelect
          fitView
          fitViewOptions={{ maxZoom: 1, padding: 0.16 }}
          maxZoom={1.6}
          minZoom={0.35}
          nodeTypes={NODE_TYPES}
          nodes={nodes}
          nodesConnectable={false}
          nodesDraggable={tool === 'select'}
          onEdgeClick={onEdgeClick}
          onEdgesChange={onEdgesChange}
          onInit={setInstance}
          onNodeClick={onNodeClick}
          onNodesChange={onNodesChange}
          onViewportChange={(viewport) => setZoom(viewport.zoom)}
          panOnDrag={tool === 'pan'}
          proOptions={{ hideAttribution: true }}
          selectionOnDrag={tool === 'select'}
        >
          <Background color="#cbd5d1" gap={18} size={1} variant={BackgroundVariant.Dots} />
        </ReactFlow>

        <TourFlowCanvasControls
          onFitView={fitView}
          onZoomIn={() => void instance?.zoomIn({ duration: 120 })}
          onZoomOut={() => void instance?.zoomOut({ duration: 120 })}
          zoom={zoom}
        />

        {selectedFlowNode && selectedStep && !selectedActionBlock && !simulationOpen ? (
          <FlowNodeInspector
            controller={controller}
            document={document}
            findings={selectedFindings.map((finding) => finding.code)}
            names={new Map(flow.nodes.map((node) => [node.id, node.title]))}
            node={selectedFlowNode}
            onOpenEditor={() => {
              controller.activateTourStep(selectedFlowNode.id);
              onClose();
            }}
            step={selectedStep}
          />
        ) : null}

        {selectedActionBlock && actionOwningStep && actionTooltip ? (
          <TourFlowWorkbench
            block={selectedActionBlock}
            controller={controller}
            mode={workbenchMode}
            onClose={() => setSelectedActionBlockId(null)}
            onEditStep={() => {
              controller.activateTourStep(actionOwningStep.id);
              onClose();
            }}
            onModeChange={setWorkbenchMode}
            step={actionOwningStep}
            steps={steps}
            tooltip={actionTooltip}
          />
        ) : null}

        {simulationOpen ? (
          <TourFlowSettings
            controller={controller}
            onClose={() => setSimulationOpen(false)}
            selectedStepId={selectedStepId}
          />
        ) : null}
      </div>
    </section>
  );
}

function reconcileNodePositions(
  current: readonly TourFlowCanvasNode[],
  next: readonly TourFlowCanvasNode[],
): TourFlowCanvasNode[] {
  const currentPositions = new Map(current.map((node) => [node.id, node.position]));
  return next.map((node) => ({
    ...node,
    position: currentPositions.get(node.id) ?? node.position,
  }));
}

function findNestedBlock(block: LodariqBlock, blockId: string): LodariqBlock | null {
  if (block.id === blockId) return block;
  for (const child of block.children) {
    const match = findNestedBlock(child, blockId);
    if (match) return match;
  }
  return null;
}

function findNestedBlockAcrossSteps(
  steps: readonly LodariqBlock[],
  blockId: string,
): LodariqBlock | null {
  for (const step of steps) {
    const match = findNestedBlock(step, blockId);
    if (match) return match;
  }
  return null;
}

function firstBlockOfType(block: LodariqBlock, type: LodariqBlock['type']): LodariqBlock | null {
  if (block.type === type) return block;
  for (const child of block.children) {
    const match = firstBlockOfType(child, type);
    if (match) return match;
  }
  return null;
}

function blockIsInside(block: LodariqBlock, blockId: string): boolean {
  return block.id === blockId || block.children.some((child) => blockIsInside(child, blockId));
}

function FlowNodeInspector({
  controller,
  document,
  findings,
  names,
  node,
  onOpenEditor,
  step,
}: {
  controller: LocalAuthoringFrameController;
  document: LodariqDocument;
  findings: readonly TourFlowFindingCode[];
  names: ReadonlyMap<string, string>;
  node: DerivedTourFlowNode;
  onOpenEditor: () => void;
  step: LodariqBlock;
}) {
  const targetId = targetIdOf(step);
  const targetLabel = targetId
    ? targetLabelOf(document, targetId)
    : authoringText('No target selected');
  return (
    <aside className="tour-flow-node-inspector">
      <header>
        <span>
          <small>{authoringText('Step {number}', { number: node.index + 1 })}</small>
          <strong>{node.title}</strong>
        </span>
        <span className={findings.length ? 'repair' : 'ready'}>
          {findings.length ? authoringText('Needs review') : authoringText('Healthy')}
        </span>
      </header>
      <dl>
        <div>
          <dt>{authoringText('Target')}</dt>
          <dd>{targetLabel}</dd>
        </div>
        <div>
          <dt>{authoringText('On Next')}</dt>
          <dd aria-label={authoringText('Outgoing paths')}>
            {node.edges
              .map(
                (edge) =>
                  `${flowEdgeLabel(edge.kind, edge.conditionCount)}: ${destinationLabel(edge.to, names)}`,
              )
              .join(' · ')}
          </dd>
        </div>
      </dl>
      {findings.map((finding) => (
        <p className="tour-flow-finding" key={finding}>
          {FINDING_LABELS[finding]}
        </p>
      ))}
      <span className="tour-flow-node-inspector-actions">
        <button onClick={onOpenEditor} type="button">
          {authoringText('Edit step')}
        </button>
        <button onClick={() => controller.previewFullTourFromStep(node.id)} type="button">
          <Eye size={13} strokeWidth={2} aria-hidden="true" />
          {authoringText('Preview from here')}
        </button>
      </span>
    </aside>
  );
}

function flowEdgeLabel(
  kind: 'implicit' | 'rule' | 'fallback' | 'action',
  conditions: number,
): string {
  if (kind === 'rule') return authoringText('{count} conditions', { count: conditions });
  if (kind === 'fallback') return authoringText('Fallback');
  if (kind === 'implicit') return authoringText('Default path');
  return authoringText('Action path');
}

function destinationLabel(
  destination: StepTransitionDestination,
  names: ReadonlyMap<string, string>,
): string {
  if (destination.type === 'step') {
    return names.get(destination.stepId) ?? authoringText('Missing step');
  }
  if (destination.type === 'dismiss') return authoringText('Close tour');
  if (destination.type === 'complete') return authoringText('Complete tour');
  return authoringText('Next step');
}

export default TourFlowMap;
