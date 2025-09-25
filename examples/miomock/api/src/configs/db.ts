import { SonamuDBBaseConfig } from "sonamu";

const baseconfig: SonamuDBBaseConfig = {
  database: "miomock",
  defaultOptions: {
    connection: {
      host: "127.0.0.1",
      port: 3306,
      user: "root",
      password: "miomock123",
      typeCast: function (field: any, next: any) {
        if (field.type == "TINY" && field.length == 1) {
          const value = field.string();
          return value ? value == "1" : null;
        }
        return next();
      },
      dateStrings: true,
    },
  },
};

export default baseconfig;
