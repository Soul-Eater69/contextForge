export type IntegrationProvider =
  | "claude-code-local"
  | "anthropic-api"
  | "openai-api"
  | "ollama"
  | "custom-mcp";

export type IntegrationTransport = "cli" | "api" | "mcp";

export interface IntegrationProfile {
  id: string;
  name: string;
  provider: IntegrationProvider;
  transport: IntegrationTransport;
  enabled: boolean;
  command?: string;
  args: string[];
  model?: string;
  baseUrl?: string;
  apiKeyEnvVar?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClaudeConnectorGuide {
  recommendedMode: "local-package" | "docker-service";
  launchCommand: string;
  envBlock: string;
  notes: string[];
}

