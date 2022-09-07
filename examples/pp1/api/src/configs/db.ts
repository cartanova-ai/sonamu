import { SonamuDBConfig } from "@sonamu/core";

/*
  DB 설정 파일

  공통 적용되는 사항들은 conf 에서 정의하고,
  개별 커넥션별 세부 정의가 필요한 경우 직접 f9Knexfile을 수정
*/
const conf = {
  database: "pp1",
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
      host: "0.0.0.0",
      user: "f9dev",
      password: "F9.dev12#",
      typeCast: function (field: any, next: any) {
        if (field.type == "TINY" && field.length == 1) {
          const value = field.string();
          return value ? value == "1" : null;
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

export const sonamuDBConfig: SonamuDBConfig = {
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
      ...conf.local,
      database: `${conf.database}_fixture`,
    },
  },
  fixture_remote: {
    ...conf.default,
    connection: {
      ...conf.default.connection,
      ...conf.remote.master,
      database: `${conf.database}_fixture`,
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
      ...conf.remote.slave,
      database: conf.database,
    },
    pool: {
      min: 5,
      max: 30,
    },
  },
};
export default sonamuDBConfig;
