/**
 * The tour the hero plays inside the embedded fixture host ("Meridian").
 *
 * This is a real Lodariq block document — the same canonical structured JSON a
 * creator produces in the authoring surface. The marketing page compiles it
 * with `@lodariq/compiler` (browser compilation is preview-only, exactly like
 * local-dev authoring previews) and hands the compiled delivery JSON to the
 * SDK installed in the demo frame. Nothing in the playback path is simulated.
 *
 * Every target below is described semantically — role, accessible name,
 * nearby text — against Meridian's actual DOM. No CSS selectors anywhere.
 */
import type { LodariqDocument } from '@lodariq/schema';

interface TourStepContent {
  key: string;
  placement: 'top' | 'right' | 'bottom' | 'left';
  targetId: string;
  heading: string;
  body: string;
  buttons: Array<{
    label: string;
    variant: 'primary' | 'secondary' | 'subtle';
    action: 'next' | 'back' | 'complete' | 'dismiss';
  }>;
}

const STEPS: TourStepContent[] = [
  {
    key: 'anchor',
    placement: 'bottom',
    targetId: 'target_create_project',
    heading: 'This tour is running for real',
    body: 'You are inside Meridian, a working demo product. The card you are reading was rendered by the Lodariq SDK — the same script that would run on your site.',
    buttons: [
      { label: 'Not now', variant: 'subtle', action: 'dismiss' },
      { label: 'Show me', variant: 'primary', action: 'next' },
    ],
  },
  {
    key: 'semantic',
    placement: 'top',
    targetId: 'target_sort_projects',
    heading: 'Anchored by meaning, not selectors',
    body: 'This step found the sort control by its role and accessible name, the way a person would describe it. There is no CSS selector to go stale after a redesign.',
    buttons: [
      { label: 'Back', variant: 'secondary', action: 'back' },
      { label: 'Next', variant: 'primary', action: 'next' },
    ],
  },
  {
    key: 'modeless',
    placement: 'bottom',
    targetId: 'target_search',
    heading: 'The product stays usable',
    body: 'Try it — sort the table, open a menu, type in this search box. Only the card itself intercepts input; everything around it is still the live product.',
    buttons: [
      { label: 'Back', variant: 'secondary', action: 'back' },
      { label: 'Next', variant: 'primary', action: 'next' },
    ],
  },
  {
    key: 'install',
    placement: 'bottom',
    targetId: 'target_notifications',
    heading: 'And that was the whole install',
    body: 'One script tag, added once. Creating, editing, verifying and releasing tours all happen on the product itself — nobody touches code again.',
    buttons: [{ label: 'Done', variant: 'primary', action: 'complete' }],
  },
];

export const MERIDIAN_TOUR_DOCUMENT_ID = 'doc_marketing_meridian_welcome';

export const MERIDIAN_TOUR: LodariqDocument = {
  id: MERIDIAN_TOUR_DOCUMENT_ID,
  workspaceId: 'wk_local_dev',
  type: 'tour',
  status: 'draft',
  title: 'Meet Meridian',
  schemaVersion: '2.0.0',
  trigger: { type: 'manual' },
  audience: { environments: ['development', 'staging'] },
  targets: [
    {
      id: 'target_create_project',
      fingerprint: {
        tagName: 'button',
        role: 'button',
        accessibleName: 'Create project',
        label: 'Create project',
        stableAttributes: { 'data-lodariq-id': 'new-project' },
        nearbyText: ['Projects'],
      },
    },
    {
      id: 'target_sort_projects',
      fingerprint: {
        tagName: 'button',
        role: 'button',
        accessibleName: 'By owner',
        label: 'By owner',
        // The fingerprint contract requires the map even when a product has
        // no stable markers to offer — which is the point of this step.
        nearbyText: ['Recent', 'A–Z'],
      },
    },
    {
      id: 'target_search',
      fingerprint: {
        tagName: 'input',
        accessibleName: 'Search Meridian',
        label: 'Search Meridian',
        nearbyText: ['Search Meridian'],
      },
    },
    {
      id: 'target_notifications',
      fingerprint: {
        tagName: 'button',
        role: 'button',
        accessibleName: 'Notifications',
        label: 'Notifications',
        nearbyText: ['Help'],
      },
    },
  ],
  blocks: STEPS.map((step, index) => ({
    id: `block_step_${step.key}`,
    type: 'tourStep',
    props: { index },
    status: 'ready',
    children: [
      {
        id: `block_tooltip_${step.key}`,
        type: 'tooltip',
        props: {
          placement: step.placement,
          targetId: step.targetId,
          tooltipLayout: { actionLayout: 'inline', actionAlign: 'end' },
        },
        status: 'ready',
        children: [
          {
            id: `block_heading_${step.key}`,
            type: 'heading',
            props: { level: 2 },
            content: step.heading,
            children: [],
          },
          {
            id: `block_paragraph_${step.key}`,
            type: 'paragraph',
            props: {},
            content: step.body,
            children: [],
          },
          ...step.buttons.map((button, buttonIndex) => ({
            id: `block_button_${step.key}_${buttonIndex}`,
            type: 'button' as const,
            content: button.label,
            props: { variant: button.variant, action: { type: button.action } },
            children: [],
          })),
        ],
      },
    ],
  })),
} as LodariqDocument;
