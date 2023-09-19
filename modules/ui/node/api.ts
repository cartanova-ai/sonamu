import fastify from "fastify";
import { flatten, uniq } from "lodash";
import {
  Sonamu,
  EntityManager,
  EntityProp,
  EntityIndex,
  EntitySubsetRow,
  Migrator,
} from "sonamu";
import { Entity } from "sonamu/dist/entity/entity";
import knex from "knex";

export async function createApiServer(options: {
  listen: {
    host: string;
    port: number;
  };
  appRoot: string;
}) {
  const { listen, appRoot } = options;

  const server = fastify();

  server.get("/api", async (_request, _reply) => {
    return { hello: "world", now: new Date() };
  });

  server.get("/api/t1", async () => {
    const entityIds = EntityManager.getAllIds();
    const { apiRootPath, isInitialized } = Sonamu;
    return {
      apiRootPath,
      entityIds,
    };
  });

  server.get("/api/entity/findMany", async () => {
    const entityIds = EntityManager.getAllIds();

    function flattenSubsetRows(subsetRows: EntitySubsetRow[]) {
      return subsetRows
        .map((subsetRow) => {
          const { children, ...sRow } = subsetRow;
          return [sRow, ...flattenSubsetRows(children)];
        })
        .flat();
    }

    const entities = await Promise.all(
      entityIds.map((entityId) => {
        const entity = EntityManager.get(entityId);
        const subsetRows = entity.getSubsetRows();

        return {
          ...entity,
          flattenSubsetRows: flattenSubsetRows(subsetRows),
        };
      })
    );

    entities.sort((a, b) => {
      const aId = a.parentId ?? a.id;
      const bId = b.parentId ?? b.id;
      if (aId < bId) return -1;
      if (aId > bId) return 1;
      if (aId === bId) {
        if (a.parentId === undefined) return -1;
        if (b.parentId === undefined) return 1;
        return 0;
      }
      return 0;
    });
    return { entities };
  });

  server.post<{
    Body: {
      form: {
        id: string;
        title: string;
        table: string;
        parentId?: string;
      };
    };
  }>("/api/entity/create", async (request) => {
    const { form } = request.body;
    await Sonamu.syncer.createEntity(
      form.id,
      form.parentId,
      form.table,
      form.title
    );

    return 1;
  });

  server.post<{
    Body: {
      entityId: string;
    };
  }>("/api/entity/del", async (request) => {
    const { entityId } = request.body;
    return Sonamu.syncer.delEntity(entityId);
  });

  server.post<{
    Body: {
      entityId: string;
      newValues: {
        title: string;
        table: string;
        parentId?: string;
      };
    };
  }>("/api/entity/modifyEntityBase", async (request) => {
    const { entityId, newValues } = request.body;
    const entity = EntityManager.get(entityId);
    entity.title = newValues.title;
    entity.table = newValues.table;
    entity.parentId = newValues.parentId;
    await entity.save();

    return 1;
  });

  server.post<{
    Body: {
      entityId: string;
      subsetKey: string;
      fields: string[];
    };
  }>("/api/entity/modifySubset", async (request) => {
    const { entityId, subsetKey, fields } = request.body;
    const entity = EntityManager.get(entityId);
    entity.subsets[subsetKey] = fields;
    await entity.save();

    return { updated: fields };
  });

  server.post<{
    Body: {
      entityId: string;
      subsetKey: string;
    };
  }>("/api/entity/delSubset", async (request) => {
    const { entityId, subsetKey } = request.body;
    const entity = EntityManager.get(entityId);
    delete entity.subsets[subsetKey];
    await entity.save();

    return 1;
  });

  server.post<{
    Body: {
      entityId: string;
      props: EntityProp[];
    };
  }>("/api/entity/modifyProps", async (request) => {
    const { entityId, props } = request.body;
    const entity = EntityManager.get(entityId);
    entity.props = props;
    await entity.save();

    return { updated: props };
  });

  server.post<{
    Body: {
      entityId: string;
      indexes: EntityIndex[];
    };
  }>("/api/entity/modifyIndexes", async (request) => {
    const { entityId, indexes } = request.body;
    const entity = EntityManager.get(entityId);
    entity.indexes = indexes;
    await entity.save();

    return { updated: indexes };
  });

  server.post<{
    Body: {
      entityId: string;
      enumLabels: Entity["enumLabels"];
    };
  }>("/api/entity/modifyEnumLabels", async (request) => {
    const { entityId, enumLabels } = request.body;
    const entity = EntityManager.get(entityId);
    entity.enumLabels = enumLabels;
    await entity.save();

    return { updated: enumLabels };
  });

  server.get<{
    Querystring: {
      entityId: string;
    };
  }>("/api/entity/getTableColumns", async (request) => {
    const { entityId } = request.query;
    const entity = EntityManager.get(entityId);
    const columns = await entity.getTableColumns();
    return { columns };
  });

  const migrator = new Migrator({
    mode: "dev",
  });
  server.get("/api/migrations/findMany", async () => {
    const connections = Object.entries(Sonamu.dbConfig).map(
      ([connKey, conn]) => {
        return {
          connKey,
          ...conn,
        };
      }
    );

    const list = await Promise.all(
      Object.keys(Sonamu.dbConfig).map(async (connKey) => {
        const knexOptions = Sonamu.dbConfig[connKey];
        const tConn = knex(knexOptions);

        const status = await (async () => {
          try {
            return tConn.migrate.status();
          } catch (err) {
            return "error";
          }
        })();

        const list = await (async () => {
          try {
            return tConn.migrate.list();
          } catch (err) {
            return [];
          }
        })();

        const currentVersion = await (async () => {
          try {
            return tConn.migrate.currentVersion();
          } catch (err) {
            return "error";
          }
        })();

        return {
          connKey,
          status,
          list,
          currentVersion,
        };
      })
    );

    return { list };
  });

  server.get("/api/all_routes", async () => {
    return {
      // apis: Sonamu.syncer.apis,
      models: Sonamu.syncer.models,
    };
  });

  server
    .listen(listen)
    .then(() => {
      console.log(
        `sonamu-ui API Server is listening on ${listen.host}:${listen.port}`
      );
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

/*
  필요 API 리스트

  1. 엔티티 관련
    - [R] 전체 엔티티 리스트
      - 각 엔티티별 props, indexes, enums, subsets
    - [C] 엔티티 Stub 생성
    - [U] 엔티티 수정
      - props 추가/수정/삭제
        - 프롭 타입별 입력 로직
      - indexes 추가/수정/삭제
        - 인덱스/유니크 각각 입력 로직
        - 컬럼명 쿼리 로직
      - enums 추가/수정/삭제
      - subsets 추가/수정/삭제
    - [D] 엔티티 삭제
  2. 모델/API 관련
    - [R] 전체 모델/API 리스트
      - 각 모델별 API 리스트
      - httpMethod, clients, path, guards, description 등
      - 각 모델을 HTTP 테스팅 할 수 있는 기능
    - [C] 모델 Scaffold 생성
  3. DB 마이그레이션 관련
    - [R] 전체 DB커넥션 설정 리스트
    - [R] 각 DB커넥션별 knex_migrations 리스트
    - [R] 전체 마이그레이션 파일 리스트
      - 마이그레이션 파일의 대상 테이블 및 설명(설명은 추가 필요)
      - 컴파일 상태 (TS/JS 기준 각각으로 뽑아 비교하여 추출)
    - [R] 현재 마이그레이션 모드 체크 (마이그레이션 파일 생성 모드 / 실행 모드)
    - 마이그레이션 생성
    - 마이그레이션 실행 (DB커넥션 복수 선택)
    - 마이그레이션 롤백 (DB커넥션 복수 선택)
  4. Scaffold/Stub 관련
    - Stub Practice
    - Stub Entity (위에 있음)
    - Scaffold Model (위에 있음)
    - Scaffold Component - List
    - Scaffold Component - Form
    - Scaffold Component - IdAsyncSelect
    - Scaffold Component - EnumsSelect

*/
