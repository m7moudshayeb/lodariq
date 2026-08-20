import type { ControlPlaneRepository } from './repository';
import type { LodariqDatabase } from './neon';
import { DrizzleRepositoryExperienceMeasurement } from './drizzle/experience-measurement';

export function createDrizzleControlPlaneRepository(
  database: LodariqDatabase,
): ControlPlaneRepository {
  return new DrizzleControlPlaneRepository(database);
}

class DrizzleControlPlaneRepository
  extends DrizzleRepositoryExperienceMeasurement
  implements ControlPlaneRepository
{
  async close(): Promise<void> {
    await this.database.$client.end();
  }
}
