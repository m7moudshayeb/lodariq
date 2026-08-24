/**
 * The six shipped experience types as registry entries (§5).
 *
 * Everything here is data. The point of the table in §5 is that the interaction
 * model is type-agnostic, so the differences between a tour and a checklist reduce
 * to which capabilities they compose, what they seed, and which gestures they
 * answer — none of which needs a branch in a surface.
 */
import type { LodariqBlock } from '@lodariq/schema';
import { authoringText } from '../../i18n';
import { INSPECTOR_SECTION_LABELS } from '../overlay/inspector-copy';
import { announcementFormFor, checklistFormFor } from './gestures';
import {
  registerExperience,
  type ExperienceDefinition,
  type ExperienceSeedContext,
} from './definition';

const CARD_SECTIONS = [
  { id: 'style', label: INSPECTOR_SECTION_LABELS.style, order: 0 },
  { id: 'actions', label: INSPECTOR_SECTION_LABELS.actions, order: 1 },
  { id: 'flow', label: authoringText('Step'), order: 2 },
  { id: 'target', label: INSPECTOR_SECTION_LABELS.target, order: 3 },
  { id: 'conditions', label: INSPECTOR_SECTION_LABELS.conditions, order: 4 },
  { id: 'narration', label: INSPECTOR_SECTION_LABELS.narration, order: 5 },
  { id: 'advanced', label: INSPECTOR_SECTION_LABELS.advanced, order: 0, advanced: true },
] as const;

const SURFACE_CAPABILITIES = [
  'structuredContent',
  'actions',
  'targeting',
  'popupComposition',
  'presentation',
  'reviewRecovery',
] as const;

const CONTENT_CAPABILITIES = [
  'structuredContent',
  'actions',
  'presentation',
  'reviewRecovery',
] as const;

const TOUR: ExperienceDefinition = {
  type: 'tour',
  capabilities: [...SURFACE_CAPABILITIES, 'flow', 'batch'],
  rootBlockTypes: ['tourStep'],
  workspace: 'sequence',
  gestures: ['pick-target', 'drag-anchor', 'resize', 'reorder'],
  inspectorSections: CARD_SECTIONS,
  seed: (context) => [tourStep(context, authoringText('Start here'))],
};

const ANNOUNCEMENT: ExperienceDefinition = {
  type: 'announcement',
  // Composition, not targeting: an announcement is triggered, and its form comes
  // from the region it is dropped in. Survey and checklist already read this way.
  capabilities: [...CONTENT_CAPABILITIES, 'popupComposition'],
  rootBlockTypes: ['tooltip'],
  workspace: 'singleSurface',
  /**
   * `drag-to-region` is doing the work of a modal-vs-banner dialog: the card starts
   * centre-screen as a modal and dragging it to an edge changes the form (§5).
   */
  gestures: ['drag-to-region', 'resize'],
  formFromRegion: announcementFormFor,
  inspectorSections: [
    { id: 'style', label: INSPECTOR_SECTION_LABELS.style, order: 0 },
    { id: 'dismissal', label: authoringText('Dismissal'), order: 1 },
    { id: 'frequency', label: authoringText('Frequency'), order: 2 },
    { id: 'audience', label: authoringText('Audience'), order: 3 },
    { id: 'advanced', label: INSPECTOR_SECTION_LABELS.advanced, order: 0, advanced: true },
  ],
  seed: (context) => [card(context, authoringText('What’s new'))],
};

const HOTSPOT: ExperienceDefinition = {
  type: 'hotspot',
  capabilities: SURFACE_CAPABILITIES,
  rootBlockTypes: ['spotlight', 'tooltip'],
  workspace: 'singleSurface',
  /** Marker and tooltip are one object in two states, so both gestures are here. */
  gestures: ['pick-target', 'drag-marker', 'pick-marker-form'],
  inspectorSections: [
    { id: 'marker', label: authoringText('Marker'), order: 0 },
    { id: 'tooltip', label: authoringText('Tooltip'), order: 1 },
    { id: 'trigger', label: authoringText('Trigger'), order: 2 },
    { id: 'style', label: INSPECTOR_SECTION_LABELS.style, order: 3 },
    { id: 'advanced', label: INSPECTOR_SECTION_LABELS.advanced, order: 0, advanced: true },
  ],
  seed: (context) => [card(context, authoringText('Did you know?'))],
};

