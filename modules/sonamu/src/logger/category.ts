import { underscore } from "inflection";
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

export function convertDomainToCategory(name: string, type: "model" | "frame" | "agent"): readonly string[] {
  return [
    "sonamu",
    // SomeAgentClass -> some_agent, SomeModelClass -> some_model, SomeFrameClass -> some_frame
    underscore(name)
      .split("_")
      .filter((item) => ![type, "class"].includes(item))
      .join("_"),
    type,
  ];
}

export function convertNaiteKeyToCategory(key: string): readonly string[] {
  return key.split(".").flatMap(stem => stem.split(":"));
}
