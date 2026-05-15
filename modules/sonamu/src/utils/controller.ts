import {
  isDevelopmentEnvironment,
  isProductionEnvironment,
  isStagingEnvironment,
  isTestEnvironment,
} from "../env";

export function isLocal(): boolean {
  return isDevelopmentEnvironment() || isTestEnvironment();
}
export function isRemote(): boolean {
  return isStagingEnvironment() || isProductionEnvironment();
}
export function isInDocker(): boolean {
  return process.env.SONAMU_IN_DOCKER === "true" || process.env.SONAMU_IN_DOCKER === "1";
}
export function isDaemonServer(): boolean {
  return process.env.NODE_TYPE === "daemon";
}
export function isDevelopment(): boolean {
  return isDevelopmentEnvironment();
}
export function isStaging(): boolean {
  return isStagingEnvironment();
}
export function isProduction(): boolean {
  return isProductionEnvironment();
}
export function isTest(): boolean {
  return isTestEnvironment();
}
export function isHotReloadServer(): boolean {
  return process.env.HOT === "yes";
}
