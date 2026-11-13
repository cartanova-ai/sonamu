// Imported by globalSetup in the main process as well as by test workers: no vitest runtime calls here.
export const OPENSEARCH_IMAGE_ENV = "SONAMU_OPENSEARCH_TEST_IMAGE";
export const POSTGRES_IMAGE_ENV = "SONAMU_OPENSEARCH_TEST_POSTGRES_IMAGE";

export const DEFAULT_OPENSEARCH_IMAGE = "opensearchproject/opensearch:3.5.0";
export const DEFAULT_POSTGRES_IMAGE = "public.ecr.aws/m9z8n2p9/cartanova/sonamu-postgres:latest";

export const SUPPORTED_OPENSEARCH_MIN = "3.5.0";
export const SUPPORTED_OPENSEARCH_MAX_EXCLUSIVE = "4.0.0";
export const SUPPORTED_POSTGRES_MAJOR = 18;
export const SUPPORTED_SDK_MIN = "3.9.0";
export const SUPPORTED_SDK_MAX_EXCLUSIVE = "4.0.0";

export const CONTAINER_LABEL_KEY = "dev.sonamu.test";
export const CONTAINER_LABEL_VALUE = "opensearch-kit";

export const TEST_ENVIRONMENT_KEY = "sonamuOpensearchTestEnvironment";

export type PostgresEndpoint = {
  image: string;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  url: string;
  containerId?: string;
  twinPort?: number;
};

export type OpenSearchEndpoint = {
  image: string;
  url: string;
};

export type TestEnvironment = {
  postgres: PostgresEndpoint;
  opensearch: OpenSearchEndpoint | null;
};

declare module "vitest" {
  export interface ProvidedContext {
    sonamuOpensearchTestEnvironment: TestEnvironment;
  }
}

function readImage(variable: string, fallback: string): string {
  const value = process.env[variable]?.trim();
  return value === undefined || value === "" ? fallback : value;
}

export function resolveOpenSearchImage(): string {
  return readImage(OPENSEARCH_IMAGE_ENV, DEFAULT_OPENSEARCH_IMAGE);
}

export function resolvePostgresImage(): string {
  return readImage(POSTGRES_IMAGE_ENV, DEFAULT_POSTGRES_IMAGE);
}

export type SemanticVersion = readonly [number, number, number];

export function parseSemanticVersion(value: string): SemanticVersion | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (match === null) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareSemanticVersions(left: SemanticVersion, right: SemanticVersion): number {
  for (let position = 0; position < 3; position += 1) {
    const difference = left[position] - right[position];
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

export function versionFromImageTag(image: string): string | null {
  const tag = image.slice(image.lastIndexOf(":") + 1);
  return parseSemanticVersion(tag) === null ? null : tag;
}
