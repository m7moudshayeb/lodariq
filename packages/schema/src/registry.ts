import type { TSchema } from '@sinclair/typebox';
import {
  Environment,
  DocumentType,
  DocumentStatus,
  ValidationLevel,
  BlockDiagnostic,
} from './common';
import { BlockActionProps, LodariqBlockProps, LodariqBlockType, LodariqBlock } from './block';
import { ElementFingerprint, RuntimeLifecycleHints, Target } from './target';
import { TriggerDefinition, AudienceDefinition, LodariqDocument } from './document';
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
  BlockActionProps,
  LodariqBlockProps,
  LodariqBlockType,
  LodariqBlock,
  ElementFingerprint,
  RuntimeLifecycleHints,
  Target,
  TriggerDefinition,
  AudienceDefinition,
  LodariqDocument,
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
