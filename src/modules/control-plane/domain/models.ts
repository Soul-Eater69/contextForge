export type PersistenceMode =
  | "ephemeral"
  | "workspace-persistent"
  | "org-shared";

export type StorageMode = "managed" | "byo-object-storage";

export type SourceKind = "github-app" | "archive-upload" | "cli-sync";

export interface Tenant {
  id: string;
  name: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  tenantId: string;
  name: string;
  persistenceMode: PersistenceMode;
  storageMode: StorageMode;
  createdAt: string;
}

export interface CodeRepository {
  id: string;
  workspaceId: string;
  name: string;
  defaultBranch: string;
  sourceKind: SourceKind;
  remoteUrl?: string;
  createdAt: string;
}

export interface WorkspacePolicy {
  id: string;
  workspaceId: string;
  allowDurableMemory: boolean;
  allowOrgSharedMemory: boolean;
  requireApprovalForOrgSharedMemory: boolean;
  defaultMemoryTtlDays: number;
  maxContextItems: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  workspaceId?: string;
  category: "control-plane" | "data-plane";
  action: string;
  actor: "system" | "user";
  details: Record<string, unknown>;
  createdAt: string;
}

