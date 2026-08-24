import { describe, expect, it } from 'vitest';
import {
  canTransitionDataResidencyMigration,
  dataResidencyRouteKey,
  isSafeWebhookEndpointUrl,
} from '@lodariq/schema';

describe('platform governance contracts', () => {
  it('accepts public HTTPS webhook endpoints and rejects credential, redirect, and private targets', () => {
    expect(isSafeWebhookEndpointUrl('https://hooks.example.com/lodariq')).toBe(true);
    expect(isSafeWebhookEndpointUrl('http://hooks.example.com/lodariq')).toBe(false);
    expect(isSafeWebhookEndpointUrl('https://user:secret@hooks.example.com/lodariq')).toBe(false);

    /*
     * Each of these passed the previous five regexes. The allow-list asked
     * "does it look like a domain", which every one of them does.
     */
    for (const bypass of [
      'https://metadata.google.internal/computeMetadata/v1/',
      'https://0.0.0.0/hook',
      'https://100.64.0.1/hook', // CGNAT.
      'https://[fd00::1]/hook', // Unique-local.
      'https://[fe80::1]/hook', // Link-local.
      'https://[::ffff:169.254.169.254]/hook', // IPv4-mapped link-local.
      'https://192.0.0.1/hook',
      'https://224.0.0.1/hook',
    ]) {
      expect(isSafeWebhookEndpointUrl(bypass), bypass).toBe(false);
    }
    expect(isSafeWebhookEndpointUrl('https://93.184.216.34/hook')).toBe(true);
    expect(isSafeWebhookEndpointUrl('https://hooks.example.com/lodariq#secret')).toBe(false);
    expect(isSafeWebhookEndpointUrl('https://localhost/lodariq')).toBe(false);
    expect(isSafeWebhookEndpointUrl('https://127.0.0.1/lodariq')).toBe(false);
    expect(isSafeWebhookEndpointUrl('https://10.0.0.1/lodariq')).toBe(false);
    expect(isSafeWebhookEndpointUrl('https://192.168.1.1/lodariq')).toBe(false);
    expect(isSafeWebhookEndpointUrl('https://172.16.1.1/lodariq')).toBe(false);
  });

  it('keeps residency cutover behind the ordered verification state machine', () => {
    expect(canTransitionDataResidencyMigration('requested', 'copying')).toBe(true);
    expect(canTransitionDataResidencyMigration('copying', 'verifying')).toBe(true);
    expect(canTransitionDataResidencyMigration('verifying', 'cutover-ready')).toBe(true);
    expect(canTransitionDataResidencyMigration('cutover-ready', 'completed')).toBe(true);
    expect(canTransitionDataResidencyMigration('requested', 'completed')).toBe(false);
    expect(canTransitionDataResidencyMigration('completed', 'copying')).toBe(false);
    expect(dataResidencyRouteKey('eu')).toBe('primary-eu');
  });
});
