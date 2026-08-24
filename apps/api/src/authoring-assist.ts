import { createHash } from 'node:crypto';
import {
  canonicalContentLocale,
  materializeLocalizedDocument,
  AiAssistProposal,
  type AiAssistRequest,
  type LodariqBlock,
  type LodariqDocument,
  validate,
} from '@lodariq/schema';

const BLOCK_CONTENT_PREFIX = 'block:';
const BLOCK_CONTENT_SUFFIX = '/content';
const ASSIST_WINDOW_MS = 60_000;
const ASSIST_REQUESTS_PER_WINDOW = 20;
const IDEMPOTENCY_TTL_MS = 15 * 60_000;
const IDEMPOTENCY_MAX_ENTRIES = 4_000;

export interface AuthoringAssistProviderInput {
  readonly request: AiAssistRequest;
  readonly document: LodariqDocument;
}

export interface AuthoringAssistProvider {
  propose: (input: AuthoringAssistProviderInput) => Promise<AuthoringAssistProviderResult>;
}

export interface MeasuredProviderUsage {
  provider: string;
  usageUnit: 'tokens' | 'characters' | 'seconds' | 'images';
  inputUnits: number;
  outputUnits: number;
  providerCostMicros: number;
}

export interface AuthoringAssistProviderResult {
  proposal: AiAssistProposal;
  usage: MeasuredProviderUsage & { usageUnit: 'tokens' };
}

export class AuthoringAssistFailure extends Error {
  constructor(
    readonly code:
      | 'invalid_request_scope'
      | 'invalid_provider_response'
      | 'idempotency_conflict'
      | 'rate_limited',
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}

interface AssistOperation {
  readonly createdAt: number;
  readonly requestHash: string;
  readonly result: Promise<AuthoringAssistProviderResult>;
}

interface AssistRateWindow {
  count: number;
  startedAt: number;
}

/** Bounded server-side dedupe for proposal-only operations; document mutation remains client-explicit. */
export class AuthoringAssistCoordinator {
  private readonly operations = new Map<string, AssistOperation>();
  private readonly rateWindows = new Map<string, AssistRateWindow>();

  async request(input: {
    sessionId: string;
    operationId: string;
    document: LodariqDocument;
    request: AiAssistRequest;
    provider: AuthoringAssistProvider;
    now?: number;
  }): Promise<{ proposal: AiAssistProposal; usage: AuthoringAssistProviderResult['usage']; replayed: boolean }> {
    const now = input.now ?? Date.now();
    this.prune(now);
    const operationKey = `${input.sessionId}:${input.operationId}`;
    const requestHash = hashAssistRequest(input.document, input.request);
    const existing = this.operations.get(operationKey);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new AuthoringAssistFailure('idempotency_conflict');
      }
      const result = await existing.result;
      return { ...structuredClone(result), replayed: true };
    }
    this.consumeRate(input.sessionId, now);
    const result = requestBoundedAuthoringAssist(input.document, input.request, input.provider);
    this.operations.set(operationKey, { createdAt: now, requestHash, result });
    try {
      return { ...structuredClone(await result), replayed: false };
    } catch (error) {
      this.operations.delete(operationKey);
      throw error;
    }
  }

  private consumeRate(sessionId: string, now: number): void {
    const current = this.rateWindows.get(sessionId);
    if (!current || current.startedAt + ASSIST_WINDOW_MS <= now) {
      this.rateWindows.set(sessionId, { count: 1, startedAt: now });
      return;
    }
    if (current.count >= ASSIST_REQUESTS_PER_WINDOW) {
      throw new AuthoringAssistFailure(
        'rate_limited',
        Math.max(1, Math.ceil((current.startedAt + ASSIST_WINDOW_MS - now) / 1_000)),
      );
    }
    current.count += 1;
  }

  private prune(now: number): void {
    for (const [key, operation] of this.operations) {
      if (operation.createdAt + IDEMPOTENCY_TTL_MS <= now) this.operations.delete(key);
    }
    while (this.operations.size >= IDEMPOTENCY_MAX_ENTRIES) {
      const oldest = this.operations.keys().next().value as string | undefined;
      if (!oldest) break;
      this.operations.delete(oldest);
    }
    for (const [key, window] of this.rateWindows) {
      if (window.startedAt + ASSIST_WINDOW_MS <= now) this.rateWindows.delete(key);
    }
  }
}

export async function requestBoundedAuthoringAssist(
  document: LodariqDocument,
  request: AiAssistRequest,
  provider: AuthoringAssistProvider,
): Promise<AuthoringAssistProviderResult> {
  const allowedBlockIds = assistBlockScope(document, request);
  if (allowedBlockIds.size === 0) throw new AuthoringAssistFailure('invalid_request_scope');
  const result = await provider.propose({
    request: structuredClone(request),
    document: structuredClone(document),
  });
  return {
    proposal: validateAssistProposal(document, result.proposal, allowedBlockIds),
    usage: validateProviderUsage(result.usage),
  };
}

