import {
  assertBackoffPolicy,
  backoffDelayMs,
  type BackoffPolicy,
  type RandomSource,
} from "./backoff";

// Process-local and never copied into a released row's available_at, so workers with working credentials take
// released rows at once. An expired entry keeps its failure count until a success, so delays keep growing. The
// start() loop and direct drainOnce() calls must share one registry per indexer.

export type CooldownKey =
  | { readonly scope: "client" }
  | { readonly scope: "database" }
  | { readonly scope: "target"; readonly targetId: string };

export interface CooldownEntry {
  readonly until: number;
  readonly failures: number;
}

export interface CooldownOptions {
  readonly now?: () => number;
  readonly random?: RandomSource;
}

export interface CooldownEnterOptions {
  readonly atMaximum?: boolean;
}

export interface DrainGate {
  readonly blocked: boolean;
  readonly remainingMs: number;
}

export interface CooldownRegistry {
  enter(key: CooldownKey, options?: CooldownEnterOptions): number;
  clear(key: CooldownKey): void;
  remainingMs(key: CooldownKey): number;
  isActive(key: CooldownKey): boolean;
  entry(key: CooldownKey): CooldownEntry | undefined;
  drainGate(): DrainGate;
  coolingTargets(): string[];
  retainTargets(live: ReadonlySet<string>): void;
  size(): number;
  earliestExpiryMs(): number;
}

function keyOf(key: CooldownKey): string {
  return key.scope === "target" ? `target:${key.targetId}` : key.scope;
}

export function createCooldownRegistry(
  policy: BackoffPolicy,
  options: CooldownOptions = {},
): CooldownRegistry {
  assertBackoffPolicy(policy);
  const now = options.now ?? (() => performance.now());
  const random = options.random ?? Math.random;
  const entries = new Map<string, CooldownEntry & { readonly key: CooldownKey }>();

  function remaining(id: string, at: number): number {
    const current = entries.get(id);
    return current === undefined ? 0 : Math.max(0, current.until - at);
  }

  return {
    enter(key, enterOptions = {}) {
      const id = keyOf(key);
      const at = now();
      const failures = entries.get(id)?.failures ?? 0;
      const delay =
        enterOptions.atMaximum === true
          ? policy.maxDelayMs
          : backoffDelayMs(policy, failures, random);
      const previousUntil = entries.get(id)?.until ?? at;
      // A shorter failure never shortens a cooldown that already ends later (the maximum delay after a 401).
      entries.set(id, { key, until: Math.max(previousUntil, at + delay), failures: failures + 1 });
      return remaining(id, at);
    },
    clear(key) {
      entries.delete(keyOf(key));
    },
    remainingMs(key) {
      return remaining(keyOf(key), now());
    },
    isActive(key) {
      return remaining(keyOf(key), now()) > 0;
    },
    entry(key) {
      const current = entries.get(keyOf(key));
      return current === undefined
        ? undefined
        : { until: current.until, failures: current.failures };
    },
    drainGate() {
      const at = now();
      const remainingMs = Math.max(remaining("client", at), remaining("database", at));
      return { blocked: remainingMs > 0, remainingMs };
    },
    coolingTargets() {
      const at = now();
      const ids: string[] = [];
      for (const current of entries.values()) {
        if (current.key.scope === "target" && current.until > at) ids.push(current.key.targetId);
      }
      return ids.toSorted();
    },
    retainTargets(live) {
      const at = now();
      for (const [id, current] of entries) {
        if (current.key.scope !== "target" || live.has(current.key.targetId)) continue;
        if (current.until <= at) entries.delete(id);
      }
    },
    size() {
      return entries.size;
    },
    earliestExpiryMs() {
      const at = now();
      let earliest = 0;
      for (const current of entries.values()) {
        const left = current.until - at;
        if (left > 0 && (earliest === 0 || left < earliest)) earliest = left;
      }
      return earliest;
    },
  };
}
