import { SonamuProvider, type SonamuContextValue } from "@sonamu-kit/react-components";
import type { ReactNode } from "react";

// Temporary type until sd.generated is created
type EmptyDictionary = Record<string, never>;

export function createSonamuConfig(): SonamuContextValue<EmptyDictionary> {
  // Auth configuration
  const auth_config = {
    user: null,
    loading: false,
    login: async (_loginParams: any) => {
      // TODO: Implement login logic
      console.log("Login not implemented yet");
    },
    logout: async () => {
      // TODO: Implement logout logic
      console.log("Logout not implemented yet");
    },
    refetch: async () => {
      // TODO: Implement refetch logic
    },
  };

  // Uploader configuration
  const uploader_config = async (_files: File[]) => {
    // TODO: Implement file upload logic
    console.log("File upload not implemented yet");
    return [];
  };

  // SD configuration - returns key as-is until i18n is set up
  const sd_config = (key: string): any => key;

  return { auth: auth_config, uploader: uploader_config, SD: sd_config };
}

export function SonamuProviderWrapper({ children }: { children: ReactNode }) {
  const sonamuConfig = createSonamuConfig();
  return <SonamuProvider<EmptyDictionary> {...sonamuConfig}>{children}</SonamuProvider>;
}
