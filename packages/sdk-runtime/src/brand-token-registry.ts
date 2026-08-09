import {
  isRegistrableCustomerBrandTokenRegistration,
  PRODUCT_STYLE_MAX_REGISTERED_SOURCES,
} from '@lodariq/schema/brand-registration-runtime';
import type { CustomerBrandTokenRegistration } from '@lodariq/schema';

const BRAND_TOKEN_REGISTRY_KEY = Symbol.for('@lodariq/customer-brand-token-registry');

interface BrandTokenRegistryState {
  registrations: CustomerBrandTokenRegistration[];
}

/**
 * Registers explicit customer-owned semantic tokens in page memory only.
 * Registering the same source replaces its prior revision; the newest source
 * has precedence when authoring merges several registrations.
 */
export function registerBrandTokens(registration: CustomerBrandTokenRegistration): void {
  if (!isRegistrableCustomerBrandTokenRegistration(registration)) {
    throw new TypeError('Brand token registration must contain only supported semantic values.');
  }

  const state = readRegistryState();
  const next = state.registrations.filter(
    (candidate) => candidate.sourceId !== registration.sourceId,
  );
  next.push(structuredClone(registration));
  state.registrations = next.slice(-PRODUCT_STYLE_MAX_REGISTERED_SOURCES);
}

/**
 * Called only after verified non-production creator activation. Returned
 * values are clones so authoring code cannot mutate the page-owned registry.
 */
export function readRegisteredBrandTokensForAuthoring(): CustomerBrandTokenRegistration[] {
  return structuredClone(readRegistryState().registrations);
}

/** Test isolation helper. Production code should never need persistent cleanup. */
export function clearRegisteredBrandTokensForTests(): void {
  readRegistryState().registrations = [];
}

function readRegistryState(): BrandTokenRegistryState {
  const host = globalThis as unknown as Record<PropertyKey, unknown>;
  const current = host[BRAND_TOKEN_REGISTRY_KEY];
  if (isRegistryState(current)) return current;

  const created: BrandTokenRegistryState = { registrations: [] };
  host[BRAND_TOKEN_REGISTRY_KEY] = created;
  return created;
}

function isRegistryState(value: unknown): value is BrandTokenRegistryState {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as Partial<BrandTokenRegistryState>).registrations)
  );
}
