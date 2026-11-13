import { type Client } from "@opensearch-project/opensearch";

import { indexMetaSchema } from "../../src/admin/remote-schemas";
import { readSearchIndexMeta, type SearchIndexMeta } from "../../src/definition/envelope";

// PUT _mapping replaces the whole _meta object; undefined removes store_id as on pre-version-2 indices.
export async function rewriteIndexStoreId(
  client: Client,
  physicalIndex: string,
  storeId: string | undefined,
): Promise<void> {
  const meta = await readIndexMeta(client, physicalIndex);
  const { store_id: _previous, ...rest } = meta;
  const next: SearchIndexMeta = storeId === undefined ? rest : { ...rest, store_id: storeId };
  await client.indices.putMapping({ index: physicalIndex, body: { _meta: { sonamu: next } } });
}

export async function readIndexMeta(
  client: Client,
  physicalIndex: string,
): Promise<SearchIndexMeta> {
  const response = await client.indices.getMapping({ index: physicalIndex });
  const meta = readSearchIndexMeta(indexMetaSchema.parse(response.body)[physicalIndex]?.mappings);
  if (meta === undefined) throw new Error(`${physicalIndex}에 _meta.sonamu가 없습니다.`);
  return meta;
}
