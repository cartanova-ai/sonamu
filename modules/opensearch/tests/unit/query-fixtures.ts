// Shared by the query tests; importing a test file would register its tests again.
import { createSearchClient, type SearchClient } from "../../src/client/search-client";
import { SearchError } from "../../src/errors";
import { type ReadTarget, type SearchCatalogReader } from "../../src/query/catalog";
import {
  createGuardedSearchQueries,
  type CursorSigningKey,
  type SearchQueries,
  type SearchQueriesHooks,
  type SearchQueriesOptions,
} from "../../src/query/search-queries";
import {
  createFakeCatalog,
  createFakeOpenSearch,
  createTestReadHead,
  createTestReadTarget,
  type FakeCatalog,
  type FakeOpenSearch,
  TEST_READ_LIFETIMES,
} from "../../src/testing";

export const NAMESPACE = "t-unit";
export const LOGICAL_KEY = "chat-messages";
export const TARGET_ID = "11111111-1111-4111-8111-111111111111";
export const NEXT_TARGET_ID = "22222222-2222-4222-8222-222222222222";
export const FINGERPRINT = "a".repeat(64);
export const NEXT_FINGERPRINT = "b".repeat(64);
export const SIGNING_KEY: CursorSigningKey = { id: "k1", secret: new Uint8Array(32).fill(7) };
export const ROTATED_KEY: CursorSigningKey = { id: "k2", secret: new Uint8Array(32).fill(9) };
export const QUERY_LIMITS = { ...TEST_READ_LIFETIMES, maxPageSize: 50, timeoutMs: 5_000 };

export interface Message {
  [key: string]: string | number;
  body: string;
  roomId: string;
  seq: number;
}

export interface SeedDocument {
  id: string;
  revision: number;
  deleted?: boolean;
  doc?: Message;
}

interface SeedEnvelope {
  sonamu_meta: {
    deleted: boolean;
    revision: number;
    hash_version: string;
    projection_hash: string;
  };
  doc?: Message;
}

// Writes documents in envelope form, creating the index and write alias if missing.
export async function seedIndex(
  fake: FakeOpenSearch,
  physicalIndex: string,
  documents: readonly SeedDocument[],
): Promise<void> {
  const alias = `${physicalIndex}-w`;
  if (fake.documents(physicalIndex).size === 0) {
    await fake.client.transport
      .request({ method: "PUT", path: `/${physicalIndex}`, body: { aliases: { [alias]: {} } } })
      .catch(() => undefined);
  }
  const lines = documents.flatMap((document) => {
    const envelope: SeedEnvelope = {
      sonamu_meta: {
        deleted: document.deleted === true,
        revision: document.revision,
        hash_version: "sonamu-c14n-v1",
        projection_hash: "0".repeat(64),
      },
    };
    if (document.doc !== undefined) envelope.doc = document.doc;
    return [
      JSON.stringify({
        index: { _id: document.id, version: document.revision, version_type: "external" },
      }),
      JSON.stringify(envelope),
    ];
  });
  await fake.client.transport.request({
    method: "POST",
    path: `/${alias}/_bulk`,
    bulkBody: `${lines.join("\n")}\n`,
    querystring: { require_alias: "true" },
  });
}

// Message documents with seq from..from+count-1.
export function messages(count: number, from = 1): SeedDocument[] {
  return Array.from({ length: count }, (_, offset) => {
    const seq = from + offset;
    return {
      id: `m${String(seq).padStart(4, "0")}`,
      revision: 1,
      doc: { body: `message ${seq}`, roomId: seq % 2 === 0 ? "even" : "odd", seq },
    };
  });
}

export interface QueryHarness {
  fake: FakeOpenSearch;
  catalog: FakeCatalog;
  client: SearchClient;
  target: ReadTarget;
  queries: SearchQueries<Message>;
}

export interface QueryHarnessOptions {
  overrides?: Partial<SearchQueriesOptions>;
  hooks?: SearchQueriesHooks;
  catalog?: (fake: FakeCatalog) => SearchCatalogReader;
  documents?: readonly SeedDocument[];
}

export async function createQueryHarness(options: QueryHarnessOptions = {}): Promise<QueryHarness> {
  const fake = createFakeOpenSearch();
  const target = createTestReadTarget({
    namespace: NAMESPACE,
    logicalKey: LOGICAL_KEY,
    targetId: TARGET_ID,
    fingerprint: FINGERPRINT,
  });
  const catalog = createFakeCatalog([createTestReadHead({ logicalKey: LOGICAL_KEY, target })]);
  await seedIndex(fake, target.physicalIndex, options.documents ?? messages(25));
  const client = createSearchClient({
    createClient: () => fake.client,
    ownsClient: false,
    requestTimeoutMs: 5_000,
  });
  const queries = createGuardedSearchQueries<Message>(
    {
      client,
      catalog: options.catalog === undefined ? catalog : options.catalog(catalog),
      logicalKey: LOGICAL_KEY,
      supportedFingerprints: [FINGERPRINT],
      limits: QUERY_LIMITS,
      cursor: { signingKeys: [SIGNING_KEY] },
      ...options.overrides,
    },
    options.hooks ?? {},
  );
  return { fake, catalog, client, target, queries };
}

export async function searchErrorOf<T>(promise: Promise<T>): Promise<SearchError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SearchError) return error;
    throw error;
  }
  throw new Error("거부되지 않았습니다.");
}

export function thrownSearchError<T>(run: () => T): SearchError {
  try {
    run();
  } catch (error) {
    if (error instanceof SearchError) return error;
    throw error;
  }
  throw new Error("오류가 발생하지 않았습니다.");
}

export function sortedBody(size: number) {
  return { query: { match_all: {} }, sort: [{ "doc.seq": "asc" as const }], size };
}
