import { z } from "zod";
import { createScheduler } from "../scheduler";
import type { TaskContext, TaskNodeConfig, TaskEvent } from "../types";

function getConfig(): TaskNodeConfig {
  const schema = z.object();

  return {
    log: {
      level: "info",
      // sinkers: {},
      // loggers: []
    },
    database: {
      client: "mysql2",
      pool: { min: 1, max: 5 },
      connection: {
        database: "miomock",
        host: "0.0.0.0",
        port: 3306,
        user: "root",
        password: "miomock123",
        typeCast: function (field: any, next: any) {
          if (field.type === "TINY" && field.length === 1) {
            const value = field.string();
            return value ? value === "1" : null;
          }
          // DATE 타입은 문자열로 유지 (YYYY-MM-dd 형태)
          if (field.type === "DATE") {
            return field.string();
          }
          return next();
        },
      },
    },
    routes: [
      {
        path: "/test",
        schema: schema,
        target: async (ctx: TaskContext<typeof schema>) => {
          console.log("Processed", ctx);
        },
      },
      {
        path: "/test2",
        retry: { maxAttempts: 3, delay: { seconds: 1 } },
        schema: schema,
        target: async (_: TaskContext<typeof schema>) => {
          throw new Error();
        },
      },
    ],

    retry: {
      delay: {},
      maxAttempts: 1,
    },

    tasks: [
      {
        type: "remote",
        // node-cron은 초까지 지원하기 때문에 이렇게 30초마다 돌릴 수 있음.
        expression: "*/10 * * * * *",
        options: {
          timezone: "Asia/Seoul",
          name: "remote-job",
          noOverlap: false,
        },
      },
      {
        type: "local",
        expression: "*/10 * * * * *",
        payload: {},
        namespace: "/test2",
        options: {
          timezone: "Asia/Seoul",
          name: "remote-job",
          noOverlap: false,
        },
      },
    ],
  };
}

(async () => {
  const config = getConfig();
  console.log(config);
  const scheduler = await createScheduler(config);
  scheduler.on("*", (evt: TaskEvent) => {
    console.log("Event:", evt);
  });

  scheduler.start();
})();
