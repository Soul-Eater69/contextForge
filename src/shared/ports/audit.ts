import type { AuditEvent } from "../../modules/control-plane/domain/models.ts";

export interface AuditRepository {
  append(event: AuditEvent): Promise<void>;
  list(filters?: {
    workspaceId?: string;
    category?: AuditEvent["category"];
  }): Promise<AuditEvent[]>;
}
