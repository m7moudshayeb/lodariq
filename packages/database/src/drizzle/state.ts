import type { LodariqDatabase } from '../neon';

export class DrizzleRepositoryState {
  constructor(protected readonly database: LodariqDatabase) {}
}
