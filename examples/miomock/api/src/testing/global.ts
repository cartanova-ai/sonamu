import { FixtureManager } from "sonamu";

import dotenv from "dotenv";
dotenv.config();

export async function setup() {
  return async function teardown() {
    await FixtureManager.destroy();
  };
}
