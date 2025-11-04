import { z } from "zod";
import { createScheduler } from "../scheduler";
import type { TaskContext, SchedulerConfig, TaskEvent } from "../types";

function getConfig(): SchedulerConfig {
  const schema = z.object();

  return {
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
        target: async ({ taskItem, retry }: TaskContext<typeof schema>) => {
          // 마지막 시도에서만 성공하게 함.
          if (taskItem.attempt !== retry.maxAttempts) {
            throw new Error("실패!");
          }
        },
      },
    ],

    retry: {
      delay: {},
      maxAttempts: 1,
    },

    tasks: [
      {
        type: "local",
        expression: "*/10 * * * * *",

        // local에서 실행할 때는 어느 namespace에서 어느 payload로 실행할지를 넣어야 함.
        payload: {},
        namespace: "/test2",

        // node-cron에서 쓰는 options를 공유함.
        options: {
          timezone: "Asia/Seoul",
          noOverlap: false,
        },
      },
    ],
  };
}

(async () => {
  const scheduler = await createScheduler(getConfig());
  scheduler.on("*", (evt: TaskEvent) => {
    console.log("Event:", evt);
  });

  scheduler.start();
})();
