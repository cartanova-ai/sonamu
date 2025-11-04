import { z } from "zod";
import { createScheduler } from "../scheduler";
import type { TaskContext, SchedulerConfig, TaskEvent } from "../types";
import assert from "node:assert";

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
        type: "remote",
        // node-cron은 초까지 지원하기 때문에 이렇게 10초마다 돌릴 수 있음.
        expression: "*/10 * * * * *",
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
  const scheduler = await createScheduler(getConfig());

  // name이 *일 경우엔 모든 이벤트를 수신할 수 있음.
  scheduler.on("*", (evt: TaskEvent) => {
    console.log("Event: ", evt);
  });

  scheduler.on("process:start", (evt: TaskEvent) => {
    assert(evt.type === "process:start");
    console.log("[Process Started] Task Item: ", evt.task.id);
  });

  scheduler.start();
})();
