import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createApplication, seedReferenceWorkspace } from "../src/composition/bootstrap.ts";
import { buildHttpServer } from "../src/infrastructure/http/server.ts";

test("memory promotion requires evidence refs", async () => {
  const container = createApplication();
  const seeded = await seedReferenceWorkspace(container);

  await assert.rejects(
    () =>
      container.services.memory.promote({
        workspaceId: seeded.workspaceId,
        repositoryId: seeded.repositoryId,
        scope: "workspace",
        type: "semantic",
        title: "Audience mismatch fix",
        summary: "Staging requires token audience validation.",
        evidenceRefs: [],
      }),
    (error: any) => error.code === "invalid_request",
  );
});

test("ephemeral workspaces reject durable memory", async () => {
  const container = createApplication();
  const tenant = await container.services.controlPlane.createTenant({
    name: "Regulated Corp",
  });
  const { workspace } = await container.services.controlPlane.createWorkspace({
    tenantId: tenant.id,
    name: "sensitive-repo",
    persistenceMode: "ephemeral",
    storageMode: "managed",
  });
  const repository = await container.services.controlPlane.registerRepository({
    workspaceId: workspace.id,
    name: "sensitive-repo",
    defaultBranch: "main",
    sourceKind: "archive-upload",
  });

  await assert.rejects(
    () =>
      container.services.memory.promote({
        workspaceId: workspace.id,
        repositoryId: repository.id,
        scope: "workspace",
        type: "episodic",
        title: "Should not persist",
        summary: "This must remain session-local.",
        evidenceRefs: ["notes.txt"],
      }),
    (error: any) => error.code === "policy_violation",
  );
});

test("retrieval is branch and commit aware", async () => {
  const container = createApplication();
  const seeded = await seedReferenceWorkspace(container);

  await container.services.memory.promote({
    workspaceId: seeded.workspaceId,
    repositoryId: seeded.repositoryId,
    branch: "main",
    commitSha: "abc123def456",
    scope: "workspace",
    type: "failure_pattern",
    title: "JWT audience mismatch in staging",
    summary: "401s occur when the staging audience is omitted.",
    evidenceRefs: ["services/auth/service.ts"],
  });

  const sameCommit = await container.services.retrieval.buildContext({
    workspaceId: seeded.workspaceId,
    repositoryId: seeded.repositoryId,
    branch: "main",
    commitSha: "abc123def456",
    query: "staging audience validation 401",
  });

  assert.equal(sameCommit.snapshot.commitSha, "abc123def456");
  assert.ok(
    sameCommit.mustHave.concat(sameCommit.supporting).some(
      (item) => item.label === "JWT audience mismatch in staging",
    ),
  );

  const otherBranch = await container.services.ingestion.ingest({
    workspaceId: seeded.workspaceId,
    repositoryId: seeded.repositoryId,
    branch: "feature/memory-refresh",
    commitSha: "fff999eee111",
    sourceKind: "github-app",
    artifacts: [
      {
        path: "services/auth/service.ts",
        kind: "code",
        content:
          "export class AuthService { validateAudience() { return 'feature branch'; } }",
        symbols: ["AuthService", "validateAudience"],
      },
    ],
  });

  const featureBranch = await container.services.retrieval.buildContext({
    workspaceId: seeded.workspaceId,
    repositoryId: seeded.repositoryId,
    branch: "feature/memory-refresh",
    commitSha: otherBranch.snapshot.commitSha,
    query: "staging audience validation 401",
  });

  assert.equal(featureBranch.snapshot.commitSha, "fff999eee111");
  assert.ok(
    !featureBranch.mustHave.concat(featureBranch.supporting).some(
      (item) => item.label === "JWT audience mismatch in staging",
    ),
  );
});

test("sessions remain isolated across agent runs", async () => {
  const container = createApplication();
  const seeded = await seedReferenceWorkspace(container);

  const firstReply = await container.services.agent.respond({
    workspaceId: seeded.workspaceId,
    repositoryId: seeded.repositoryId,
    branch: "main",
    commitSha: "abc123def456",
    prompt: "Explain the auth audience validation flow",
  });

  const secondReply = await container.services.agent.respond({
    workspaceId: seeded.workspaceId,
    repositoryId: seeded.repositoryId,
    branch: "main",
    commitSha: "abc123def456",
    prompt: "Summarize memory promotion controls",
  });

  assert.notEqual(firstReply.sessionId, secondReply.sessionId);

  const firstNotes = await container.repositories.sessions.listNotes(firstReply.sessionId);
  const secondNotes = await container.repositories.sessions.listNotes(secondReply.sessionId);

  assert.equal(firstNotes.length, 2);
  assert.equal(secondNotes.length, 2);
  assert.ok(firstNotes.every((note) => note.sessionId === firstReply.sessionId));
  assert.ok(secondNotes.every((note) => note.sessionId === secondReply.sessionId));
});

