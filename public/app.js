const state = {
  apiKey: localStorage.getItem("context-forge-api-key") || "",
  config: null,
  overview: null,
  claudeGuide: null,
  selectedView: localStorage.getItem("context-forge-view") || "overview",
  selectedWorkspaceId: null,
  selectedRepositoryId: null,
  selectedSnapshotId: null,
  selectedSessionId: null,
  workspaceDetail: null,
  repositoryDetail: null,
  snapshotDetail: null,
  sessionDetail: null,
  lastAgentResult: null,
  globalSearch: "",
  provisionTab: "workspace",
  agentTab: "prompt",
};

const ui = {
  apiKeyForm: document.querySelector("#apiKeyForm"),
  apiKeyInput: document.querySelector("#apiKeyInput"),
  saveApiKeyButton: document.querySelector("#saveApiKeyButton"),
  refreshButton: document.querySelector("#refreshButton"),
  seedButton: document.querySelector("#seedButton"),
  heroSeedButton: document.querySelector("#heroSeedButton"),
  heroGuideButton: document.querySelector("#heroGuideButton"),
  globalSearch: document.querySelector("#globalSearch"),
  statusLine: document.querySelector("#statusLine"),
  viewTitle: document.querySelector("#viewTitle"),
  viewSummary: document.querySelector("#viewSummary"),
  statsGrid: document.querySelector("#statsGrid"),
  postureGrid: document.querySelector("#postureGrid"),
  modeGrid: document.querySelector("#modeGrid"),
  workspacePortfolio: document.querySelector("#workspacePortfolio"),
  recentActivity: document.querySelector("#recentActivity"),
  selectionSummary: document.querySelector("#selectionSummary"),
  workspaceExplorer: document.querySelector("#workspaceExplorer"),
  workspaceInspector: document.querySelector("#workspaceInspector"),
  agentResult: document.querySelector("#agentResult"),
  evidenceInspector: document.querySelector("#evidenceInspector"),
  memoryList: document.querySelector("#memoryList"),
  integrationStrategy: document.querySelector("#integrationStrategy"),
  integrationProfiles: document.querySelector("#integrationProfiles"),
  claudeGuide: document.querySelector("#claudeGuide"),
  auditList: document.querySelector("#auditList"),
  sessionInspector: document.querySelector("#sessionInspector"),
  outputPane: document.querySelector("#outputPane"),
  views: [...document.querySelectorAll(".view")],
  navItems: [...document.querySelectorAll(".nav-item")],
  provisionTabs: [...document.querySelectorAll('[data-action="switch-provision-tab"]')],
  provisionPanels: [...document.querySelectorAll("[data-provision-panel]")],
  agentTabs: [...document.querySelectorAll('[data-action="switch-agent-tab"]')],
  agentPanels: [...document.querySelectorAll("[data-agent-panel]")],
};

const viewCopy = {
  overview: [
    "Overview",
    "Read the platform like an operator: posture, recent evidence, and where teams should work from.",
  ],
  workspaces: [
    "Workspace Studio",
    "Inspect repository state, policy posture, and snapshot grounding without digging through raw JSON.",
  ],
  agent: [
    "Agent Console",
    "Run a grounded prompt, inspect the evidence package, and decide whether the result deserves durable memory.",
  ],
  memory: [
    "Memory Center",
    "Keep durable memory lean, scoped, evidence-backed, and easy to audit.",
  ],
  integrations: [
    "Integrations",
    "Make the local Claude bridge obvious and configurable while keeping Docker as the team-facing service surface.",
  ],
  audit: [
    "Audit Trail",
    "Replay operator activity, session notes, and policy-relevant events from one timeline.",
  ],
};

ui.apiKeyInput.value = state.apiKey;
bind();
boot().catch(showError);

