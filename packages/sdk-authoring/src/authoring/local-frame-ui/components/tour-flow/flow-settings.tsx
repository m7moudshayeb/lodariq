import type { AuthoringFlowSimulationContext } from '@lodariq/schema';
import { useState } from 'react';
import { authoringText } from '../../../../i18n';
import type { LocalAuthoringFrameController } from '../../controller';
import { AuthoringButton, AuthoringTextField, X } from '../../design-system';

export function TourFlowSettings({
  controller,
  onClose,
  selectedStepId,
}: {
  controller: LocalAuthoringFrameController;
  onClose: () => void;
  selectedStepId: string | null;
}) {
  return (
    <section className="tour-flow-settings" aria-label={authoringText('Branch simulation')}>
      <header>
        <strong>{authoringText('Branch simulation')}</strong>
        <button aria-label={authoringText('Close settings')} onClick={onClose} type="button">
          <X size={15} strokeWidth={2} aria-hidden="true" />
        </button>
      </header>
      <div className="tour-flow-settings-content">
        <BranchSimulationEditor controller={controller} selectedStepId={selectedStepId} />
      </div>
    </section>
  );
}

function BranchSimulationEditor({
  controller,
  selectedStepId,
}: {
  controller: LocalAuthoringFrameController;
  selectedStepId: string | null;
}) {
  const [traitKey, setTraitKey] = useState('');
  const [traitValue, setTraitValue] = useState('');
  const [stateKey, setStateKey] = useState('');
  const [stateValue, setStateValue] = useState('');
  const simulationContext = flowSimulationContext(traitKey, traitValue, stateKey, stateValue);
  return (
    <fieldset className="tour-flow-simulation flow-settings-editor">
      <legend className="visually-hidden">{authoringText('Branch simulation')}</legend>
      <p>
        {authoringText('Supply only declared test values. The preview does not read product data.')}
      </p>
      <div className="tour-flow-simulation-grid">
        <AuthoringTextField
          label={authoringText('Visitor trait key')}
          maxLength={80}
          pattern="[A-Za-z][A-Za-z0-9._:-]*"
          onChange={(event) => setTraitKey(event.currentTarget.value)}
          value={traitKey}
        />
        <AuthoringTextField
          label={authoringText('Visitor trait test value')}
          maxLength={160}
          onChange={(event) => setTraitValue(event.currentTarget.value)}
          value={traitValue}
        />
        <AuthoringTextField
          label={authoringText('Document state key')}
          maxLength={80}
          pattern="[A-Za-z][A-Za-z0-9._:-]*"
          onChange={(event) => setStateKey(event.currentTarget.value)}
          value={stateKey}
        />
        <AuthoringTextField
          label={authoringText('Document state test value')}
          maxLength={160}
          onChange={(event) => setStateValue(event.currentTarget.value)}
          value={stateValue}
        />
      </div>
      <AuthoringButton
        disabled={!simulationContext}
        onClick={() =>
          simulationContext &&
          controller.previewFlowSimulation(simulationContext, selectedStepId ?? undefined)
        }
        tone="primary"
      >
        {authoringText('Start branch simulation')}
      </AuthoringButton>
    </fieldset>
  );
}

function flowSimulationContext(
  traitKey: string,
  traitValue: string,
  stateKey: string,
  stateValue: string,
): AuthoringFlowSimulationContext | null {
  const normalizedTraitKey = traitKey.trim();
  const normalizedStateKey = stateKey.trim();
  if (!normalizedTraitKey && !normalizedStateKey) return null;
  const validKey = /^[A-Za-z][A-Za-z0-9._:-]{0,79}$/u;
  if (
    (normalizedTraitKey && !validKey.test(normalizedTraitKey)) ||
    (normalizedStateKey && !validKey.test(normalizedStateKey))
  ) {
    return null;
  }
  return {
    ...(normalizedTraitKey ? { identifyTraits: { [normalizedTraitKey]: traitValue } } : {}),
    ...(normalizedStateKey ? { documentState: { [normalizedStateKey]: stateValue } } : {}),
  };
}
