import { createServer } from "vite";
import fastify from "fastify";
import { createApiServer } from "./api";

import fs from "fs";
import path from "path";

const HOST = "0.0.0.0";
const WEB_PORT = 57000;
const API_PORT = 57001;
const root = __dirname;
const webRoot = path.join(root, "../build");

async function createDevServer() {
  const server = await createServer({
    configFile: path.join(root, "../vite.config.ts"),
    root,
    server: {
      host: HOST,
      port: WEB_PORT,
    },
  });
  await server.listen();
  console.log(`sonamu-ui WEB-dev Server is listening on ${HOST}:${WEB_PORT}`);
}

async function createWebServer() {
  const server = fastify({});

  server.register(import("@fastify/static"), {
    root: path.join(webRoot, "assets"),
    prefix: "/assets",
  });
  server.get("*", async (_request, reply) => {
    reply
      .headers({ "Content-type": "text/html" })
      .send(fs.readFileSync(`${webRoot}/index.html`));
  });

  server
    .listen({
      port: WEB_PORT,
      host: HOST,
    })
    .then(() => {
      console.log(
        `sonamu-ui WEB-static Server is listening on ${HOST}:${WEB_PORT}`
      );
    })
    .catch((err) => {
      if (err.code === "EADDRINUSE") {
        // DEV Mode
        console.log("dev:client is already running");
        return;
      } else {
        console.error(err);
        process.exit(1);
      }
    });
}

export async function startServers(apiRootPath: string) {
  if (false) {
    await createDevServer();
  }
  if (true) {
    await createWebServer();
  }

  await createApiServer({
    listen: { port: API_PORT, host: HOST },
    apiRootPath,
    watch: true,
  });
}

/*
if (process.argv[2] === "run") {
  const apiRootPath = process.argv[3] ?? path.resolve("../../../bysuco/api");

  async function bootstrap() {
    await Sonamu.init(true, false, apiRootPath);
    await startServers(apiRootPath);
  }
  bootstrap().then(() => {
    console.log("bootstrap finished");
  });
}
DEV NOTE: This is a temporary solution to run sonamu-ui in dev mode.
*/
