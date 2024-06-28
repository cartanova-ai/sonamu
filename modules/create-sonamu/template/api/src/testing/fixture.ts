const fixtureLoader = {
  // 아래와 같이 fixture를 정의합니다.
  fixture: async () => {},
};

export async function loadFixtures<K extends keyof typeof fixtureLoader>(
  names: K[],
): Promise<{
  [P in K]: Awaited<ReturnType<(typeof fixtureLoader)[P]>>;
}> {
  return Object.fromEntries(
    await Promise.all(
      names.map(async (name) => {
        return [name, await fixtureLoader[name]()];
      }),
    ),
  );
}
