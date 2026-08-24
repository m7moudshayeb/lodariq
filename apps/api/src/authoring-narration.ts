import { createHash } from 'node:crypto';
import { canonicalJson, sha256Hex } from '@lodariq/compiler';
import {
  AUTHORING_RESOURCE_LIMITS,
  NarrationAudio,
  sanitizeNarrationAudio,
  validate,
  type AuthoringMediaAssetResource,
  type LodariqBlock,
  type LodariqDocument,
  type NarrationCue,
  type NarrationVoice,
  type StepNarration,
} from '@lodariq/schema';
import type { MeasuredProviderUsage } from './authoring-assist';

const OPERATION_TTL_MS = 15 * 60_000;
const OPERATION_LIMIT = 4_000;

export interface NarrationProviderInput {
  operationId: string;
  narration: StepNarration;
  voice: NarrationVoice | null;
}

export interface NarrationProviderResult {
  bytes: Uint8Array;
  contentType: 'audio/mpeg' | 'audio/ogg' | 'audio/wav';
  durationMs: number;
  cues: readonly NarrationCue[];
  model: string;
  usage: MeasuredProviderUsage;
}

export interface NarrationProvider {
  voices: readonly NarrationVoice[];
  generate: (input: NarrationProviderInput) => Promise<NarrationProviderResult>;
}

export interface CommittedNarrationGeneration {
  audio: NarrationAudio;
  asset: AuthoringMediaAssetResource;
  usage: MeasuredProviderUsage;
}

export class NarrationGenerationFailure extends Error {
  constructor(
    readonly code:
      | 'step_not_found'
      | 'narration_missing'
      | 'voice_unavailable'
      | 'voice_consent_required'
      | 'idempotency_conflict'
      | 'invalid_provider_response',
  ) {
    super(code);
  }
}

interface Operation {
  createdAt: number;
  requestHash: string;
  result: Promise<CommittedNarrationGeneration>;
}

export class NarrationGenerationCoordinator {
  private readonly operations = new Map<string, Operation>();

  async request(input: {
    sessionId: string;
    operationId: string;
    stepId: string;
    document: LodariqDocument;
    provider: NarrationProvider;
    commit: (
      generated: NarrationProviderResult,
      audio: NarrationAudio,
    ) => Promise<CommittedNarrationGeneration>;
    now?: number;
  }): Promise<CommittedNarrationGeneration & { replayed: boolean }> {
    const narration = narrationForStep(input.document, input.stepId);
    const voice = narration.voiceId
      ? (input.provider.voices.find((candidate) => candidate.id === narration.voiceId) ?? null)
      : null;
    if (narration.voiceId && !voice) throw new NarrationGenerationFailure('voice_unavailable');
    if (voice?.cloned) throw new NarrationGenerationFailure('voice_consent_required');

    const now = input.now ?? Date.now();
    this.prune(now);
    const key = `${input.sessionId}:${input.operationId}`;
    const requestHash = await narrationRequestHash(input.stepId, narration, voice);
    const existing = this.operations.get(key);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new NarrationGenerationFailure('idempotency_conflict');
      }
      return { ...structuredClone(await existing.result), replayed: true };
    }

    const result = this.generateAndCommit(input, narration, voice);
    this.operations.set(key, { createdAt: now, requestHash, result });
    try {
      return { ...structuredClone(await result), replayed: false };
    } catch (error) {
      this.operations.delete(key);
      throw error;
    }
  }

  private async generateAndCommit(
    input: Parameters<NarrationGenerationCoordinator['request']>[0],
    narration: StepNarration,
    voice: NarrationVoice | null,
  ): Promise<CommittedNarrationGeneration> {
    const generated = await input.provider.generate({
      operationId: input.operationId,
      narration: structuredClone(narration),
      voice: voice ? structuredClone(voice) : null,
    });
    validateProviderResult(generated);
    const sourceHash = await narrationSourceHash(narration, voice, generated.model);
    const audio: NarrationAudio = {
      assetId: 'pending',
      contentHash: `sha256-${createHash('sha256').update(generated.bytes).digest('hex')}`,
      contentType: generated.contentType,
      durationMs: generated.durationMs,
      cues: generated.cues.map((cue) => ({ ...cue })),
      sourceHash,
    };
    return input.commit(generated, audio);
  }

  private prune(now: number): void {
    for (const [key, operation] of this.operations) {
      if (operation.createdAt + OPERATION_TTL_MS <= now) this.operations.delete(key);
    }
    while (this.operations.size >= OPERATION_LIMIT) {
      const oldest = this.operations.keys().next().value as string | undefined;
      if (!oldest) break;
      this.operations.delete(oldest);
    }
  }
}

