import { type JsonObject } from "../../src/definition/canonical-json";

// The documentation quotes these roles verbatim. least-privilege-opensearch.test.ts runs every handle operation under
// its role and shows that removing any one permission makes a package request fail with 403.
export const LEAST_PRIVILEGE_ROLES = {
  sonamu_admin: {
    cluster_permissions: [
      "cluster:monitor/nodes/info",
      "cluster:monitor/nodes/stats",
      "cluster:monitor/state",
      "indices:data/read/mget",
      "indices:data/write/bulk",
    ],
    index_permissions: [
      {
        index_patterns: ["snm-*"],
        allowed_actions: [
          "indices:admin/create",
          "indices:admin/delete",
          "indices:admin/aliases",
          "indices:admin/aliases/get",
          "indices:admin/mappings/get",
          "indices:admin/refresh*",
          "indices:monitor/stats",
          "indices:data/read/mget*",
          "indices:data/write/bulk*",
          "indices:data/write/index",
          "indices:data/read/search*",
          "indices:data/read/point_in_time/create",
          "indices:data/read/point_in_time/delete",
        ],
      },
    ],
  },
  sonamu_worker: {
    cluster_permissions: ["indices:data/write/bulk", "indices:data/read/mget"],
    index_permissions: [
      {
        index_patterns: ["snm-*"],
        allowed_actions: [
          "indices:data/write/bulk*",
          "indices:data/write/index",
          "indices:data/read/mget*",
        ],
      },
    ],
  },
  sonamu_query: {
    cluster_permissions: [],
    index_permissions: [
      {
        index_patterns: ["snm-*"],
        allowed_actions: [
          "indices:data/read/search*",
          "indices:data/read/point_in_time/create",
          "indices:data/read/point_in_time/delete",
        ],
      },
    ],
  },
} as const satisfies Record<string, JsonObject>;

export type LeastPrivilegeRole = keyof typeof LEAST_PRIVILEGE_ROLES;

// From 3.9.0 the security plugin also checks bulk and mget at cluster level; 3.5.0 allows them without.
export const CLUSTER_PERMISSIONS_REQUIRED_FROM: ReadonlyMap<string, string> = new Map([
  ["indices:data/read/mget", "3.9.0"],
  ["indices:data/write/bulk", "3.9.0"],
]);
