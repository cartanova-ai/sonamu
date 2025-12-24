import { createFixtureLoader } from "sonamu/test";
import { CompanyModel } from "../application/company/company.model";

export const loadFixtures = createFixtureLoader({
  company01: async () => CompanyModel.findById("A", 1),
});
