import { Type, type Static } from '@sinclair/typebox';
import { ContentLocale } from './document-localization';
import { LodariqDocument } from './document';

/** Explicit draft-only machine-translation request from an authenticated creator. */
export const AuthoringTranslationRequest = Type.Object(
  {
    operationId: Type.String({
      minLength: 25,
      maxLength: 128,
      pattern: '^aiop_[A-Za-z0-9_-]{20,}$',
    }),
    document: Type.Ref(LodariqDocument),
    targetLocale: Type.Ref(ContentLocale),
    mode: Type.Literal('missing'),
  },
  { $id: 'AuthoringTranslationRequest', additionalProperties: false },
);
export type AuthoringTranslationRequest = Static<typeof AuthoringTranslationRequest>;

/** A translated mutable draft. The translation boundary never saves or publishes it. */
export const AuthoringTranslationResult = Type.Object(
  {
    document: Type.Ref(LodariqDocument),
    sourceLocale: Type.Ref(ContentLocale),
    targetLocale: Type.Ref(ContentLocale),
    translatedTitle: Type.Boolean(),
    translatedBlockCount: Type.Integer({ minimum: 0, maximum: 2_000 }),
    translatedCharacterCount: Type.Integer({ minimum: 0, maximum: 1_000_000 }),
  },
  { $id: 'AuthoringTranslationResult', additionalProperties: false },
);
export type AuthoringTranslationResult = Static<typeof AuthoringTranslationResult>;
