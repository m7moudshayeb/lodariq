import { describe, expect, it } from 'vitest';
import { readInitialBaseline } from './migration-test-utils.js';

describe('owned-auth credential baseline', () => {
  it('stores one canonical Argon2id PHC string without custom scrypt material columns', () => {
    const source = readInitialBaseline();

    expect(source).toContain('create table if not exists password_credentials');
    expect(source).toContain('algorithm text not null');
    expect(source).toContain('password_hash text not null');
    expect(source).toContain("check (algorithm = 'argon2id-v1')");
    expect(source).toContain(
      "password_hash ~ '^\\$argon2id\\$v=19\\$m=65536,p=1,t=3\\$[A-Za-z0-9+/]{22}\\$[A-Za-z0-9+/]{43}$'",
    );

    expect(source).not.toMatch(/\b(?:password_)?salt\s+(?:text|bytea)\b/iu);
    for (const retiredColumn of [
      'scrypt_n',
      'scrypt_r',
      'scrypt_p',
      'scrypt_key_length',
      'cost_n',
      'block_size',
      'parallelization',
      'key_length',
    ]) {
      expect(source).not.toContain(retiredColumn);
    }
  });
});