function bind() {
  ui.apiKeyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    state.apiKey = ui.apiKeyInput.value.trim();
    localStorage.setItem("context-forge-api-key", state.apiKey);
    await refresh();
  });

  ui.refreshButton.addEventListener("click", () => refresh().catch(showError));
  ui.seedButton.addEventListener("click", () => seedDemo().catch(showError));
  ui.heroSeedButton.addEventListener("click", () => seedDemo().catch(showError));
  ui.heroGuideButton.addEventListener("click", () => setView("integrations"));
  ui.globalSearch.addEventListener("input", () => {
    state.globalSearch = ui.globalSearch.value.trim().toLowerCase();
    renderAll();
  });

  for (const item of ui.navItems) {
    item.addEventListener("click", () => setView(item.dataset.view));
  }

  registerJsonForm("#tenantForm", "/api/control/tenants");
  registerJsonForm("#workspaceForm", "/api/control/workspaces");
  registerJsonForm("#repositoryForm", "/api/control/repositories");
  registerJsonForm("#memoryForm", "/api/data/memories", (payload) => ({
    ...payload,
    evidenceRefs: String(payload.evidenceRefs || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  }));
  registerJsonForm("#integrationForm", "/api/platform/integrations", (payload) => ({
    ...payload,
    enabled: payload.enabled === "on",
    args: payload.args,
  }));
  registerJsonForm("#agentForm", "/api/data/agents/respond", (payload) => payload, async (result) => {
    state.lastAgentResult = result;
    if (result.groundedAgainst?.snapshotId) {
      await selectSnapshot(result.groundedAgainst.snapshotId, false);
    }
    if (result.sessionId) {
      await selectSession(result.sessionId, false);
    }
    setView("agent");
  });

  document.querySelector("#archiveForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const response = await callForm("/api/data/uploads/archive", new FormData(event.currentTarget));
    log(response);
    if (response.snapshot?.repositoryId) {
      await selectRepository(response.snapshot.repositoryId, false);
    }
    if (response.snapshot?.id) {
      await selectSnapshot(response.snapshot.id, false);
    }
    event.currentTarget.reset();
    setView("agent");
    await refresh();
  });

  document.addEventListener("click", async (event) => {
    const node = event.target.closest("[data-action]");
    if (!node) return;

    try {
      if (node.dataset.action === "fill") {
        fill(node.dataset.field, node.dataset.value);
      }
      if (node.dataset.action === "switch-provision-tab") {
        state.provisionTab = node.dataset.tab;
        renderTabs();
      }
      if (node.dataset.action === "switch-agent-tab") {
        state.agentTab = node.dataset.tab;
        renderTabs();
      }
      if (node.dataset.action === "select-workspace") {
        await selectWorkspace(node.dataset.workspaceId);
        setView("workspaces");
      }
      if (node.dataset.action === "select-repository") {
        await selectRepository(node.dataset.repositoryId);
        setView(node.dataset.targetView || "workspaces");
      }
      if (node.dataset.action === "select-snapshot") {
        await selectSnapshot(node.dataset.snapshotId);
        setView(node.dataset.targetView || "agent");
      }
      if (node.dataset.action === "select-session") {
        await selectSession(node.dataset.sessionId);
        setView("audit");
      }
      if (node.dataset.action === "load-profile") {
        loadProfile(node.dataset.profileId);
        setView("integrations");
      }
      if (node.dataset.action === "copy-guide") {
        await navigator.clipboard.writeText(node.dataset.value || "");
        ui.statusLine.textContent = "Copied generated guide to clipboard.";
      }
    } catch (error) {
      showError(error);
    }
  });
}

async function boot() {
  state.config = await callJson("/api/config");
  await refresh();
  setView(state.selectedView);
}

async function refresh() {
  ui.statusLine.textContent = "Refreshing operational surface...";
  [state.overview, state.claudeGuide] = await Promise.all([
    callJson("/api/overview"),
    callJson("/api/platform/integrations/claude-guide"),
  ]);
  await syncDefaultSelection();
  renderAll();

  if (state.overview?.counts?.workspaces) {
    ui.statusLine.textContent = state.config?.authRequired
      ? "Authenticated dashboard ready."
      : "Dashboard ready.";
  } else {
    ui.statusLine.textContent = "Seed the example workspace or create your own.";
  }
}

async function syncDefaultSelection() {
  const workspaces = state.overview?.workspaces || [];
  const repositories = state.overview?.repositories || [];

  if (
    state.selectedRepositoryId &&
    !repositories.some((repository) => repository.id === state.selectedRepositoryId)
  ) {
    state.selectedRepositoryId = null;
    state.repositoryDetail = null;
    state.snapshotDetail = null;
    state.selectedSnapshotId = null;
  }

  if (
    state.selectedWorkspaceId &&
    !workspaces.some((workspace) => workspace.id === state.selectedWorkspaceId)
  ) {
    state.selectedWorkspaceId = null;
    state.workspaceDetail = null;
  }

  if (!state.selectedRepositoryId && repositories[0]) {
    await selectRepository(repositories[0].id, false);
  } else if (state.selectedRepositoryId && !state.repositoryDetail) {
    await selectRepository(state.selectedRepositoryId, false);
  } else if (!state.selectedWorkspaceId && workspaces[0]) {
    await selectWorkspace(workspaces[0].id, false);
  }

  const repositorySnapshots = state.repositoryDetail?.snapshots || [];
  if (
    repositorySnapshots.length > 0 &&
    (!state.selectedSnapshotId ||
      !repositorySnapshots.some((snapshot) => snapshot.id === state.selectedSnapshotId))
  ) {
    await selectSnapshot(repositorySnapshots[0].id, false);
  }

  if (
    state.selectedSessionId &&
    !(state.overview?.sessions || []).some((session) => session.id === state.selectedSessionId)
  ) {
    state.selectedSessionId = null;
    state.sessionDetail = null;
  }
}

function setView(name) {
  state.selectedView = name;
  localStorage.setItem("context-forge-view", name);
  const copy = viewCopy[name];

  ui.viewTitle.textContent = copy?.[0] || "Context Forge";
  ui.viewSummary.textContent = copy?.[1] || "";

  for (const item of ui.navItems) {
    item.classList.toggle("is-active", item.dataset.view === name);
  }
  for (const view of ui.views) {
    view.classList.toggle("is-active", view.dataset.viewPanel === name);
  }
}

function renderAll() {
  renderStats();
  renderSidebarSelection();
  renderTabs();
  renderOverview();
  renderWorkspaces();
  renderAgent();
  renderMemory();
  renderIntegrations();
  renderAudit();
}

