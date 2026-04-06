import { SonamuProvider, useSonamuBaseContext } from "@sonamu-kit/react-components";
import { type SonamuContextValue } from "@sonamu-kit/react-components";
import { type ReactNode } from "react";

import { useSD } from "../i18n";
import { type UiWebDictionary } from "../i18n";

export function createSonamuConfig(): SonamuContextValue<UiWebDictionary> {
  return { SD: useSD() };
}

export function SonamuProviderWrapper({ children }: { children: ReactNode }) {
  const sonamuConfig = createSonamuConfig();
  return <SonamuProvider<UiWebDictionary> {...sonamuConfig}>{children}</SonamuProvider>;
}

export function useSonamuContext() {
  return useSonamuBaseContext<UiWebDictionary>();
}
