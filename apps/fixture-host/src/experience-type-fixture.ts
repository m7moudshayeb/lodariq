import type { CreatorEnabledExperienceType } from '@lodariq/sdk-authoring/creator-experiences';
import { createExperienceDraft } from '@lodariq/sdk-authoring/creator-experiences';
import type { ExperienceSurfaceForm, LodariqBlock, LodariqDocument } from '@lodariq/schema';

const FIXTURE_TYPES = new Set<CreatorEnabledExperienceType>([
  'tour',
  'announcement',
  'hotspot',
  'survey',
  'checklist',
]);

export function experienceTypeFixtureDocument(
  value: string | null,
  surfaceValue?: string | null,
): LodariqDocument | null {
  if (!value || !FIXTURE_TYPES.has(value as CreatorEnabledExperienceType)) return null;
  const type = value as CreatorEnabledExperienceType;
  if (type === 'tour') return null;
  const document = createExperienceDraft({
    documentId: `doc_fixture_${type}`,
    workspaceId: 'wk_local_dev',
    environment: 'development',
    schemaVersion: '2.0.0',
    type,
    title: `Fixture ${type}`,
  });
  document.blocks = document.blocks.map(markReady);
  if (type === 'announcement') {
    document.experience = {
      type: 'announcement',
      frequency: 'always',
      dismissible: true,
    };
    document.surfaceForm = announcementSurface(surfaceValue);
  }
  if (type === 'hotspot') bindHotspotTarget(document);
  if (type === 'survey') {
    document.experience = {
      type: 'survey',
      submission: 'repeatable',
      requireAnswer: true,
    };
  }
  if (type === 'checklist') document.surfaceForm = checklistSurface(surfaceValue);
  return document;
}

function markReady(block: LodariqBlock): LodariqBlock {
  return {
    ...block,
    status: 'ready',
    children: block.children.map(markReady),
  };
}

function bindHotspotTarget(document: LodariqDocument): void {
  document.targets = [
    {
      id: 'target_fixture_help',
      fingerprint: {
        tagName: 'button',
        role: 'button',
        accessibleName: 'Help',
        label: 'Help',
      },
    },
  ];
  document.blocks = document.blocks.map((block) => ({
    ...block,
    props: { ...block.props, targetId: 'target_fixture_help' },
  }));
}

function announcementSurface(value: string | null | undefined): ExperienceSurfaceForm {
  if (value === 'banner' || value === 'slideIn') return value;
  return 'modal';
}

function checklistSurface(value: string | null | undefined): ExperienceSurfaceForm {
  return value === 'drawer' ? 'drawer' : 'floating';
}