function renderStats() {
  const counts = state.overview?.counts || {};
  const currentPolicy = state.overview?.policies?.[0];

  ui.statsGrid.innerHTML = [
    signal(
      "Repository Coverage",
      counts.repositories || 0,
      "repos tracked",
      "Workspaces, repositories, and snapshots tied to explicit grounding state.",
      [
        metric(counts.workspaces || 0, "workspaces"),
        metric(counts.snapshots || 0, "snapshots"),
        metric(counts.artifacts || 0, "artifacts"),
        metric(counts.graphEdges || 0, "graph edges"),
      ],
    ),
    signal(
      "Memory Posture",
      counts.memories || 0,
      "durable records",
      currentPolicy?.allowDurableMemory
        ? "Durable memory is enabled with policy controls and TTL."
        : "Durable memory is currently disabled for the active workspace policy.",
      [
        metric(counts.sessions || 0, "sessions"),
        metric(counts.integrationProfiles || 0, "profiles"),
        metric(currentPolicy?.defaultMemoryTtlDays || 0, "ttl days"),
        metric(currentPolicy?.maxContextItems || 0, "context cap"),
      ],
    ),
    signal(
      "Operational Throughput",
      counts.ingestionJobs || 0,
      "ingestion runs",
      "Ingestion, retrieval, and agent execution should all feel traceable from this one surface.",
      [
        metric(counts.auditEvents || 0, "audit events"),
        metric(counts.policies || 0, "policies"),
        metric(counts.tenants || 0, "tenants"),
        metric(counts.memories || 0, "memories"),
      ],
    ),
    signal(
      "Runtime Mode",
      state.claudeGuide?.recommendedMode === "local-package" ? "Local" : "Docker",
      "recommended edge",
      state.claudeGuide?.recommendedMode === "local-package"
        ? "Best for a single developer running Claude and Context Forge on the same machine."
        : "Best for a team-facing service while the developer bridge still stays local.",
      [
        metric(state.config?.authRequired ? "secured" : "open", "access mode"),
        metric(state.config?.version || "1.0.0", "version"),
        metric(state.claudeGuide?.launchCommand || "claude", "launch"),
        metric(state.overview?.repositories?.[0]?.defaultBranch || "main", "default branch"),
      ],
    ),
  ].join("");
}

function renderSidebarSelection() {
  const cards = [];
  if (state.selectedWorkspaceId && state.overview?.workspaces) {
    const workspace = state.overview.workspaces.find((item) => item.id === state.selectedWorkspaceId);
    if (workspace) {
      cards.push(
        card(
          workspace.name,
          `Workspace ${workspace.id}`,
          [
            pill("mode", workspace.persistenceMode, workspace.persistenceMode === "ephemeral" ? "warn" : "good"),
            pill("storage", workspace.storageMode, "signal"),
            fillPill("workspaceId", workspace.id),
          ],
          true,
        ),
      );
    }
  }

  if (state.selectedRepositoryId && state.overview?.repositories) {
    const repository = state.overview.repositories.find((item) => item.id === state.selectedRepositoryId);
    if (repository) {
      cards.push(
        card(
          repository.name,
          `Repository ${repository.id}`,
          [
            pill("branch", repository.defaultBranch, "signal"),
            pill("source", repository.sourceKind),
            fillPill("repositoryId", repository.id),
          ],
          true,
        ),
      );
    }
  }

  if (state.snapshotDetail?.snapshot) {
    cards.push(
      card(
        "Snapshot",
        `${state.snapshotDetail.snapshot.branch} @ ${state.snapshotDetail.snapshot.commitSha}`,
        [
          pill("artifacts", state.snapshotDetail.artifacts.length, "signal"),
          fillPill("commitSha", state.snapshotDetail.snapshot.commitSha),
          fillPill("branch", state.snapshotDetail.snapshot.branch),
        ],
      ),
    );
  }

  ui.selectionSummary.innerHTML =
    cards.join("") || card("Selection", "No active selection yet. Seed the demo or choose a workspace.");
}

function renderTabs() {
  for (const tab of ui.provisionTabs) {
    tab.classList.toggle("is-active", tab.dataset.tab === state.provisionTab);
  }
  for (const panel of ui.provisionPanels) {
    panel.classList.toggle("is-active", panel.dataset.provisionPanel === state.provisionTab);
  }
  for (const tab of ui.agentTabs) {
    tab.classList.toggle("is-active", tab.dataset.tab === state.agentTab);
  }
  for (const panel of ui.agentPanels) {
    panel.classList.toggle("is-active", panel.dataset.agentPanel === state.agentTab);
  }
}

