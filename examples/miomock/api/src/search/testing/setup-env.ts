import { inject } from "vitest";

// The search runtime builds its handles when the models are imported, so OPENSEARCH_URL must be set first.
process.env.OPENSEARCH_URL = inject("opensearchUrl");
