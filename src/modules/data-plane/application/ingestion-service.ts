import { createId, sha256 } from "../../../shared/kernel/ids.ts";
import { NotFoundError, invariant } from "../../../shared/kernel/errors.ts";
import { isoNow, type Clock } from "../../../shared/kernel/time.ts";
import type { AuditRepository } from "../../../shared/ports/audit.ts";
import type {
  CodeRepositoryRepository,
  WorkspaceRepository,
} from "../../control-plane/ports/repositories.ts";
import type {
  ArtifactKind,
  GraphConfidence,
  GraphEdge,
  IngestionJob,
  KnowledgeArtifact,
  Snapshot,
} from "../domain/models.ts";
import type {
  GraphRepository,
  IngestionJobRepository,
  KnowledgeArtifactRepository,
  ObjectStore,
  SnapshotRepository,
} from "../ports/repositories.ts";

export interface IngestionArtifactInput {
  path: string;
  kind: ArtifactKind;
  title?: string;
  summary?: string;
  content: string;
  symbols?: string[];
}

export interface IngestionRelationshipInput {
  from: string;
  to: string;
  relation: string;
  confidence?: GraphConfidence;
  evidenceRefs?: string[];
}

export interface CreateIngestionInput {
  workspaceId: string;
  repositoryId: string;
  branch: string;
  commitSha: string;
  sourceKind: Snapshot["sourceKind"];
  artifacts: IngestionArtifactInput[];
  relationships?: IngestionRelationshipInput[];
}

export class IngestionService {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly repositories: CodeRepositoryRepository,
    private readonly snapshots: SnapshotRepository,
    private readonly artifacts: KnowledgeArtifactRepository,
    private readonly graph: GraphRepository,
    private readonly jobs: IngestionJobRepository,
    private readonly objectStore: ObjectStore,
    private readonly audit: AuditRepository,
    private readonly clock: Clock,
  ) {}

  async ingest(input: CreateIngestionInput): Promise<{
    snapshot: Snapshot;
    job: IngestionJob;
  }> {
    invariant(input.branch.trim(), "Branch is required");
    invariant(input.commitSha.trim(), "Commit SHA is required");
    invariant(input.artifacts.length > 0, "At least one artifact is required");

    const workspace = await this.workspaces.getById(input.workspaceId);
    if (!workspace) {
      throw new NotFoundError("Workspace", input.workspaceId);
    }

    const repository = await this.repositories.getById(input.repositoryId);
    if (!repository || repository.workspaceId !== workspace.id) {
      throw new NotFoundError("Repository", input.repositoryId);
    }

    const timestamp = isoNow(this.clock);
    const manifestUri = await this.objectStore.put(
      [
        "snapshots",
        workspace.id,
        repository.id,
        input.branch,
        input.commitSha,
      ].join("/"),
      input,
    );

    const snapshot: Snapshot = {
      id: createId("snap"),
      workspaceId: workspace.id,
      repositoryId: repository.id,
      branch: input.branch.trim(),
      commitSha: input.commitSha.trim(),
      ingestionVersion: 1,
      sourceKind: input.sourceKind,
      manifestUri,
      createdAt: timestamp,
    };

    const job: IngestionJob = {
      id: createId("ingest"),
      snapshotId: snapshot.id,
      workspaceId: workspace.id,
      repositoryId: repository.id,
      status: "queued",
      artifactCount: input.artifacts.length,
      edgeCount: input.relationships?.length ?? 0,
      createdAt: timestamp,
    };

    const artifacts: KnowledgeArtifact[] = input.artifacts.map((artifact) => ({
      id: createId("artifact"),
      snapshotId: snapshot.id,
      workspaceId: workspace.id,
      repositoryId: repository.id,
      path: artifact.path,
      kind: artifact.kind,
      title: artifact.title?.trim() || artifact.path,
      summary: artifact.summary?.trim() || summarizeContent(artifact.content),
      content: artifact.content,
      symbols: artifact.symbols ?? [],
      hash: sha256(`${artifact.path}:${artifact.content}`),
      createdAt: timestamp,
    }));

    const edges: GraphEdge[] = (input.relationships ?? []).map((edge) => ({
      id: createId("edge"),
      snapshotId: snapshot.id,
      workspaceId: workspace.id,
      repositoryId: repository.id,
      from: edge.from,
      to: edge.to,
      relation: edge.relation,
      confidence: edge.confidence ?? "syntax_inferred",
      evidenceRefs: edge.evidenceRefs ?? [],
      createdAt: timestamp,
    }));

    await this.snapshots.save(snapshot);
    await this.jobs.save(job);
    await this.artifacts.saveMany(artifacts);
    await this.graph.saveMany(edges);

    const completedJob: IngestionJob = {
      ...job,
      status: "completed",
      completedAt: isoNow(this.clock),
    };
    await this.jobs.save(completedJob);

    await this.audit.append({
      id: createId("audit"),
      workspaceId: workspace.id,
      category: "data-plane",
      action: "ingestion.completed",
      actor: "system",
      details: {
        snapshotId: snapshot.id,
        repositoryId: repository.id,
        branch: snapshot.branch,
        commitSha: snapshot.commitSha,
        artifactCount: artifacts.length,
        edgeCount: edges.length,
      },
      createdAt: isoNow(this.clock),
    });

    return { snapshot, job: completedJob };
  }
}

const summarizeContent = (content: string): string =>
  content
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

