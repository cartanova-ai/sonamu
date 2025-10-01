require("dotenv").config();
import { SonamuDBBaseConfig } from "sonamu";

const baseconfig: SonamuDBBaseConfig = {
  database: process.env.MYSQL_DATABASE!,
  defaultOptions: {
    connection: {
      host: process.env.DB_HOST,
      user: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
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
