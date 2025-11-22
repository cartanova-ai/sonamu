import { z } from "zod";
import { createScheduler } from "../scheduler";
import type { SchedulerConfig, TaskContext } from "../types";

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
        typeCast: (field: any, next: any) => {
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
        // rou3을 쓰기 때문에, task의 path는 HTTP Router 문법에 대응됨.
        path: "/test/:complexId",
        retry: { maxAttempts: 3, delay: { seconds: 1 } },
        schema: schema,
        target: async ({ params }: TaskContext<typeof schema>) => {
          // router를 통해 complexId가 전달됨.
          console.log(params?.complexId);
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
        // rou3을 쓰기 때문에, task의 path는 HTTP Router 문법에 대응됨.
        namespace: "/test/some-complex-data",
        payload: {},
        options: {
          timezone: "Asia/Seoul",
          name: "local-router-test",
          noOverlap: false,
        },
      },
    ],
  };
}

(async () => {
  const scheduler = await createScheduler(getConfig());
  scheduler.start();
})();
