import { api, BaseModelClass } from "sonamu";

import { type SyncFixtureSubsetKey, type SyncFixtureSubsetMapping } from "../sonamu.generated";
import { syncFixtureLoaderQueries, syncFixtureSubsetQueries } from "../sonamu.generated.sso";
import { SyncFixtureModel } from "./sync-fixture.model";

class SyncFixtureSubModelClass extends BaseModelClass<
  SyncFixtureSubsetKey,
  SyncFixtureSubsetMapping,
  typeof syncFixtureSubsetQueries,
  typeof syncFixtureLoaderQueries
> {
  constructor() {
    super("SyncFixtureSub", syncFixtureSubsetQueries, syncFixtureLoaderQueries);
  }

  @api({ httpMethod: "GET", clients: ["axios", "tanstack-query"], resourceName: "SyncFixtureSub" })
  async findById<T extends SyncFixtureSubsetKey>(
    subset: T,
    id: number,
  ): Promise<SyncFixtureSubsetMapping[T]> {
    return SyncFixtureModel.findById(subset, id);
  }
}

export const SyncFixtureSubModel = new SyncFixtureSubModelClass();
