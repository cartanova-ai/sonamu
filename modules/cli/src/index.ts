import { runSonamuCli, type RunSonamuCliOptions } from "./runtime.js";

export function main(options?: RunSonamuCliOptions) {
  return runSonamuCli(options);
}
