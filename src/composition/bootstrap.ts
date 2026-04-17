import type { AppConfig } from "../config/app-config.ts";
import { ControlPlaneService } from "../modules/control-plane/application/control-plane-service.ts";
import { AgentRuntime } from "../modules/data-plane/application/agent-runtime.ts";
import { IngestionService } from "../modules/data-plane/application/ingestion-service.ts";
import { MemoryService } from "../modules/data-plane/application/memory-service.ts";
import { RetrievalService } from "../modules/data-plane/application/retrieval-service.ts";
import { SessionService } from "../modules/data-plane/application/session-service.ts";
import { IntegrationService } from "../modules/platform/application/integration-service.ts";
import { PlatformReadService } from "../modules/platform/application/platform-read-service.ts";
import { DeterministicModelGateway } from "../infrastructure/model/deterministic-model-gateway.ts";
import {
  FileAuditRepository,
  FileCodeRepositoryRepository,
  FileGraphRepository,
  FileIntegrationProfileRepository,
  FileIngestionJobRepository,
  FileKnowledgeArtifactRepository,
  FileMemoryRepository,
  FileObjectStore,
  FileSessionRepository,
  FileSnapshotRepository,
  FileTenantRepository,
  FileWorkspacePolicyRepository,
  FileWorkspaceRepository,
} from "../infrastructure/persistence/file/repositories.ts";
import { FileStateStore } from "../infrastructure/persistence/file/state-store.ts";
import {
  InMemoryAuditRepository,
  InMemoryCodeRepositoryRepository,
  InMemoryGraphRepository,
  InMemoryIntegrationProfileRepository,
  InMemoryIngestionJobRepository,
  InMemoryKnowledgeArtifactRepository,
  InMemoryMemoryRepository,
  InMemoryObjectStore,
  InMemorySessionRepository,
  InMemorySnapshotRepository,
  InMemoryTenantRepository,
  InMemoryWorkspacePolicyRepository,
  InMemoryWorkspaceRepository,
} from "../infrastructure/persistence/in-memory/repositories.ts";
import { SystemClock } from "../shared/kernel/time.ts";

type RepositorySet = {
  audit: InMemoryAuditRepository | FileAuditRepository;
  tenants: InMemoryTenantRepository | FileTenantRepository;
  workspaces: InMemoryWorkspaceRepository | FileWorkspaceRepository;
  codeRepositories:
    | InMemoryCodeRepositoryRepository
    | FileCodeRepositoryRepository;
  policies:
    | InMemoryWorkspacePolicyRepository
    | FileWorkspacePolicyRepository;
  snapshots: InMemorySnapshotRepository | FileSnapshotRepository;
  artifacts:
    | InMemoryKnowledgeArtifactRepository
    | FileKnowledgeArtifactRepository;
  graph: InMemoryGraphRepository | FileGraphRepository;
  jobs: InMemoryIngestionJobRepository | FileIngestionJobRepository;
  memories: InMemoryMemoryRepository | FileMemoryRepository;
  sessions: InMemorySessionRepository | FileSessionRepository;
  objectStore: InMemoryObjectStore | FileObjectStore;
  integrations:
    | InMemoryIntegrationProfileRepository
    | FileIntegrationProfileRepository;
};

export interface ApplicationContainer {
  services: {
    controlPlane: ControlPlaneService;
    ingestion: IngestionService;
    memory: MemoryService;
    retrieval: RetrievalService;
    sessions: SessionService;
    agent: AgentRuntime;
    read: PlatformReadService;
    integrations: IntegrationService;
  };
  repositories: RepositorySet;
}

export interface CreateApplicationOptions {
  runtime?: "memory" | "file";
  config?: AppConfig;
}

