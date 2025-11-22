import dotenv from "dotenv";

dotenv.config();

export async function setup() {
  return async function teardown() {};
}
