import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

export const HANDOFF_RESUME_MODES = ['same-step', 'next-step', 'restart'] as const;
export const APPLICATION_MAX_ORIGINS = 32;

const ApplicationId = Type.String({
  minLength: 1,
  maxLength: 128,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$',
});

/**
 * One application is one brand theme plus one content library — not a hostname
 * and not an environment. Several origins may serve the same application.
 */
export const ApplicationSummary = Type.Object(
  {
    id: ApplicationId,
    name: Type.String({ minLength: 1, maxLength: 160 }),
    originPatterns: Type.Array(Type.String({ minLength: 1, maxLength: 253 }), {
      minItems: 1,
      maxItems: APPLICATION_MAX_ORIGINS,
    }),
    themeId: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
    isPrimary: Type.Boolean(),
  },
  { $id: 'ApplicationSummary', additionalProperties: false },
);
export type ApplicationSummary = Static<typeof ApplicationSummary>;

/** Continues one experience in a second application, carrying progress with the user. */
export const JourneyHandoff = Type.Object(
  {
    applicationId: ApplicationId,
    resumeMode: Type.Union(HANDOFF_RESUME_MODES.map((value) => Type.Literal(value))),
    /** Optional experience to start there; otherwise the same document continues. */
    documentId: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
  },
  { $id: 'JourneyHandoff', additionalProperties: false },
);
export type JourneyHandoff = Static<typeof JourneyHandoff>;

export function sanitizeJourneyHandoff(value: unknown): JourneyHandoff | undefined {
  if (!Value.Check(JourneyHandoff, [], value)) return undefined;
  return structuredClone(value as JourneyHandoff);
}
