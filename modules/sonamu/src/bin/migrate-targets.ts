import { type SonamuDBConfig } from "../database/db";
import { getSonamuEnvironment } from "../env";

export function getMigrateRunTargets(): (keyof SonamuDBConfig)[] {
  const environment = getSonamuEnvironment();
  return environment === "test" ? ["test", "fixture"] : [environment];
}
