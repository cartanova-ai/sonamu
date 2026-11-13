import { randomBytes } from "node:crypto";

import { type CursorSigningKey, type SearchClient } from "@sonamu-kit/opensearch";
import {
  createPostgresSynchronization,
  type PostgresSynchronization,
} from "@sonamu-kit/opensearch/postgres";
import {
  createSonamuSynchronization,
  resolveSonamuPrimary,
  type SonamuSearchSynchronization,
} from "@sonamu-kit/opensearch/sonamu";

import { createMiomockSearchClient } from "./client";
import { isSearchEnabled } from "./switch";

// Definitions, queries and the lifecycle live in runtime.ts to break the model -> search -> model import cycle.

export { isSearchEnabled, isSearchWorkerEnabled } from "./switch";

export const SEARCH_NAMESPACE = "miomock";

export type MiomockSearchHandles = {
  readonly url: string;
  readonly client: SearchClient;
  readonly synchronization: PostgresSynchronization;
  readonly sonamu: SonamuSearchSynchronization;
  readonly cursorSigningKey: CursorSigningKey;
};

let handles: MiomockSearchHandles | undefined;

export function requireOpenSearchUrl(): string {
  const url = process.env.OPENSEARCH_URL;
  if (url === undefined || url === "") {
    throw new Error("OPENSEARCH_URL is required when MIOMOCK_SEARCH_ENABLED=true.");
  }
  return url;
}

/** Must differ per environment; processes configured with another name than the recorded one stop remote work. */
export function searchInstanceName(): string | undefined {
  const name = process.env.MIOMOCK_SEARCH_INSTANCE_NAME;
  return name === undefined || name === "" ? undefined : name;
}

export function createMiomockSynchronization(): PostgresSynchronization {
  return createPostgresSynchronization({
    getPrimaryDatabase: resolveSonamuPrimary,
    namespace: SEARCH_NAMESPACE,
    instanceName: searchInstanceName(),
  });
}

/** Without a secret each process gets a random key, so cursors do not survive a restart; production refuses that. */
function cursorSigningKey(): CursorSigningKey {
  const encoded = process.env.MIOMOCK_SEARCH_CURSOR_SECRET;
  if (encoded === undefined || encoded === "") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("MIOMOCK_SEARCH_CURSOR_SECRET is required in production.");
    }
    return { id: "process", secret: randomBytes(32) };
  }
  const secret = Buffer.from(encoded, "base64");
  if (secret.length < 32) {
    throw new Error("MIOMOCK_SEARCH_CURSOR_SECRET must decode to at least 32 bytes.");
  }
  return { id: "env", secret };
}

/** Undefined while search is disabled; creating the handles opens no connection. */
export function getSearchHandles(): MiomockSearchHandles | undefined {
  if (!isSearchEnabled()) {
    return undefined;
  }
  if (handles === undefined) {
    const url = requireOpenSearchUrl();
    const synchronization = createMiomockSynchronization();
    handles = Object.freeze({
      url,
      client: createMiomockSearchClient(url),
      synchronization,
      sonamu: createSonamuSynchronization(synchronization),
      cursorSigningKey: cursorSigningKey(),
    });
  }
  return handles;
}

export async function closeSearchHandles(): Promise<void> {
  const current = handles;
  handles = undefined;
  await current?.client.close();
}
