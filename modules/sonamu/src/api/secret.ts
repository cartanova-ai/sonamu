export type SonamuSecrets = {
  anthropic_api_key?: string;
  voyage_api_key?: string;
  openai_api_key?: string;
};

export function getSecrets(): SonamuSecrets {
  const secrets: SonamuSecrets = {};
  const secretKeys: (keyof SonamuSecrets)[] = [
    "anthropic_api_key",
    "voyage_api_key",
    "openai_api_key",
  ] as const;

  for (const key of secretKeys) {
    const envKey = key.toUpperCase();
    if (envKey in process.env) {
      secrets[key] = process.env[envKey];
    }
  }

  return secrets;
}
