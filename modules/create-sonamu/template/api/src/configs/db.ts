import { SonamuDBConfig } from "sonamu";

const conf = {
  database: process.env.MYSQL_DATABASE,
  default: {
    client: "mysql2",
    useNullAsDefault: true,
    pool: {
      min: 1,
      max: 5,
    },
    migrations: {
      extension: "js",
      directory: "./dist/migrations",
    },
    connection: {
      dateStrings: true,
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      typeCast: function (field: any, next: any) {
        if (field.type == "TINY" && field.length == 1) {
          const value = field.string();
          return value ? value === "1" : null;
        }
        return next();
      },
    },
  },
  remote: {
    master: {},
    slave: {},
  },
  local: {},
};

export const dbConfig: SonamuDBConfig = {
  development_master: {
    ...conf.default,
    connection: {
      ...conf.default.connection,
      ...conf.remote.master,
      database: conf.database,
    },
  },
  development_slave: {
    ...conf.default,
    connection: {
      ...conf.default.connection,
      ...conf.remote.slave,
      database: conf.database,
    },
  },
  test: {
    ...conf.default,
    connection: {
      ...conf.default.connection,
      ...conf.local,
      database: `${conf.database}_test`,
    },
  },
  fixture_local: {
    ...conf.default,
    connection: {
      ...conf.default.connection,
      ...conf.remote.master,
      database: `${conf.database}_fixture_local`,
    },
  },
  fixture_remote: {
    ...conf.default,
    connection: {
      ...conf.default.connection,
      ...conf.remote.master,
      database: `${conf.database}_fixture_remote`,
    },
  },
  production_master: {
    ...conf.default,
    connection: {
      ...conf.default.connection,
      ...conf.remote.master,
      database: conf.database,
    },
    pool: {
      min: 5,
      max: 50,
    },
  },
  production_slave: {
    ...conf.default,
    connection: {
      ...conf.default.connection,
      ...conf.remote.master,
      database: conf.database,
    },
    pool: {
      min: 5,
      max: 30,
    },
  },
};

export default dbConfig;
