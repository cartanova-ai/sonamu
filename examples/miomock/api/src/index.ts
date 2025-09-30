import fastify from "fastify";
import { Sonamu } from "sonamu";
import path from "path";

const host = "localhost";
const port = 10280;

const server = fastify();
server.register(import("fastify-qs"));

async function bootstrap() {
  const current = "../../../";
  console.log(path.resolve(current));

  await Sonamu.withFastify(server, {
    contextProvider: (defaultContext, request) => {
      return {
        ...defaultContext,
        ip: request.ip,
      };
    },
    guardHandler: (_guard, _request, _api) => {
      console.log("NOTHING YET");
    },
  });

  server
    .listen({ port, host })
    .then(() => {
      console.log(`🌲 Server listening on http://${host}:${port}`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
bootstrap();
