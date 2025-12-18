import { workflow } from "sonamu";
import { UserModel } from "./user.model";
import { UserListParams } from "./user.types";

export const findAll = workflow({
  name: "find-all",
  schema: UserListParams,
  schedules: [
    {
      // 이름이 없으면 자동으로 워크플로우 이름 + 스케줄 expression으로 설정됩니다.
      name: "find-all-every-minute",
      // 초를 지원하는 cron 표현식입니다.
      expression: "0 * * * *",
      // 여기에는 값이 그대로 올 수도 있고, 함수와 비동기 함수 모두가 올 수 있습니다.
      input: () => {
        return {
          num: 10,
          page: 1,
        };
      },
    },
  ],
})(async ({ step, input }) => {
  const results = await step.get({ name: "find-all" }, UserModel, "findMany").run("A", input);
  await step.sleep("sleep-find-all", "1s");
  return results;
});
