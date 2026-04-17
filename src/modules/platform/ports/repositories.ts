import type { IntegrationProfile } from "../domain/models.ts";

export interface IntegrationProfileRepository {
  save(profile: IntegrationProfile): Promise<void>;
  getById(id: string): Promise<IntegrationProfile | undefined>;
  list(): Promise<IntegrationProfile[]>;
}

