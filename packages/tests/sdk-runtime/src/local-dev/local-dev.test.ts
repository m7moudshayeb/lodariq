// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { LodariqDocument } from '@lodariq/schema';
import {
  compilePreview,
  createLocalMetricsReport,
  exportLocalMetricsReport,
  exportDocument,
  importDocument,
  listLocalMetrics,
  recordLocalMetric,
  resetLocalMetrics,
  summarizeLocalMetrics,
} from '@lodariq/sdk-runtime/local-dev';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

describe('local-dev document import', () => {
  it('validates shared document JSON before returning it', () => {
    const imported = importDocument(JSON.stringify(tourFixture));

    expect(imported.id).toBe((tourFixture as LodariqDocument).id);
  });

  it('rejects malformed document JSON', () => {
    expect(() => importDocument(JSON.stringify({ id: 'doc_missing_shape' }))).toThrow(
      /Invalid Lodariq document import/,
    );
  });

  it('rejects imported documents with arbitrary block props', () => {
    const broken = JSON.parse(JSON.stringify(tourFixture));
    broken.blocks[0].children[0].children[0].props = {
      level: 2,
      style: 'color: red',
      html: '<script>alert(1)</script>',
    };

    expect(() => importDocument(JSON.stringify(broken))).toThrow(/Invalid Lodariq document import/);
  });

  it('exports, re-imports, and compiles without losing stable IDs', async () => {
    const fixture = tourFixture as LodariqDocument;
    const imported = importDocument(exportDocument(fixture));
    const compiled = await compilePreview(imported);

    expect(imported.blocks.map((block) => block.id)).toEqual(
      fixture.blocks.map((block) => block.id),
    );
    expect(imported.targets.map((target) => target.id)).toEqual(
      fixture.targets.map((target) => target.id),
    );
    expect(compiled.steps.map((step) => step.id)).toEqual(fixture.blocks.map((block) => block.id));
    expect(compiled.targets.map((target) => target.id)).toEqual(
      fixture.targets.map((target) => target.id),
    );
  });

  it('compiles canonical tourStep blocks without wrapping loose top-level content', async () => {
    const doc = JSON.parse(JSON.stringify(tourFixture)) as LodariqDocument;
    doc.blocks.push({
      id: 'block_loose_heading',
      type: 'heading',
      content: 'Loose heading',
      props: { targetId: 'target_new_project' },
      status: 'ready',
      children: [],
    });

    const compiled = await compilePreview(doc);

    expect(compiled.steps.map((step) => step.id)).toEqual(['block_step_1']);
    expect(JSON.stringify(compiled)).not.toContain('block_loose_heading');
  });
});

describe('local-dev usability metrics', () => {
  it('records and summarizes Phase 0 local authoring metrics', () => {
    resetLocalMetrics();

    recordLocalMetric({
      sessionId: 'session_1',
      documentId: 'doc_1',
      name: 'authoring.opened',
      at: 100,
    });
    recordLocalMetric({
      sessionId: 'session_1',
      documentId: 'doc_1',
      name: 'block.inserted',
      at: 160,
    });
    recordLocalMetric({
      sessionId: 'session_1',
      documentId: 'doc_1',
      name: 'target.pick.started',
      at: 200,
    });
    recordLocalMetric({
      sessionId: 'session_1',
      documentId: 'doc_1',
      name: 'target.pick.canceled',
      at: 210,
    });
    recordLocalMetric({
      sessionId: 'session_1',
      documentId: 'doc_1',
      name: 'target.pick.started',
      at: 240,
    });
    recordLocalMetric({
      sessionId: 'session_1',
      documentId: 'doc_1',
      name: 'target.pick.succeeded',
      at: 300,
    });
    recordLocalMetric({
      sessionId: 'session_1',
      documentId: 'doc_1',
      name: 'target.pick.failed',
      at: 360,
    });
    recordLocalMetric({
      sessionId: 'session_1',
      documentId: 'doc_1',
      name: 'preview.opened',
      at: 400,
    });

    expect(summarizeLocalMetrics(listLocalMetrics('session_1'))).toEqual({
      sessionId: 'session_1',
      documentId: 'doc_1',
      timeToFirstBlockMs: 60,
      timeToAttachFirstTargetMs: 200,
      failedTargetPicks: 1,
      previewOpenRate: 1,
      cancelRate: 0.5,
    });
  });

  it('exports a stable metrics report for Phase 0 sign-off evidence', () => {
    resetLocalMetrics();
    recordLocalMetric({
      sessionId: 'session_2',
      documentId: 'doc_2',
      name: 'block.inserted',
      at: 260,
    });
    recordLocalMetric({
      sessionId: 'session_2',
      documentId: 'doc_2',
      name: 'authoring.opened',
      at: 200,
    });

    expect(createLocalMetricsReport({ exportedAt: '2026-06-28T00:00:00.000Z' })).toEqual({
      exportedAt: '2026-06-28T00:00:00.000Z',
      sessions: [
        {
          sessionId: 'session_2',
          documentId: 'doc_2',
          summary: {
            sessionId: 'session_2',
            documentId: 'doc_2',
            timeToFirstBlockMs: 60,
            timeToAttachFirstTargetMs: null,
            failedTargetPicks: 0,
            previewOpenRate: 0,
            cancelRate: 0,
          },
          events: [
            {
              sessionId: 'session_2',
              documentId: 'doc_2',
              name: 'authoring.opened',
              at: 200,
            },
            {
              sessionId: 'session_2',
              documentId: 'doc_2',
              name: 'block.inserted',
              at: 260,
            },
          ],
        },
      ],
    });

    expect(
      JSON.parse(
        exportLocalMetricsReport({
          sessionId: 'session_2',
          exportedAt: '2026-06-28T00:00:00.000Z',
        }),
      ),
    ).toMatchObject({ sessions: [{ sessionId: 'session_2' }] });
  });

  it('ignores corrupted local metric storage', () => {
    localStorage.setItem('lodariq:metrics:broken', '{bad json');

    expect(listLocalMetrics('broken')).toEqual([]);
  });
});