function renderOverview() {
  const latestSnapshot = state.overview?.snapshots?.[0];
  const primaryPolicy = state.overview?.policies?.[0];

  ui.postureGrid.innerHTML = [
    posture(
      "Grounding Discipline",
      latestSnapshot
        ? `Latest snapshot is pinned to ${latestSnapshot.branch} at ${latestSnapshot.commitSha}. Answers can stay commit-aware instead of drifting across repo state.`
        : "No grounded snapshot exists yet. Use the ingest flow or seed the example workspace first.",
    ),
    posture(
      "Memory Governance",
      primaryPolicy?.allowDurableMemory
        ? `Durable memory is enabled${primaryPolicy.allowOrgSharedMemory ? " and org sharing is approval-gated" : ""}. Context cap is ${primaryPolicy.maxContextItems}.`
        : "This workspace is running without durable memory. Sessions remain isolated and non-durable.",
    ),
    posture(
      "Developer Workflow",
      state.claudeGuide?.recommendedMode === "local-package"
        ? "Local package mode is the primary developer workflow. The GUI and the local Claude edge should feel like one system."
        : "Docker is the shared operator surface, but the cleanest Claude execution edge still belongs on the developer machine.",
    ),
  ].join("");

  ui.modeGrid.innerHTML = [
    mode(
      "Local Package",
      "Best when one developer wants the GUI, API, and Claude bridge on the same machine with minimal friction.",
      [pill("best for", "daily build loop", "good"), pill("bridge", "Claude CLI", "signal")],
    ),
    mode(
      "Shared Service",
      "Best when a team wants one persistent memory surface and a common dashboard while keeping local agent execution flexible.",
      [pill("best for", "team workspace"), pill("surface", "GUI + API", "signal")],
    ),
    mode(
      "Grounded Loop",
      "Ingest, inspect, ask, validate, and only then promote durable memory with explicit evidence.",
      [pill("flow", "ingest"), pill("flow", "retrieve"), pill("flow", "promote", "warn")],
    ),
  ].join("");

  const workspaceRows = filter(state.overview?.workspaces || [], ["name", "id", "persistenceMode"]).map((workspace) => {
    const repoCount = (state.overview?.repositories || []).filter((repository) => repository.workspaceId === workspace.id).length;
    const memoryCount = (state.overview?.memories || []).filter((memory) => memory.workspaceId === workspace.id).length;
    const latestAudit = (state.overview?.recentAudit || []).find((event) => event.workspaceId === workspace.id);

    return row(
      workspace.name,
      `${repoCount} repo(s), ${memoryCount} durable memory item(s), ${workspace.storageMode} storage.`,
      [
        pill("mode", workspace.persistenceMode, workspace.persistenceMode === "ephemeral" ? "warn" : "good"),
        latestAudit ? pill("latest", latestAudit.action, "signal") : pill("latest", "no recent event"),
        act("Inspect", { "data-action": "select-workspace", "data-workspace-id": workspace.id }),
      ],
    );
  });

  const repositoryRows = filter(state.overview?.repositories || [], ["name", "id", "defaultBranch", "sourceKind"]).map((repository) => {
    const snapshot = (state.overview?.snapshots || []).find((candidate) => candidate.repositoryId === repository.id);
    return row(
      repository.name,
      snapshot
        ? `${repository.sourceKind} · ${snapshot.branch} @ ${snapshot.commitSha}`
        : `${repository.sourceKind} · no snapshot yet`,
      [
        pill("branch", repository.defaultBranch, "signal"),
        pill("source", repository.sourceKind),
        act("Open Repo", {
          "data-action": "select-repository",
          "data-repository-id": repository.id,
          "data-target-view": "workspaces",
        }),
      ],
    );
  });

  ui.workspacePortfolio.innerHTML =
    [...workspaceRows, ...repositoryRows].join("") ||
    row("Workspace portfolio", "No workspaces or repositories yet. Seed the demo or create a workspace.");

  const activity = [
    ...(state.overview?.sessions || []).slice(0, 4).map((session) =>
      trow(
        `Session ${session.id}`,
        `Repository ${session.repositoryId} on ${session.branch}${session.commitSha ? ` at ${session.commitSha}` : ""}.`,
        [
          pill("updated", fmt(session.updatedAt), "signal"),
          act("Inspect", { "data-action": "select-session", "data-session-id": session.id }),
        ],
      ),
    ),
    ...(state.overview?.memories || []).slice(0, 4).map((memory) =>
      trow(memory.title, memory.summary, [
        pill("scope", memory.scope, memory.scope === "org" ? "warn" : "good"),
        pill("approval", memory.approvalState, toneForApproval(memory.approvalState)),
      ]),
    ),
    ...(state.overview?.recentAudit || []).slice(0, 6).map((entry) =>
      trow(entry.action, describeAudit(entry), [
        pill("category", entry.category, entry.category === "data-plane" ? "signal" : "good"),
        pill("at", fmt(entry.createdAt)),
      ]),
    ),
  ];

  ui.recentActivity.innerHTML =
    activity.join("") ||
    trow("Activity", "No recent activity yet. The example workspace will populate the operational timeline.");
}

function renderWorkspaces() {
  const workspaces = filter(state.overview?.workspaces || [], ["name", "id", "tenantId"]);
  const repositories = filter(state.overview?.repositories || [], ["name", "id", "workspaceId"]);

  ui.workspaceExplorer.innerHTML = [
    ...workspaces.map((workspace) =>
      card(
        workspace.name,
        `Workspace ${workspace.id}`,
        [
          pill("mode", workspace.persistenceMode, workspace.persistenceMode === "ephemeral" ? "warn" : "good"),
          pill("storage", workspace.storageMode, "signal"),
          act("Inspect", { "data-action": "select-workspace", "data-workspace-id": workspace.id }),
        ],
        workspace.id === state.selectedWorkspaceId,
      ),
    ),
    ...repositories.map((repository) =>
      card(
        repository.name,
        `Repository ${repository.id}`,
        [
          pill("branch", repository.defaultBranch, "signal"),
          pill("source", repository.sourceKind),
          act("Inspect", { "data-action": "select-repository", "data-repository-id": repository.id }),
        ],
        repository.id === state.selectedRepositoryId,
      ),
    ),
  ].join("") || card("Workspace Explorer", "No entities yet. Create a tenant, workspace, or repository to begin.");

  if (state.repositoryDetail) {
    ui.workspaceInspector.innerHTML = renderRepoInspector();
    return;
  }
  if (state.workspaceDetail) {
    ui.workspaceInspector.innerHTML = renderWorkspaceInspector();
    return;
  }

  ui.workspaceInspector.innerHTML =
    '<div class="empty-state">Select a workspace or repository to inspect policy, snapshots, memory, and sessions.</div>';
}

