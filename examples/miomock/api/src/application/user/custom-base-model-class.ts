import {
  BaseModelClass,
  DatabaseSchemaExtend,
  Puri,
  PuriWrapper,
  UnionExtractedTTables,
} from "sonamu";

export abstract class CustomBaseModelClass<
  TSubsetKey extends string,
  TSubsetMapping extends Record<TSubsetKey, any>,
  TSubsetQueries extends Record<
    TSubsetKey,
    (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => Puri<any, any, any>
  >,
> extends BaseModelClass {
  constructor(
    protected subsetQueries: Record<
      TSubsetKey,
      (qbWrapper: PuriWrapper<DatabaseSchemaExtend>) => Puri<any, any, any>
    >,
    protected subsetLoaders: Record<TSubsetKey, any>
  ) {
    super();
  }

  getSubsetQueries<T extends TSubsetKey>(subset: T) {
    const qb = this.subsetQueries[subset]?.(this.getPuri("r"));

    return {
      qb: qb as unknown as Puri<
        DatabaseSchemaExtend,
        UnionExtractedTTables<TSubsetKey, TSubsetQueries> & {
          NonAllowedAsSingleTable: { __fulltext__: true };
        },
        {}
      >,
      onSubset: <S extends TSubsetKey>(
        _specificSubset: S
      ): ReturnType<(typeof this.subsetQueries)[S]> => {
        return qb as unknown as ReturnType<(typeof this.subsetQueries)[S]>;
      },
    };
  }

  async executeSubsetQuery<T extends TSubsetKey>({
    subset,
    qb,
    params,
  }: {
    subset: T;
    qb: Puri<any, any, any>;
    params: {
      num: number;
      page: number;
    };
  }): Promise<{ rows: TSubsetMapping[T][]; total: number }> {
    const { num, page } = params;
    const unloadedRows = (await qb
      .limit(num)
      .offset(num * (page - 1))) as TSubsetMapping[T][];

    const total = 0;

    const loaders = this.subsetLoaders[subset];
    const loadedRows = await this.useLoaders(qb.knex, unloadedRows, loaders);

    const rows = this.hydrate(loadedRows) as TSubsetMapping[T][];

    return { rows, total };
  }
}
