import { readAppConfig } from "./config/app-config.ts";
import { createApplication } from "./composition/bootstrap.ts";
import { buildHttpServer } from "./infrastructure/http/server.ts";

const config = readAppConfig();
const container = createApplication({
  runtime: "file",
  config,
});

if (config.autoSeedDemo) {
  await seedIfEmpty();
}

const server = buildHttpServer(container, config);

server.listen(config.port, config.host, () => {
  console.log(
    `context-forge listening on http://${config.host}:${config.port} with data in ${config.dataDir}`,
  );
});

async function seedIfEmpty(): Promise<void> {
  const { seedReferenceWorkspace } = await import("./composition/bootstrap.ts");
  await seedReferenceWorkspace(container);
}
