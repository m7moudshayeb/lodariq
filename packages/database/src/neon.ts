import console from 'node:console';
import { Pool } from '@neondatabase/serverless';
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';

export type LodariqDatabase = NeonDatabase<typeof schema> & { $client: Pool };

export function createNeonDatabase(connectionString: string): LodariqDatabase {
  if (!connectionString.trim()) {
    throw new Error('DATABASE_URL is required to create the Lodariq database client');
  }
  const pool = new Pool({ connectionString });
  pool.on('error', (error: Error & { code?: unknown }) => {
    console.error('Unexpected idle Neon database connection error', {
      name: error.name,
      message: error.message,
      code: error.code,
    });
  });
  return drizzle(pool, { schema });
}
