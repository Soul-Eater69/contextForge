import type { AuditRepository } from "../../../shared/ports/audit.ts";
import type {
  AuditEvent,
  CodeRepository,
  Tenant,
  Workspace,
  WorkspacePolicy,
} from "../../../modules/control-plane/domain/models.ts";
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
import { FileStateStore } from "./state-store.ts";

export class FileTenantRepository implements TenantRepository {
  constructor(private readonly store: FileStateStore) {}

  async save(tenant: Tenant): Promise<void> {
    this.store.write((state) => upsert(state.tenants, tenant, "id"));
  }

  async getById(id: string): Promise<Tenant | undefined> {
    return this.store.read((state) => state.tenants.find((tenant) => tenant.id === id));
  }

  async list(): Promise<Tenant[]> {
    return this.store.read((state) => state.tenants);
  }
}

export class FileWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly store: FileStateStore) {}

  async save(workspace: Workspace): Promise<void> {
    this.store.write((state) => upsert(state.workspaces, workspace, "id"));
  }

  async getById(id: string): Promise<Workspace | undefined> {
    return this.store.read((state) =>
      state.workspaces.find((workspace) => workspace.id === id),
    );
  }

  async list(): Promise<Workspace[]> {
    return this.store.read((state) => state.workspaces);
  }

  async listByTenant(tenantId: string): Promise<Workspace[]> {
    return this.store.read((state) =>
      state.workspaces.filter((workspace) => workspace.tenantId === tenantId),
    );
  }
}

export class FileCodeRepositoryRepository implements CodeRepositoryRepository {
  constructor(private readonly store: FileStateStore) {}

  async save(repository: CodeRepository): Promise<void> {
    this.store.write((state) => upsert(state.repositories, repository, "id"));
  }

  async getById(id: string): Promise<CodeRepository | undefined> {
    return this.store.read((state) =>
      state.repositories.find((repository) => repository.id === id),
    );
  }

  async list(): Promise<CodeRepository[]> {
    return this.store.read((state) => state.repositories);
  }

  async listByWorkspace(workspaceId: string): Promise<CodeRepository[]> {
    return this.store.read((state) =>
      state.repositories.filter((repository) => repository.workspaceId === workspaceId),
    );
  }
}

export class FileWorkspacePolicyRepository implements WorkspacePolicyRepository {
  constructor(private readonly store: FileStateStore) {}

  async save(policy: WorkspacePolicy): Promise<void> {
    this.store.write((state) => {
      const index = state.policies.findIndex(
        (candidate) => candidate.workspaceId === policy.workspaceId,
      );
      if (index >= 0) {
        state.policies[index] = policy;
      } else {
        state.policies.push(policy);
      }
    });
  }

  async list(): Promise<WorkspacePolicy[]> {
    return this.store.read((state) => state.policies);
  }

  async getByWorkspaceId(workspaceId: string): Promise<WorkspacePolicy | undefined> {
    return this.store.read((state) =>
      state.policies.find((policy) => policy.workspaceId === workspaceId),
    );
  }
}

export class FileAuditRepository implements AuditRepository {
  constructor(private readonly store: FileStateStore) {}

  async append(event: AuditEvent): Promise<void> {
    this.store.write((state) => {
      state.auditEvents.push(event);
    });
  }

  async list(filters?: {
    workspaceId?: string;
    category?: AuditEvent["category"];
  }): Promise<AuditEvent[]> {
    return this.store.read((state) =>
      state.auditEvents.filter(
        (event) =>
          (filters?.workspaceId === undefined ||
            event.workspaceId === filters.workspaceId) &&
          (filters?.category === undefined || event.category === filters.category),
      ),
    );
  }
}

export class FileSnapshotRepository implements SnapshotRepository {
  constructor(private readonly store: FileStateStore) {}

  async save(snapshot: Snapshot): Promise<void> {
    this.store.write((state) => upsert(state.snapshots, snapshot, "id"));
  }

  async getById(id: string): Promise<Snapshot | undefined> {
    return this.store.read((state) =>
      state.snapshots.find((snapshot) => snapshot.id === id),
    );
  }

  async list(): Promise<Snapshot[]> {
    return this.store.read((state) => state.snapshots);
  }

  async listByRepository(repositoryId: string): Promise<Snapshot[]> {
    return this.store.read((state) =>
      state.snapshots.filter((snapshot) => snapshot.repositoryId === repositoryId),
    );
  }

  async findByRepositoryAndCommit(
    repositoryId: string,
    commitSha: string,
  ): Promise<Snapshot | undefined> {
    return this.store.read((state) =>
      state.snapshots.find(
        (snapshot) =>
          snapshot.repositoryId === repositoryId && snapshot.commitSha === commitSha,
      ),
    );
  }

  async findLatestByRepositoryAndBranch(
    repositoryId: string,
    branch: string,
  ): Promise<Snapshot | undefined> {
    return this.store.read((state) =>
      state.snapshots
        .filter(
          (snapshot) =>
            snapshot.repositoryId === repositoryId && snapshot.branch === branch,
        )
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0],
    );
  }
}

export class FileKnowledgeArtifactRepository implements KnowledgeArtifactRepository {
  constructor(private readonly store: FileStateStore) {}

