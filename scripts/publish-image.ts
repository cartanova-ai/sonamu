#! /usr/bin/env zx
import path from "node:path";

import { DescribeImagesCommand, ECRPUBLICClient } from "@aws-sdk/client-ecr-public";
import { $ } from "zx";

const AWS_ECR_REGISTRY_NAME = "cartanova/sonamu-postgres";
const AWS_ECR_PUBLIC_REGISTRY_URL = `public.ecr.aws/m9z8n2p9/${AWS_ECR_REGISTRY_NAME}`;
const GHCR_REGISTRY_URL = "ghcr.io/cartanova-ai/sonamu-postgres";

const { version } = await import("../package.json");
const client = new ECRPUBLICClient({
  // "us-east-1" is only supported for ECR Public.
  region: "us-east-1",
});

// ECR Public에 이미지가 배포되어 있는지 확인합니다.
async function isDeployedToEcr() {
  const command = new DescribeImagesCommand({
    repositoryName: AWS_ECR_REGISTRY_NAME,
  });

  const result = await client.send(command);

  if (result.imageDetails === undefined) {
    return false;
  }

  return result.imageDetails.some(
    (image) => image.imageTags?.some((tag) => tag === `v${version}`) ?? false,
  );
}

// GHCR에 이미지가 배포되어 있는지 확인합니다. 조회에 실패하면 미배포로 보고 복사를 다시 시도합니다(복사는 재실행해도 안전함).
async function isDeployedToGhcr() {
  const result = await $`docker buildx imagetools inspect ${GHCR_REGISTRY_URL}:v${version}`
    .nothrow()
    .quiet();

  return result.exitCode === 0;
}

// ECR Public에 이미지를 빌드해서 배포합니다.
async function deployToEcr() {
  await $`
    aws ecr-public get-login-password --region us-east-1 | \
    docker login --username AWS --password-stdin public.ecr.aws
  `;

  await $`
    docker buildx build \
      --push \
      --platform linux/amd64,linux/arm64 \
      --build-arg VERSION=${version} \
      --tag ${AWS_ECR_PUBLIC_REGISTRY_URL}:v${version} \
      --tag ${AWS_ECR_PUBLIC_REGISTRY_URL}:latest \
      --file ${path.join(import.meta.dirname, "..", "images", "postgres", "Dockerfile")} \
      ${path.join(import.meta.dirname, "..", "images", "postgres")}
  `;
}

// ECR에 올린 이미지를 고대로 복사해서 GHCR에도 올려요.
async function copyToGhcr() {
  await $`
    docker buildx imagetools create \
      --tag ${GHCR_REGISTRY_URL}:v${version} \
      --tag ${GHCR_REGISTRY_URL}:latest \
      ${AWS_ECR_PUBLIC_REGISTRY_URL}:v${version}
  `;
}

async function main() {
  console.log(`Checking if ${AWS_ECR_REGISTRY_NAME}:v${version} is deployed...`);
  const deployedToEcr = await isDeployedToEcr();
  const deployedToGhcr = await isDeployedToGhcr();

  if (deployedToEcr && deployedToGhcr) {
    console.log(`${AWS_ECR_REGISTRY_NAME}:v${version} is already deployed to ECR Public and GHCR`);
    return;
  }

  // 이전 실행이 ECR 배포 후 GHCR 복사에서 실패했다면, 재실행 시 복사만 다시 합니다.
  if (!deployedToEcr) {
    console.log(`Deploying ${AWS_ECR_REGISTRY_NAME}:v${version} to ECR Public...`);
    await deployToEcr();
  }

  console.log(`Copying ${AWS_ECR_REGISTRY_NAME}:v${version} to GHCR...`);
  await copyToGhcr();
}

await main();
