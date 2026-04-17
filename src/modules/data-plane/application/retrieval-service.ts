import { createId } from "../../../shared/kernel/ids.ts";
import { NotFoundError } from "../../../shared/kernel/errors.ts";
import { isoNow, type Clock } from "../../../shared/kernel/time.ts";
import type { AuditRepository } from "../../../shared/ports/audit.ts";
import type {
  CodeRepositoryRepository,
  WorkspacePolicyRepository,
  WorkspaceRepository,
} from "../../control-plane/ports/repositories.ts";
import type {
  ContextItem,
  ContextPackage,
  GraphConfidence,
  GraphEdge,
  KnowledgeArtifact,
  MemoryRecord,
  Snapshot,
} from "../domain/models.ts";
import type {
  GraphRepository,
  KnowledgeArtifactRepository,
  MemoryRepository,
  SnapshotRepository,
} from "../ports/repositories.ts";

export interface BuildContextInput {
  workspaceId: string;
  repositoryId: string;
  branch: string;
  query: string;
  commitSha?: string;
  symbolHints?: string[];
}

const graphConfidenceWeight: Record<GraphConfidence, number> = {
  semantic_verified: 1,
  syntax_inferred: 0.72,
  config_inferred: 0.68,
  historical_correlation: 0.58,
  low_confidence: 0.3,
};

export class RetrievalService {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly repositories: CodeRepositoryRepository,
    private readonly policies: WorkspacePolicyRepository,
    private readonly snapshots: SnapshotRepository,
    private readonly artifacts: KnowledgeArtifactRepository,
    private readonly graph: GraphRepository,
    private readonly memories: MemoryRepository,
    private readonly audit: AuditRepository,
    private readonly clock: Clock,
  ) {}

  async buildContext(input: BuildContextInput): Promise<ContextPackage> {
    const workspace = await this.workspaces.getById(input.workspaceId);
    if (!workspace) {
      throw new NotFoundError("Workspace", input.workspaceId);
    }

    const repository = await this.repositories.getById(input.repositoryId);
    if (!repository || repository.workspaceId !== workspace.id) {
      throw new NotFoundError("Repository", input.repositoryId);
    }

    const policy = await this.policies.getByWorkspaceId(workspace.id);
    if (!policy) {
      throw new NotFoundError("WorkspacePolicy", workspace.id);
    }

    const snapshot = await resolveSnapshot(
      this.snapshots,
      repository.id,
      input.branch,
      input.commitSha,
    );
    if (!snapshot) {
      throw new NotFoundError(
        "Snapshot",
        input.commitSha ?? `${repository.id}:${input.branch}`,
      );
    }

    const [artifacts, edges, workspaceMemories, tenantMemories] = await Promise.all([
      this.artifacts.listBySnapshot(snapshot.id),
      this.graph.listBySnapshot(snapshot.id),
      this.memories.listByWorkspace(workspace.id),
      this.memories.listByTenant(workspace.tenantId),
    ]);

    const relevantMemories = filterMemories({
      workspaceId: workspace.id,
      repositoryId: repository.id,
      branch: input.branch,
      commitSha: input.commitSha,
      workspaceMemories,
      tenantMemories,
      now: this.clock.now(),
    });

    const queryTokens = tokenize([input.query, ...(input.symbolHints ?? [])].join(" "));

    const scoredItems = [
      ...artifacts.map((artifact) =>
        scoreArtifact(artifact, edges, queryTokens, input.symbolHints ?? []),
      ),
      ...relevantMemories.map((memory) => scoreMemory(memory, queryTokens)),
      ...edges.map((edge) => scoreEdge(edge, queryTokens)),
    ]
      .filter((item): item is ContextItem => item !== undefined)
      .sort((left, right) => right.score - left.score);

    const deduped = dedupe(scoredItems).slice(0, policy.maxContextItems);
    const mustHave = deduped.filter((item) => item.score >= 0.56).slice(0, 4);
    const supporting = deduped
      .filter((item) => item.score >= 0.32 && item.score < 0.56)
      .slice(0, 4);
    const optional = deduped
      .filter((item) => item.score < 0.32)
      .slice(
        0,
        Math.max(0, policy.maxContextItems - mustHave.length - supporting.length),
      );

    const contextPackage: ContextPackage = {
      snapshot,
      mustHave,
      supporting,
      optional,
      uncertainties: buildUncertainties(snapshot, deduped),
    };

    await this.audit.append({
      id: createId("audit"),
      workspaceId: workspace.id,
      category: "data-plane",
      action: "retrieval.context-built",
      actor: "system",
      details: {
        snapshotId: snapshot.id,
        commitSha: snapshot.commitSha,
        mustHaveCount: mustHave.length,
        supportingCount: supporting.length,
        optionalCount: optional.length,
      },
      createdAt: isoNow(this.clock),
    });

    return contextPackage;
  }
}