function renderAgent() {
  if (!state.lastAgentResult) {
    ui.agentResult.innerHTML =
      '<div class="empty-state">Run a grounded prompt to inspect the answer, plan, and memory candidate output here.</div>';
    ui.evidenceInspector.innerHTML = state.snapshotDetail
      ? snapshotInspector(state.snapshotDetail)
      : card("Evidence Rail", "Choose a repository or snapshot to inspect the grounded evidence surface.");
    return;
  }

  const result = state.lastAgentResult;
  const pack = result.contextPackage;

  ui.agentResult.innerHTML = [
    card(
      "Grounded Answer",
      result.answer,
      [
        pill("branch", result.groundedAgainst.branch, "signal"),
        pill("commit", result.groundedAgainst.commitSha),
        pill("session", result.sessionId, "good"),
      ],
    ),
    detailBlock("Execution Plan", orderedList(result.plan)),
    detailBlock(
      "Candidate Durable Memory",
      result.memoryCandidates.length
        ? detailList(
            result.memoryCandidates.map((candidate) =>
              detailItem(
                candidate.title,
                `${candidate.summary}\nEvidence: ${candidate.evidenceRefs.join(", ")}`,
              ),
            ),
          )
        : '<p class="caption">No durable memory candidate proposed for this run.</p>',
    ),
  ].join("");

  ui.evidenceInspector.innerHTML = [
    info("Grounding Snapshot", [
      ["Snapshot", pack.snapshot.id],
      ["Branch", pack.snapshot.branch],
      ["Commit", pack.snapshot.commitSha],
      ["Source", pack.snapshot.sourceKind],
    ]),
    detailBlock("Must-Have Context", contextList(pack.mustHave)),
    detailBlock("Supporting Context", contextList(pack.supporting)),
    detailBlock("Optional Background", contextList(pack.optional)),
    detailBlock(
      "Uncertainty Notes",
      pack.uncertainties.length
        ? detailList(pack.uncertainties.map((item) => detailItem("Signal", item)))
        : '<p class="caption">No explicit uncertainty annotations were generated.</p>',
    ),
    state.snapshotDetail ? snapshotInspector(state.snapshotDetail, true) : "",
  ].join("");
}

function renderMemory() {
  const memories = filter(state.overview?.memories || [], ["title", "summary", "scope", "type", "approvalState"]);
  ui.memoryList.innerHTML = memories.length
    ? memories
        .map((memory) =>
          row(
            memory.title,
            `${memory.summary}\nEvidence refs: ${memory.evidenceRefs.join(", ")}`,
            [
              pill("scope", memory.scope, memory.scope === "org" ? "warn" : "good"),
              pill("type", memory.type),
              pill("approval", memory.approvalState, toneForApproval(memory.approvalState)),
              pill("confidence", memory.confidence, "signal"),
              pill("expires", fmt(memory.expiresAt)),
            ],
          ),
        )
        .join("")
    : row("Memory inventory", "No durable memories yet. Promote one from an evidence-backed outcome.");
}

function renderIntegrations() {
  const guide = state.claudeGuide;
  const profiles = filter(state.overview?.integrationProfiles || [], ["name", "provider", "transport", "command", "model", "notes"]);

  ui.integrationStrategy.innerHTML = [
    mode(
      "Developer Default",
      "Run Context Forge locally when Claude Code lives on the same machine. That should be the lowest-friction path.",
      [pill("recommended", "local package", "good"), pill("bridge", "CLI", "signal")],
    ),
    mode(
      "Team Default",
      "Keep Docker for the shared operator surface, archive ingestion, and a common API while local agent execution stays flexible.",
      [pill("recommended", "shared GUI"), pill("surface", "Docker service", "signal")],
    ),
    mode(
      "Bridge Rule",
      "The UI should explain the local edge clearly so teams understand how the package, GUI, and model runtime relate.",
      [pill("goal", "clarity"), pill("surface", "operator guide")],
    ),
  ].join("");

  ui.integrationProfiles.innerHTML = profiles.length
    ? profiles
        .map((profile) =>
          card(
            profile.name,
            `${profile.provider} via ${profile.transport}${profile.notes ? `. ${profile.notes}` : "."}`,
            [
              pill(profile.enabled ? "enabled" : "disabled", profile.model || "default", profile.enabled ? "good" : "warn"),
              pill("command", profile.command || "n/a"),
              act("Load Profile", { "data-action": "load-profile", "data-profile-id": profile.id }),
            ],
          ),
        )
        .join("")
    : card("Profiles", "No profiles saved yet. The generated guide still shows the recommended bridge.");

  ui.claudeGuide.innerHTML = guide
    ? [
        card(
          guide.recommendedMode === "local-package"
            ? "Recommended: Local Package Mode"
            : "Recommended: Docker Service Mode",
          guide.recommendedMode === "local-package"
            ? "Use one machine for the GUI, storage, and Claude edge when you want the cleanest operator experience."
            : "Keep Docker for the shared service, but still treat the developer machine as the natural Claude execution edge.",
          [
            pill("launch", guide.launchCommand, "signal"),
            act("Copy Env Block", { "data-action": "copy-guide", "data-value": guide.envBlock }),
          ],
        ),
        '<div class="code-block">' + esc(guide.envBlock) + "</div>",
        detailBlock(
          "Operational Notes",
          detailList(guide.notes.map((note) => detailItem("Guidance", note))),
        ),
      ].join("")
    : '<div class="empty-state">Connector guidance unavailable.</div>';
}

