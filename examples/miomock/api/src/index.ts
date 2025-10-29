import fastifySecureSession from "@fastify/secure-session";
import fastifyPassport from "@fastify/passport";
import { Context, ContextExtend, Sonamu } from "sonamu";
import path from "path";

const host = "localhost";
const port = 10280;

async function bootstrap() {
  const current = "../../../";
  console.log(path.resolve(current));

  await Sonamu.createServer({
    listen: { port, host },
    plugins: {
      formbody: true,
      qs: true,
      custom: (server) => {
        server.register(fastifySecureSession, {
          secret: "miomock-secret-key-change-this-in-production",
          salt: "mq9hDxBCDbsQDR6N",
          cookie: {
            domain: "localhost",
            path: "/",
            maxAge: 60 * 60 * 24 * 365 * 10,
          },
        });

        server.register(fastifyPassport.initialize());
        server.register(fastifyPassport.secureSession());
        fastifyPassport.registerUserSerializer(async (user, _request) => user);
        fastifyPassport.registerUserDeserializer(
          async (serialized, _request) => serialized
        );

        server.register(import("@fastify/static"), {
          root: path.join(__dirname, "/../", "public"),
          prefix: "/api/public",
        });

        server.register(import("@fastify/multipart"), {
          limits: {
            fileSize: 1024 * 1024 * 30, // 30MB
          },
        });
      },
    },

    apiConfig: {
      contextProvider: (defaultContext, request) => {
        return {
          ...defaultContext,
          ip: request.ip,
          session: request.session,
          body: request.body,
          user: request.user ?? null,
          passport: {
            login: request.login.bind(request) as Context["passport"]["login"],
            logout: request.logout.bind(request),
          },
          file: request.file?.bind(request),
          files: request.files?.bind(request),
        };
      },
      guardHandler: (_guard, _request, _api) => {
        console.log("NOTHING YET");
      },
    },

    lifecycle: {
      onStart: () => {
        console.log(`🌲 Server listening on http://${host}:${port}`);
      },
      onShutdown: () => {
        console.log("graceful shutdown");
      },
    },
  });
}
bootstrap();
