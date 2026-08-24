import { FormatRegistry, type TSchema, type Static } from '@sinclair/typebox';
import { Errors } from '@sinclair/typebox/errors';
import { Check } from '@sinclair/typebox/value';
import { SCHEMA_REGISTRY } from './registry';

const RFC_3339_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:(?:[0-5]\d|60)(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u;

FormatRegistry.Set('date-time', isRfc3339DateTime);

/**
 * Lightweight validation helpers built on TypeBox's validation functions so
 * @lodariq/schema stays dependency-light. The Fastify API uses Ajv against the
 * same JSON Schemas (PRD §11.1); this is for fixtures, tests, and local-dev.
 *
 * The whole registry is passed as references so `Type.Ref(...)` schemas
 * dereference correctly.
 */
export function isValid<T extends TSchema>(schema: T, value: unknown): value is Static<T> {
  return Check(schema, SCHEMA_REGISTRY, value);
}

export function isValidWithReferences<T extends TSchema>(
  schema: T,
  references: readonly TSchema[],
  value: unknown,
): value is Static<T> {
  return Check(schema, [...SCHEMA_REGISTRY, ...references], value);
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export function validate<T extends TSchema>(
  schema: T,
  value: unknown,
): { valid: true; value: Static<T> } | { valid: false; errors: ValidationIssue[] } {
  if (Check(schema, SCHEMA_REGISTRY, value)) {
    return { valid: true, value: value as Static<T> };
  }
  const errors = [...Errors(schema, SCHEMA_REGISTRY, value)].map((e) => ({
    path: e.path,
    message: e.message,
  }));
  return { valid: false, errors };
}

export function validateWithReferences<T extends TSchema>(
  schema: T,
  references: readonly TSchema[],
  value: unknown,
): { valid: true; value: Static<T> } | { valid: false; errors: ValidationIssue[] } {
  const registry = [...SCHEMA_REGISTRY, ...references];
  if (Check(schema, registry, value)) {
    return { valid: true, value: value as Static<T> };
  }
  const errors = [...Errors(schema, registry, value)].map((error) => ({
    path: error.path,
    message: error.message,
  }));
  return { valid: false, errors };
}

function isRfc3339DateTime(value: string): boolean {
  const match = RFC_3339_DATE_TIME.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}
