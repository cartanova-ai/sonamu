import { afterEach, beforeAll } from "vitest";
import { migrate, stopBackend } from "./connection";

beforeAll(async () => {
  await migrate();
});

afterEach(async () => {
  await stopBackend();
});
