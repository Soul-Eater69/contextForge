import { createId } from "../../../shared/kernel/ids.ts";
import { NotFoundError, invariant } from "../../../shared/kernel/errors.ts";
import { isoNow, type Clock } from "../../../shared/kernel/time.ts";
import type { AuditRepository } from "../../../shared/ports/audit.ts";
import type {
  CodeRepository,
  PersistenceMode,
  SourceKind,
  StorageMode,
  Tenant,
  Workspace,
  WorkspacePolicy,
} from "../domain/models.ts";
import type {
  CodeRepositoryRepository,
  TenantRepository,
  WorkspacePolicyRepository,
  WorkspaceRepository,
} from "../ports/repositories.ts";

export interface CreateTenantInput {
  name: string;
}

export interface CreateWorkspaceInput {
  tenantId: string;
  name: string;
  persistenceMode: PersistenceMode;
  storageMode: StorageMode;
}

export interface RegisterRepositoryInput {
  workspaceId: string;
  name: string;
  defaultBranch: string;
  sourceKind: SourceKind;
  remoteUrl?: string;
}

export interface ConfigurePolicyInput {
  workspaceId: string;
  allowDurableMemory?: boolean;
  allowOrgSharedMemory?: boolean;
  requireApprovalForOrgSharedMemory?: boolean;
  defaultMemoryTtlDays?: number;
  maxContextItems?: number;
}

export class ControlPlaneService {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly workspaces: WorkspaceRepository,
    private readonly repositories: CodeRepositoryRepository,
    private readonly policies: WorkspacePolicyRepository,
    private readonly audit: AuditRepository,
    private readonly clock: Clock,
  ) {}

  async createTenant(input: CreateTenantInput): Promise<Tenant> {
    invariant(input.name.trim(), "Tenant name is required");

    const tenant: Tenant = {
      id: createId("tenant"),
      name: input.name.trim(),
      createdAt: isoNow(this.clock),
    };

    await this.tenants.save(tenant);
    await this.recordAudit(undefined, "tenant.created", { tenantId: tenant.id });
    return tenant;
  }

  async createWorkspace(
    input: CreateWorkspaceInput,
  ): Promise<{ workspace: Workspace; policy: WorkspacePolicy }> {
    invariant(input.name.trim(), "Workspace name is required");

    const tenant = await this.tenants.getById(input.tenantId);
    if (!tenant) {
      throw new NotFoundError("Tenant", input.tenantId);
    }

    const timestamp = isoNow(this.clock);
    const workspace: Workspace = {
      id: createId("ws"),
      tenantId: tenant.id,
      name: input.name.trim(),
      persistenceMode: input.persistenceMode,
      storageMode: input.storageMode,
      createdAt: timestamp,
    };

    const policy: WorkspacePolicy = {
      id: createId("policy"),
      workspaceId: workspace.id,
      allowDurableMemory: input.persistenceMode !== "ephemeral",
      allowOrgSharedMemory: input.persistenceMode === "org-shared",
      requireApprovalForOrgSharedMemory: true,
      defaultMemoryTtlDays: 180,
      maxContextItems: 12,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.workspaces.save(workspace);
    await this.policies.save(policy);
    await this.recordAudit(workspace.id, "workspace.created", {
      workspaceId: workspace.id,
      tenantId: tenant.id,
      persistenceMode: workspace.persistenceMode,
      storageMode: workspace.storageMode,
    });

    return { workspace, policy };
  }

  async registerRepository(input: RegisterRepositoryInput): Promise<CodeRepository> {
    invariant(input.name.trim(), "Repository name is required");
    invariant(input.defaultBranch.trim(), "Default branch is required");

    const workspace = await this.workspaces.getById(input.workspaceId);
    if (!workspace) {
      throw new NotFoundError("Workspace", input.workspaceId);
    }

    const repository: CodeRepository = {
      id: createId("repo"),
      workspaceId: workspace.id,
      name: input.name.trim(),
      defaultBranch: input.defaultBranch.trim(),
      sourceKind: input.sourceKind,
      remoteUrl: input.remoteUrl,
      createdAt: isoNow(this.clock),
    };

    await this.repositories.save(repository);
    await this.recordAudit(workspace.id, "repository.registered", {
      workspaceId: workspace.id,
      repositoryId: repository.id,
      sourceKind: repository.sourceKind,
    });

    return repository;
  }

  async configurePolicy(input: ConfigurePolicyInput): Promise<WorkspacePolicy> {
    const workspace = await this.workspaces.getById(input.workspaceId);
    if (!workspace) {
      throw new NotFoundError("Workspace", input.workspaceId);
    }

    const existing = await this.policies.getByWorkspaceId(workspace.id);
    if (!existing) {
      throw new NotFoundError("WorkspacePolicy", workspace.id);
    }

    const updated: WorkspacePolicy = {
      ...existing,
      allowDurableMemory:
        input.allowDurableMemory ?? existing.allowDurableMemory,
      allowOrgSharedMemory:
        input.allowOrgSharedMemory ?? existing.allowOrgSharedMemory,
      requireApprovalForOrgSharedMemory:
        input.requireApprovalForOrgSharedMemory ??
        existing.requireApprovalForOrgSharedMemory,
      defaultMemoryTtlDays:
        input.defaultMemoryTtlDays ?? existing.defaultMemoryTtlDays,
      maxContextItems: input.maxContextItems ?? existing.maxContextItems,
      updatedAt: isoNow(this.clock),
    };

    await this.policies.save(updated);
    await this.recordAudit(workspace.id, "workspace-policy.updated", {
      workspaceId: workspace.id,
      allowDurableMemory: updated.allowDurableMemory,
      allowOrgSharedMemory: updated.allowOrgSharedMemory,
    });

    return updated;
  }

  private async recordAudit(
    workspaceId: string | undefined,
    action: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.append({
      id: createId("audit"),
      workspaceId,
      category: "control-plane",
      action,
      actor: "system",
      details,
      createdAt: isoNow(this.clock),
    });
  }
}