export const createApplication = (
  options: CreateApplicationOptions = {},
): ApplicationContainer => {
  const clock = new SystemClock();
  const repositories = createRepositories(options);

  const services = {
    controlPlane: new ControlPlaneService(
      repositories.tenants,
      repositories.workspaces,
      repositories.codeRepositories,
      repositories.policies,
      repositories.audit,
      clock,
    ),
    sessions: new SessionService(repositories.sessions, clock),
    ingestion: new IngestionService(
      repositories.workspaces,
      repositories.codeRepositories,
      repositories.snapshots,
      repositories.artifacts,
      repositories.graph,
      repositories.jobs,
      repositories.objectStore,
      repositories.audit,
      clock,
    ),
    memory: new MemoryService(
      repositories.workspaces,
      repositories.codeRepositories,
      repositories.policies,
      repositories.memories,
      repositories.audit,
      clock,
    ),
    retrieval: new RetrievalService(
      repositories.workspaces,
      repositories.codeRepositories,
      repositories.policies,
      repositories.snapshots,
      repositories.artifacts,
      repositories.graph,
      repositories.memories,
      repositories.audit,
      clock,
    ),
    read: new PlatformReadService(
      repositories.tenants,
      repositories.workspaces,
      repositories.codeRepositories,
      repositories.policies,
      repositories.snapshots,
      repositories.artifacts,
      repositories.graph,
      repositories.jobs,
      repositories.memories,
      repositories.sessions,
      repositories.audit,
      repositories.integrations,
    ),
    integrations: new IntegrationService(repositories.integrations, clock),
    agent: undefined as unknown as AgentRuntime,
  };

  services.agent = new AgentRuntime(
    repositories.workspaces,
    services.sessions,
    services.retrieval,
    new DeterministicModelGateway(),
    repositories.audit,
    clock,
  );

  return { services, repositories };
};

const createRepositories = (options: CreateApplicationOptions): RepositorySet => {
  if (options.runtime === "file") {
    if (!options.config) {
      throw new Error("File runtime requires app config");
    }

    const store = new FileStateStore(options.config.dataDir);
    return {
      audit: new FileAuditRepository(store),
      tenants: new FileTenantRepository(store),
      workspaces: new FileWorkspaceRepository(store),
      codeRepositories: new FileCodeRepositoryRepository(store),
      policies: new FileWorkspacePolicyRepository(store),
      snapshots: new FileSnapshotRepository(store),
      artifacts: new FileKnowledgeArtifactRepository(store),
      graph: new FileGraphRepository(store),
      jobs: new FileIngestionJobRepository(store),
        memories: new FileMemoryRepository(store),
        sessions: new FileSessionRepository(store),
        objectStore: new FileObjectStore(store),
        integrations: new FileIntegrationProfileRepository(store),
      };
  }

  return {
    audit: new InMemoryAuditRepository(),
    tenants: new InMemoryTenantRepository(),
    workspaces: new InMemoryWorkspaceRepository(),
    codeRepositories: new InMemoryCodeRepositoryRepository(),
    policies: new InMemoryWorkspacePolicyRepository(),
    snapshots: new InMemorySnapshotRepository(),
    artifacts: new InMemoryKnowledgeArtifactRepository(),
    graph: new InMemoryGraphRepository(),
    jobs: new InMemoryIngestionJobRepository(),
    memories: new InMemoryMemoryRepository(),
    sessions: new InMemorySessionRepository(),
    objectStore: new InMemoryObjectStore(),
    integrations: new InMemoryIntegrationProfileRepository(),
  };
};

