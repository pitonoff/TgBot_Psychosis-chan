import { buildApp } from "./app.js";
import { getConfig } from "./config.js";

async function main() {
  const config = getConfig();
  const app = await buildApp(config);

  const closeSignals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of closeSignals) {
    process.once(signal, async () => {
      app.log.info({ signal }, "Shutting down");
      await app.close();
      process.exit(0);
    });
  }

  try {
    await app.listen({
      host: config.HOST,
      port: config.PORT
    });
  } catch (error) {
    app.log.error(error, "Failed to start server");
    process.exit(1);
  }
}

void main();
