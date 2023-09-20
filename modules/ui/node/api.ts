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
  console.log("migrator inialized");

  server.get("/api/migrations/status", async () => {
    const status = await migrator.getStatus();

    return { status };
  });

  server.post<{
    Body: {
      action: "latest" | "rollback" | "shadow";
      targets: string[];
    };
  }>(
    "/api/migrations/runAction",
    async (
      request
    ): Promise<
      {
        connKey: string;
        batchNo: number;
        applied: string[];
      }[]
    > => {
      const { action, targets } = request.body;

      if (action === "shadow") {
        return migrator.runShadowTest();
      } else {
        return migrator.runAction(action, targets);
      }
    }
  );

  server.post<{
    Body: {
      codeNames: string[];
    };
  }>("/api/migrations/delCodes", async (request) => {
    const { codeNames } = request.body;
    return await migrator.delCodes(codeNames);
  });

  server.post<{
    Body: {};
  }>("/api/migrations/generatePreparedCodes", async (request) => {
    return await migrator.generatePreparedCodes();
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
