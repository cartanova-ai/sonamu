import { describe, test, expect } from "vitest";
import { bootstrap } from "../../testing/bootstrap";
import { PostModel } from "./post.model";

bootstrap(["users", "posts"]);
describe("PostModelTest", () => {
  test("등록/수정", async () => {
    await PostModel.getDB("w");
    expect(true).toBe(true);
  });
});
