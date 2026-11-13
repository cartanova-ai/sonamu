import { Sonamu } from "sonamu";
import { z } from "zod";

import { adoptDefaultSearchLocale, getSearchLocale, isSearchLocaleExplicit } from "../i18n";

const sonamuI18nSchema = z.object({
  i18n: z.object({ defaultLocale: z.string() }).optional(),
});

let applied = false;

// Runs at the first operation, not at import: Sonamu.config is unset (its getter throws) until Sonamu initializes.
export function applySonamuDefaultLocale(): string {
  if (applied) return getSearchLocale();
  let config: z.output<typeof sonamuI18nSchema>;
  try {
    const parsed = sonamuI18nSchema.safeParse(Sonamu.config);
    if (!parsed.success) {
      applied = true;
      return getSearchLocale();
    }
    config = parsed.data;
  } catch {
    return getSearchLocale();
  }
  applied = true;
  const defaultLocale = config.i18n?.defaultLocale;
  if (defaultLocale !== undefined && !isSearchLocaleExplicit()) {
    adoptDefaultSearchLocale(defaultLocale);
  }
  return getSearchLocale();
}
