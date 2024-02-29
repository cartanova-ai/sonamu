import { clone } from "lodash";
import { DateTime } from "luxon";
import { Context, FixtureManager, Sonamu } from "sonamu";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";
import { UserSubsetSS } from "../application/sonamu.generated";

export function bootstrap(tableNames?: string[]) {
  beforeAll(async () => {
    await Sonamu.init(true);
    FixtureManager.init();
  });
  beforeEach(async () => {
    await FixtureManager.cleanAndSeed(tableNames);
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  afterAll(() => {
    vi.restoreAllMocks();
  });
}

export const mockedContext: Context = {
  ip: "200.12.34.56",
  passport: {
    login: vi.fn().mockImplementation((_user: UserSubsetSS) => {}),
    logout: vi.fn().mockImplementation(() => {}),
  },
  now: () => DateTime.local().toSQL().slice(0, 19),
  user: null,
} as unknown as Context;

export async function loginContext(userId: number) {
  const { UserModel } = await import(
    "../application/user/user.model?ver=2" as string
  );

  return {
    ...clone(mockedContext),
    user: await UserModel.findById("SS", userId),
  };
}
