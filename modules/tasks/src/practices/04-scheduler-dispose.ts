/** biome-ignore-all lint/suspicious/noExplicitAny: Task 프로젝트 임시 조치 */

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
    ],

    retry: {
      delay: {},
      maxAttempts: 1,
    },

    tasks: [
      {
        type: "remote",
        expression: "5 * * * *",
        options: {
          timezone: "Asia/Seoul",
          noOverlap: false,
        },
      },
    ],
  };
}
// scheduler를 dispose하면 대기 중인 Promise가 없기 때문에 프로그램은 1분 뒤에 바로 종료된다.
(async () => {
  const scheduler = await createScheduler(getConfig());
  setTimeout(() => {
    scheduler.dispose();
  }, 60 * 1000);

  scheduler.start();
})();