const resolveSnapshot = async (
  snapshots: SnapshotRepository,
  repositoryId: string,
  branch: string,
  commitSha?: string,
): Promise<Snapshot | undefined> => {
  if (commitSha) {
    return snapshots.findByRepositoryAndCommit(repositoryId, commitSha);
  }

  return snapshots.findLatestByRepositoryAndBranch(repositoryId, branch);
};

const filterMemories = (input: {
  workspaceId: string;
  repositoryId: string;
  branch: string;
  commitSha?: string;
  workspaceMemories: MemoryRecord[];
  tenantMemories: MemoryRecord[];
  now: Date;
}): MemoryRecord[] =>
  [...input.workspaceMemories, ...input.tenantMemories].filter(
    (memory, index, all) =>
      memory.approvalState === "approved" &&
      new Date(memory.expiresAt) > input.now &&
      (memory.scope === "workspace"
        ? memory.workspaceId === input.workspaceId
        : true) &&
      (memory.scope === "org" || memory.repoId === input.repositoryId) &&
      (!memory.branch || memory.branch === input.branch) &&
      (!input.commitSha || !memory.commitSha || memory.commitSha === input.commitSha) &&
      all.findIndex((candidate) => candidate.memoryId === memory.memoryId) === index,
  );

const scoreArtifact = (
  artifact: KnowledgeArtifact,
  edges: GraphEdge[],
  queryTokens: string[],
  symbolHints: string[],
): ContextItem | undefined => {
  const searchable = [
    artifact.path,
    artifact.title,
    artifact.summary,
    artifact.content,
    artifact.symbols.join(" "),
  ].join(" ");

  const lexical = lexicalScore(queryTokens, searchable);
  const semantic = semanticSimilarity(queryTokens, tokenize(searchable));
  const symbolBoost = exactMatchScore([...artifact.symbols, artifact.path], [
    ...queryTokens,
    ...symbolHints.map((item) => item.toLowerCase()),
  ]);
  const graphProximity = edges.some(
    (edge) =>
      edge.from === artifact.path ||
      edge.to === artifact.path ||
      artifact.symbols.includes(edge.from) ||
      artifact.symbols.includes(edge.to),
  )
    ? 0.8
    : 0.1;

  const score = roundScore(
    0.28 * lexical +
      0.24 * semantic +
      0.20 * graphProximity +
      0.12 * symbolBoost +
      0.10 * 0.85 +
      0.06 * riskSignal(artifact.path),
  );

  if (score < 0.16) {
    return undefined;
  }

  return {
    id: artifact.id,
    source: "artifact",
    label: artifact.path,
    excerpt: artifact.summary,
    score,
    confidence: 0.9,
    refs: [artifact.path],
  };
};

