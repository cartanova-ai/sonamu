import { Sonamu, FSDriver, S3Driver } from "sonamu";
import path from "path";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const a_filename = fileURLToPath(import.meta.url);
const a_dirname = dirname(a_filename);

const host = "localhost";
const port = 10280;

async function bootstrap() {
  await Sonamu.createServer({
    listen: { port, host },
    plugins: {
      formbody: true,
      qs: true,
      multipart: { limits: { fileSize: 1024 * 1024 * 30 } },
      static: {
        root: path.join(a_dirname, "/../", "public"),
        prefix: "/api/public",
      },
      session: {
        secret: "miomock-secret-key-change-this-in-production",
        salt: "mq9hDxBCDbsQDR6N",
        cookie: {
          domain: "localhost",
          path: "/",
          maxAge: 60 * 60 * 24 * 365 * 10,
        },
      },
      custom: (_server) => {
        // nothing yet
      },
    },

    auth: true,
    // auth: {
    //   userSerializer: async (user, _request) => user,
    //   userDeserializer: async (serialized, _request) => serialized,
    // },

    apiConfig: {
      contextProvider: (defaultContext, request) => {
        return {
          ...defaultContext,
          ip: request.ip,
          session: request.session,
          body: request.body,
        };
      },
      guardHandler: (_guard, _request, _api) => {
        console.log("NOTHING YET");
      },
    },

    storage: (() => {
      if (process.env.NODE_ENV === "production") {
        return new S3Driver({
          bucket: "miomock",
          region: "ap-northeast-2",
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
          },
        });
      }
      return new FSDriver({
        location: path.join(a_dirname, "/../", "public", "uploaded"),
        urlPrefix: "/api/public/uploaded",
      });
    })(),
    lifecycle: {
      onStart: () => {
        console.log(`🌲 Server listening on http://${host}:${port}`);
      },
      onShutdown: () => {
        console.log("graceful shutdown");
      },
      onError: (error, _request, reply) => {
        console.error(error);
        reply.status(500).send({
          name: error.name,
          message: error.message,
        });
      },
    },
  });
}
bootstrap();
