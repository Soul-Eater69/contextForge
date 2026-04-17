import { createId } from "../../../shared/kernel/ids.ts";
import { invariant } from "../../../shared/kernel/errors.ts";
import { isoNow, type Clock } from "../../../shared/kernel/time.ts";
import type { AppConfig } from "../../../config/app-config.ts";
import type { ClaudeConnectorGuide, IntegrationProfile } from "../domain/models.ts";
import type { IntegrationProfileRepository } from "../ports/repositories.ts";

export interface SaveIntegrationProfileInput {
  id?: string;
  name: string;
  provider: IntegrationProfile["provider"];
  transport: IntegrationProfile["transport"];
  enabled?: boolean;
  command?: string;
  args?: string[];
  model?: string;
  baseUrl?: string;
  apiKeyEnvVar?: string;
  notes?: string;
}

export class IntegrationService {
  constructor(
    private readonly profiles: IntegrationProfileRepository,
    private readonly clock: Clock,
  ) {}

  async saveProfile(input: SaveIntegrationProfileInput): Promise<IntegrationProfile> {
    invariant(input.name.trim(), "Integration profile name is required");
    invariant(input.provider, "Integration provider is required");
    invariant(input.transport, "Integration transport is required");

    const existing = input.id ? await this.profiles.getById(input.id) : undefined;
    const timestamp = isoNow(this.clock);
    const profile: IntegrationProfile = {
      id: existing?.id ?? createId("int"),
      name: input.name.trim(),
      provider: input.provider,
      transport: input.transport,
      enabled: input.enabled ?? true,
      command: input.command?.trim() || undefined,
      args: (input.args ?? []).map((value) => value.trim()).filter(Boolean),
      model: input.model?.trim() || undefined,
      baseUrl: input.baseUrl?.trim() || undefined,
      apiKeyEnvVar: input.apiKeyEnvVar?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    await this.profiles.save(profile);
    return profile;
  }

  async listProfiles(): Promise<IntegrationProfile[]> {
    const profiles = await this.profiles.list();
    return profiles.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getClaudeConnectorGuide(config: AppConfig): Promise<ClaudeConnectorGuide> {
    const profiles = await this.listProfiles();
    const profile =
      profiles.find((candidate) => candidate.enabled && candidate.provider === "claude-code-local") ??
      ({
        name: "Local Claude Code",
        provider: "claude-code-local",
        transport: "cli",
        enabled: true,
        command: "claude",
        args: [],
        model: "claude-sonnet-4-5",
        baseUrl: `http://127.0.0.1:${config.port}`,
      } satisfies Partial<IntegrationProfile>);

    const isDockerLike = config.dataDir.startsWith("/app/");
    const baseUrl =
      profile.baseUrl ||
      (isDockerLike ? "http://127.0.0.1:4000" : `http://127.0.0.1:${config.port}`);
    const command = profile.command || "claude";
    const args = profile.args?.length ? ` ${profile.args.join(" ")}` : "";

    return {
      recommendedMode: isDockerLike ? "docker-service" : "local-package",
      launchCommand: `${command}${args}`,
      envBlock: [
        `CONTEXT_FORGE_URL=${baseUrl}`,
        `CONTEXT_FORGE_API_KEY=${config.apiKey ? "<set-your-api-key>" : "<optional>"}`,
        `CLAUDE_CODE_COMMAND=${command}`,
        `CLAUDE_CODE_MODEL=${profile.model || "claude-sonnet-4-5"}`,
      ].join("\n"),
      notes: [
        "Best experience: run Context Forge on the same machine as Claude Code when you want a local CLI bridge.",
        "If Context Forge runs in Docker, use the web GUI and HTTP API from the container, but the host Claude CLI is usually better bridged from a local install.",
        "Treat the local package mode as the primary developer workflow and Docker as the shared team service mode.",
      ],
    };
  }
}
