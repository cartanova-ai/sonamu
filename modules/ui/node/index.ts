import path from "path";
import { createServer, preview } from "vite";
import fastify from "fastify";
import { createApiServer } from "./api";

const root = __dirname;

const HOST = "0.0.0.0";
const API_PORT = 57001;
const WEB_PORT = 57000;

async function createDevServer() {
  console.log(root);
  const server = await createServer({
    configFile: path.join(root, "/vite.config.ts"),
    root,
    server: {
      host: HOST,
      port: WEB_PORT,
    },
  });
  await server.listen();
  console.log(`sonamu-ui WEB-dev Server is listening on ${HOST}:${WEB_PORT}`);
}

async function createPreviewServer() {
  await preview({
    configFile: path.join(root, "/vite.config.ts"),
    root,
    preview: {
      port: WEB_PORT,
      open: true,
    },
  });
  console.log(
    `sonamu-ui WEB-preview Server is listening on ${HOST}:${WEB_PORT}`
  );
}

async function createWebServer() {
  const server = fastify({});

  server.register(require("@fastify/static"), {
    root: path.join(root, "/dist"),
    prefix: "/",
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
      console.error(err);
      process.exit(1);
    });
}

export async function startServers(appRoot: string) {
  if (false) {
    await createDevServer();
  }

  if (false) {
    await createWebServer();
  }
  if (false) {
    await createPreviewServer();
  }

  await createApiServer({ listen: { port: API_PORT, host: HOST }, appRoot });
}

if (process.argv[2] === "run") {
  const appRoot = process.argv[3] ?? "/Users/minsangk/Development/ride";
  startServers(appRoot).finally(() => {
    console.log("bootstrap finished");
  });
}