const scoreMemory = (
  memory: MemoryRecord,
  queryTokens: string[],
): ContextItem | undefined => {
  const searchable = [memory.title, memory.summary, memory.evidenceRefs.join(" ")].join(" ");
  const lexical = lexicalScore(queryTokens, searchable);
  const semantic = semanticSimilarity(queryTokens, tokenize(searchable));
  const recency = recencyScore(memory.createdAt);
  const evidenceDensity = Math.min(1, memory.evidenceRefs.length / 3);

  const score = roundScore(
    0.28 * lexical +
      0.24 * semantic +
      0.20 * evidenceDensity +
      0.12 * memory.confidence +
      0.10 * recency +
      0.06 * 0.7,
  );

  if (score < 0.16) {
    return undefined;
  }

  return {
    id: memory.memoryId,
    source: "memory",
    label: memory.title,
    excerpt: memory.summary,
    score,
    confidence: memory.confidence,
    refs: [...memory.evidenceRefs],
  };
};

const scoreEdge = (
  edge: GraphEdge,
  queryTokens: string[],
): ContextItem | undefined => {
  const searchable = [edge.from, edge.to, edge.relation, edge.evidenceRefs.join(" ")].join(" ");
  const lexical = lexicalScore(queryTokens, searchable);
  const endpointMatch = exactMatchScore([edge.from, edge.to, edge.relation], queryTokens);
  const confidence = graphConfidenceWeight[edge.confidence];
  const score = roundScore(
    0.28 * lexical +
      0.24 * semanticSimilarity(queryTokens, tokenize(searchable)) +
      0.20 * confidence +
      0.12 * endpointMatch +
      0.10 * recencyScore(edge.createdAt) +
      0.06 * Math.min(1, edge.evidenceRefs.length / 2),
  );

  if (score < 0.18) {
    return undefined;
  }

  return {
    id: edge.id,
    source: "graph",
    label: `${edge.from} ${edge.relation} ${edge.to}`,
    excerpt: `${edge.confidence} edge`,
    score,
    confidence,
    refs: [...edge.evidenceRefs],
  };
};

const buildUncertainties = (
  snapshot: Snapshot,
  items: ContextItem[],
): string[] => {
  const uncertainties = new Set<string>();
  uncertainties.add(
    `Grounded against branch ${snapshot.branch} at commit ${snapshot.commitSha}.`,
  );

  if (items.some((item) => item.source === "graph" && item.confidence < 0.7)) {
    uncertainties.add(
      "Some graph evidence is inferred rather than semantically verified.",
    );
  }

  if (items.length === 0) {
    uncertainties.add("No high-signal evidence was retrieved for this request.");
  }

  return [...uncertainties];
};

const dedupe = (items: ContextItem[]): ContextItem[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.source}:${item.label}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .filter(Boolean);

const lexicalScore = (queryTokens: string[], searchable: string): number => {
  if (queryTokens.length === 0) {
    return 0;
  }

  const haystack = searchable.toLowerCase();
  const matches = queryTokens.filter((token) => haystack.includes(token)).length;
  return matches / queryTokens.length;
};

const semanticSimilarity = (queryTokens: string[], targetTokens: string[]): number => {
  const union = new Set([...queryTokens, ...targetTokens]);
  if (union.size === 0) {
    return 0;
  }

  const overlap = queryTokens.filter((token) => targetTokens.includes(token)).length;
  return overlap / union.size;
};

const exactMatchScore = (candidates: string[], needles: string[]): number => {
  const normalized = candidates.map((candidate) => candidate.toLowerCase());
  return needles.some((needle) => normalized.includes(needle.toLowerCase())) ? 1 : 0;
};

const recencyScore = (createdAt: string): number => {
  const ageInDays =
    (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, 1 - ageInDays / 365);
};

const riskSignal = (path: string): number => {
  const sensitiveKeywords = ["auth", "security", "billing", "payment", "policy"];
  return sensitiveKeywords.some((keyword) => path.toLowerCase().includes(keyword))
    ? 1
    : 0.45;
};

const roundScore = (value: number): number => Number(value.toFixed(4));