const SURVEY: ExperienceDefinition = {
  type: 'survey',
  capabilities: CONTENT_CAPABILITIES,
  rootBlockTypes: ['tooltip'],
  workspace: 'collection',
  gestures: ['reorder-items', 'resize'],
  inspectorSections: [
    { id: 'question', label: authoringText('Question'), order: 0 },
    { id: 'options', label: authoringText('Options'), order: 1 },
    { id: 'logic', label: authoringText('Logic'), order: 2 },
    { id: 'style', label: INSPECTOR_SECTION_LABELS.style, order: 3 },
    { id: 'advanced', label: INSPECTOR_SECTION_LABELS.advanced, order: 0, advanced: true },
  ],
  /**
   * One CSAT question on the canvas immediately. `Start from a template` belongs in
   * the inspector's first section — nobody should face a template grid before
   * seeing anything (§5).
   */
  seed: (context) => [
    card(context, authoringText('How easy was that?'), [
      csatField(context, authoringText('How easy was that?')),
    ]),
  ],
};

const CHECKLIST: ExperienceDefinition = {
  type: 'checklist',
  capabilities: CONTENT_CAPABILITIES,
  rootBlockTypes: ['tooltip'],
  workspace: 'collection',
  /** Same edge-drag logic as announcements: an edge is a drawer, the middle floats. */
  gestures: ['drag-to-region', 'reorder-items'],
  formFromRegion: checklistFormFor,
  inspectorSections: [
    { id: 'items', label: authoringText('Items'), order: 0 },
    { id: 'completion', label: authoringText('Completion'), order: 1 },
    { id: 'style', label: INSPECTOR_SECTION_LABELS.style, order: 2 },
    { id: 'advanced', label: INSPECTOR_SECTION_LABELS.advanced, order: 0, advanced: true },
  ],
  seed: (context) => [
    card(context, authoringText('Get started'), [
      listItem(context, authoringText('Invite a teammate')),
    ]),
  ],
};

/** Deferred per `ux-revamp.md`, but present so the registry covers every type. */
const KNOWLEDGE: ExperienceDefinition = {
  type: 'knowledge',
  capabilities: CONTENT_CAPABILITIES,
  rootBlockTypes: [],
  workspace: 'collection',
  gestures: [],
  inspectorSections: [
    { id: 'style', label: INSPECTOR_SECTION_LABELS.style, order: 0 },
    { id: 'advanced', label: INSPECTOR_SECTION_LABELS.advanced, order: 0, advanced: true },
  ],
  seed: () => [],
};

export const BUILT_IN_EXPERIENCES = [
  TOUR,
  ANNOUNCEMENT,
  HOTSPOT,
  SURVEY,
  CHECKLIST,
  KNOWLEDGE,
] as const;

export function registerBuiltInExperiences(): void {
  for (const definition of BUILT_IN_EXPERIENCES) registerExperience(definition);
}

// ── seed builders ────────────────────────────────────────────────────────────

function tourStep(context: ExperienceSeedContext, heading: string): LodariqBlock {
  return {
    id: context.createBlockId(),
    type: 'tourStep',
    props: { index: 0 },
    status: 'incomplete',
    children: [card(context, heading)],
  };
}

function card(
  context: ExperienceSeedContext,
  heading: string,
  extra: readonly LodariqBlock[] = [],
): LodariqBlock {
  return {
    id: context.createBlockId(),
    type: 'tooltip',
    props: { placement: 'bottom' },
    status: 'incomplete',
    children: [
      {
        id: context.createBlockId(),
        type: 'heading',
        props: { level: 2 },
        status: 'ready',
        content: heading,
        children: [],
      },
      ...extra,
    ],
  };
}

/** A CSAT scale, which the closed form-control recipe expresses as a radio group. */
function csatField(context: ExperienceSeedContext, label: string): LodariqBlock {
  return {
    id: context.createBlockId(),
    type: 'formField',
    props: {
      formField: {
        control: 'radio',
        name: 'ease',
        required: false,
        options: [
          { id: 'very_hard', label: authoringText('Very hard') },
          { id: 'hard', label: authoringText('Hard') },
          { id: 'neutral', label: authoringText('Neither') },
          { id: 'easy', label: authoringText('Easy') },
          { id: 'very_easy', label: authoringText('Very easy') },
        ],
      },
    },
    status: 'ready',
    content: label,
    children: [],
  };
}

function listItem(context: ExperienceSeedContext, content: string): LodariqBlock {
  return {
    id: context.createBlockId(),
    type: 'list',
    props: {},
    status: 'ready',
    content,
    children: [],
  };
}
