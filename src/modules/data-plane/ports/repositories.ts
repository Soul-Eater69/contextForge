import type {
  ContextPackage,
  GraphEdge,
  IngestionJob,
  KnowledgeArtifact,
  MemoryRecord,
  Session,
  SessionNote,
  Snapshot,
} from "../domain/models.ts";

export interface SnapshotRepository {
  save(snapshot: Snapshot): Promise<void>;
  getById(id: string): Promise<Snapshot | undefined>;
  list(): Promise<Snapshot[]>;
  listByRepository(repositoryId: string): Promise<Snapshot[]>;
  findByRepositoryAndCommit(
    repositoryId: string,
    commitSha: string,
  ): Promise<Snapshot | undefined>;
  findLatestByRepositoryAndBranch(
    repositoryId: string,
    branch: string,
  ): Promise<Snapshot | undefined>;
}

export interface KnowledgeArtifactRepository {
  saveMany(artifacts: KnowledgeArtifact[]): Promise<void>;
  list(): Promise<KnowledgeArtifact[]>;
  listBySnapshot(snapshotId: string): Promise<KnowledgeArtifact[]>;
}

export interface GraphRepository {
  saveMany(edges: GraphEdge[]): Promise<void>;
  list(): Promise<GraphEdge[]>;
  listBySnapshot(snapshotId: string): Promise<GraphEdge[]>;
}

export interface IngestionJobRepository {
  save(job: IngestionJob): Promise<void>;
  getById(id: string): Promise<IngestionJob | undefined>;
  list(): Promise<IngestionJob[]>;
  listByRepository(repositoryId: string): Promise<IngestionJob[]>;
}

export interface MemoryRepository {
  save(memory: MemoryRecord): Promise<void>;
  list(): Promise<MemoryRecord[]>;
  findBySimilarity(input: {
    workspaceId: string;
    repoId: string;
    scope: MemoryRecord["scope"];
    type: MemoryRecord["type"];
    title: string;
  }): Promise<MemoryRecord | undefined>;
  listByWorkspace(workspaceId: string): Promise<MemoryRecord[]>;
  listByTenant(tenantId: string): Promise<MemoryRecord[]>;
}

export interface SessionRepository {
  saveSession(session: Session): Promise<void>;
  getSession(id: string): Promise<Session | undefined>;
  listSessions(): Promise<Session[]>;
  listSessionsByWorkspace(workspaceId: string): Promise<Session[]>;
  appendNote(note: SessionNote): Promise<void>;
  listNotes(sessionId: string): Promise<SessionNote[]>;
}

export interface ObjectStore {
  put(key: string, value: unknown): Promise<string>;
  get(uri: string): Promise<unknown>;
}

export interface ModelGateway {
  compose(input: {
    prompt: string;
    contextPackage: ContextPackage;
    sessionNotes: SessionNote[];
  }): Promise<{
    answer: string;
    plan: string[];
  }>;
}
