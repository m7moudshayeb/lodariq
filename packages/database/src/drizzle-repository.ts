import type { ControlPlaneRepository } from './repository';
import type { LodariqDatabase } from './neon';
import { DrizzleRepositoryAnalytics } from './drizzle/analytics';

export function createDrizzleControlPlaneRepository(
  database: LodariqDatabase,
): ControlPlaneRepository {
  return new DrizzleControlPlaneRepository(database);
}

class DrizzleControlPlaneRepository
  extends DrizzleRepositoryAnalytics
  implements ControlPlaneRepository
{
  async close(): Promise<void> {
    await this.database.$client.end();
  }
}
