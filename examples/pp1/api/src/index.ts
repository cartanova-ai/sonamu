console.time("total");
import { Context, Sonamu } from "sonamu";
import fastify from "fastify";
import path from "path";
import { FastifyFile } from "./application/file/file.types";
import { setupAuth } from "./application/user/auth";
import { setupErrorHandler } from "./errors/error-handler";

const host = "0.0.0.0";
const port = 16000;

const server = fastify();
server.register(require("fastify-qs"));
server.register(require("@fastify/formbody"));
server.register(require("@fastify/cors"), {
  origin: true,
  credentials: true,
});
server.register(require("@fastify/static"), {
  root: path.join(__dirname, "/../", "public"),
  prefix: "/api/public",
});
server.register(require("fastify-file-upload"), {
  useTempFiles: true,
  tempFileDir: path.join(__dirname, "/../", "public", "tmp", "upload-temp"),
});
setupAuth(server);
setupErrorHandler(server);

async function bootstrap() {
  await Sonamu.withFastify(server, {
    contextProvider: (defaultContext, request) => {
      return {
        ...defaultContext,
        session: request.session,
        user: request.user ?? null,
        passport: {
          login: request.login.bind(request) as Context["passport"]["login"],
          logout: request.logout.bind(request),
        },
        uploadedFile: (request.body as { file?: FastifyFile })
          ?.file as Context["uploadedFile"],
      };
    },
    guardHandler: (_guard, _request, _api) => {
      console.log("NOTHING YET");
    },
  });

  server
    .listen({
      port,
      host,
    })
    .then(() => {
      console.log(`Server is listening on ${host}:${port}`);
      console.timeEnd("total");
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
bootstrap();
