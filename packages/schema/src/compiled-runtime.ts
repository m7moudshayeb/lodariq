import type { TSchema } from '@sinclair/typebox';
import { Check } from '@sinclair/typebox/value';
import {
  BlockLayoutProps,
  ButtonStyleProps,
  InlineTextRun,
  PresentationAnchor,
  TextStyleProps,
  TooltipLayoutProps,
  TooltipStyleProps,
} from './block';
import {
  BrandThemeDefinition,
  OpaqueSrgbColor,
  RendererRecipes,
  SafeFontFamily,
  SrgbColorWithOptionalAlpha,
  ThemeBorderTokens,
  ThemeColorTokens,
  ThemeElevationTokens,
  ThemeModeTokens,
  ThemeMotionTokens,
  ThemeRadiusTokens,
  ThemeShadowLayer,
  ThemeSizingTokens,
  ThemeSpacingTokens,
  ThemeTokens,
  ThemeTypographyTokens,
  TourRendererRecipe,
} from './brand';
import {
  StepChoreography,
  StepChoreographyTransition,
  StepChoreographyTrigger,
  StepChoreographyWait,
} from './choreography';
import {
  CompiledDocumentLocaleVariant,
  CompiledDocumentLocaleVariantV4,
  CompiledDocumentLocalization,
  CompiledDocumentLocalizationV4,
  CompiledDocumentV1,
  CompiledDocumentV2,
  CompiledDocumentV3,
  CompiledDocumentV4,
  type CompiledDocument,
} from './compiled';
import { TourCompletionBehavior } from './document';
import { ContentLocale } from './document-localization';
import {
  StepTransition,
  StepTransitionCondition,
  StepTransitionDestination,
  StepTransitionRule,
} from './flow';
import {
  FormFieldPresentation,
  MediaPresentation,
  ResponsiveStepOverride,
  ResponsiveStepPresentation,
  SpotlightPresentation,
  StructuredCompositionPresentation,
  TourMotionPresentation,
} from './presentation';
import { ElementFingerprint, RuntimeLifecycleHints, TargetIdentityV2 } from './target';

/**
 * Minimal TypeBox reference closure required to validate immutable compiled
 * artifacts. Keep this separate from the full schema registry so the public
 * SDK can lazy-load validation without bundling dashboard/authoring contracts.
 */
export const COMPILED_RUNTIME_SCHEMA_REFERENCES = [
  BlockLayoutProps,
  BrandThemeDefinition,
  ButtonStyleProps,
  CompiledDocumentLocaleVariant,
  CompiledDocumentLocaleVariantV4,
  CompiledDocumentLocalization,
  CompiledDocumentLocalizationV4,
  ContentLocale,
  ElementFingerprint,
  FormFieldPresentation,
  InlineTextRun,
  MediaPresentation,
  OpaqueSrgbColor,
  PresentationAnchor,
  RendererRecipes,
  ResponsiveStepOverride,
  ResponsiveStepPresentation,
  RuntimeLifecycleHints,
  SafeFontFamily,
  SpotlightPresentation,
  StructuredCompositionPresentation,
  SrgbColorWithOptionalAlpha,
  StepChoreography,
  StepChoreographyTransition,
  StepChoreographyTrigger,
  StepChoreographyWait,
  StepTransition,
  StepTransitionCondition,
  StepTransitionDestination,
  StepTransitionRule,
  TargetIdentityV2,
  TextStyleProps,
  ThemeBorderTokens,
  ThemeColorTokens,
  ThemeElevationTokens,
  ThemeModeTokens,
  ThemeMotionTokens,
  ThemeRadiusTokens,
  ThemeShadowLayer,
  ThemeSizingTokens,
  ThemeSpacingTokens,
  ThemeTokens,
  ThemeTypographyTokens,
  TooltipLayoutProps,
  TooltipStyleProps,
  TourCompletionBehavior,
  TourMotionPresentation,
  TourRendererRecipe,
] as const satisfies readonly TSchema[];

const VERSIONED_COMPILED_DOCUMENT_SCHEMAS = {
  '2': CompiledDocumentV2,
  '3': CompiledDocumentV3,
  '4': CompiledDocumentV4,
} as const;

/** Fully validates one public delivery artifact against its exact immutable schema. */
export function isValidCompiledRuntimeArtifact(value: unknown): value is CompiledDocument {
  if (!isRecord(value)) return false;
  const artifactSchemaVersion = value['artifactSchemaVersion'];
  const schema =
    artifactSchemaVersion === undefined
      ? CompiledDocumentV1
      : VERSIONED_COMPILED_DOCUMENT_SCHEMAS[
          artifactSchemaVersion as keyof typeof VERSIONED_COMPILED_DOCUMENT_SCHEMAS
        ];
  if (!schema) return false;

  try {
    return Check(schema, [...COMPILED_RUNTIME_SCHEMA_REFERENCES], value);
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
