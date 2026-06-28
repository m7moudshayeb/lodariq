import type { TSchema } from '@sinclair/typebox';
import {
  Environment,
  DocumentType,
  DocumentStatus,
  ValidationLevel,
  BlockDiagnostic,
} from './common';
import { TalmehBlockType, TalmehBlock } from './block';
import { ElementFingerprint, RuntimeLifecycleHints, Target } from './target';
import { TriggerDefinition, AudienceDefinition, TalmehDocument } from './document';
import { CompiledStep, CompiledTarget, CompiledDocument, ManifestPointer } from './compiled';
import { DataCatalogEntry } from './catalog';
import {
  BridgeEnvelope,
  ScrollState,
  PreviewPatch,
  PreviewPatchOperation,
  ResolverDiagnostic,
  BridgeMessage,
} from './bridge';
import { AnalyticsEvent, SelectorDiagnosticEvent } from './events';

/**
 * Every `$id`-tagged schema, so TypeBox's Value functions can dereference
 * `Type.Ref(...)` during validation. The Fastify API registers the same set
 * with Ajv (PRD §11.1).
 */
export const SCHEMA_REGISTRY: TSchema[] = [
  Environment,
  DocumentType,
  DocumentStatus,
  ValidationLevel,
  BlockDiagnostic,
  TalmehBlockType,
  TalmehBlock,
  ElementFingerprint,
  RuntimeLifecycleHints,
  Target,
  TriggerDefinition,
  AudienceDefinition,
  TalmehDocument,
  CompiledStep,
  CompiledTarget,
  CompiledDocument,
  ManifestPointer,
  DataCatalogEntry,
  BridgeEnvelope,
  ScrollState,
  PreviewPatchOperation,
  PreviewPatch,
  ResolverDiagnostic,
  BridgeMessage,
  AnalyticsEvent,
  SelectorDiagnosticEvent,
];
