export function isLocal(): boolean {
  return process.env.LR === undefined || process.env.LR === "local";
}
export function isRemote(): boolean {
  return process.env.LR === "remote";
}
export function isInDocker(): boolean {
  return process.env.LR !== undefined;
}
export function isDaemonServer(): boolean {
  return process.env.NODE_TYPE === "daemon";
}
export function isDevelopment(): boolean {
  return isRemote() && process.env.NODE_ENV === "development";
}
export function isStaging(): boolean {
  return isRemote() && process.env.NODE_ENV === "staging";
}
export function isProduction(): boolean {
  return isRemote() && process.env.NODE_ENV === "production";
}
export function isTest(): boolean {
  return isLocal() && process.env.NODE_ENV === "test";
}
