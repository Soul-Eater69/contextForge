import type { AuditRepository } from "../../../shared/ports/audit.ts";
import type { AuditEvent, CodeRepository, Tenant, Workspace, WorkspacePolicy } from "../../../modules/control-plane/domain/models.ts";
import type {
  CodeRepositoryRepository,
  TenantRepository,
  WorkspacePolicyRepository,
  WorkspaceRepository,
} from "../../../modules/control-plane/ports/repositories.ts";
import type {
  GraphEdge,
  IngestionJob,
  KnowledgeArtifact,
  MemoryRecord,
  Session,
  SessionNote,
  Snapshot,
} from "../../../modules/data-plane/domain/models.ts";
import type { IntegrationProfile } from "../../../modules/platform/domain/models.ts";
import type { IntegrationProfileRepository } from "../../../modules/platform/ports/repositories.ts";
import type {
  GraphRepository,
  IngestionJobRepository,
  KnowledgeArtifactRepository,
  MemoryRepository,
  ObjectStore,
  SessionRepository,
  SnapshotRepository,
} from "../../../modules/data-plane/ports/repositories.ts";

export class InMemoryTenantRepository implements TenantRepository {
  private readonly tenants = new Map<string, Tenant>();

  async save(tenant: Tenant): Promise<void> {
    this.tenants.set(tenant.id, tenant);
  }

  async getById(id: string): Promise<Tenant | undefined> {
    return this.tenants.get(id);
  }

  async list(): Promise<Tenant[]> {
    return [...this.tenants.values()];
  }
}

export class InMemoryWorkspaceRepository implements WorkspaceRepository {
  private readonly workspaces = new Map<string, Workspace>();

  async save(workspace: Workspace): Promise<void> {
    this.workspaces.set(workspace.id, workspace);
  }

  async getById(id: string): Promise<Workspace | undefined> {
    return this.workspaces.get(id);
  }

  async list(): Promise<Workspace[]> {
    return [...this.workspaces.values()];
  }

  async listByTenant(tenantId: string): Promise<Workspace[]> {
    return [...this.workspaces.values()].filter(
      (workspace) => workspace.tenantId === tenantId,
    );
  }
}

export class InMemoryCodeRepositoryRepository implements CodeRepositoryRepository {
  private readonly repositories = new Map<string, CodeRepository>();

  async save(repository: CodeRepository): Promise<void> {
    this.repositories.set(repository.id, repository);
  }

  async getById(id: string): Promise<CodeRepository | undefined> {
    return this.repositories.get(id);
  }

  async list(): Promise<CodeRepository[]> {
    return [...this.repositories.values()];
  }

  async listByWorkspace(workspaceId: string): Promise<CodeRepository[]> {
    return [...this.repositories.values()].filter(
      (repository) => repository.workspaceId === workspaceId,
    );
  }
}

export class InMemoryWorkspacePolicyRepository implements WorkspacePolicyRepository {
  private readonly policies = new Map<string, WorkspacePolicy>();

  async save(policy: WorkspacePolicy): Promise<void> {
    this.policies.set(policy.workspaceId, policy);
  }

  async list(): Promise<WorkspacePolicy[]> {
    return [...this.policies.values()];
  }

  async getByWorkspaceId(workspaceId: string): Promise<WorkspacePolicy | undefined> {
    return this.policies.get(workspaceId);
  }
}

export class InMemoryAuditRepository implements AuditRepository {
  private readonly events: AuditEvent[] = [];

  async append(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }

  async list(filters?: {
    workspaceId?: string;
    category?: AuditEvent["category"];
  }): Promise<AuditEvent[]> {
    return this.events.filter(
      (event) =>
        (filters?.workspaceId === undefined ||
          event.workspaceId === filters.workspaceId) &&
        (filters?.category === undefined || event.category === filters.category),
    );
  }
}

export class InMemorySnapshotRepository implements SnapshotRepository {
  private readonly snapshots = new Map<string, Snapshot>();

  async save(snapshot: Snapshot): Promise<void> {
    this.snapshots.set(snapshot.id, snapshot);
  }

  async getById(id: string): Promise<Snapshot | undefined> {
    return this.snapshots.get(id);
  }

  async list(): Promise<Snapshot[]> {
    return [...this.snapshots.values()];
  }

  async listByRepository(repositoryId: string): Promise<Snapshot[]> {
    return [...this.snapshots.values()].filter(
      (snapshot) => snapshot.repositoryId === repositoryId,
    );
  }

  async findByRepositoryAndCommit(
    repositoryId: string,
    commitSha: string,
  ): Promise<Snapshot | undefined> {
    return [...this.snapshots.values()].find(
      (snapshot) =>
        snapshot.repositoryId === repositoryId && snapshot.commitSha === commitSha,
    );
  }

