import { z } from "zod";
import { SonamuTaskNode } from "../task-node";
import type { TaskContext, TaskNodeConfig, TaskNodeEvent } from "../types";

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
      pool: { min: 1, max: 5, },
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
      }
    },
    routes: [{
      path: "/test",
      schema: schema,
      target: async (ctx: TaskContext<typeof schema>) => {
        console.log("Processed", ctx);
      },
    }],
    retry: {
      delay: {},
      maxAttempts: 1
    }
  };
}


(() => {
  const config = getConfig();
  console.log(config);
  const taskNode = new SonamuTaskNode(config);
  taskNode.on("*", (evt: TaskNodeEvent) => {
    console.log("Event:", evt);
  });

  taskNode.run();
})();
