import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema';

export type LodariqDatabase = NeonHttpDatabase<typeof schema>;

export function createNeonDatabase(connectionString: string): LodariqDatabase {
  if (!connectionString.trim()) {
    throw new Error('DATABASE_URL is required to create the Lodariq database client');
  }
  return drizzle(neon(connectionString), { schema });
}
