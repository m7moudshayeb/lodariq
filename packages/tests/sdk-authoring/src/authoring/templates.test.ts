import { describe, expect, it } from 'vitest';
import {
  CANONICAL_DOCUMENT_TEMPLATES,
  LodariqDocument,
  instantiateCanonicalTemplate,
  validate,
} from '@lodariq/schema';

describe('canonical document templates', () => {
  it('instantiates an independent draft with fresh block ids', () => {
    let sequence = 0;
    const createBlockId = () => `block_template_${++sequence}`;
    const input = {
      templateId: CANONICAL_DOCUMENT_TEMPLATES[0]!.id,
      documentId: 'doc_from_template',
      workspaceId: 'workspace_template',
      environment: 'staging' as const,
      schemaVersion: '2.0.0',
      createBlockId,
    };

    const first = instantiateCanonicalTemplate(input);
    const second = instantiateCanonicalTemplate(input);
    expect(first.id).toBe('doc_from_template');
    expect(first.status).toBe('draft');
    expect(first.blocks.length).toBeGreaterThan(0);
    expect(first.blocks).not.toBe(second.blocks);
    expect(first.blocks[0]?.id).not.toBe(second.blocks[0]?.id);
    expect(first.targets).toEqual([]);
  });

  it('materializes every versioned template as valid canonical block JSON', () => {
    const documentIds = new Set<string>();
    const blockIds = new Set<string>();
    for (const [templateIndex, template] of CANONICAL_DOCUMENT_TEMPLATES.entries()) {
      let sequence = 0;
      const document = instantiateCanonicalTemplate({
        templateId: template.id,
        documentId: `doc_template_${templateIndex}`,
        workspaceId: 'workspace_template',
        environment: 'development',
        schemaVersion: '2.0.0',
        createBlockId: () => `block_${templateIndex}_${++sequence}`,
      });
      const checked = validate(LodariqDocument, document);
      if (!checked.valid) {
        throw new Error(`Template ${template.id} is invalid: ${JSON.stringify(checked.errors)}`);
      }
      expect(checked.valid).toBe(true);
      expect(document.type).toBe(template.type);
      expect(documentIds.has(document.id)).toBe(false);
      documentIds.add(document.id);
      for (const id of flattenBlockIds(document.blocks)) {
        expect(blockIds.has(id)).toBe(false);
        blockIds.add(id);
      }
    }
  });
});

function flattenBlockIds(blocks: LodariqDocument['blocks']): string[] {
  return blocks.flatMap((block) => [block.id, ...flattenBlockIds(block.children)]);
}
