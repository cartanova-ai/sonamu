#! /usr/bin/env zx
import { DescribeImagesCommand, ECRPUBLICClient } from "@aws-sdk/client-ecr-public";
import { $ } from "zx";

const AWS_ECR_REGISTRY_NAME = "cartanova/sonamu-postgres";
const AWS_ECR_PUBLIC_REGISTRY_URL = `public.ecr.aws/m9z8n2p9/${AWS_ECR_REGISTRY_NAME}`;

const client = new ECRPUBLICClient({
  // "us-east-1" is only supported for ECR Public.
  region: "us-east-1",
});

const { version } = await import("../../package.json");
async function checkDeployed() {
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

async function deploy() {
  await $`aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws`;
  await $`docker build -t target .`;

  await Promise.allSettled(
    [`${AWS_ECR_PUBLIC_REGISTRY_URL}:latest`, `${AWS_ECR_PUBLIC_REGISTRY_URL}:v${version}`].map(
      async (tag) => {
        await $`docker tag target ${tag}`;
        await $`docker push ${tag}`;
        return tag;
      },
    ),
  );
}

async function main() {
  console.log(`Checking if ${AWS_ECR_REGISTRY_NAME}:v${version} is already deployed...`);
  const isDeployed = await checkDeployed();

  if (isDeployed) {
    console.log(`${AWS_ECR_REGISTRY_NAME}:v${version} is already deployed`);
    return;
  }

  console.log(`Deploying ${AWS_ECR_REGISTRY_NAME}:v${version}...`);
  await deploy();
}

main();
