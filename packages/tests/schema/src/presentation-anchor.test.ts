import { describe, expect, it } from 'vitest';
import {
  BridgeMessage,
  ExactPresentationAnchor,
  LodariqBlockProps,
  PresentationAnchor,
  PresentationAnchorPickCanceledMessage,
  PresentationAnchorPickResultMessage,
  PresentationAnchorPickStartMessage,
  PreviewPatchOperation,
  isPresentationAnchor,
  sanitizePresentationAnchor,
  validate,
} from '@lodariq/schema';

const envelope = {
  protocol: '1' as const,
  sessionId: 'session_1',
  documentId: 'document_1',
  correlationId: 'correlation_1',
};

describe('presentation anchors', () => {
  it.each([
    { kind: 'element-bounds' },
    { kind: 'point', xRatio: 0, yRatio: 1 },
    { kind: 'region', xRatio: 0.2, yRatio: 0.3, widthRatio: 0.5, heightRatio: 0.4 },
  ])('accepts the closed $kind contract', (anchor) => {
    expect(validate(PresentationAnchor, anchor).valid).toBe(true);
    expect(isPresentationAnchor(anchor)).toBe(true);
    expect(validate(ExactPresentationAnchor, anchor).valid).toBe(anchor.kind !== 'element-bounds');
  });

  it.each([
    { kind: 'point', xRatio: -0.01, yRatio: 0.5 },
    { kind: 'point', xRatio: 0.5, yRatio: 1.01 },
    { kind: 'point', xRatio: Number.NaN, yRatio: 0.5 },
    { kind: 'point', xRatio: Number.POSITIVE_INFINITY, yRatio: 0.5 },
    { kind: 'region', xRatio: 0, yRatio: 0, widthRatio: 0, heightRatio: 0.4 },
    { kind: 'element-bounds', selector: '#unsafe' },
  ])('rejects non-finite, out-of-range, zero-area, or undeclared values', (anchor) => {
    expect(validate(PresentationAnchor, anchor).valid).toBe(false);
    expect(isPresentationAnchor(anchor)).toBe(false);
  });

  it('semantically rejects a region that extends outside its owner bounds', () => {
    const overflow = {
      kind: 'region',
      xRatio: 0.8,
      yRatio: 0.7,
      widthRatio: 0.3,
      heightRatio: 0.4,
    } as const;

    expect(isPresentationAnchor(overflow)).toBe(false);
    expect(sanitizePresentationAnchor(overflow)).toBeUndefined();
  });

  it('sanitizes a valid value into an isolated canonical object', () => {
    const source = {
      kind: 'region',
      xRatio: 0.1,
      yRatio: 0.2,
      widthRatio: 0.3,
      heightRatio: 0.4,
    } as const;

    const sanitized = sanitizePresentationAnchor(source);

    expect(sanitized).toEqual(source);
    expect(sanitized).not.toBe(source);
    expect(validate(LodariqBlockProps, { presentationAnchor: sanitized }).valid).toBe(true);
  });
});

describe('presentation-anchor bridge protocol', () => {
  const start = {
    ...envelope,
    type: 'presentation.anchor.pick.start' as const,
    blockId: 'tooltip_1',
    targetId: 'target_1',
    current: { kind: 'point' as const, xRatio: 0.4, yRatio: 0.6 },
  };
  const result = {
    ...envelope,
    correlationId: 'correlation_result_1',
    type: 'presentation.anchor.pick.result' as const,
    requestCorrelationId: envelope.correlationId,
    blockId: 'tooltip_1',
    targetId: 'target_1',
    presentationAnchor: { kind: 'point' as const, xRatio: 0.4, yRatio: 0.6 },
  };
  const canceled = {
    ...envelope,
    correlationId: 'correlation_canceled_1',
    type: 'presentation.anchor.pick.canceled' as const,
    requestCorrelationId: envelope.correlationId,
    blockId: 'tooltip_1',
    targetId: 'target_1',
  };

  it('accepts the closed start, result, and canceled messages', () => {
    expect(validate(PresentationAnchorPickStartMessage, start).valid).toBe(true);
    expect(validate(PresentationAnchorPickResultMessage, result).valid).toBe(true);
    expect(validate(PresentationAnchorPickCanceledMessage, canceled).valid).toBe(true);
    expect(validate(BridgeMessage, start).valid).toBe(true);
    expect(validate(BridgeMessage, result).valid).toBe(true);
    expect(validate(BridgeMessage, canceled).valid).toBe(true);
  });

  it('requires request correlation on result and canceled messages', () => {
    const resultWithoutRequest: Record<string, unknown> = { ...result };
    const cancelWithoutRequest: Record<string, unknown> = { ...canceled };
    delete resultWithoutRequest['requestCorrelationId'];
    delete cancelWithoutRequest['requestCorrelationId'];

    expect(validate(PresentationAnchorPickResultMessage, resultWithoutRequest).valid).toBe(false);
    expect(validate(PresentationAnchorPickCanceledMessage, cancelWithoutRequest).valid).toBe(false);
  });

  it('rejects undeclared message fields', () => {
    expect(validate(BridgeMessage, { ...start, selector: '#unsafe' }).valid).toBe(false);
    expect(validate(BridgeMessage, { ...result, x: 120, y: 80 }).valid).toBe(false);
    expect(
      validate(BridgeMessage, {
        ...result,
        presentationAnchor: { kind: 'element-bounds' },
      }).valid,
    ).toBe(false);
  });

  it('bounds request and entity identifiers carried by the picker protocol', () => {
    const overlongId = 'x'.repeat(257);

    expect(
      validate(PresentationAnchorPickStartMessage, { ...start, blockId: overlongId }).valid,
    ).toBe(false);
    expect(
      validate(PresentationAnchorPickResultMessage, {
        ...result,
        requestCorrelationId: overlongId,
      }).valid,
    ).toBe(false);
  });

  it('supports one semantic preview operation for setting or clearing an anchor', () => {
    expect(
      validate(PreviewPatchOperation, {
        op: 'setPresentationAnchor',
        presentationAnchor: { kind: 'point', xRatio: 0.25, yRatio: 0.75 },
      }).valid,
    ).toBe(true);
    expect(validate(PreviewPatchOperation, { op: 'setPresentationAnchor' }).valid).toBe(true);
    expect(
      validate(PreviewPatchOperation, {
        op: 'setPresentationAnchor',
        presentationAnchor: { kind: 'element-bounds' },
        selector: '#unsafe',
      }).valid,
    ).toBe(false);
  });
});
