import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@sonamu-kit/react-components";
import { useEffect, useReducer, useRef, useState } from "react";
import { type MigrationConnectionMeta } from "sonamu";
import Undo2Icon from "~icons/lucide/undo-2";

import { useSonamuContext } from "../../contexts/sonamu-provider";
import { SonamuUIService } from "../../services/sonamu-ui.service";
import { createMigrationExecutionState, migrationExecutionReducer } from "./_migration_execution";
import {
  MigrationErrorMessage,
  MigrationHeightReveal,
  MigrationProgressCard,
} from "./_migration_progress";

type RollbackPhase = "review" | "running" | "done" | "failed" | "disconnected";

type MigrationRollbackDialogProps = {
  open: boolean;
  connections: MigrationConnectionMeta[];
  onOpenChange: (open: boolean) => void;
  onSettled: (success: boolean) => Promise<void> | void;
};

export function MigrationRollbackDialog({
  open,
  connections,
  onOpenChange,
  onSettled,
}: MigrationRollbackDialogProps) {
  const { SD } = useSonamuContext();
  const [phase, setPhase] = useState<RollbackPhase>("review");
  const [armed, setArmed] = useState(false);
  const [execution, dispatch] = useReducer(
    migrationExecutionReducer,
    "rollback",
    createMigrationExecutionState,
  );
  const abortRef = useRef<AbortController | undefined>(undefined);
  const hasAttributedError = Object.values(execution.targets).some(
    ({ error }) => error !== undefined,
  );
  useEffect(() => () => abortRef.current?.abort(), []);

  const runRollback = async () => {
    setPhase("running");
    const abort = new AbortController();
    abortRef.current = abort;
    let succeeded = true;
    let completed = false;
    try {
      for await (const event of SonamuUIService.rollbackMigrations(
        connections.map(({ connKey }) => connKey),
        abort.signal,
      )) {
        dispatch(event);
        if (event.type === "error") {
          succeeded = false;
        } else if (event.type === "complete") {
          completed = true;
        }
      }
      const fullySucceeded = succeeded && completed;
      if (succeeded && !completed) {
        dispatch({
          type: "disconnected",
          action: "rollback",
          message: SD("migration.streamEndedWithoutComplete"),
        });
        setPhase("disconnected");
        return;
      }
      setPhase(fullySucceeded ? "done" : "failed");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      if (caught instanceof SonamuUIService.MigrationResponseError) {
        dispatch({
          type: "error",
          action: "rollback",
          message,
          completedTargets: [],
          pendingTargets: connections.map(({ connKey }) => connKey),
        });
        setPhase("failed");
      } else {
        dispatch({ type: "disconnected", action: "rollback", message });
        setPhase("disconnected");
      }
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && phase === "running") return;
    if (!next && (phase === "done" || phase === "failed" || phase === "disconnected")) {
      void onSettled(phase === "done");
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[560px] border border-red-500"
        onEscapeKeyDown={(event) => {
          if (phase === "running") event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (phase === "running") event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2Icon className="size-5 shrink-0" />
            {SD("migration.rollback")}
          </DialogTitle>
          <DialogDescription>{SD("migration.rollbackDialog.description")}</DialogDescription>
        </DialogHeader>
        {phase === "review" ? (
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>{SD("migration.rollbackDialog.note1")}</li>
            <li>{SD("migration.rollbackDialog.note2")}</li>
            <li>{SD("migration.rollbackDialog.note3")}</li>
          </ul>
        ) : null}
        <div className="space-y-2 text-sm">
          {connections.map((connection) => (
            <MigrationProgressCard
              key={connection.connKey}
              connection={connection}
              target={
                execution.targets[connection.connKey] ?? {
                  connKey: connection.connKey,
                  files: [],
                  completed: 0,
                  done: false,
                }
              }
              verb="rollback"
              showDone={phase === "done"}
            />
          ))}
        </div>
        <MigrationHeightReveal
          open={phase === "disconnected" || (phase === "failed" && !hasAttributedError)}
        >
          <div className="pt-3">
            <MigrationErrorMessage
              message={
                phase === "disconnected"
                  ? SD("migration.disconnectedNotice")
                  : (execution.message ?? SD("migration.rollbackDialog.failed"))
              }
            />
          </div>
        </MigrationHeightReveal>
        <DialogFooter>
          {phase === "review" ? (
            <>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                {SD("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                icon={<Undo2Icon />}
                onClick={() => {
                  if (armed) void runRollback();
                  else setArmed(true);
                }}
              >
                <span
                  className="migration-rollback-arm inline-block overflow-hidden whitespace-nowrap"
                  style={{ maxWidth: armed ? "260px" : "40px" }}
                >
                  {armed ? SD("migration.rollbackDialog.confirmArm") : SD("migration.rollback")}
                </span>
              </Button>
            </>
          ) : null}
          {phase === "done" || phase === "failed" || phase === "disconnected" ? (
            <Button variant="secondary" onClick={() => handleOpenChange(false)}>
              {SD("common.close")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