export function creditsForProviderUsage(
  usage: MeasuredProviderUsage,
): number {
  if (usage.providerCostMicros > 0) {
    return Math.max(1, Math.ceil(usage.providerCostMicros / 1_000));
  }
  const units = usage.inputUnits + usage.outputUnits;
  const unitsPerCredit = usage.usageUnit === 'characters' ? 5_000 : 1_000;
  return Math.max(1, Math.ceil(units / unitsPerCredit));
}

function validateProviderUsage(
  usage: AuthoringAssistProviderResult['usage'],
): AuthoringAssistProviderResult['usage'] {
  if (
    !usage ||
    !usage.provider.trim() ||
    usage.provider.length > 80 ||
    usage.usageUnit !== 'tokens' ||
    !Number.isInteger(usage.inputUnits) ||
    !Number.isInteger(usage.outputUnits) ||
    !Number.isInteger(usage.providerCostMicros) ||
    usage.inputUnits < 0 ||
    usage.outputUnits < 0 ||
    usage.providerCostMicros < 0
  ) {
    throw new AuthoringAssistFailure('invalid_provider_response');
  }
  return { ...usage, provider: usage.provider.trim() };
}

function validateAssistProposal(
  document: LodariqDocument,
  proposal: AiAssistProposal,
  allowedBlockIds: ReadonlySet<string>,
): AiAssistProposal {
  if (!validate(AiAssistProposal, proposal).valid) {
    throw new AuthoringAssistFailure('invalid_provider_response');
  }
  if (
    !proposal.proposalId ||
    proposal.proposalId.length > 128 ||
    !proposal.summary.trim() ||
    proposal.summary.length > 240 ||
    proposal.edits.length === 0 ||
    proposal.edits.length > 100
  ) {
    throw new AuthoringAssistFailure('invalid_provider_response');
  }
  const blocks = flattenBlocks(document.blocks);
  const seen = new Set<string>();
  const edits = proposal.edits.map((edit) => {
    const blockId = parseBlockContentPath(edit.path);
    const block = blockId ? blocks.get(blockId) : undefined;
    const locale = edit.locale ? canonicalContentLocale(edit.locale) : null;
    const identity = `${locale ?? ''}:${edit.path}`;
    if (
      !blockId ||
      !block ||
      block.children.length > 0 ||
      block.content === undefined ||
      !allowedBlockIds.has(blockId) ||
      seen.has(identity) ||
      edit.after.length > 10_000 ||
      edit.after === edit.before
    ) {
      throw new AuthoringAssistFailure('invalid_provider_response');
    }
    const current = locale
      ? flattenBlocks(materializeLocalizedDocument(document, locale).blocks).get(blockId)?.content
      : block.content;
    if (current !== edit.before) throw new AuthoringAssistFailure('invalid_provider_response');
    seen.add(identity);
    return {
      path: edit.path,
      before: edit.before,
      after: edit.after,
      ...(locale ? { locale } : {}),
    };
  });
  return { proposalId: proposal.proposalId, summary: proposal.summary.trim(), edits };
}

function assistBlockScope(document: LodariqDocument, request: AiAssistRequest): Set<string> {
  const blocks = flattenBlocks(document.blocks);
  if (request.kind === 'rewrite') {
    const exact = [...blocks.values()].find(
      (block) => block.children.length === 0 && block.content?.trim() === request.text.trim(),
    );
    return exact ? new Set([exact.id]) : new Set();
  }
  const stepIds = request.kind === 'draft-step' ? [request.stepId] : request.stepIds;
  const allowed = new Set<string>();
  for (const stepId of stepIds) {
    const step = blocks.get(stepId);
    if (!step || step.type !== 'tourStep') return new Set();
    visitBlocks([step], (block) => {
      if (block.children.length === 0 && block.content !== undefined) allowed.add(block.id);
    });
  }
  return allowed;
}

function parseBlockContentPath(path: string): string | null {
  if (!path.startsWith(BLOCK_CONTENT_PREFIX) || !path.endsWith(BLOCK_CONTENT_SUFFIX)) return null;
  const blockId = path.slice(BLOCK_CONTENT_PREFIX.length, -BLOCK_CONTENT_SUFFIX.length);
  return blockId ? blockId : null;
}

function flattenBlocks(blocks: readonly LodariqBlock[]): Map<string, LodariqBlock> {
  const result = new Map<string, LodariqBlock>();
  visitBlocks(blocks, (block) => result.set(block.id, block));
  return result;
}

function visitBlocks(blocks: readonly LodariqBlock[], visit: (block: LodariqBlock) => void): void {
  for (const block of blocks) {
    visit(block);
    visitBlocks(block.children, visit);
  }
}

function hashAssistRequest(document: LodariqDocument, request: AiAssistRequest): string {
  return createHash('sha256').update(JSON.stringify({ document, request })).digest('hex');
}
