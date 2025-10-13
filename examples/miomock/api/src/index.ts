import fastify from "fastify";
import fastifySession from "@fastify/session";
import fastifyCookie from "@fastify/cookie";
import fastifyPassport from "@fastify/passport";
import { Context, Sonamu } from "sonamu";
import path from "path";

const host = "localhost";
const port = 10280;

const server = fastify();
server.register(fastifyCookie);
server.register(fastifySession, {
  secret: "miomock-secret-key-change-this-in-production",
  cookie: {
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
});
server.register(import("fastify-qs"));

server.register(fastifyPassport.initialize());
server.register(fastifyPassport.secureSession());
fastifyPassport.registerUserSerializer(async (user, _request) => user);
fastifyPassport.registerUserDeserializer(
  async (serialized, _request) => serialized
);

async function bootstrap() {
  const current = "../../../";
  console.log(path.resolve(current));

  await Sonamu.withFastify(server, {
    contextProvider: (defaultContext, request) => {
      return {
        ...defaultContext,
        ip: request.ip,
        session: request.session,
        user: request.user ?? null,
        passport: {
          login: request.login.bind(request) as Context["passport"]["login"],
          logout: request.logout.bind(request),
        },
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
