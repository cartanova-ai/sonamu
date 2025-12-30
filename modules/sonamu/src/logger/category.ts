// NOTE: import * as inflection 혹은 import { underscore } 사용 시 오류 발생.
import inflection from "inflection";
import { asArray } from "../utils/model";

// 두 카테고리가 동일한지 확인
export function isSameCategory(
  categoryA: readonly string[],
  categoryB: string | string[],
): boolean {
  const categoryBArr = asArray(categoryB);
  if (categoryA.length !== categoryBArr.length) {
    return false;
  }

  return categoryA.every((category, index) => categoryBArr[index] === category);
}

// 로깅 카테고리를 지정합니다.
// 예: SomeAgentClass -> ["sonamu", "agent", "some-agent"]
// SomeLongWorkflow -> ["sonamu", "workflow", "some-long-workflow"]
export function convertDomainToCategory(
  name: string,
  type: "model" | "frame" | "agent" | "workflow",
): readonly string[] {
  const compareItems = ["class"];
  if (type !== "workflow") {
    compareItems.push(type);
  }

  // SomeAgentClass -> some_agent, SomeModelClass -> some_model, SomeFrameClass -> some_frame
  const convertedName = inflection
    .underscore(name)
    .split("_")
    .filter((item) => !compareItems.includes(item))
    .join("-");

  return ["sonamu", type, convertedName];
}

export function convertNaiteKeyToCategory(key: string): readonly string[] {
  return key.split(".").flatMap((stem) => stem.split(":"));
}
