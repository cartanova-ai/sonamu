console.time("total");
require("dotenv").config();
import fastify from "fastify";
import { Sonamu } from "sonamu";

const host = "localhost";
const port = 19000;

const server = fastify();
server.register(require("fastify-qs"));

async function bootstrap() {
  await Sonamu.withFastify(server, {
    contextProvider: (defaultContext, _request) => {
      return {
        ...defaultContext,
        //
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
      console.timeEnd("total");
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
bootstrap();
