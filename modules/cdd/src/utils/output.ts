export interface OutputResult {
  data: unknown;
  pretty: () => void;
  exitCode?: number;
}

export type OutputMode = "raw" | "pretty";

export function getOutputMode(rawFlag: boolean): OutputMode {
  if (rawFlag) return "raw";
  if (!process.stdout.isTTY) return "raw";
  if (process.env.NO_COLOR || process.env.TERM === "dumb" || process.env.CI) return "raw";
  return "pretty";
}

export function printOutput(result: OutputResult, rawFlag: boolean): void {
  const mode = getOutputMode(rawFlag);
  if (mode === "raw") {
    console.log(JSON.stringify(result.data));
  } else {
    result.pretty();
  }
}
