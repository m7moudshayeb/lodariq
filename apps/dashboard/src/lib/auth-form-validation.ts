import { SignInRequest, SignUpRequest } from '@lodariq/schema';

export const AUTH_FIELD_NAMES = [
  'name',
  'email',
  'identifier',
  'password',
  'passwordConfirmation',
  'workspaceName',
] as const;

export const AUTH_FIELD_ERROR_CODES = [
  'required',
  'invalid_format',
  'too_short',
  'too_long',
  'password_mismatch',
] as const;

export type AuthFieldName = (typeof AUTH_FIELD_NAMES)[number];
export type AuthFieldErrorCode = (typeof AUTH_FIELD_ERROR_CODES)[number];

interface CanonicalStringSchema {
  $comment?: string;
  format?: string;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
}

export interface AuthFieldDefinition extends CanonicalStringSchema {
  autoComplete: string;
  inputMode?: 'email' | 'text';
  preserveWhitespace: boolean;
  type: 'email' | 'password' | 'text';
}

export interface AuthFieldError {
  code: AuthFieldErrorCode;
  field: AuthFieldName;
  limit?: number;
}

export type AuthFieldErrors = Partial<Record<AuthFieldName, AuthFieldError>>;
export type AuthFormValues = Record<AuthFieldName, string>;

const signUpProperties = SignUpRequest.properties;
const signInProperties = SignInRequest.properties;

export const AUTH_FIELD_DEFINITIONS: Readonly<Record<AuthFieldName, AuthFieldDefinition>> =
  Object.freeze({
    name: fieldDefinition(signUpProperties.name, {
      autoComplete: 'name',
      preserveWhitespace: false,
      type: 'text',
    }),
    email: fieldDefinition(signUpProperties.email, {
      autoComplete: 'email',
      inputMode: 'email',
      preserveWhitespace: false,
      type: 'email',
    }),
    identifier: fieldDefinition(signInProperties.identifier, {
      autoComplete: 'username',
      inputMode: 'text',
      preserveWhitespace: false,
      type: 'text',
    }),
    password: fieldDefinition(signInProperties.password, {
      autoComplete: 'current-password',
      preserveWhitespace: true,
      type: 'password',
    }),
    passwordConfirmation: fieldDefinition(signInProperties.password, {
      autoComplete: 'new-password',
      preserveWhitespace: true,
      type: 'password',
    }),
    workspaceName: fieldDefinition(signUpProperties.workspaceName, {
      autoComplete: 'organization',
      preserveWhitespace: false,
      type: 'text',
    }),
  });

export function validateAuthForm(
  form: HTMLFormElement,
  fields: readonly AuthFieldName[],
  options: { confirmPassword?: boolean } = {},
): { errors: AuthFieldErrors; values: AuthFormValues } {
  const data = new FormData(form);
  const values = Object.fromEntries(
    AUTH_FIELD_NAMES.map((field) => [field, readField(data, field)]),
  ) as AuthFormValues;
  const errors: AuthFieldErrors = {};

  for (const field of fields) {
    const definition = AUTH_FIELD_DEFINITIONS[field];
    const value = values[field];
    const length = Array.from(value).length;
    if (!value) {
      errors[field] = { code: 'required', field };
      continue;
    }
    if (definition.minLength !== undefined && length < definition.minLength) {
      errors[field] = { code: 'too_short', field, limit: definition.minLength };
      continue;
    }
    if (definition.maxLength !== undefined && length > definition.maxLength) {
      errors[field] = { code: 'too_long', field, limit: definition.maxLength };
      continue;
    }
    if (definition.pattern && !new RegExp(definition.pattern, 'u').test(value)) {
      errors[field] = { code: 'invalid_format', field };
    }
  }

  if (
    options.confirmPassword &&
    !errors.password &&
    !errors.passwordConfirmation &&
    values.password !== values.passwordConfirmation
  ) {
    errors.passwordConfirmation = {
      code: 'password_mismatch',
      field: 'passwordConfirmation',
    };
  }

  return { errors, values };
}

export function focusFirstInvalidAuthField(
  form: HTMLFormElement,
  fields: readonly AuthFieldName[],
  errors: AuthFieldErrors,
): void {
  const firstInvalid = fields.find((field) => errors[field]);
  if (!firstInvalid) return;
  const control = form.elements.namedItem(firstInvalid);
  if (control instanceof HTMLElement) control.focus();
}

export function withoutAuthFieldError(errors: AuthFieldErrors, field: string): AuthFieldErrors {
  if (!isAuthFieldName(field) || !errors[field]) return errors;
  const next = { ...errors };
  delete next[field];
  return next;
}

export function hasAuthFieldErrors(errors: AuthFieldErrors): boolean {
  return AUTH_FIELD_NAMES.some((field) => Boolean(errors[field]));
}

function readField(data: FormData, field: AuthFieldName): string {
  const value = data.get(field);
  if (typeof value !== 'string') return '';
  return AUTH_FIELD_DEFINITIONS[field].preserveWhitespace ? value : value.trim();
}

function fieldDefinition(
  schema: CanonicalStringSchema,
  presentation: Omit<AuthFieldDefinition, keyof CanonicalStringSchema>,
): AuthFieldDefinition {
  const characterLimits = parseCanonicalCharacterLimits(schema.$comment);
  const minLength = schema.minLength ?? characterLimits?.minLength;
  const maxLength = schema.maxLength ?? characterLimits?.maxLength;
  return Object.freeze({
    ...presentation,
    ...(schema.format === undefined ? {} : { format: schema.format }),
    ...(maxLength === undefined ? {} : { maxLength }),
    ...(minLength === undefined ? {} : { minLength }),
    ...(schema.pattern === undefined ? {} : { pattern: schema.pattern }),
  });
}

function parseCanonicalCharacterLimits(
  comment: string | undefined,
): { minLength: number; maxLength: number } | null {
  const match = /^lodariq-unicode-character-length:(\d+):(\d+)$/u.exec(comment ?? '');
  if (!match) return null;
  const minLength = Number(match[1]);
  const maxLength = Number(match[2]);
  if (!Number.isSafeInteger(minLength) || !Number.isSafeInteger(maxLength)) return null;
  if (minLength < 0 || maxLength < minLength) return null;
  return { minLength, maxLength };
}

function isAuthFieldName(value: string): value is AuthFieldName {
  return (AUTH_FIELD_NAMES as readonly string[]).includes(value);
}
