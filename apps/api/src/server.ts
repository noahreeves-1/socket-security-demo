import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

try {
  const config = loadConfig(process.env);
  const server = createApp({ config }).listen(config.port, config.host, () => {
    console.log(`OrderPulse API listening on http://${config.host}:${config.port}`);
  });
  server.on("error", () => {
    console.error("API could not start. Check HOST, PORT, and whether the port is already in use.");
    process.exitCode = 1;
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : "API could not start.");
  process.exitCode = 1;
}
