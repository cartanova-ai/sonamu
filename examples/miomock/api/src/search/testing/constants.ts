declare module "vitest" {
  export interface ProvidedContext {
    opensearchUrl: string;
  }
}

export const SEARCH_IT_DATABASE = "miomock_search_it";

/** Never adopted by the setup; store-binding.search.test.ts renames it, so teardown drops both names. */
export const SEARCH_IT_COPY_DATABASE = "miomock_search_it_copy";
export const SEARCH_IT_RENAMED_COPY_DATABASE = "miomock_search_it_copy_moved";

export const SEARCH_IT_TEMPLATE_DATABASE = "miomock_test";

export const DEFAULT_OPENSEARCH_IMAGE = "opensearchproject/opensearch:3.5.0";
