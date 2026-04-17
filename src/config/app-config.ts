import path from "node:path";

export interface AppConfig {
  host: string;
  port: number;
  dataDir: string;
  publicDir: string;
  apiKey?: string;
  autoSeedDemo: boolean;
  maxUploadBytes: number;
}

export const readAppConfig = (): AppConfig => ({
  host: process.env.HOST?.trim() || "0.0.0.0",
  port: Number(process.env.PORT ?? "4000"),
  dataDir: path.resolve(process.cwd(), process.env.DATA_DIR?.trim() || "data"),
  publicDir: path.resolve(process.cwd(), process.env.PUBLIC_DIR?.trim() || "public"),
  apiKey: process.env.API_KEY?.trim() || undefined,
  autoSeedDemo: process.env.AUTO_SEED_DEMO === "true",
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? `${10 * 1024 * 1024}`),
});

