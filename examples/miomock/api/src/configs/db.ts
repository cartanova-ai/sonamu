import { SonamuDBBaseConfig } from "sonamu";

const baseconfig: SonamuDBBaseConfig = {
  database: "miomock",
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
};

export default baseconfig;
