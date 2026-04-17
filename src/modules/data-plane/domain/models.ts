import type { SourceKind } from "../../control-plane/domain/models.ts";

export type ArtifactKind =
  | "code"
  | "doc"
  | "schema"
  | "architecture"
  | "runbook";

export type GraphConfidence =
  | "semantic_verified"
  | "syntax_inferred"
  | "config_inferred"
  | "historical_correlation"
  | "low_confidence";

export type MemoryScope = "workspace" | "org";

export type MemoryType =
  | "startup"
  | "episodic"
  | "semantic"
  | "org-shared"
  | "failure_pattern";

export type ApprovalState = "approved" | "pending" | "rejected";

export interface Snapshot {
  id: string;
  workspaceId: string;
  repositoryId: string;
  branch: string;
  commitSha: string;
  ingestionVersion: number;
  sourceKind: SourceKind;
  manifestUri: string;
  createdAt: string;
}

export interface KnowledgeArtifact {
  id: string;
  snapshotId: string;
  workspaceId: string;
  repositoryId: string;
  path: string;
  kind: ArtifactKind;
  title: string;
  summary: string;
  content: string;
  symbols: string[];
  hash: string;
  createdAt: string;
}

export interface GraphEdge {
  id: string;
  snapshotId: string;
  workspaceId: string;
  repositoryId: string;
  from: string;
  to: string;
  relation: string;
  confidence: GraphConfidence;
  evidenceRefs: string[];
  createdAt: string;
}

export interface IngestionJob {
  id: string;
  snapshotId: string;
  workspaceId: string;
  repositoryId: string;
  status: "queued" | "completed";
  artifactCount: number;
  edgeCount: number;
  createdAt: string;
  completedAt?: string;
}

export interface MemoryRecord {
  memoryId: string;
  tenantId: string;
  workspaceId: string;
  repoId: string;
  branch?: string;
  commitSha?: string;
  type: MemoryType;
  scope: MemoryScope;
  title: string;
  summary: string;
  evidenceRefs: string[];
  confidence: number;
  approvalState: ApprovalState;
  ttlDays: number;
  createdFromSession?: string;
  createdAt: string;
  expiresAt: string;
}

export interface Session {
  id: string;
  tenantId: string;
  workspaceId: string;
  repositoryId: string;
  branch: string;
  commitSha?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionNote {
  id: string;
  sessionId: string;
  kind: "question" | "plan" | "observation" | "tool-output";
  content: string;
  createdAt: string;
}

export interface ContextItem {
  id: string;
  source: "artifact" | "memory" | "graph";
  label: string;
  excerpt: string;
  score: number;
  confidence: number;
  refs: string[];
}

export interface ContextPackage {
  snapshot: Snapshot;
  mustHave: ContextItem[];
  supporting: ContextItem[];
  optional: ContextItem[];
  uncertainties: string[];
}

export interface AgentReply {
  sessionId: string;
  groundedAgainst: {
    snapshotId: string;
    commitSha: string;
    branch: string;
  };
  answer: string;
  plan: string[];
  contextPackage: ContextPackage;
  memoryCandidates: Array<{
    title: string;
    summary: string;
    evidenceRefs: string[];
  }>;
}

