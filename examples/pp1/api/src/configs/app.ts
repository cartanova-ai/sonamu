import { isDevelopment, isLocal, isStaging } from "sonamu";

export const appConfig = {
  getHostName: (): string => {
    if (isLocal()) {
      return "local.f9dev.kr";
    }

    if (isDevelopment()) {
      return "dev.f9dev.kr";
    } else if (isStaging()) {
      return "staging.f9dev.kr";
    } else {
      return "www.f9dev.kr";
    }
  },

  getApiPrefix: (): string => {
    return `http://${appConfig.getHostName()}/api`;
  },
};
