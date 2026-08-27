import { type MigrationAction, type MigrationStreamEvent, type MigrationTarget } from "sonamu";

export type MigrationExecutionTarget = {
  connKey: MigrationTarget | "shadow";
  files: string[];
  completed: number;
  currentFile?: string;
  done: boolean;
  error?: string;
};

export type MigrationExecutionState = {
  action: MigrationAction;
  targets: Record<string, MigrationExecutionTarget>;
  order: (MigrationTarget | "shadow")[];
  terminal: "running" | "complete" | "error" | "disconnected";
  message?: string;
};

export type MigrationExecutionEvent =
  | MigrationStreamEvent
  | { type: "disconnected"; action: MigrationAction; message: string };

export function createMigrationExecutionState(action: MigrationAction): MigrationExecutionState {
  return { action, targets: {}, order: [], terminal: "running" };
}

function ensureTarget(
  state: MigrationExecutionState,
  connKey: MigrationTarget | "shadow",
  files: string[] = [],
) {
  return (
    state.targets[connKey] ?? {
      connKey,
      files,
      completed: 0,
      done: false,
    }
  );
}

export function migrationExecutionReducer(
  state: MigrationExecutionState,
  event: MigrationExecutionEvent,
): MigrationExecutionState {
  if (event.type === "complete") {
    return { ...state, terminal: "complete" };
  }
  if (event.type === "disconnected") {
    return { ...state, terminal: "disconnected", message: event.message };
  }
  if (event.type === "error") {
    const targets = { ...state.targets };
    if (event.connKey !== undefined) {
      const target = ensureTarget(state, event.connKey);
      targets[event.connKey] = { ...target, error: event.message };
    }
    return { ...state, targets, terminal: "error", message: event.message };
  }

  const target = ensureTarget(
    state,
    event.connKey,
    event.type === "target-start" ? event.files : [],
  );
  const order = state.order.includes(event.connKey) ? state.order : [...state.order, event.connKey];
  const nextTarget: MigrationExecutionTarget = (() => {
    switch (event.type) {
      case "target-start":
        return { ...target, files: event.files, completed: 0, done: false };
      case "file-start":
        return { ...target, currentFile: event.file };
      case "file-executed":
        return {
          ...target,
          currentFile: event.file,
          completed: Math.max(target.completed, event.index + 1),
        };
      case "target-complete":
        return {
          ...target,
          files: target.files.length === 0 ? event.files : target.files,
          completed: event.files.length,
          currentFile: undefined,
          done: true,
        };
      default:
        return target;
    }
  })();

  return {
    ...state,
    order,
    targets: { ...state.targets, [event.connKey]: nextTarget },
  };
}