export const seedReferenceWorkspace = async (
  container: ApplicationContainer,
): Promise<{
  tenantId: string;
  workspaceId: string;
  repositoryId: string;
  snapshotId: string;
}> => {
  const existing = await container.services.read.getOverview();
  const existingWorkspace = existing.workspaces.find(
    (workspace) => workspace.name === "code-intelligence-platform",
  );
  const existingRepository = existing.repositories.find(
    (repository) =>
      repository.name === "platform-monorepo" &&
      repository.workspaceId === existingWorkspace?.id,
  );
  const existingSnapshot = existing.snapshots.find(
    (snapshot) => snapshot.repositoryId === existingRepository?.id,
  );

  if (existingWorkspace && existingRepository && existingSnapshot) {
    await hydrateReferenceWorkspace(container, {
      workspaceId: existingWorkspace.id,
      repositoryId: existingRepository.id,
      branch: existingSnapshot.branch,
      commitSha: existingSnapshot.commitSha,
    });
    return {
      tenantId: existingWorkspace.tenantId,
      workspaceId: existingWorkspace.id,
      repositoryId: existingRepository.id,
      snapshotId: existingSnapshot.id,
    };
  }

  const tenant = await container.services.controlPlane.createTenant({
    name: "Acme Engineering",
  });
  const { workspace } = await container.services.controlPlane.createWorkspace({
    tenantId: tenant.id,
    name: "code-intelligence-platform",
    persistenceMode: "workspace-persistent",
    storageMode: "managed",
  });
  await container.services.controlPlane.configurePolicy({
    workspaceId: workspace.id,
    allowOrgSharedMemory: true,
    requireApprovalForOrgSharedMemory: true,
    maxContextItems: 14,
  });
  const repository = await container.services.controlPlane.registerRepository({
    workspaceId: workspace.id,
    name: "platform-monorepo",
    defaultBranch: "main",
    sourceKind: "github-app",
    remoteUrl: "https://github.com/acme/platform-monorepo",
  });

  const ingestion = await container.services.ingestion.ingest({
    workspaceId: workspace.id,
    repositoryId: repository.id,
    branch: "main",
    commitSha: "abc123def456",
    sourceKind: "github-app",
    artifacts: [
      {
        path: "services/auth/service.ts",
        kind: "code",
        content:
          "export class AuthService { validateAudience() { return 'staging audience enforced'; } }",
        symbols: ["AuthService", "validateAudience"],
        summary: "Auth service enforces token audience validation for staging traffic.",
      },
      {
        path: "config/staging.env",
        kind: "runbook",
        content: "AUTH_VALIDATE_AUDIENCE=true\nAUTH_EXPECTED_AUDIENCE=platform-staging",
        symbols: ["AUTH_VALIDATE_AUDIENCE", "AUTH_EXPECTED_AUDIENCE"],
        summary: "Staging environment keeps audience validation enabled with an explicit expected audience.",
      },
      {
        path: "schemas/auth/openapi.json",
        kind: "schema",
        content:
          '{"openapi":"3.1.0","paths":{"/auth/validate":{"post":{"summary":"Validate auth token audience"}}}}',
        symbols: ["/auth/validate", "ValidateAuthTokenAudience"],
        summary: "Auth validation API contract documents the token audience enforcement flow.",
      },
      {
        path: "docs/architecture/memory.md",
        kind: "architecture",
        content:
          "Memory promotion requires evidence references, TTL, and workspace policy approval.",
        symbols: ["memory-promotion"],
        summary:
          "Architecture guidance for evidence-backed memory promotion, retention, and approval gates.",
      },
      {
        path: "runbooks/auth-incidents.md",
        kind: "doc",
        content:
          "When auth failures occur in staging, verify commit pinning, audience config, and the latest retrieval evidence package.",
        symbols: ["auth-incident", "commit-pinning"],
        summary:
          "Incident response notes for staging auth failures and commit-aware retrieval discipline.",
      },
    ],
    relationships: [
      {
        from: "services/auth/service.ts",
        to: "docs/architecture/memory.md",
        relation: "documents",
        confidence: "config_inferred",
        evidenceRefs: ["docs/architecture/memory.md"],
      },
      {
        from: "services/auth/service.ts",
        to: "config/staging.env",
        relation: "configured_by",
        confidence: "semantic_verified",
        evidenceRefs: ["config/staging.env"],
      },
      {
        from: "schemas/auth/openapi.json",
        to: "services/auth/service.ts",
        relation: "calls",
        confidence: "syntax_inferred",
        evidenceRefs: ["schemas/auth/openapi.json"],
      },
      {
        from: "runbooks/auth-incidents.md",
        to: "services/auth/service.ts",
        relation: "documents",
        confidence: "historical_correlation",
        evidenceRefs: ["runbooks/auth-incidents.md"],
      },
    ],
  });
  await hydrateReferenceWorkspace(container, {
    workspaceId: workspace.id,
    repositoryId: repository.id,
    branch: ingestion.snapshot.branch,
    commitSha: ingestion.snapshot.commitSha,
  });

  return {
    tenantId: tenant.id,
    workspaceId: workspace.id,
    repositoryId: repository.id,
    snapshotId: ingestion.snapshot.id,
  };
};

