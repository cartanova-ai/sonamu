import chalk from "chalk";

import { runAgentsInit } from "./agents-init.js";
import { runContractInit } from "./contract-init.js";

export function runCddInit(force: boolean): void {
  console.log(chalk.bold("── agents init ──────────────────────────────"));
  runAgentsInit(force);

  console.log(chalk.bold("\n── contract init ────────────────────────────"));
  runContractInit(force);
}
