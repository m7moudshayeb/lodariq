import { describe, expect, it } from 'vitest';
import {
  BlockActionProps,
  AuthoringFlowSimulationContext,
  MediaPresentation,
  ResponsiveStepPresentation,
  StepChoreography,
  StepTransition,
  StructuredCompositionPresentation,
  TourStepStyleSnapshot,
  TourMotionPresentation,
  validate,
} from '@lodariq/schema';

describe('Tour reliability and flow contracts', () => {
  it('accepts a bounded activate, wait, and continue sequence', () => {
    const sequence = {
      trigger: { type: 'activateTarget', targetId: 'target-import' },
      waitFor: [
        { type: 'targetAvailable', targetId: 'target-dialog-close' },
        { type: 'event', eventName: 'import.dialog.ready' },
      ],
      transition: { type: 'next' },
      timeoutMs: 3_000,
      onTimeout: 'retry',
    };
    expect(validate(StepChoreography, sequence).valid).toBe(true);
    expect(validate(BlockActionProps, { type: 'runSequence', sequence }).valid).toBe(true);
  });

  it('accepts value-free click, focus, and input observation triggers', () => {
    for (const type of [
      'observeTargetClick',
      'observeTargetFocus',
      'observeTargetInput',
    ] as const) {
      expect(
        validate(StepChoreography, {
          ...validSequence(),
          trigger: { type, targetId: 'target-field' },
        }).valid,
      ).toBe(true);
    }
    expect(
      validate(StepChoreography, {
        ...validSequence(),
        trigger: {
          type: 'observeTargetInput',
          targetId: 'target-field',
          value: 'must-never-be-stored',
        },
      }).valid,
    ).toBe(false);
  });

  it.each([
    { ...validSequence(), script: 'alert(1)' },
    { ...validSequence(), waitFor: [{ type: 'selector', value: '#dialog' }] },
    { ...validSequence(), timeoutMs: 0 },
    { ...validSequence(), waitFor: Array.from({ length: 9 }, () => ({ type: 'networkIdle' })) },
  ])('rejects undeclared or unbounded choreography %#', (sequence) => {
    expect(validate(StepChoreography, sequence).valid).toBe(false);
  });

  it('keeps action variants exact and requires a destination for recovery routing', () => {
    expect(validate(BlockActionProps, { type: 'next', url: '/unsafe-shape' }).valid).toBe(false);
    expect(validate(BlockActionProps, { type: 'runSequence' }).valid).toBe(false);
    expect(
      validate(StepChoreography, {
        ...validSequence(),
        onTimeout: 'goToStep',
      }).valid,
    ).toBe(false);
    expect(
      validate(StepChoreography, {
        ...validSequence(),
        onTimeout: 'goToStep',
        timeoutStepId: 'step-help',
      }).valid,
    ).toBe(true);
  });

  it('requires a deterministic fallback and rejects undeclared customer data', () => {
    const transition = {
      rules: [
        {
          all: [{ source: 'identifyTrait', key: 'plan', operator: 'equals', value: 'pro' }],
          to: { type: 'step', stepId: 'step-pro' },
        },
      ],
      fallback: { type: 'complete' },
    };
    expect(validate(StepTransition, transition).valid).toBe(true);
    expect(
      validate(StepTransition, {
        ...transition,
        rules: [
          {
            all: [{ source: 'databaseQuery', key: 'payments' }],
            to: { type: 'complete' },
          },
        ],
      }).valid,
    ).toBe(false);
    const { fallback: _fallback, ...withoutFallback } = transition;
    expect(validate(StepTransition, withoutFallback).valid).toBe(false);
  });

  it('keeps style projections closed against behavior and target fields', () => {
    expect(
      validate(TourStepStyleSnapshot, {
        popupStyle: { surfaceColor: '#102030' },
        action: { type: 'dismiss' },
      }).valid,
    ).toBe(false);
    expect(
      validate(TourStepStyleSnapshot, {
        popupStyle: { surfaceColor: '#102030' },
        primaryActionStyle: { fillColor: '#405060' },
      }).valid,
    ).toBe(true);
  });

  it('accepts only bounded semantic presentation and branch simulation data', () => {
    expect(
      validate(TourMotionPresentation, {
        recipe: 'lift',
        durationMs: 240,
        easing: 'standard',
        reducedMotion: 'none',
      }).valid,
    ).toBe(true);
    expect(validate(TourMotionPresentation, { recipe: 'javascript', durationMs: 240 }).valid).toBe(
      false,
    );
    expect(
      validate(ResponsiveStepPresentation, {
        compact: { placement: 'bottom', widthPx: 296, actionLayout: 'stack' },
      }).valid,
    ).toBe(true);
    expect(
      validate(MediaPresentation, {
        kind: 'video',
        assetId: 'asset.demo',
        accessibilityName: 'Product walkthrough',
      }).valid,
    ).toBe(true);
    expect(
      validate(AuthoringFlowSimulationContext, {
        identifyTraits: { plan: 'pro' },
        documentState: { onboardingReady: true },
      }).valid,
    ).toBe(true);
    expect(
      validate(AuthoringFlowSimulationContext, {
        identifyTraits: { 'bad key': 'value' },
      }).valid,
    ).toBe(false);
  });

  it('keeps callout, stat, and icon renderer recipes closed and typed', () => {
    for (const composition of [
      { kind: 'callout', tone: 'warning' },
      { kind: 'stat', emphasis: 'strong' },
      { kind: 'icon', icon: 'star' },
      { kind: 'icon', icon: 'rocket' },
    ] as const) {
      expect(validate(StructuredCompositionPresentation, composition).valid).toBe(true);
    }
    expect(
      validate(StructuredCompositionPresentation, {
        kind: 'icon',
        icon: 'custom-svg',
        html: '<svg />',
      }).valid,
    ).toBe(false);
  });
});

function validSequence() {
  return {
    trigger: { type: 'manual' },
    waitFor: [],
    transition: { type: 'next' },
    timeoutMs: 1_000,
    onTimeout: 'stay',
  };
}
