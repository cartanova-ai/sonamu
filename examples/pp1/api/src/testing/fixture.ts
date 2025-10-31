import { loginContext } from "./bootstrap";

const fixtureLoader = {
  // 컨텍스트: 어드민
  ctxAdmin: () => loginContext(1),
};

export async function loadFixtures<K extends keyof typeof fixtureLoader>(
  names: K[]
): Promise<{
  [P in K]: Awaited<ReturnType<(typeof fixtureLoader)[P]>>;
}> {
  return Object.fromEntries(
    await Promise.all(
      names.map(async (name) => {
        return [name, await fixtureLoader[name]()];
      })
    )
  );
}
