import { describe, expect, it } from 'vitest';
import {
  BRAND_THEME_CONTRACT_VERSION,
  PUBLIC_MANIFEST_SCHEMA_VERSION,
  isSupportedDeliveryContract,
  isValidCompilerVersion,
} from '@lodariq/schema';

describe('delivery version compatibility', () => {
  it('supports only the explicit artifact and renderer contract pairs', () => {
    expect(isSupportedDeliveryContract('2', '2', BRAND_THEME_CONTRACT_VERSION)).toBe(true);
    expect(isSupportedDeliveryContract('3', '3', BRAND_THEME_CONTRACT_VERSION)).toBe(true);
    expect(isSupportedDeliveryContract('4', '4', BRAND_THEME_CONTRACT_VERSION)).toBe(true);

    expect(isSupportedDeliveryContract('2', '4', BRAND_THEME_CONTRACT_VERSION)).toBe(false);
    expect(isSupportedDeliveryContract('4', '2', BRAND_THEME_CONTRACT_VERSION)).toBe(false);
    expect(isSupportedDeliveryContract('99', '99', BRAND_THEME_CONTRACT_VERSION)).toBe(false);
    expect(isSupportedDeliveryContract('4', '4', '99')).toBe(false);
  });

  it('treats bounded semantic compiler versions as provenance', () => {
    expect(isValidCompilerVersion('0.2.0')).toBe(true);
    expect(isValidCompilerVersion('0.5.0')).toBe(true);
    expect(isValidCompilerVersion('1.0.0-rc.1+build.7')).toBe(true);

    expect(isValidCompilerVersion('future-compiler')).toBe(false);
    expect(isValidCompilerVersion('1.0')).toBe(false);
    expect(isValidCompilerVersion('')).toBe(false);
  });

  it('keeps the public manifest envelope version independent from artifact policies', () => {
    expect(PUBLIC_MANIFEST_SCHEMA_VERSION).toBe('4');
  });
});
