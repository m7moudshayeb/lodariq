import type { LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

export function approachFixtureDocument(): LodariqDocument {
  const document = structuredClone(tourFixture as LodariqDocument);
  document.id = 'doc_tour_approach_fixture';
  document.title = 'Import data tour';
  document.targets = [
    {
      id: 'target_import_csv',
      fingerprint: {
        tagName: 'button',
        role: 'menuitem',
        accessibleName: 'CSV file',
        stableAttributes: { 'data-open-modal': 'import' },
        nearbyText: ['Import from'],
      },
      approach: {
        legs: [
          {
            act: { kind: 'activateTarget', targetId: 'target_import_menu' },
            wait: { type: 'targetAvailable', targetId: 'target_import_csv' },
            label: 'Open the Import menu',
          },
        ],
      },
    },
    {
      id: 'target_import_menu',
      fingerprint: {
        tagName: 'button',
        role: 'button',
        accessibleName: 'Import',
        stableAttributes: { 'data-open-pop': 'import' },
        nearbyText: ['Projects'],
      },
    },
  ];
  const tooltip = document.blocks[0]?.children.find((block) => block.type === 'tooltip');
  if (tooltip) {
    tooltip.props.targetId = 'target_import_csv';
    const heading = tooltip.children.find((block) => block.type === 'heading');
    if (heading) heading.content = 'Import project data';
  }
  return document;
}