const hydrateReferenceWorkspace = async (
  container: ApplicationContainer,
  input: {
    workspaceId: string;
    repositoryId: string;
    branch: string;
    commitSha: string;
  },
): Promise<void> => {
  await container.services.controlPlane.configurePolicy({
    workspaceId: input.workspaceId,
    allowOrgSharedMemory: true,
    requireApprovalForOrgSharedMemory: true,
    maxContextItems: 14,
  });

  const workspace = await container.services.read.getWorkspace(input.workspaceId);

  let authRunSessionId = workspace.sessions[0]?.id;
  if (workspace.sessions.length === 0) {
    const authRun = await container.services.agent.respond({
      workspaceId: input.workspaceId,
      repositoryId: input.repositoryId,
      branch: input.branch,
      commitSha: input.commitSha,
      prompt: "Explain the staging auth audience validation path and identify the highest-signal evidence.",
    });
    authRunSessionId = authRun.sessionId;

    await container.services.sessions.appendNote(
      authRun.sessionId,
      "observation",
      "Staging audience enforcement is grounded in services/auth/service.ts and mirrored in the memory architecture guidance.",
    );

    await container.services.agent.respond({
      workspaceId: input.workspaceId,
      repositoryId: input.repositoryId,
      branch: input.branch,
      commitSha: input.commitSha,
      prompt: "Summarize the memory promotion policy and whether this result should become durable memory.",
    });
  }

  await container.services.memory.promote({
    workspaceId: input.workspaceId,
    repositoryId: input.repositoryId,
    branch: input.branch,
    commitSha: input.commitSha,
    scope: "workspace",
    type: "startup",
    title: "Always pin auth investigations to a snapshot",
    summary:
      "When debugging auth flows, keep retrieval pinned to the branch and commit so memory never outruns the grounded code snapshot.",
    evidenceRefs: ["services/auth/service.ts", "docs/architecture/memory.md"],
    confidence: 0.97,
  });

  await container.services.memory.promote({
    workspaceId: input.workspaceId,
    repositoryId: input.repositoryId,
    branch: input.branch,
    commitSha: input.commitSha,
    scope: "workspace",
    type: "failure_pattern",
    title: "Staging audience enforcement is easy to miss",
    summary:
      "The staging auth path fails closed when audience validation stays enabled and the expected audience is absent from the token flow.",
    evidenceRefs: ["services/auth/service.ts", "docs/architecture/memory.md"],
    confidence: 0.91,
    createdFromSession: authRunSessionId,
  });

  await container.services.memory.promote({
    workspaceId: input.workspaceId,
    repositoryId: input.repositoryId,
    branch: input.branch,
    scope: "org",
    type: "org-shared",
    title: "Org shared memories require approval before reuse",
    summary:
      "Shared platform patterns can cross repository boundaries, but they should remain approval-gated and revocable.",
    evidenceRefs: ["docs/architecture/memory.md"],
    confidence: 0.82,
  });

  const profiles = await container.services.integrations.listProfiles();
  if (!profiles.some((profile) => profile.name === "Local Claude Code")) {
    await container.services.integrations.saveProfile({
      name: "Local Claude Code",
      provider: "claude-code-local",
      transport: "cli",
      enabled: true,
      command: "claude",
      model: "claude-sonnet-4-5",
      notes:
        "Use local package mode for the cleanest developer loop. Keep Docker for the shared operator GUI and ingestion service.",
    });
  }
};
