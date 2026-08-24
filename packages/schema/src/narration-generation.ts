import { Type, type Static } from '@sinclair/typebox';
import { AuthoringMediaAssetResource } from './authoring-resources';
import { NarrationAudio } from './narration';

const IDENTIFIER = Type.String({
  minLength: 1,
  maxLength: 160,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$',
});

const NARRATION_OPERATION_ID = Type.String({
  minLength: 26,
  maxLength: 160,
  pattern: '^ttsop_[A-Za-z0-9_-]{20,}$',
});

export const NarrationVoice = Type.Object(
  {
    id: IDENTIFIER,
    name: Type.String({ minLength: 1, maxLength: 120 }),
    locale: Type.String({ minLength: 2, maxLength: 35 }),
    gender: Type.Optional(
      Type.Union([Type.Literal('female'), Type.Literal('male'), Type.Literal('neutral')]),
    ),
    accent: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
    cloned: Type.Optional(Type.Boolean()),
  },
  { $id: 'NarrationVoice', additionalProperties: false },
);
export type NarrationVoice = Static<typeof NarrationVoice>;

export const GenerateNarrationRequest = Type.Object(
  {
    operationId: NARRATION_OPERATION_ID,
    stepId: IDENTIFIER,
  },
  { $id: 'GenerateNarrationRequest', additionalProperties: false },
);
export type GenerateNarrationRequest = Static<typeof GenerateNarrationRequest>;

export const GenerateNarrationResult = Type.Object(
  {
    operationId: NARRATION_OPERATION_ID,
    replayed: Type.Boolean(),
    audio: Type.Ref(NarrationAudio),
    asset: Type.Ref(AuthoringMediaAssetResource),
  },
  { $id: 'GenerateNarrationResult', additionalProperties: false },
);
export type GenerateNarrationResult = Static<typeof GenerateNarrationResult>;
