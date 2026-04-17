import type {
  CodeRepository,
  Tenant,
  Workspace,
  WorkspacePolicy,
} from "../domain/models.ts";

export interface TenantRepository {
  save(tenant: Tenant): Promise<void>;
  getById(id: string): Promise<Tenant | undefined>;
  list(): Promise<Tenant[]>;
}

export interface WorkspaceRepository {
  save(workspace: Workspace): Promise<void>;
  getById(id: string): Promise<Workspace | undefined>;
  list(): Promise<Workspace[]>;
  listByTenant(tenantId: string): Promise<Workspace[]>;
}

export interface CodeRepositoryRepository {
  save(repository: CodeRepository): Promise<void>;
  getById(id: string): Promise<CodeRepository | undefined>;
  list(): Promise<CodeRepository[]>;
  listByWorkspace(workspaceId: string): Promise<CodeRepository[]>;
}

export interface WorkspacePolicyRepository {
  save(policy: WorkspacePolicy): Promise<void>;
  list(): Promise<WorkspacePolicy[]>;
  getByWorkspaceId(workspaceId: string): Promise<WorkspacePolicy | undefined>;
}