function renderAudit() {
  const sessions = filter(state.overview?.sessions || [], ["id", "repositoryId", "branch"]);
  const events = filter(state.overview?.recentAudit || [], ["action", "category"]);

  ui.auditList.innerHTML = [
    ...sessions.slice(0, 8).map((session) =>
      trow(
        `Session ${session.id}`,
        `Repository ${session.repositoryId} on ${session.branch}${session.commitSha ? ` at ${session.commitSha}` : ""}.`,
        [
          pill("updated", fmt(session.updatedAt), "signal"),
          act("Inspect", { "data-action": "select-session", "data-session-id": session.id }),
        ],
      ),
    ),
    ...events.slice(0, 12).map((entry) =>
      trow(entry.action, describeAudit(entry), [
        pill("category", entry.category, entry.category === "data-plane" ? "signal" : "good"),
        pill("at", fmt(entry.createdAt)),
      ]),
    ),
  ].join("") || trow("Activity", "No activity yet.");

  ui.sessionInspector.innerHTML = state.sessionDetail
    ? [
        info("Session", [
          ["ID", state.sessionDetail.session.id],
          ["Repository", state.sessionDetail.session.repositoryId],
          ["Branch", state.sessionDetail.session.branch],
          ["Updated", fmt(state.sessionDetail.session.updatedAt)],
        ]),
        detailBlock(
          "Notes",
          state.sessionDetail.notes.length
            ? detailList(
                state.sessionDetail.notes.map((note) =>
                  detailItem(note.kind, `${note.content}\nRecorded ${fmt(note.createdAt)}`),
                ),
              )
            : '<p class="caption">No notes recorded for this session.</p>',
        ),
      ].join("")
    : '<div class="empty-state">Select a session from the timeline to inspect its notes.</div>';
}

async function seedDemo() {
  const response = await callJson("/api/demo/seed", { method: "POST" });
  log(response);
  await refresh();
}

async function selectWorkspace(id, rerender = true) {
  if (!id) return;
  state.selectedWorkspaceId = id;
  state.selectedRepositoryId = null;
  state.selectedSnapshotId = null;
  state.workspaceDetail = await callJson(`/api/control/workspaces/${id}`);
  state.repositoryDetail = null;
  state.snapshotDetail = null;
  fill("workspaceId", id);
  if (rerender) renderAll();
}

async function selectRepository(id, rerender = true) {
  if (!id) return;
  state.selectedRepositoryId = id;
  state.repositoryDetail = await callJson(`/api/control/repositories/${id}`);
  state.workspaceDetail = null;
  const repository = state.repositoryDetail.repository;
  state.selectedWorkspaceId = repository.workspaceId;
  fill("repositoryId", repository.id);
  fill("workspaceId", repository.workspaceId);
  fill("branch", repository.defaultBranch);
  if (rerender) renderAll();
}

async function selectSnapshot(id, rerender = true) {
  if (!id) return;
  state.selectedSnapshotId = id;
  state.snapshotDetail = await callJson(`/api/data/snapshots/${id}`);
  fill("commitSha", state.snapshotDetail.snapshot.commitSha);
  fill("branch", state.snapshotDetail.snapshot.branch);
  if (rerender) renderAll();
}

async function selectSession(id, rerender = true) {
  if (!id) return;
  state.selectedSessionId = id;
  state.sessionDetail = await callJson(`/api/data/sessions/${id}`);
  if (rerender) renderAll();
}

function loadProfile(id) {
  const profile = (state.overview?.integrationProfiles || []).find((item) => item.id === id);
  if (!profile) return;

  const form = document.querySelector("#integrationForm");
  form.elements.name.value = profile.name;
  form.elements.provider.value = profile.provider;
  form.elements.transport.value = profile.transport;
  form.elements.command.value = profile.command || "";
  form.elements.args.value = profile.args.join(" ");
  form.elements.model.value = profile.model || "";
  form.elements.baseUrl.value = profile.baseUrl || "";
  form.elements.apiKeyEnvVar.value = profile.apiKeyEnvVar || "";
  form.elements.notes.value = profile.notes || "";
  form.elements.enabled.checked = profile.enabled;
}

function fill(field, value) {
  if (!field || !value) return;
  document.querySelectorAll(`[name="${field}"]`).forEach((node) => {
    node.value = value;
  });
}

function registerJsonForm(selector, endpoint, map = (payload) => payload, after) {
  document.querySelector(selector).addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = map(Object.fromEntries(new FormData(form).entries()));
    const response = await callJson(endpoint, { method: "POST", body: JSON.stringify(payload) });
    log(response);
    if (after) {
      await after(response);
    }
    if (selector !== "#integrationForm" && selector !== "#agentForm") {
      form.reset();
    }
    await refresh();
  });
}

