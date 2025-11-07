import { Sonamu } from "sonamu";
import { EmployeeModel } from "../application/employee/employee.model";

// 예시 케이스: Sonamu.runScript() 를 사용하면 init-destroy 를 자동으로 처리합니다.
Sonamu.runScript(async () => {
  console.log("Hello, world!");
  await useDB();
});

// 예시 케이스: Sonamu.init() 을 사용하고 내부에서 커넥션이 있는 상태에서 명시적 destory (없으면 hang)
// async function bootstrap() {
//   await Sonamu.init(false, false);
//   console.log("Hello, world!");
//   await useDB();
// }
// bootstrap().finally(async () => {
//   await Sonamu.destroy();
// });

async function useDB() {
  const { rows } = await EmployeeModel.findMany("A", {
    num: 10,
    page: 1,
  });
  return rows;
}
