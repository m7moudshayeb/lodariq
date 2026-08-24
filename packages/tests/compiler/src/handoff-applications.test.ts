import { describe, expect, it } from 'vitest';
import {
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type ApplicationSummary,
  type LodariqDocument,
} from '@lodariq/schema';
import { compile } from '@lodariq/compiler';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

const APPLICATIONS: ApplicationSummary[] = [
  { id: 'app', name: 'Meridian', originPatterns: ['app.meridian.test'], isPrimary: true },
  { id: 'billing', name: 'Billing', originPatterns: ['billing.meridian.test'], isPrimary: false },
  { id: 'unused', name: 'Unused', originPatterns: ['unused.meridian.test'], isPrimary: false },
];

function documentHandingOffTo(applicationId: string): LodariqDocument {
  const next = structuredClone(tourFixture) as LodariqDocument;
  const step = next.blocks.find((block) => block.type === 'tourStep');
  if (!step) throw new Error('Fixture has no tour step');
  step.props = { ...step.props, handoff: { applicationId, resumeMode: 'next-step' } };
  return next;
}

function input(document: LodariqDocument, applications?: readonly ApplicationSummary[]) {
  return {
    document,
    theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
    ...(applications ? { applications } : {}),
  };
}

describe('handoff applications in the artifact', () => {
  it('omits the field entirely when nothing hands off', () => {
    const compiled = compile(input(structuredClone(tourFixture) as LodariqDocument, APPLICATIONS));
    expect('applications' in compiled).toBe(false);
  });

  it('carries only the applications a step actually references', () => {
    const compiled = compile(input(documentHandingOffTo('billing'), APPLICATIONS));
    expect(compiled.applications?.map((application) => application.id)).toEqual(['billing']);
  });

  it('refuses to compile a handoff to an application the workspace does not have', () => {
    expect(() => compile(input(documentHandingOffTo('ghost'), APPLICATIONS))).toThrow(
      /Unknown handoff application ghost/,
    );
    expect(() => compile(input(documentHandingOffTo('billing')))).toThrow(
      /Unknown handoff application billing/,
    );
  });

  it('deep-copies, so editing the registry cannot mutate a published artifact', () => {
    const registry = structuredClone(APPLICATIONS);
    const compiled = compile(input(documentHandingOffTo('billing'), registry));
    expect(compiled.applications?.[0]).not.toBe(registry[1]);
    expect(compiled.applications?.[0]).toEqual(registry[1]);
  });
});