async function callJson(url, options = {}) {
  const headers = { ...auth(), ...(options.headers || {}) };
  if (options.body) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(url, { ...options, headers });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || "Request failed");
  }
  return payload;
}

async function callForm(url, body) {
  const response = await fetch(url, { method: "POST", body, headers: auth() });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || "Upload failed");
  }
  return payload;
}

function auth() {
  return state.apiKey ? { "x-api-key": state.apiKey } : {};
}

function log(payload) {
  ui.outputPane.textContent = JSON.stringify(payload, null, 2);
}

function showError(error) {
  ui.outputPane.textContent = error instanceof Error ? error.stack || error.message : String(error);
  ui.statusLine.textContent = error instanceof Error ? error.message : String(error);
}

function filter(items, keys) {
  if (!state.globalSearch) return items;
  return items.filter((item) =>
    keys.some((key) => String(item[key] || "").toLowerCase().includes(state.globalSearch)),
  );
}

function renderWorkspaceInspector() {
  const detail = state.workspaceDetail;
  return [
    info("Workspace", [
      ["Name", detail.workspace.name],
      ["ID", detail.workspace.id],
      ["Mode", detail.workspace.persistenceMode],
      ["Storage", detail.workspace.storageMode],
    ]),
    detail.policy
      ? detailBlock(
          "Policy Posture",
          detailList([
            detailItem(
              "Durable Memory",
              `${detail.policy.allowDurableMemory ? "Enabled" : "Disabled"} with ${detail.policy.defaultMemoryTtlDays} day default TTL.`,
            ),
            detailItem(
              "Org Sharing",
              `${detail.policy.allowOrgSharedMemory ? "Enabled" : "Disabled"}${detail.policy.requireApprovalForOrgSharedMemory ? " with approval gate." : "."}`,
            ),
            detailItem(
              "Context Budget",
              `${detail.policy.maxContextItems} max context items are allowed per retrieval package.`,
            ),
          ]),
        )
      : card("Policy", "No workspace policy configured."),
    detailBlock(
      "Repositories",
      detail.repositories.length
        ? detailList(
            detail.repositories.map((repository) =>
              detailItem(
                repository.name,
                `${repository.sourceKind} on ${repository.defaultBranch}`,
                [
                  act("Inspect", {
                    "data-action": "select-repository",
                    "data-repository-id": repository.id,
                  }),
                ],
              ),
            ),
          )
        : '<p class="caption">No repositories registered yet.</p>',
    ),
    detailBlock(
      "Durable Memory",
      detail.memories.length
        ? detailList(
            detail.memories.slice(0, 6).map((memory) =>
              detailItem(
                memory.title,
                `${memory.type} · ${memory.approvalState} · ${memory.summary}`,
              ),
            ),
          )
        : '<p class="caption">No durable memory promoted yet for this workspace.</p>',
    ),
    detailBlock(
      "Recent Sessions",
      detail.sessions.length
        ? detailList(
            detail.sessions.slice(0, 6).map((session) =>
              detailItem(
                session.id,
                `${session.branch}${session.commitSha ? ` @ ${session.commitSha}` : ""}`,
                [
                  act("Open", {
                    "data-action": "select-session",
                    "data-session-id": session.id,
                  }),
                ],
              ),
            ),
          )
        : '<p class="caption">No sessions recorded yet.</p>',
    ),
    detailBlock(
      "Recent Audit",
      detail.audit.length
        ? detailList(
            detail.audit.slice(0, 6).map((entry) =>
              detailItem(entry.action, `${entry.category} · ${fmt(entry.createdAt)}`),
            ),
          )
        : '<p class="caption">No audit events recorded yet.</p>',
    ),
  ].join("");
}

function renderRepoInspector() {
  const detail = state.repositoryDetail;
  const latestSnapshot = detail.snapshots[0];
  const matchingSnapshot =
    state.snapshotDetail?.snapshot?.repositoryId === detail.repository.id ? state.snapshotDetail : null;

  return [
    info("Repository", [
      ["Name", detail.repository.name],
      ["ID", detail.repository.id],
      ["Branch", detail.repository.defaultBranch],
      ["Source", detail.repository.sourceKind],
    ]),
    latestSnapshot
      ? detailBlock(
          "Latest Grounding Snapshot",
          detailList([
            detailItem(
              `${latestSnapshot.branch} @ ${latestSnapshot.commitSha}`,
              `Created ${fmt(latestSnapshot.createdAt)} from ${latestSnapshot.sourceKind}.`,
              [
                act("Inspect Snapshot", {
                  "data-action": "select-snapshot",
                  "data-snapshot-id": latestSnapshot.id,
                }),
              ],
            ),
          ]),
        )
      : card("Latest Grounding Snapshot", "No snapshots yet."),
    detailBlock(
      "Snapshot History",
      detail.snapshots.length
        ? detailList(
            detail.snapshots.map((snapshot) =>
              detailItem(
                `${snapshot.branch} @ ${snapshot.commitSha}`,
                `Ingestion v${snapshot.ingestionVersion} via ${snapshot.sourceKind}`,
                [
                  act("Inspect", {
                    "data-action": "select-snapshot",
                    "data-snapshot-id": snapshot.id,
                  }),
                ],
              ),
            ),
          )
        : '<p class="caption">No snapshots recorded yet.</p>',
    ),
    detailBlock(
      "Ingestion Jobs",
      detail.ingestionJobs.length
        ? detailList(
            detail.ingestionJobs.map((job) =>
              detailItem(
                job.id,
                `${job.status} · ${job.artifactCount} artifacts · ${job.edgeCount} edges`,
              ),
            ),
          )
        : '<p class="caption">No ingestion jobs recorded yet.</p>',
    ),
    matchingSnapshot ? snapshotInspector(matchingSnapshot, true) : "",
  ].join("");
}

