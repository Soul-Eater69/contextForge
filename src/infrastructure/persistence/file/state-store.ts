import fs from "node:fs";
import path from "node:path";
import type {
  AuditEvent,
  CodeRepository,
  Tenant,
  Workspace,
  WorkspacePolicy,
} from "../../../modules/control-plane/domain/models.ts";
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

export interface FileDatabaseState {
  tenants: Tenant[];
  workspaces: Workspace[];
  repositories: CodeRepository[];
  policies: WorkspacePolicy[];
  auditEvents: AuditEvent[];
  snapshots: Snapshot[];
  artifacts: KnowledgeArtifact[];
  graphEdges: GraphEdge[];
  ingestionJobs: IngestionJob[];
  memories: MemoryRecord[];
  sessions: Session[];
  sessionNotes: SessionNote[];
  integrationProfiles: IntegrationProfile[];
}

const createEmptyState = (): FileDatabaseState => ({
  tenants: [],
  workspaces: [],
  repositories: [],
  policies: [],
  auditEvents: [],
  snapshots: [],
  artifacts: [],
  graphEdges: [],
  ingestionJobs: [],
  memories: [],
  sessions: [],
  sessionNotes: [],
  integrationProfiles: [],
});

export class FileStateStore {
  private readonly filePath: string;
  private readonly objectDir: string;
  private state: FileDatabaseState;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.objectDir = path.join(dataDir, "objects");
    fs.mkdirSync(this.objectDir, { recursive: true });
    this.filePath = path.join(dataDir, "state.json");
    this.state = this.loadState();
  }

  read<T>(selector: (state: FileDatabaseState) => T): T {
    return structuredClone(selector(this.state));
  }

  write(mutator: (state: FileDatabaseState) => void): void {
    mutator(this.state);
    this.persist();
  }

  putObject(key: string, value: unknown): string {
    const normalizedKey = key.replace(/[\\/:]+/g, "_");
    const objectPath = path.join(this.objectDir, `${normalizedKey}.json`);
    fs.mkdirSync(path.dirname(objectPath), { recursive: true });
    fs.writeFileSync(objectPath, JSON.stringify(value, null, 2), "utf8");
    return `file-object://${normalizedKey}.json`;
  }

  getObject(uri: string): unknown {
    const fileName = uri.replace(/^file-object:\/\//, "");
    const objectPath = path.join(this.objectDir, fileName);
    if (!fs.existsSync(objectPath)) {
      return undefined;
    }

    return JSON.parse(fs.readFileSync(objectPath, "utf8"));
  }

  private loadState(): FileDatabaseState {
    if (!fs.existsSync(this.filePath)) {
      const initial = createEmptyState();
      fs.writeFileSync(this.filePath, JSON.stringify(initial, null, 2), "utf8");
      return initial;
    }

    const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as Partial<FileDatabaseState>;
    return {
      ...createEmptyState(),
      ...parsed,
    };
  }

  private persist(): void {
    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(this.state, null, 2), "utf8");
    fs.renameSync(tempPath, this.filePath);
  }
}
