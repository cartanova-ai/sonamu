import { workflow } from "sonamu";
import z from "zod";

const InputSchema = z.object();

export const findAll = workflow({
  name: "find-all",
  schema: InputSchema,
  schedules: [
    {
      name: "find-all-every-minute",
      expression: "0 * * * * *",
      input: {},
    },
  ],
})(async ({ step, input }) => {
  console.log("find-all", "input", input);

  // FIXME: admin context를 넣어주도록 해야함.
  // const context = await step.get(Sonamu.getContext).run();
  // console.log("context", context);
});