  async saveMany(artifacts: KnowledgeArtifact[]): Promise<void> {
    this.store.write((state) => {
      for (const artifact of artifacts) {
        upsert(state.artifacts, artifact, "id");
      }
    });
  }

  async list(): Promise<KnowledgeArtifact[]> {
    return this.store.read((state) => state.artifacts);
  }

  async listBySnapshot(snapshotId: string): Promise<KnowledgeArtifact[]> {
    return this.store.read((state) =>
      state.artifacts.filter((artifact) => artifact.snapshotId === snapshotId),
    );
  }
}

export class FileGraphRepository implements GraphRepository {
  constructor(private readonly store: FileStateStore) {}

  async saveMany(edges: GraphEdge[]): Promise<void> {
    this.store.write((state) => {
      for (const edge of edges) {
        upsert(state.graphEdges, edge, "id");
      }
    });
  }

  async list(): Promise<GraphEdge[]> {
    return this.store.read((state) => state.graphEdges);
  }

  async listBySnapshot(snapshotId: string): Promise<GraphEdge[]> {
    return this.store.read((state) =>
      state.graphEdges.filter((edge) => edge.snapshotId === snapshotId),
    );
  }
}

export class FileIngestionJobRepository implements IngestionJobRepository {
  constructor(private readonly store: FileStateStore) {}

  async save(job: IngestionJob): Promise<void> {
    this.store.write((state) => upsert(state.ingestionJobs, job, "id"));
  }

  async getById(id: string): Promise<IngestionJob | undefined> {
    return this.store.read((state) =>
      state.ingestionJobs.find((job) => job.id === id),
    );
  }

  async list(): Promise<IngestionJob[]> {
    return this.store.read((state) => state.ingestionJobs);
  }

  async listByRepository(repositoryId: string): Promise<IngestionJob[]> {
    return this.store.read((state) =>
      state.ingestionJobs.filter((job) => job.repositoryId === repositoryId),
    );
  }
}

export class FileMemoryRepository implements MemoryRepository {
  constructor(private readonly store: FileStateStore) {}

  async save(memory: MemoryRecord): Promise<void> {
    this.store.write((state) => upsert(state.memories, memory, "memoryId"));
  }

  async list(): Promise<MemoryRecord[]> {
    return this.store.read((state) => state.memories);
  }

  async findBySimilarity(input: {
    workspaceId: string;
    repoId: string;
    scope: MemoryRecord["scope"];
    type: MemoryRecord["type"];
    title: string;
  }): Promise<MemoryRecord | undefined> {
    return this.store.read((state) =>
      state.memories.find(
        (memory) =>
          memory.workspaceId === input.workspaceId &&
          memory.repoId === input.repoId &&
          memory.scope === input.scope &&
          memory.type === input.type &&
          memory.title.toLowerCase() === input.title.toLowerCase(),
      ),
    );
  }

  async listByWorkspace(workspaceId: string): Promise<MemoryRecord[]> {
    return this.store.read((state) =>
      state.memories.filter((memory) => memory.workspaceId === workspaceId),
    );
  }

  async listByTenant(tenantId: string): Promise<MemoryRecord[]> {
    return this.store.read((state) =>
      state.memories.filter((memory) => memory.tenantId === tenantId),
    );
  }
}

export class FileSessionRepository implements SessionRepository {
  constructor(private readonly store: FileStateStore) {}

  async saveSession(session: Session): Promise<void> {
    this.store.write((state) => upsert(state.sessions, session, "id"));
  }

  async getSession(id: string): Promise<Session | undefined> {
    return this.store.read((state) =>
      state.sessions.find((session) => session.id === id),
    );
  }

  async listSessions(): Promise<Session[]> {
    return this.store.read((state) => state.sessions);
  }

  async listSessionsByWorkspace(workspaceId: string): Promise<Session[]> {
    return this.store.read((state) =>
      state.sessions.filter((session) => session.workspaceId === workspaceId),
    );
  }

  async appendNote(note: SessionNote): Promise<void> {
    this.store.write((state) => {
      state.sessionNotes.push(note);
    });
  }

  async listNotes(sessionId: string): Promise<SessionNote[]> {
    return this.store.read((state) =>
      state.sessionNotes.filter((note) => note.sessionId === sessionId),
    );
  }
}

export class FileObjectStore implements ObjectStore {
  constructor(private readonly store: FileStateStore) {}

  async put(key: string, value: unknown): Promise<string> {
    return this.store.putObject(key, value);
  }

  async get(uri: string): Promise<unknown> {
    return this.store.getObject(uri);
  }
}

export class FileIntegrationProfileRepository
  implements IntegrationProfileRepository
{
  constructor(private readonly store: FileStateStore) {}

  async save(profile: IntegrationProfile): Promise<void> {
    this.store.write((state) => upsert(state.integrationProfiles, profile, "id"));
  }

  async getById(id: string): Promise<IntegrationProfile | undefined> {
    return this.store.read((state) =>
      state.integrationProfiles.find((profile) => profile.id === id),
    );
  }

  async list(): Promise<IntegrationProfile[]> {
    return this.store.read((state) => state.integrationProfiles);
  }
}

const upsert = <T, K extends keyof T>(
  collection: T[],
  value: T,
  key: K,
) => {
  const index = collection.findIndex((candidate) => candidate[key] === value[key]);
  if (index >= 0) {
    collection[index] = value;
  } else {
    collection.push(value);
  }
};
