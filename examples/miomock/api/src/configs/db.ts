import { SonamuDBBaseConfig } from "sonamu";

const baseconfig: SonamuDBBaseConfig = {
  database: "miomock",
  defaultOptions: {
    connection: {
      host: "0.0.0.0",
      port: 3306,
      user: "miomock",
      password: "miomock123",
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
