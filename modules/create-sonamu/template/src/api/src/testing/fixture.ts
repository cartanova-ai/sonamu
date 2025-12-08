const fixtureLoader = {
  // Define your fixtures...
  fixture01: async () => {},
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
