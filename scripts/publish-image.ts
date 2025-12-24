#! /usr/bin/env zx
import path from "node:path";
import { DescribeImagesCommand, ECRPUBLICClient } from "@aws-sdk/client-ecr-public";
import { $ } from "zx";

const AWS_ECR_REGISTRY_NAME = "cartanova/sonamu-postgres";
const AWS_ECR_PUBLIC_REGISTRY_URL = `public.ecr.aws/m9z8n2p9/${AWS_ECR_REGISTRY_NAME}`;

const { version } = await import("../package.json");
const client = new ECRPUBLICClient({
  // "us-east-1" is only supported for ECR Public.
  region: "us-east-1",
});

// ECR Public에 이미지가 배포되어 있는지 확인합니다.
async function isDeployed() {
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

// ECR Public에 이미지를 배포합니다.
async function deploy() {
  await $`
    aws ecr-public get-login-password --region us-east-1 | \
    docker login --username AWS --password-stdin public.ecr.aws
  `;

  await $`
    docker buildx build \
      --push \
      --platform linux/amd64,linux/arm64 \
      --tag ${AWS_ECR_PUBLIC_REGISTRY_URL}:v${version} \
      --tag ${AWS_ECR_PUBLIC_REGISTRY_URL}:latest \
      --file ${path.join(import.meta.dirname, "..", "images", "postgres", "Dockerfile")} \
      ${path.join(import.meta.dirname, "..", "images", "postgres")}
  `;
}

async function main() {
  console.log(`Checking if ${AWS_ECR_REGISTRY_NAME}:v${version} is deployed...`);
  if (await isDeployed()) {
    console.log(`${AWS_ECR_REGISTRY_NAME}:v${version} is already deployed`);
    return;
  }

  console.log(`Deploying ${AWS_ECR_REGISTRY_NAME}:v${version}...`);
  await deploy();
}

await main();