function narrationForStep(document: LodariqDocument, stepId: string): StepNarration {
  const step = findBlock(document.blocks, stepId);
  if (!step || step.type !== 'tourStep') throw new NarrationGenerationFailure('step_not_found');
  if (!step.props.narration?.script.trim()) {
    throw new NarrationGenerationFailure('narration_missing');
  }
  return step.props.narration;
}

function findBlock(blocks: readonly LodariqBlock[], id: string): LodariqBlock | null {
  for (const block of blocks) {
    if (block.id === id) return block;
    const child = findBlock(block.children, id);
    if (child) return child;
  }
  return null;
}

async function narrationSourceHash(
  narration: StepNarration,
  voice: NarrationVoice | null,
  model: string,
): Promise<string> {
  return `sha256-${await sha256Hex(
    canonicalJson({
      script: narration.script,
      voiceId: voice?.id ?? narration.voiceId ?? null,
      locale: narration.localeOverride ?? voice?.locale ?? null,
      speed: narration.speed ?? 1,
      model,
    }),
  )}`;
}

async function narrationRequestHash(
  stepId: string,
  narration: StepNarration,
  voice: NarrationVoice | null,
): Promise<string> {
  return `sha256-${await sha256Hex(
    canonicalJson({
      stepId,
      script: narration.script,
      voiceId: voice?.id ?? narration.voiceId ?? null,
      locale: narration.localeOverride ?? voice?.locale ?? null,
      speed: narration.speed ?? 1,
    }),
  )}`;
}

function validateProviderResult(result: NarrationProviderResult): void {
  const audio = {
    assetId: 'pending',
    contentHash: `sha256-${'0'.repeat(64)}`,
    sourceHash: `sha256-${'0'.repeat(64)}`,
    contentType: result.contentType,
    durationMs: result.durationMs,
    cues: result.cues,
  };
  if (
    !result.model.trim() ||
    result.model.length > 120 ||
    result.bytes.byteLength < 1 ||
    result.bytes.byteLength > AUTHORING_RESOURCE_LIMITS.assetBytes ||
    !validate(NarrationAudio, audio).valid ||
    !sanitizeNarrationAudio(audio) ||
    !matchesAudioType(result.bytes, result.contentType) ||
    !validUsage(result.usage)
  ) {
    throw new NarrationGenerationFailure('invalid_provider_response');
  }
}

function validUsage(usage: MeasuredProviderUsage): boolean {
  return (
    Boolean(usage.provider.trim()) &&
    usage.provider.length <= 80 &&
    (usage.usageUnit === 'characters' || usage.usageUnit === 'seconds') &&
    Number.isInteger(usage.inputUnits) &&
    usage.inputUnits >= 0 &&
    Number.isInteger(usage.outputUnits) &&
    usage.outputUnits >= 0 &&
    Number.isInteger(usage.providerCostMicros) &&
    usage.providerCostMicros >= 0
  );
}

function matchesAudioType(
  bytes: Uint8Array,
  contentType: NarrationProviderResult['contentType'],
): boolean {
  const head = Buffer.from(bytes.subarray(0, 12));
  if (contentType === 'audio/mpeg') {
    return (
      head.subarray(0, 3).toString('ascii') === 'ID3' ||
      (head[0] === 0xff && (Number(head[1]) & 0xe0) === 0xe0)
    );
  }
  if (contentType === 'audio/ogg') return head.subarray(0, 4).toString('ascii') === 'OggS';
  return (
    head.subarray(0, 4).toString('ascii') === 'RIFF' &&
    head.subarray(8, 12).toString('ascii') === 'WAVE'
  );
}
