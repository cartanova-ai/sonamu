import path from "node:path";
import { defineConfig } from "sonamu";
import { drivers } from "sonamu/storage";

const host = "localhost";
const port = 1028;

export default defineConfig({
  projectName: process.env.PROJECT_NAME ?? "SonamuProject",
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
  database: {
    database: "postgresql",
    name: process.env.DATABASE_NAME ?? "database_name",
    defaultOptions: {
      connection: {
        host: process.env.DB_HOST || "0.0.0.0",
        port: Number(process.env.DB_PORT) || 5432,
        user: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD,
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
        secret: process.env.SESSION_SECRET || "sonamu-secret-key-change-this-in-production",
        salt: process.env.SESSION_SALT || "mq9hDxBCDbsQDR6N",
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

    storage: {
      default: process.env.DRIVE_DISK ?? "fs",
      drivers: {
        fs: drivers.fs({
          location: path.join(import.meta.dirname, "/../public/uploaded"),
          visibility: "public",
          urlBuilder: {
            generateURL(key) {
              return `/api/public/uploaded/${key}`;
            },
            generateSignedURL(key) {
              return `/api/public/uploaded/${key}`;
            },
          },
        }),
        s3: drivers.s3({
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
          },
          region: process.env.S3_REGION ?? "ap-northeast-2",
          bucket: process.env.S3_BUCKET ?? "sonamu_default_bucket",
          visibility: "private",
        }),
      },
    },

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
