// custom-sequencer.ts
import type { TestSequencer, TestSpecification } from "vitest/node";

export class PrioritySequencer implements TestSequencer {
  async sort(files: TestSpecification[]) {
    const highPriority = ["migrator", "syncer", "type-safety"];
    const lowPriority = ["fixture-generator"];

    return files.sort((a, b) => {
      const aHigh = highPriority.findIndex((p) => a.moduleId.includes(p));
      const bHigh = highPriority.findIndex((p) => b.moduleId.includes(p));
      const aLow = lowPriority.some((p) => a.moduleId.includes(p));
      const bLow = lowPriority.some((p) => b.moduleId.includes(p));

      // 높은 우선순위가 있으면 먼저
      if (aHigh !== -1 && bHigh === -1) return -1;
      if (aHigh === -1 && bHigh !== -1) return 1;
      if (aHigh !== bHigh && aHigh !== -1 && bHigh !== -1) return aHigh - bHigh;

      // 낮은 우선순위는 나중에
      if (aLow && !bLow) return 1;
      if (!aLow && bLow) return -1;

      // 나머지는 알파벳 순
      return a.moduleId.localeCompare(b.moduleId);
    });
  }

  async shard(files: TestSpecification[]) {
    return files;
  }
}
