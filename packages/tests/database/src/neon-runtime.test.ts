import { describe, expect, it } from 'vitest';
import { createNeonDatabase } from '@lodariq/database';

describe('Neon runtime database adapter', () => {
  it('uses the transaction-capable serverless Pool adapter', async () => {
    const database = createNeonDatabase(
      'postgresql://lodariq_app:password@example.neon.tech/neondb?sslmode=require',
    );

    try {
      expect(database.$client.constructor.name).toBe('NeonPool');
      expect(database.transaction).toBeTypeOf('function');
    } finally {
      await database.$client.end();
    }
  });

  it('rejects an empty connection string before creating a pool', () => {
    expect(() => createNeonDatabase('  ')).toThrow(
      /DATABASE_URL is required to create the Lodariq database client/u,
    );
  });
});