test("file runtime persists state across application restarts", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-forge-"));
  const config = {
    host: "127.0.0.1",
    port: 0,
    dataDir,
    publicDir: path.resolve(process.cwd(), "public"),
    autoSeedDemo: false,
    maxUploadBytes: 5_000_000,
  };

  try {
    const first = createApplication({ runtime: "file", config });
    const seeded = await seedReferenceWorkspace(first);

    const second = createApplication({ runtime: "file", config });
    const overview = await second.services.read.getOverview();

    assert.equal(overview.counts.tenants, 1);
    assert.equal(overview.counts.workspaces, 1);
    assert.equal(overview.counts.repositories, 1);
    assert.equal(overview.counts.snapshots, 1);
    assert.equal(overview.repositories[0]?.id, seeded.repositoryId);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("archive upload endpoint ingests manifest files over HTTP", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-forge-http-"));
  const config = {
    host: "127.0.0.1",
    port: 0,
    dataDir,
    publicDir: path.resolve(process.cwd(), "public"),
    autoSeedDemo: false,
    maxUploadBytes: 5_000_000,
  };

  const container = createApplication({ runtime: "file", config });
  const tenant = await container.services.controlPlane.createTenant({ name: "Upload Corp" });
  const { workspace } = await container.services.controlPlane.createWorkspace({
    tenantId: tenant.id,
    name: "upload-ws",
    persistenceMode: "workspace-persistent",
    storageMode: "managed",
  });
  const repository = await container.services.controlPlane.registerRepository({
    workspaceId: workspace.id,
    name: "upload-repo",
    defaultBranch: "main",
    sourceKind: "archive-upload",
  });

  const server = buildHttpServer(container, config);
  await new Promise<void>((resolve) => server.listen(0, config.host, resolve));
  const address = server.address();
  const port =
    typeof address === "object" && address && "port" in address ? address.port : 0;

  try {
    const form = new FormData();
    form.set("workspaceId", workspace.id);
    form.set("repositoryId", repository.id);
    form.set("branch", "main");
    form.set(
      "archive",
      new Blob(
        [
          JSON.stringify({
            files: [
              {
                path: "src/auth.py",
                content: "def validate_token():\n    return True\n",
              },
            ],
          }),
        ],
        { type: "application/json" },
      ),
      "snapshot.json",
    );

    const response = await fetch(`http://${config.host}:${port}/api/data/uploads/archive`, {
      method: "POST",
      body: form,
    });
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.equal(payload.artifactCount, 1);
    assert.equal(payload.relationshipCount, 0);

    const snapshot = await container.services.read.getSnapshot(payload.snapshot.id);
    assert.equal(snapshot.artifacts[0]?.path, "src/auth.py");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("integration profiles persist and generate claude guidance", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-forge-int-"));
  const config = {
    host: "127.0.0.1",
    port: 4110,
    dataDir,
    publicDir: path.resolve(process.cwd(), "public"),
    autoSeedDemo: false,
    maxUploadBytes: 5_000_000,
  };

  try {
    const first = createApplication({ runtime: "file", config });
    const profile = await first.services.integrations.saveProfile({
      name: "Local Claude Code",
      provider: "claude-code-local",
      transport: "cli",
      command: "claude",
      model: "claude-sonnet-4-5",
      notes: "Prefer local package mode.",
      enabled: true,
    });

    assert.equal(profile.provider, "claude-code-local");

    const second = createApplication({ runtime: "file", config });
    const profiles = await second.services.integrations.listProfiles();
    const guide = await second.services.integrations.getClaudeConnectorGuide(config);

    assert.equal(profiles.length, 1);
    assert.equal(profiles[0]?.name, "Local Claude Code");
    assert.match(guide.launchCommand, /claude/);
    assert.match(guide.envBlock, /CONTEXT_FORGE_URL=http:\/\/127\.0\.0\.1:4110/);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
