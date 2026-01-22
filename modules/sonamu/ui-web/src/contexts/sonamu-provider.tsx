import { type SonamuContextValue, SonamuProvider } from "@sonamu-kit/react-components";
import type { ReactNode } from "react";
import { type UiWebDictionary, useSD } from "../i18n";

export function createSonamuConfig(): SonamuContextValue<UiWebDictionary> {
  return { SD: useSD() };
}

export function SonamuProviderWrapper({ children }: { children: ReactNode }) {
  const sonamuConfig = createSonamuConfig();
  return <SonamuProvider<UiWebDictionary> {...sonamuConfig}>{children}</SonamuProvider>;
}
