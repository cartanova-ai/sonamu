#!/bin/bash

# Runs the @sonamu-kit/opensearch unit, type and integration tests. Needs Docker and built packages.
# The tests start their own PostgreSQL and OpenSearch containers (they create and drop roles), not the CI service.
# Override the images with SONAMU_OPENSEARCH_TEST_IMAGE and SONAMU_OPENSEARCH_TEST_POSTGRES_IMAGE.

set -euo pipefail

ENV_FILE=modules/opensearch/tests/helpers/env.ts

# Read the defaults from env.ts so they cannot drift from the tests.
read_default_image() {
  local NAME=$1
  local VALUE
  VALUE=$(sed -n "s/^export const ${NAME} = \"\(.*\)\";$/\1/p" "$ENV_FILE")
  if [ -z "$VALUE" ]; then
    echo "Error: could not read ${NAME} from ${ENV_FILE}"
    exit 1
  fi
  echo "$VALUE"
}

# testcontainers uses a local image as is, so the version printed below is the one the tests run against.
ensure_image() {
  local IMAGE=$1
  if ! docker image inspect "$IMAGE" &>/dev/null; then
    echo "Pulling $IMAGE..."
    docker pull -q "$IMAGE"
  fi
}

if ! docker info &>/dev/null; then
  echo "Error: Docker is not available. testcontainers needs a running Docker daemon."
  exit 1
fi

OPENSEARCH_IMAGE=${SONAMU_OPENSEARCH_TEST_IMAGE:-$(read_default_image DEFAULT_OPENSEARCH_IMAGE)}
POSTGRES_IMAGE=${SONAMU_OPENSEARCH_TEST_POSTGRES_IMAGE:-$(read_default_image DEFAULT_POSTGRES_IMAGE)}
export SONAMU_OPENSEARCH_TEST_IMAGE="$OPENSEARCH_IMAGE"
export SONAMU_OPENSEARCH_TEST_POSTGRES_IMAGE="$POSTGRES_IMAGE"

ensure_image "$OPENSEARCH_IMAGE"
ensure_image "$POSTGRES_IMAGE"

OPENSEARCH_VERSION=$(docker run --rm --entrypoint /usr/share/opensearch/bin/opensearch "$OPENSEARCH_IMAGE" --version 2>/dev/null | grep '^Version:' || true)
POSTGRES_VERSION=$(docker run --rm --entrypoint postgres "$POSTGRES_IMAGE" --version)
echo "OpenSearch image: $OPENSEARCH_IMAGE (${OPENSEARCH_VERSION:-version unknown})"
echo "PostgreSQL image: $POSTGRES_IMAGE ($POSTGRES_VERSION)"

# Also runs the type tests in tests/types.
mise exec -- pnpm --filter @sonamu-kit/opensearch test:unit

# Runs the integration and sonamu projects together so they share the containers.
mise exec -- pnpm --filter @sonamu-kit/opensearch test:integration

echo "OpenSearch integration tests passed with ${OPENSEARCH_VERSION:-$OPENSEARCH_IMAGE}"
