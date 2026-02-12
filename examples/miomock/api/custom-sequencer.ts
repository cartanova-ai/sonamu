// custom-sequencer.ts
import type { TestSequencer, TestSpecification } from "vitest/node";

export class PrioritySequencer implements TestSequencer {
  async sort(files: TestSpecification[]) {
    const priority = ["migrator", "syncer", "type-safety"];

    return files.sort((a, b) => {
      const aPriority = priority.findIndex((p) => a.moduleId.includes(p));
      const bPriority = priority.findIndex((p) => b.moduleId.includes(p));

      if (aPriority !== -1 && bPriority === -1) return -1;
      if (aPriority === -1 && bPriority !== -1) return 1;
      if (aPriority !== bPriority) return aPriority - bPriority;

      return a.moduleId.localeCompare(b.moduleId);
    });
  }

  async shard(files: TestSpecification[]) {
    return files;
  }
}
