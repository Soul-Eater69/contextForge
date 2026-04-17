import { NotFoundError } from "../../../shared/kernel/errors.ts";
import type { AuditRepository } from "../../../shared/ports/audit.ts";
import type {
  CodeRepositoryRepository,
  TenantRepository,
  WorkspacePolicyRepository,
  WorkspaceRepository,
} from "../../control-plane/ports/repositories.ts";
import type {
  GraphRepository,
  IngestionJobRepository,
  KnowledgeArtifactRepository,
  MemoryRepository,
  SessionRepository,
  SnapshotRepository,
} from "../../data-plane/ports/repositories.ts";
import type { IntegrationProfileRepository } from "../ports/repositories.ts";

export class PlatformReadService {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly workspaces: WorkspaceRepository,
    private readonly repositories: CodeRepositoryRepository,
    private readonly policies: WorkspacePolicyRepository,
    private readonly snapshots: SnapshotRepository,
    private readonly artifacts: KnowledgeArtifactRepository,
    private readonly graph: GraphRepository,
    private readonly jobs: IngestionJobRepository,
    private readonly memories: MemoryRepository,
    private readonly sessions: SessionRepository,
    private readonly audit: AuditRepository,
    private readonly integrations: IntegrationProfileRepository,
  ) {}

  async getOverview(): Promise<{
    counts: Record<string, number>;
    tenants: Awaited<ReturnType<TenantRepository["list"]>>;
    workspaces: Awaited<ReturnType<WorkspaceRepository["list"]>>;
    repositories: Awaited<ReturnType<CodeRepositoryRepository["list"]>>;
    policies: Awaited<ReturnType<WorkspacePolicyRepository["list"]>>;
    snapshots: Awaited<ReturnType<SnapshotRepository["list"]>>;
    memories: Awaited<ReturnType<MemoryRepository["list"]>>;
    sessions: Awaited<ReturnType<SessionRepository["listSessions"]>>;
    integrationProfiles: Awaited<ReturnType<IntegrationProfileRepository["list"]>>;
    recentAudit: Awaited<ReturnType<AuditRepository["list"]>>;
  }> {
    const [
      tenants,
      workspaces,
      repositories,
      policies,
      snapshots,
      memories,
      sessions,
      integrationProfiles,
      audit,
      artifacts,
      graph,
      jobs,
    ] = await Promise.all([
      this.tenants.list(),
      this.workspaces.list(),
      this.repositories.list(),
      this.policies.list(),
      this.snapshots.list(),
      this.memories.list(),
      this.sessions.listSessions(),
      this.integrations.list(),
      this.audit.list(),
      this.artifacts.list(),
      this.graph.list(),
      this.jobs.list(),
    ]);

    return {
      counts: {
        tenants: tenants.length,
        workspaces: workspaces.length,
        repositories: repositories.length,
        policies: policies.length,
        snapshots: snapshots.length,
        artifacts: artifacts.length,
        graphEdges: graph.length,
        ingestionJobs: jobs.length,
        memories: memories.length,
        sessions: sessions.length,
        integrationProfiles: integrationProfiles.length,
        auditEvents: audit.length,
      },
      tenants,
      workspaces,
      repositories,
      policies,
      snapshots: snapshots.sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      ),
      memories: memories.sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      ),
      sessions: sessions.sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      ),
      integrationProfiles: integrationProfiles.sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      ),
      recentAudit: audit
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 50),
    };
  }

  async listTenants() {
    return this.tenants.list();
  }

  async listWorkspaces(tenantId?: string) {
    return tenantId
      ? this.workspaces.listByTenant(tenantId)
      : this.workspaces.list();
  }

  async getWorkspace(workspaceId: string) {
    const workspace = await this.workspaces.getById(workspaceId);
    if (!workspace) {
      throw new NotFoundError("Workspace", workspaceId);
    }

    const [policy, repositories, memories, sessions, audit] = await Promise.all([
      this.policies.getByWorkspaceId(workspaceId),
      this.repositories.listByWorkspace(workspaceId),
      this.memories.listByWorkspace(workspaceId),
      this.sessions.listSessionsByWorkspace(workspaceId),
      this.audit.list({ workspaceId }),
    ]);

    return {
      workspace,
      policy,
      repositories,
      memories,
      sessions,
      audit,
    };
  }

  async listRepositories(workspaceId?: string) {
    return workspaceId
      ? this.repositories.listByWorkspace(workspaceId)
      : this.repositories.list();
  }

  async getRepository(repositoryId: string) {
    const repository = await this.repositories.getById(repositoryId);
    if (!repository) {
      throw new NotFoundError("Repository", repositoryId);
    }

    const [snapshots, jobs] = await Promise.all([
      this.snapshots.listByRepository(repositoryId),
      this.jobs.listByRepository(repositoryId),
    ]);

    return {
      repository,
      snapshots: snapshots.sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      ),
      ingestionJobs: jobs.sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      ),
    };
  }

  async getSnapshot(snapshotId: string) {
    const snapshot = await this.snapshots.getById(snapshotId);
    if (!snapshot) {
      throw new NotFoundError("Snapshot", snapshotId);
    }

    const [artifacts, graph] = await Promise.all([
      this.artifacts.listBySnapshot(snapshotId),
      this.graph.listBySnapshot(snapshotId),
    ]);

    return { snapshot, artifacts, graph };
  }

  async listMemories(workspaceId: string) {
    return this.memories.listByWorkspace(workspaceId);
  }

  async getSession(sessionId: string) {
    const session = await this.sessions.getSession(sessionId);
    if (!session) {
      throw new NotFoundError("Session", sessionId);
    }

    const notes = await this.sessions.listNotes(sessionId);
    return { session, notes };
  }

  async listAuditEvents(filters?: Parameters<AuditRepository["list"]>[0]) {
    return this.audit.list(filters);
  }
}
