import path from "node:path";
import { createServer } from "node:http";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import type { AppConfig } from "../../config/app-config.ts";
import type { ApplicationContainer } from "../../composition/bootstrap.ts";
import { seedReferenceWorkspace } from "../../composition/bootstrap.ts";
import { parseArchiveUpload } from "../uploads/archive-parser.ts";
import { AppError, invariant } from "../../shared/kernel/errors.ts";

export const buildHttpServer = (
  container: ApplicationContainer,
  config: AppConfig,
) => {
  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadBytes },
  });

  app.disable("x-powered-by");
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use((request, response, next) => {
    response.setHeader("cache-control", "no-store");
    next();
  });

  app.use("/api", (request, response, next) => {
    if (
      !config.apiKey ||
      request.path === "/health" ||
      request.path === "/config" ||
      request.header("x-api-key") === config.apiKey
    ) {
      return next();
    }

    return response.status(401).json({
      error: "unauthorized",
      message: "Missing or invalid x-api-key header.",
    });
  });

  app.get("/api", asyncRoute(async (_request, response) => {
    response.json({
      name: "context-forge",
      status: "ok",
      authRequired: Boolean(config.apiKey),
      endpoints: {
        overview: "GET /api/overview",
        seedDemo: "POST /api/demo/seed",
        integrations: [
          "GET /api/platform/integrations",
          "POST /api/platform/integrations",
          "GET /api/platform/integrations/claude-guide",
        ],
        controlPlane: [
          "GET /api/control/tenants",
          "POST /api/control/tenants",
          "GET /api/control/workspaces",
          "GET /api/control/workspaces/:workspaceId",
          "POST /api/control/workspaces",
          "POST /api/control/repositories",
          "GET /api/control/repositories/:repositoryId",
          "POST /api/control/policies",
        ],
        dataPlane: [
          "POST /api/data/ingestions",
          "POST /api/data/uploads/archive",
          "GET /api/data/repositories/:repositoryId/snapshots",
          "GET /api/data/snapshots/:snapshotId",
          "POST /api/data/memories",
          "GET /api/data/workspaces/:workspaceId/memories",
          "POST /api/data/retrievals",
          "POST /api/data/agents/respond",
          "GET /api/data/sessions/:sessionId",
        ],
      },
    });
  }));

  app.get("/api/health", asyncRoute(async (_request, response) => {
    response.json({ status: "healthy" });
  }));

  app.get("/api/config", asyncRoute(async (_request, response) => {
    response.json({
      authRequired: Boolean(config.apiKey),
      maxUploadBytes: config.maxUploadBytes,
      version: "1.0.0",
    });
  }));

  app.get("/api/overview", asyncRoute(async (_request, response) => {
    response.json(await container.services.read.getOverview());
  }));

  app.get("/api/platform/integrations", asyncRoute(async (_request, response) => {
    response.json(await container.services.integrations.listProfiles());
  }));

  app.post("/api/platform/integrations", asyncRoute(async (request, response) => {
    const body = {
      ...request.body,
      args:
        typeof request.body.args === "string"
          ? request.body.args
              .split(/\s+/g)
              .map((value: string) => value.trim())
              .filter(Boolean)
          : Array.isArray(request.body.args)
            ? request.body.args
            : [],
    };
    response.status(201).json(await container.services.integrations.saveProfile(body));
  }));

  app.get(
    "/api/platform/integrations/claude-guide",
    asyncRoute(async (_request, response) => {
      response.json(await container.services.integrations.getClaudeConnectorGuide(config));
    }),
  );

  app.get("/api/metrics", asyncRoute(async (_request, response) => {
    const overview = await container.services.read.getOverview();
    response.type("text/plain").send([
      "# HELP context_forge_entities Total entities tracked in the platform.",
      "# TYPE context_forge_entities gauge",
      ...Object.entries(overview.counts).map(
        ([key, value]) => `context_forge_entities{type="${key}"} ${value}`,
      ),
    ].join("\n"));
  }));

  app.post("/api/demo/seed", asyncRoute(async (_request, response) => {
    response.status(201).json(await seedReferenceWorkspace(container));
  }));

  app.get("/api/audit/events", asyncRoute(async (request, response) => {
    const workspaceId = readOptionalString(request.query.workspaceId);
    const category =
      request.query.category === "control-plane" ||
      request.query.category === "data-plane"
        ? request.query.category
        : undefined;

    response.json(
      await container.services.read.listAuditEvents({
        workspaceId,
        category,
      }),
    );
  }));

  app.get("/api/control/tenants", asyncRoute(async (_request, response) => {
    response.json(await container.services.read.listTenants());
  }));

  app.post("/api/control/tenants", asyncRoute(async (request, response) => {
    response
      .status(201)
      .json(await container.services.controlPlane.createTenant(request.body));
  }));

  app.get("/api/control/workspaces", asyncRoute(async (request, response) => {
    response.json(
      await container.services.read.listWorkspaces(readOptionalString(request.query.tenantId)),
    );
  }));

  app.get(
    "/api/control/workspaces/:workspaceId",
    asyncRoute(async (request, response) => {
      const workspaceId = readRequiredString(
        request.params.workspaceId,
        "workspaceId",
      );
      response.json(
        await container.services.read.getWorkspace(workspaceId),
      );
    }),
  );

  app.post("/api/control/workspaces", asyncRoute(async (request, response) => {
    response
      .status(201)
      .json(await container.services.controlPlane.createWorkspace(request.body));
  }));

  app.get(
    "/api/control/workspaces/:workspaceId/repositories",
    asyncRoute(async (request, response) => {
      const workspaceId = readRequiredString(
        request.params.workspaceId,
        "workspaceId",
      );
      response.json(
        await container.services.read.listRepositories(workspaceId),
      );
    }),
  );

  app.post("/api/control/repositories", asyncRoute(async (request, response) => {
    response
      .status(201)
      .json(await container.services.controlPlane.registerRepository(request.body));
  }));

  app.get(
    "/api/control/repositories/:repositoryId",
    asyncRoute(async (request, response) => {
      const repositoryId = readRequiredString(
        request.params.repositoryId,
        "repositoryId",
      );
      response.json(
        await container.services.read.getRepository(repositoryId),
      );
    }),
  );

  app.post("/api/control/policies", asyncRoute(async (request, response) => {
    response.json(await container.services.controlPlane.configurePolicy(request.body));
  }));

  app.post("/api/data/ingestions", asyncRoute(async (request, response) => {
    response
      .status(201)
      .json(await container.services.ingestion.ingest(request.body));
  }));

  app.post(
    "/api/data/uploads/archive",
    upload.single("archive"),
    asyncRoute(async (request, response) => {
      const file = request.file;
      const workspaceId = readRequiredString(request.body.workspaceId, "workspaceId");
      const repositoryId = readRequiredString(request.body.repositoryId, "repositoryId");
      const branch = readRequiredString(request.body.branch, "branch");
      invariant(file, "Archive file is required");

      const parsed = await parseArchiveUpload({
        fileName: file.originalname,
        buffer: file.buffer,
      });

      const result = await container.services.ingestion.ingest({
        workspaceId,
        repositoryId,
        branch,
        commitSha: readOptionalString(request.body.commitSha) || parsed.inferredCommitSha,
        sourceKind: "archive-upload",
        artifacts: parsed.artifacts,
        relationships: parsed.relationships,
      });

      response.status(201).json({
        ...result,
        skippedPaths: parsed.skippedPaths,
        artifactCount: parsed.artifacts.length,
        relationshipCount: parsed.relationships.length,
      });
    }),
  );

  app.get(
    "/api/data/repositories/:repositoryId/snapshots",
    asyncRoute(async (request, response) => {
      const repositoryId = readRequiredString(
        request.params.repositoryId,
        "repositoryId",
      );
      const repository = await container.services.read.getRepository(
        repositoryId,
      );
      response.json(repository.snapshots);
    }),
  );

  app.get(
    "/api/data/snapshots/:snapshotId",
    asyncRoute(async (request, response) => {
      const snapshotId = readRequiredString(request.params.snapshotId, "snapshotId");
      response.json(
        await container.services.read.getSnapshot(snapshotId),
      );
    }),
  );

  app.post("/api/data/memories", asyncRoute(async (request, response) => {
    response
      .status(201)
      .json(await container.services.memory.promote(request.body));
  }));

  app.get(
    "/api/data/workspaces/:workspaceId/memories",
    asyncRoute(async (request, response) => {
      const workspaceId = readRequiredString(
        request.params.workspaceId,
        "workspaceId",
      );
      response.json(
        await container.services.read.listMemories(workspaceId),
      );
    }),
  );

  app.post("/api/data/retrievals", asyncRoute(async (request, response) => {
    response.json(await container.services.retrieval.buildContext(request.body));
  }));

  app.post("/api/data/agents/respond", asyncRoute(async (request, response) => {
    response.json(await container.services.agent.respond(request.body));
  }));

  app.get(
    "/api/data/sessions/:sessionId",
    asyncRoute(async (request, response) => {
      const sessionId = readRequiredString(request.params.sessionId, "sessionId");
      response.json(await container.services.read.getSession(sessionId));
    }),
  );

  app.use("/app", express.static(config.publicDir));
  app.get("/favicon.ico", (_request, response) => {
    response.redirect("/app/favicon.svg");
  });
  app.get("/", (_request, response) => {
    response.redirect("/app/");
  });
  app.get("/app", (_request, response) => {
    response.sendFile(path.join(config.publicDir, "index.html"));
  });

  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
      if (error instanceof multer.MulterError) {
        return response.status(400).json({
          error: "upload_error",
          message: error.message,
        });
      }

      if (error instanceof AppError) {
        return response.status(error.statusCode).json({
          error: error.code,
          message: error.message,
          details: error.details,
        });
      }

      return response.status(500).json({
        error: "internal_error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    },
  );

  return createServer(app);
};

const asyncRoute =
  (
    handler: (request: Request, response: Response, next: NextFunction) => Promise<void>,
  ) =>
  (request: Request, response: Response, next: NextFunction) => {
    handler(request, response, next).catch(next);
  };

const readRequiredString = (value: unknown, label: string): string => {
  invariant(typeof value === "string" && value.trim(), `${label} is required`);
  return value.trim();
};

const readOptionalString = (value: unknown): string | undefined => {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};
