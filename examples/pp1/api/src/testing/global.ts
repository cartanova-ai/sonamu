import { FixtureManager } from "sonamu";
require("dotenv").config();

export async function setup() {
  return async function teardown() {
    await FixtureManager.destory();
  };
}
