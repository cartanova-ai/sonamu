import { CompanyModel } from "../application/company/company.model";

const fixtureLoader = {
  company01: async () => CompanyModel.findById("A", 1),
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
