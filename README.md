# Context Forge

`context-forge` is a deployable code-intelligence and governed-memory product slice built from the architecture spec in this repo. It ships as a Node/TypeScript modular monolith with:

- a distinct control plane and data plane
- durable file-backed storage
- snapshot-grounded ingestion and retrieval
- policy-aware persistent memory
- a browser dashboard
- archive upload ingestion for `.zip`, `.tar`, `.tgz`, `.tar.gz`, and JSON manifests
- Docker packaging for local or server deployment

## What is live

### Control plane
- Tenants
- Workspaces
- Repository registration
- Workspace policy configuration
- Audit event collection

### Data plane
- Snapshot ingestion from API payloads
- Archive upload ingestion with heuristic code/doc extraction
- Canonical knowledge artifacts
- Graph edge extraction from import-style relationships
- Workspace and org-scoped durable memory
- Commit-aware retrieval and context composition
- Session-isolated agent runs

### Product surface
- Express API
- Static operator dashboard at `/app`
- Overview and metrics endpoints
- File-backed state persisted under `DATA_DIR`

## Tech choices

- Runtime: Node 24
- Server: Express 5
- Upload handling: Multer
- Archive parsing: `adm-zip` and `tar-stream`
- Persistence: local JSON state store plus object blobs on disk
- Build: TypeScript compiler to `dist/`

This keeps the code deployable today while still leaving clean ports for Postgres, object storage, graph databases, vector indexes, GitHub App sync, and real LLM gateways.

## Local run

### 1. Install
```bash
cmd /c npm install
```

### 2. Optional env
Copy `.env.example` into your environment or set variables directly.

Important variables:
- `PORT`
- `HOST`
- `DATA_DIR`
- `PUBLIC_DIR`
- `MAX_UPLOAD_BYTES`
- `AUTO_SEED_DEMO`
- `API_KEY`

### 3. Run in dev mode
```bash
cmd /c npm run dev
```

Open `http://localhost:4000/app`.

### 4. Build for production
```bash
cmd /c npm run build
node dist/src/main.js
```

## Docker run

### Build and start
```bash
docker compose up --build
```

The app is exposed on `http://localhost:4000/app` and persists state to `./data`.

## Main routes

### Platform
- `GET /api`
- `GET /api/health`
- `GET /api/config`
- `GET /api/overview`
- `GET /api/metrics`
- `POST /api/demo/seed`
- `GET /api/audit/events`

### Control plane
- `GET /api/control/tenants`
- `POST /api/control/tenants`
- `GET /api/control/workspaces`
- `GET /api/control/workspaces/:workspaceId`
- `POST /api/control/workspaces`
- `GET /api/control/workspaces/:workspaceId/repositories`
- `POST /api/control/repositories`
- `GET /api/control/repositories/:repositoryId`
- `POST /api/control/policies`

### Data plane
- `POST /api/data/ingestions`
- `POST /api/data/uploads/archive`
- `GET /api/data/repositories/:repositoryId/snapshots`
- `GET /api/data/snapshots/:snapshotId`
- `POST /api/data/memories`
- `GET /api/data/workspaces/:workspaceId/memories`
- `POST /api/data/retrievals`
- `POST /api/data/agents/respond`
- `GET /api/data/sessions/:sessionId`

## Dashboard workflow

1. Open `/app`
2. Seed the demo or create your own tenant, workspace, and repository
3. Upload an archive or JSON manifest to create a snapshot
4. Run the agent against a branch and commit
5. Promote validated findings into durable memory
6. Inspect snapshots, sessions, memories, and audit history in the overview

## Tests

```bash
cmd /c npm test
```

Current tests cover:
- evidence-required memory promotion
- ephemeral-mode memory blocking
- branch and commit-aware retrieval
- session isolation
- file-backed persistence across restarts
- live HTTP archive upload ingestion

## Deliberate limits

This is now deployable, but it is still a product slice rather than the full long-term enterprise platform. The following are still designed as future pluggable upgrades:

- GitHub App installation and webhook sync
- malware scanning for uploaded archives
- semantic analyzers like `tsserver`, `gopls`, `rust-analyzer`, or `Pyright`
- Postgres, Neo4j, vector DB, and cloud object storage backends
- SSO, SCIM, and enterprise RBAC/ABAC
- real LLM provider integration beyond the deterministic gateway
- customer-hosted data plane and BYO cloud storage control paths
