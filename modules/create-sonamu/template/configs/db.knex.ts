require("dotenv").config();
import { SonamuDBBaseConfig } from "sonamu";

const baseconfig: SonamuDBBaseConfig = {
  client: "knex",
  database: process.env.MYSQL_DATABASE!,
  defaultOptions: {
    connection: {
      host: process.env.DB_HOST,
      user: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
    },
  },
};

export default baseconfig;
