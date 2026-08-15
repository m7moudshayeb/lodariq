import {
  analyzeTourDocumentFlow,
  analyzeTourFlow,
  type BasicVisualPreflightIssue,
  type CompiledDocumentV4,
  type LodariqDocument,
  type TourFlowIssue,
} from '@lodariq/schema';

type FlowIssue = Extract<
  BasicVisualPreflightIssue,
  {
    code: TourFlowIssue['code'];
  }
>;

export interface TourDocumentFlowIssue {
  actionBlockId?: string;
  code: TourFlowIssue['code'];
  severity: TourFlowIssue['severity'];
  stepId: string;
  stepIndex: number;
}

/** Pure graph validation derived from compiled action edges. */
export function validateCompiledTourFlow(artifact: CompiledDocumentV4): FlowIssue[] {
  const completionStepId =
    artifact.completion?.type === 'showStep' ? artifact.completion.stepId : undefined;
  const analysis = analyzeTourFlow(
    artifact.steps.map((step) => ({
      id: step.id,
      actionNodes: step.body.map((node) => ({ id: node.id, action: node.props.action })),
    })),
    { ...(completionStepId ? { completionStepId } : {}) },
  );
  return analysis.findings.map((finding) => ({
    code: finding.code,
    severity: finding.severity,
    stepIndex: finding.stepIndex,
    ...(finding.actionNodeIndex === undefined ? {} : { nodeIndex: finding.actionNodeIndex }),
  }));
}

/** Release-equivalent topology checks against canonical structured block JSON. */
export function validateTourDocumentFlow(document: LodariqDocument): TourDocumentFlowIssue[] {
  return analyzeTourDocumentFlow(document).findings.map((finding) => ({
    code: finding.code,
    severity: finding.severity,
    stepId: finding.stepId,
    stepIndex: finding.stepIndex,
    ...(finding.actionBlockId ? { actionBlockId: finding.actionBlockId } : {}),
  }));
}
