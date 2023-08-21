import { clone } from "lodash";
import { DateTime } from "luxon";
import { Context, FixtureManager, Sonamu } from "sonamu";
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest";
import { UserSubsetSS } from "../application/user/user.generated";
import { UserModel } from "../application/user/user.model";

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
  return {
    ...clone(mockedContext),
    user: await UserModel.findById("SS", userId),
  };
}
