import { describe, test, expect } from "vitest";
import { bootstrap } from "../../testing/bootstrap";
import { UserModel } from "./user.model";

bootstrap();
describe("UserModel", () => {
  test("should be defined", async () => {
    await expect(UserModel.findById("A", 1)).rejects.toThrow(
      "존재하지 않는 User"
    );
    expect(true).toBe(true);
  });

  test("should get my IP", async () => {
    expect(false).toBe(false);
  });
});
