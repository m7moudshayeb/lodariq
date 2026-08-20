import type { LodariqBlock, LodariqDocument } from '@lodariq/schema';
import {
  blockContentPath,
  type AiAssistProposal,
  type AiAssistRequest,
  type AiRewriteVerb,
} from '../authoring/ai/assist-contract';

/**
 * A deterministic stand-in for the assist provider, for local development only.
 *
 * WIRE_BE: the real provider is `services.requestAiAssist`, supplied by the
 * authenticated authoring session and served by the control plane. Nothing here
 * ships to a hosted origin — `local-dev/*` is the fixture-host seam — and the
 * shape it returns is the same `AiAssistProposal` the real one must return, so
 * swapping it is one assignment in `frame.ts`.
 *
 * It exists so the assist surface can be seen and reviewed: a control that is
 * only ever disabled cannot be designed against.
 *
 * Reference: authoring-spec.html → `REWRITES` / `aiDraftStep()` / `aiNarration()`
 */

/** The prototype's own transforms, kept literal so the diffs read the same. */
const REWRITES: Record<AiRewriteVerb, (text: string) => string> = {
  shorter: (text) => text.split(/(?<=[.!?])\s+/u)[0] ?? text,
  clearer: (text) =>
    text
      .replace(/\bkeep\b/giu, 'hold')
      .replace(/together\./u, 'in one place.')
      .replace(/Start from/u, 'Begin with'),
  'more-formal': (text) =>
    text
      .replace(/let's/giu, 'let us')
      .replace(/you'll/giu, 'you will')
      .replace(/^(\w)/u, (match) => match.toUpperCase()),
  friendlier: (text) => text.replace(/\.$/u, ' — it takes about a minute.'),
  'fix-grammar': (text) =>
    text
      .replace(/\s+/gu, ' ')
      .replace(/\s([,.!?])/gu, '$1')
      .trim(),
};

const REWRITE_SUMMARIES: Record<AiRewriteVerb, string> = {
  shorter: 'Shorter',
  clearer: 'Clearer',
  'more-formal': 'More formal',
  friendlier: 'Friendlier',
  'fix-grammar': 'Fix grammar',
};

export function mockAssistProposal(
  request: AiAssistRequest,
  document: LodariqDocument | null,
): AiAssistProposal {
  const proposalId = `proposal_local_${request.kind}_${flatBlocks(document).length}`;
  if (request.kind === 'rewrite') {
    const block = blockForText(document, request.text);
    const before = block?.content ?? request.text;
    const after = REWRITES[request.verb](before);
    return {
      proposalId,
      summary: `${REWRITE_SUMMARIES[request.verb]} — ${before.length} → ${after.length} characters`,
      edits: block ? [{ path: blockContentPath(block.id), before, after }] : [],
    };
  }
  if (request.kind === 'draft-step') {
    const step = flatBlocks(document).find((block) => block.id === request.stepId);
    const heading = childOfType(step, 'heading');
    const paragraph = childOfType(step, 'paragraph');
    const name = request.target.accessibleName || 'this step';
    return {
      proposalId,
      summary: 'Drafted from the accessible name and role — no page pixels were sent anywhere',
      edits: [
        ...(heading
          ? [{ path: blockContentPath(heading.id), before: heading.content ?? '', after: name }]
          : []),
        ...(paragraph
          ? [
              {
                path: blockContentPath(paragraph.id),
                before: paragraph.content ?? '',
                after: draftCopyFor(name, request.target.role),
              },
            ]
          : []),
      ],
    };
  }
  if (request.kind === 'translate') {
    return {
      proposalId,
      summary: `Drafted ${request.stepIds.length} steps in ${request.locale}`,
      edits: request.stepIds.flatMap((stepId) => {
        const paragraph = childOfType(
          flatBlocks(document).find((block) => block.id === stepId),
          'paragraph',
        );
        if (!paragraph) return [];
        return [
          {
            path: blockContentPath(paragraph.id),
            before: paragraph.content ?? '',
            after: `[${request.locale}] ${paragraph.content ?? ''}`,
            locale: request.locale,
          },
        ];
      }),
    };
  }
  const target =
    childOfType(
      flatBlocks(document).find((block) => block.id === request.stepIds[0]),
      'paragraph',
    ) ?? flatBlocks(document).find((block) => block.type === 'paragraph');
  const before = target?.content ?? '';
  return {
    proposalId,
    summary: request.prompt,
    edits: target
      ? [
          {
            path: blockContentPath(target.id),
            before,
            after: `${capitalize(request.prompt)} — rewritten for this step.`,
          },
        ]
      : [],
  };
}

/** The prototype's role→sentence map: a draft is only as good as the a11y name. */
function draftCopyFor(name: string, role: string): string {
  const byRole: Record<string, string> = {
    button: `Use ${name} to move forward.`,
    'navigation link': `${name} is where this lives.`,
    'menu item': `Choose ${name} to continue.`,
    'table row': `This is a ${name.replace(' row', '')}.`,
    'text input': `Type your ${name.toLowerCase()} here.`,
    select: `Pick a ${name.toLowerCase()}.`,
    switch: `Turn ${name} on if you want it.`,
    card: `${name} shows what changed.`,
  };
  return byRole[role] ?? `This is ${name}.`;
}

function flatBlocks(document: LodariqDocument | null): LodariqBlock[] {
  const out: LodariqBlock[] = [];
  const walk = (blocks: readonly LodariqBlock[]): void => {
    for (const block of blocks) {
      out.push(block);
      walk(block.children);
    }
  };
  walk(document?.blocks ?? []);
  return out;
}

function blockForText(document: LodariqDocument | null, text: string): LodariqBlock | undefined {
  const trimmed = text.trim();
  const blocks = flatBlocks(document);
  return (
    blocks.find((block) => (block.content ?? '').trim() === trimmed) ??
    blocks.find((block) => trimmed.length > 0 && (block.content ?? '').includes(trimmed)) ??
    blocks.find((block) => block.type === 'paragraph')
  );
}

function childOfType(block: LodariqBlock | undefined, type: string): LodariqBlock | undefined {
  if (!block) return undefined;
  for (const child of block.children) {
    if (child.type === type) return child;
    const nested = childOfType(child, type);
    if (nested) return nested;
  }
  return undefined;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
