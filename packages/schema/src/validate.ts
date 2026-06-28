import { Value } from '@sinclair/typebox/value';
import type { TSchema, Static } from '@sinclair/typebox';
import { SCHEMA_REGISTRY } from './registry';

/**
 * Lightweight validation helpers built on TypeBox's own Value module so
 * @talmeh/schema stays dependency-light. The Fastify API uses Ajv against the
 * same JSON Schemas (PRD §11.1); this is for fixtures, tests, and local-dev.
 *
 * The whole registry is passed as references so `Type.Ref(...)` schemas
 * dereference correctly.
 */
export function isValid<T extends TSchema>(schema: T, value: unknown): value is Static<T> {
  return Value.Check(schema, SCHEMA_REGISTRY, value);
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export function validate<T extends TSchema>(
  schema: T,
  value: unknown,
): { valid: true; value: Static<T> } | { valid: false; errors: ValidationIssue[] } {
  if (Value.Check(schema, SCHEMA_REGISTRY, value)) {
    return { valid: true, value: value as Static<T> };
  }
  const errors = [...Value.Errors(schema, SCHEMA_REGISTRY, value)].map((e) => ({
    path: e.path,
    message: e.message,
  }));
  return { valid: false, errors };
}