function snapshotInspector(detail, compact = false) {
  return detailBlock(
    compact ? "Snapshot Contents" : "Evidence Rail",
    detailList([
      detailItem(
        "Artifacts",
        detail.artifacts.length
          ? detail.artifacts
              .slice(0, 6)
              .map((artifact) => `${artifact.path} · ${artifact.kind}`)
              .join("\n")
          : "No artifacts captured for this snapshot.",
      ),
      detailItem(
        "Graph",
        detail.graph.length
          ? detail.graph
              .slice(0, 6)
              .map((edge) => `${edge.from} ${edge.relation} ${edge.to}`)
              .join("\n")
          : "No graph edges captured for this snapshot.",
      ),
    ]),
  );
}

function contextList(items) {
  if (!items.length) {
    return '<p class="caption">No context items in this bucket.</p>';
  }

  return detailList(
    items.map((item) =>
      detailItem(
        item.label,
        `${item.excerpt}\nScore ${item.score} · confidence ${item.confidence}`,
        item.refs.length ? [pill("refs", item.refs.join(", "), "signal")] : [],
      ),
    ),
  );
}

function describeAudit(entry) {
  const details = Object.entries(entry.details || {})
    .slice(0, 4)
    .map(([key, value]) => `${title(key)} ${value}`)
    .join(" · ");
  return details || "No extra details.";
}

function signal(titleText, value, unit, copy, metrics) {
  return `<article class="signal-card"><div class="signal-head"><div><div class="signal-label">${esc(titleText)}</div><h3 class="signal-title">${esc(titleText)}</h3></div>${pill("live", "yes", "good")}</div><div class="signal-value"><strong>${esc(value)}</strong><span>${esc(unit)}</span></div><p class="signal-copy">${esc(copy)}</p><div class="metric-grid">${metrics.join("")}</div></article>`;
}

function metric(value, label) {
  return `<div class="metric-chip"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;
}

function info(titleText, rows) {
  return `<article class="stack-card"><h4>${esc(titleText)}</h4><dl class="info-list">${rows
    .map(([key, value]) => `<dt>${esc(key)}</dt><dd>${esc(value)}</dd>`)
    .join("")}</dl></article>`;
}

function mode(titleText, body, meta = []) {
  return `<article class="mode-card"><h4>${esc(titleText)}</h4><p>${esc(body)}</p><div class="meta-row">${meta.join("")}</div></article>`;
}

function posture(titleText, body) {
  return `<article class="posture-card"><h4>${esc(titleText)}</h4><p>${esc(body)}</p></article>`;
}

function row(titleText, body, meta = []) {
  return `<article class="table-row"><strong>${esc(titleText)}</strong><p>${esc(body)}</p><div class="meta-row">${meta.join("")}</div></article>`;
}

function trow(titleText, body, meta = []) {
  return `<article class="timeline-row"><strong>${esc(titleText)}</strong><p>${esc(body)}</p><div class="meta-row">${meta.join("")}</div></article>`;
}

function card(titleText, body, meta = [], selected = false) {
  return `<article class="stack-card ${selected ? "is-selected" : ""}"><h4>${esc(titleText)}</h4><p>${esc(body)}</p>${meta.length ? `<div class="meta-row">${meta.join("")}</div>` : ""}</article>`;
}

function detailBlock(titleText, body) {
  return `<section class="detail-block"><h4>${esc(titleText)}</h4>${body}</section>`;
}

function detailList(items) {
  return `<div class="detail-list">${items.join("")}</div>`;
}

function detailItem(titleText, body, meta = []) {
  return `<article class="detail-item"><strong>${esc(titleText)}</strong><span>${esc(body)}</span>${meta.length ? `<div class="meta-row">${meta.join("")}</div>` : ""}</article>`;
}

function orderedList(items) {
  return `<ol class="ordered-list">${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ol>`;
}

function pill(label, value, tone) {
  return `<span class="pill"${tone ? ` data-tone="${escAttr(tone)}"` : ""}>${esc(label)}: ${esc(value)}</span>`;
}

function fillPill(field, value) {
  return `<button class="pill-button" type="button" data-action="fill" data-field="${escAttr(field)}" data-value="${escAttr(value)}">${esc(field)}: ${esc(value)}</button>`;
}

function act(label, attrsMap) {
  return `<button class="pill-button" type="button" ${attrs(attrsMap)}>${esc(label)}</button>`;
}

function attrs(map) {
  return Object.entries(map)
    .map(([key, value]) => `${key}="${escAttr(value)}"`)
    .join(" ");
}

function toneForApproval(value) {
  if (value === "approved") return "good";
  if (value === "pending") return "warn";
  if (value === "rejected") return "danger";
  return undefined;
}

function fmt(value) {
  return new Date(value).toLocaleString();
}

function title(value) {
  return String(value)
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (character) => character.toUpperCase());
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escAttr(value) {
  return esc(value).replaceAll("'", "&#39;");
}
