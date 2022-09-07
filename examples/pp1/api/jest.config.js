/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testTimeout: 300000,
  testMatch: ["**/?(*.)+(test).ts"],
  maxWorkers: 1,
  globals: {
    "ts-jest": {
      isolatedModules: true,
    },
  },
  // transform: {
  //   "^.+\\.(t|j)sx?$": "@swc/jest",
  // },
};