  async findLatestByRepositoryAndBranch(
    repositoryId: string,
    branch: string,
  ): Promise<Snapshot | undefined> {
    return [...this.snapshots.values()]
      .filter(
        (snapshot) =>
          snapshot.repositoryId === repositoryId && snapshot.branch === branch,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  }
}

export class InMemoryKnowledgeArtifactRepository implements KnowledgeArtifactRepository {
  private readonly artifacts: KnowledgeArtifact[] = [];

  async saveMany(artifacts: KnowledgeArtifact[]): Promise<void> {
    this.artifacts.push(...artifacts);
  }

  async list(): Promise<KnowledgeArtifact[]> {
    return [...this.artifacts];
  }

  async listBySnapshot(snapshotId: string): Promise<KnowledgeArtifact[]> {
    return this.artifacts.filter((artifact) => artifact.snapshotId === snapshotId);
  }
}

export class InMemoryGraphRepository implements GraphRepository {
  private readonly edges: GraphEdge[] = [];

  async saveMany(edges: GraphEdge[]): Promise<void> {
    this.edges.push(...edges);
  }

  async list(): Promise<GraphEdge[]> {
    return [...this.edges];
  }

  async listBySnapshot(snapshotId: string): Promise<GraphEdge[]> {
    return this.edges.filter((edge) => edge.snapshotId === snapshotId);
  }
}

export class InMemoryIngestionJobRepository implements IngestionJobRepository {
  private readonly jobs = new Map<string, IngestionJob>();

  async save(job: IngestionJob): Promise<void> {
    this.jobs.set(job.id, job);
  }

  async getById(id: string): Promise<IngestionJob | undefined> {
    return this.jobs.get(id);
  }

  async list(): Promise<IngestionJob[]> {
    return [...this.jobs.values()];
  }

  async listByRepository(repositoryId: string): Promise<IngestionJob[]> {
    return [...this.jobs.values()].filter((job) => job.repositoryId === repositoryId);
  }
}

export class InMemoryMemoryRepository implements MemoryRepository {
  private readonly memories: MemoryRecord[] = [];

  async save(memory: MemoryRecord): Promise<void> {
    const index = this.memories.findIndex(
      (candidate) => candidate.memoryId === memory.memoryId,
    );
    if (index >= 0) {
      this.memories[index] = memory;
      return;
    }

    this.memories.push(memory);
  }

  async list(): Promise<MemoryRecord[]> {
    return [...this.memories];
  }

  async findBySimilarity(input: {
    workspaceId: string;
    repoId: string;
    scope: MemoryRecord["scope"];
    type: MemoryRecord["type"];
    title: string;
  }): Promise<MemoryRecord | undefined> {
    return this.memories.find(
      (memory) =>
        memory.workspaceId === input.workspaceId &&
        memory.repoId === input.repoId &&
        memory.scope === input.scope &&
        memory.type === input.type &&
        memory.title.toLowerCase() === input.title.toLowerCase(),
    );
  }

  async listByWorkspace(workspaceId: string): Promise<MemoryRecord[]> {
    return this.memories.filter((memory) => memory.workspaceId === workspaceId);
  }

  async listByTenant(tenantId: string): Promise<MemoryRecord[]> {
    return this.memories.filter((memory) => memory.tenantId === tenantId);
  }
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, Session>();
  private readonly notes: SessionNote[] = [];

  async saveSession(session: Session): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async getSession(id: string): Promise<Session | undefined> {
    return this.sessions.get(id);
  }

  async listSessions(): Promise<Session[]> {
    return [...this.sessions.values()];
  }

  async listSessionsByWorkspace(workspaceId: string): Promise<Session[]> {
    return [...this.sessions.values()].filter(
      (session) => session.workspaceId === workspaceId,
    );
  }

  async appendNote(note: SessionNote): Promise<void> {
    this.notes.push(note);
  }

  async listNotes(sessionId: string): Promise<SessionNote[]> {
    return this.notes.filter((note) => note.sessionId === sessionId);
  }
}

export class InMemoryObjectStore implements ObjectStore {
  private readonly objects = new Map<string, unknown>();

  async put(key: string, value: unknown): Promise<string> {
    this.objects.set(key, value);
    return `memory://${key}`;
  }

  async get(uri: string): Promise<unknown> {
    const key = uri.replace(/^memory:\/\//, "");
    return this.objects.get(key);
  }
}

export class InMemoryIntegrationProfileRepository
  implements IntegrationProfileRepository
{
  private readonly profiles = new Map<string, IntegrationProfile>();

  async save(profile: IntegrationProfile): Promise<void> {
    this.profiles.set(profile.id, profile);
  }

  async getById(id: string): Promise<IntegrationProfile | undefined> {
    return this.profiles.get(id);
  }

  async list(): Promise<IntegrationProfile[]> {
    return [...this.profiles.values()];
  }
}
