import { FixtureManager } from "sonamu";

export async function setup() {
  return async function teardown() {
    await FixtureManager.destory();
  };
}
