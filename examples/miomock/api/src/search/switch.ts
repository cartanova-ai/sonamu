// Imports nothing, so sonamu.config.ts can read the switch without loading the package.

export function isSearchEnabled(): boolean {
  return process.env.MIOMOCK_SEARCH_ENABLED === "true";
}

/** Ignored while search is disabled. */
export function isSearchWorkerEnabled(): boolean {
  return process.env.MIOMOCK_SEARCH_WORKER === "true";
}
