import { createId } from "../../../shared/kernel/ids.ts";
import { NotFoundError } from "../../../shared/kernel/errors.ts";
import { isoNow, type Clock } from "../../../shared/kernel/time.ts";
import type { AuditRepository } from "../../../shared/ports/audit.ts";
import type { WorkspaceRepository } from "../../control-plane/ports/repositories.ts";
import type { AgentReply } from "../domain/models.ts";
import type { ModelGateway } from "../ports/repositories.ts";
import { RetrievalService } from "./retrieval-service.ts";
import { SessionService } from "./session-service.ts";

export interface AgentRequest {
  workspaceId: string;
  repositoryId: string;
  branch: string;
  prompt: string;
  commitSha?: string;
  sessionId?: string;
}

export class AgentRuntime {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly sessions: SessionService,
    private readonly retrieval: RetrievalService,
    private readonly modelGateway: ModelGateway,
    private readonly audit: AuditRepository,
    private readonly clock: Clock,
  ) {}

  async respond(input: AgentRequest): Promise<AgentReply> {
    const workspace = await this.workspaces.getById(input.workspaceId);
    if (!workspace) {
      throw new NotFoundError("Workspace", input.workspaceId);
    }

    const session =
      input.sessionId === undefined
        ? await this.sessions.create({
            tenantId: workspace.tenantId,
            workspaceId: workspace.id,
            repositoryId: input.repositoryId,
            branch: input.branch,
            commitSha: input.commitSha,
          })
        : await this.sessions.get(input.sessionId);

    await this.sessions.appendNote(session.id, "question", input.prompt);

    const contextPackage = await this.retrieval.buildContext({
      workspaceId: workspace.id,
      repositoryId: input.repositoryId,
      branch: input.branch,
      query: input.prompt,
      commitSha: input.commitSha,
    });

    const sessionNotes = await this.sessions.listNotes(session.id);
    const modelReply = await this.modelGateway.compose({
      prompt: input.prompt,
      contextPackage,
      sessionNotes,
    });

    await this.sessions.appendNote(session.id, "plan", modelReply.plan.join(" | "));

    await this.audit.append({
      id: createId("audit"),
      workspaceId: workspace.id,
      category: "data-plane",
      action: "agent.responded",
      actor: "system",
      details: {
        sessionId: session.id,
        snapshotId: contextPackage.snapshot.id,
        commitSha: contextPackage.snapshot.commitSha,
      },
      createdAt: isoNow(this.clock),
    });

    return {
      sessionId: session.id,
      groundedAgainst: {
        snapshotId: contextPackage.snapshot.id,
        commitSha: contextPackage.snapshot.commitSha,
        branch: contextPackage.snapshot.branch,
      },
      answer: modelReply.answer,
      plan: modelReply.plan,
      contextPackage,
      memoryCandidates: buildMemoryCandidates(modelReply.plan, contextPackage),
    };
  }
}

const buildMemoryCandidates = (
  plan: string[],
  contextPackage: AgentReply["contextPackage"],
): AgentReply["memoryCandidates"] => {
  const evidence = contextPackage.mustHave.slice(0, 2);
  if (evidence.length === 0) {
    return [];
  }

  return [
    {
      title: "Candidate durable lesson from latest grounded run",
      summary: plan.join(" "),
      evidenceRefs: evidence.flatMap((item) => item.refs).slice(0, 4),
    },
  ];
};
