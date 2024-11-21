require("dotenv").config();
import { SonamuDBBaseConfig } from "sonamu";

const baseconfig: SonamuDBBaseConfig = {
  client: "kysely",
  database: process.env.MYSQL_DATABASE!,
  defaultOptions: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
};

export default baseconfig;
