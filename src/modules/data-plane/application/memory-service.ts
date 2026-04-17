import { createId } from "../../../shared/kernel/ids.ts";
import {
  NotFoundError,
  PolicyError,
  invariant,
} from "../../../shared/kernel/errors.ts";
import { isoNow, type Clock } from "../../../shared/kernel/time.ts";
import type { AuditRepository } from "../../../shared/ports/audit.ts";
import type {
  CodeRepositoryRepository,
  WorkspacePolicyRepository,
  WorkspaceRepository,
} from "../../control-plane/ports/repositories.ts";
import type { MemoryRecord, MemoryScope, MemoryType } from "../domain/models.ts";
import type { MemoryRepository } from "../ports/repositories.ts";

export interface PromoteMemoryInput {
  workspaceId: string;
  repositoryId: string;
  branch?: string;
  commitSha?: string;
  scope: MemoryScope;
  type: MemoryType;
  title: string;
  summary: string;
  evidenceRefs: string[];
  confidence?: number;
  ttlDays?: number;
  createdFromSession?: string;
}

export class MemoryService {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly repositories: CodeRepositoryRepository,
    private readonly policies: WorkspacePolicyRepository,
    private readonly memories: MemoryRepository,
    private readonly audit: AuditRepository,
    private readonly clock: Clock,
  ) {}

  async promote(input: PromoteMemoryInput): Promise<MemoryRecord> {
    invariant(input.title.trim(), "Memory title is required");
    invariant(input.summary.trim(), "Memory summary is required");
    invariant(
      input.evidenceRefs.length > 0,
      "Memory promotion requires at least one evidence reference",
    );

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

    if (workspace.persistenceMode === "ephemeral" || !policy.allowDurableMemory) {
      throw new PolicyError("Durable memory is disabled for this workspace", {
        workspaceId: workspace.id,
      });
    }

    if (input.scope === "org" && !policy.allowOrgSharedMemory) {
      throw new PolicyError("Org-shared memory is disabled for this workspace", {
        workspaceId: workspace.id,
      });
    }

    const duplicate = await this.memories.findBySimilarity({
      workspaceId: workspace.id,
      repoId: repository.id,
      scope: input.scope,
      type: input.type,
      title: input.title.trim(),
    });
    if (duplicate) {
      return duplicate;
    }

    const timestamp = this.clock.now();
    const ttlDays = input.ttlDays ?? policy.defaultMemoryTtlDays;
    const expiresAt = new Date(timestamp);
    expiresAt.setUTCDate(expiresAt.getUTCDate() + ttlDays);

    const memory: MemoryRecord = {
      memoryId: createId("mem"),
      tenantId: workspace.tenantId,
      workspaceId: workspace.id,
      repoId: repository.id,
      branch: input.branch,
      commitSha: input.commitSha,
      type: input.type,
      scope: input.scope,
      title: input.title.trim(),
      summary: input.summary.trim(),
      evidenceRefs: [...input.evidenceRefs],
      confidence: normalizeConfidence(input.confidence ?? 0.85),
      approvalState:
        input.scope === "org" && policy.requireApprovalForOrgSharedMemory
          ? "pending"
          : "approved",
      ttlDays,
      createdFromSession: input.createdFromSession,
      createdAt: timestamp.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    await this.memories.save(memory);
    await this.audit.append({
      id: createId("audit"),
      workspaceId: workspace.id,
      category: "data-plane",
      action: "memory.promoted",
      actor: "system",
      details: {
        memoryId: memory.memoryId,
        type: memory.type,
        scope: memory.scope,
        approvalState: memory.approvalState,
      },
      createdAt: isoNow(this.clock),
    });

    return memory;
  }
}

const normalizeConfidence = (value: number): number =>
  Math.max(0, Math.min(1, value));
