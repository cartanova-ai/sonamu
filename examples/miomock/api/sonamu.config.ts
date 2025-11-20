import path from "path";
import { defineConfig, FSDriver, S3Driver } from "sonamu";

const host = "localhost";
const port = 10280;

export default defineConfig({
  projectName: "Miomock",
  api: {
    dir: "api",
    timezone: "Asia/Seoul",
    route: {
      prefix: "/api",
    },
  },
  sync: {
    targets: ["web"],
  },
  ui: {
    port: 60000,
  },
  database: {
    name: "miomock",
    defaultOptions: {
      connection: {
        host: process.env.MIOMOCK_DB_HOST ?? "0.0.0.0",
        port: Number(process.env.MIOMOCK_DB_PORT ?? 3306),
        user: process.env.MIOMOCK_DB_USER ?? "root",
        password: process.env.MIOMOCK_DB_PASSWORD ?? "miomock123",
        typeCast: function (field: any, next: any) {
          if (field.type == "TINY" && field.length == 1) {
            const value = field.string();
            return value ? value == "1" : null;
          }
          // DATE 타입은 문자열로 유지 (YYYY-MM-dd 형태)
          if (field.type == "DATE") {
            return field.string();
          }
          return next();
        },
      },
    },
  },

  server: {
    listen: { port, host },
    plugins: {
      formbody: true,
      qs: true,
      multipart: { limits: { fileSize: 1024 * 1024 * 30 } },
      static: {
        root: path.join(import.meta.dirname, "/../", "public"),
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
        location: path.join(import.meta.dirname, "/../", "public", "uploaded"),
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
  },
});
