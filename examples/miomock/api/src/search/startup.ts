import { isSearchEnabled } from "./switch";

/*
  Sonamu calls lifecycle.onStart only after listen, so writes arriving in between would fail with
  store-identity-uninitialized: the store identity is fixed in Fastify's onReady hook, which runs before listen.
  The runtime is imported lazily, so a disabled search loads nothing and sonamu.config.ts does not pull in the models.
*/

export async function initializeSearchStore(): Promise<void> {
  if (!isSearchEnabled()) {
    return;
  }
  const [{ getSearchRuntime }, { getSearchHandles }] = await Promise.all([
    import("./runtime"),
    import("./index"),
  ]);
  // Throws a configuration error kept from module evaluation.
  getSearchRuntime();
  await getSearchHandles()?.synchronization.initialize();
}

/** The lifecycle retries transient errors and lets the server start; configuration and schema errors are thrown. */
export async function startSearch(): Promise<void> {
  if (!isSearchEnabled()) {
    return;
  }
  const { getSearchRuntime } = await import("./runtime");
  await getSearchRuntime()?.lifecycle.onStart();
}

/** Ignores configuration errors so they never block shutdown. */
export async function stopSearch(): Promise<void> {
  if (!isSearchEnabled()) {
    return;
  }
  const [{ getSearchRuntime }, { closeSearchHandles }] = await Promise.all([
    import("./runtime"),
    import("./index"),
  ]);
  let lifecycle;
  try {
    lifecycle = getSearchRuntime()?.lifecycle;
  } catch {
    lifecycle = undefined;
  }
  await lifecycle?.onShutdown();
  await closeSearchHandles();
}
