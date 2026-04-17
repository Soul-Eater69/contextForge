import { createId } from "../../../shared/kernel/ids.ts";
import { NotFoundError } from "../../../shared/kernel/errors.ts";
import { isoNow, type Clock } from "../../../shared/kernel/time.ts";
import type { Session, SessionNote } from "../domain/models.ts";
import type { SessionRepository } from "../ports/repositories.ts";

export interface CreateSessionInput {
  tenantId: string;
  workspaceId: string;
  repositoryId: string;
  branch: string;
  commitSha?: string;
}

export class SessionService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly clock: Clock,
  ) {}

  async create(input: CreateSessionInput): Promise<Session> {
    const timestamp = isoNow(this.clock);
    const session: Session = {
      id: createId("sess"),
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      repositoryId: input.repositoryId,
      branch: input.branch,
      commitSha: input.commitSha,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.sessions.saveSession(session);
    return session;
  }

  async get(sessionId: string): Promise<Session> {
    const session = await this.sessions.getSession(sessionId);
    if (!session) {
      throw new NotFoundError("Session", sessionId);
    }

    return session;
  }

  async appendNote(
    sessionId: string,
    kind: SessionNote["kind"],
    content: string,
  ): Promise<SessionNote> {
    const session = await this.get(sessionId);
    const note: SessionNote = {
      id: createId("note"),
      sessionId: session.id,
      kind,
      content,
      createdAt: isoNow(this.clock),
    };

    await this.sessions.appendNote(note);
    await this.sessions.saveSession({
      ...session,
      updatedAt: isoNow(this.clock),
    });
    return note;
  }

  async listNotes(sessionId: string): Promise<SessionNote[]> {
    await this.get(sessionId);
    return this.sessions.listNotes(sessionId);
  }
}
