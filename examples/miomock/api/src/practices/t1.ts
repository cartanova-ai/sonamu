// import { Sonamu } from "sonamu";
// await Sonamu.initForTesting();

// console.time("radash");
// await import("radash");
// console.timeEnd("radash");

// console.time("lodash-es");
// await import("lodash-es");
// console.timeEnd("lodash-es");

console.time("sonamu");
await import("sonamu");
console.timeEnd("sonamu");

export function t1() {
  return "t1";
}
