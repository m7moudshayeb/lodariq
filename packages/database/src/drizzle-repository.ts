import type { ControlPlaneRepository } from './repository';
import type { LodariqDatabase } from './neon';
import { DrizzleRepositoryAccessibilityGovernance } from './drizzle/accessibility-governance';

export function createDrizzleControlPlaneRepository(
  database: LodariqDatabase,
): ControlPlaneRepository {
  return new DrizzleControlPlaneRepository(database);
}

class DrizzleControlPlaneRepository
  extends DrizzleRepositoryAccessibilityGovernance
  implements ControlPlaneRepository
{
  async close(): Promise<void> {
    await this.database.$client.end();
  }
}
