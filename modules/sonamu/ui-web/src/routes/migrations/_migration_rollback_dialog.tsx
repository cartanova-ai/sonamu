import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@sonamu-kit/react-components";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useReducer, useRef, useState } from "react";
import { type MigrationConnectionMeta } from "sonamu";
import RefreshCwIcon from "~icons/lucide/refresh-cw";
import SendIcon from "~icons/lucide/send";
import Undo2Icon from "~icons/lucide/undo-2";

import { useSonamuContext } from "../../contexts/sonamu-provider";
import { SonamuUIService } from "../../services/sonamu-ui.service";
import { createMigrationExecutionState, migrationExecutionReducer } from "./_migration_execution";
import {
  MigrationErrorMessage,
  MigrationHeightReveal,
  MigrationProgressCard,
} from "./_migration_progress";

type RollbackPhase =
  | "review"
  | "approval"
  | "ready"
  | "running"
  | "done"
  | "failed"
  | "disconnected";

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
  const [phaseState, setPhase] = useState<RollbackPhase>("review");
  const [armed, setArmed] = useState(false);
  const [approval, setApproval] = useState<{ channel: string; ts: string }>();
  const [requestingApproval, setRequestingApproval] = useState(false);
  const [execution, dispatch] = useReducer(
    migrationExecutionReducer,
    "rollback",
    createMigrationExecutionState,
  );
  const abortRef = useRef<AbortController | undefined>(undefined);
  const targets = connections.map(({ connKey }) => connKey);
  // 승인 대상 원격 DB가 포함되면 apply와 같이 Slack 승인 뒤에만 롤백할 수 있습니다.
  const needsApproval = connections.some(
    ({ remote, requiresApproval }) => remote && requiresApproval,
  );
  const hasAttributedError = Object.values(execution.targets).some(
    ({ error }) => error !== undefined,
  );

  const approvalQuery = useQuery({
    queryKey: ["migrations", "approval", approval?.channel, approval?.ts],
    queryFn: () =>
      SonamuUIService.migrationsCheckApproval(approval?.channel ?? "", approval?.ts ?? ""),
    enabled: phaseState === "approval" && approval !== undefined,
    refetchInterval: (query) => (query.state.data?.approved === true ? false : 2000),
    retry: 2,
  });
  const approvalFailed =
    phaseState === "approval" &&
    (approvalQuery.data?.rejected === true || approvalQuery.error !== null);
  const phase: RollbackPhase =
    phaseState === "approval" && approvalQuery.data?.approved === true
      ? "ready"
      : approvalFailed
        ? "failed"
        : phaseState;
  const closeLocked = requestingApproval || phase === "approval" || phase === "running";
  const approvalFailureMessage =
    approvalQuery.data?.rejected === true
      ? SD("migration.apply.approvalRejected")
      : approvalQuery.error !== null
        ? SD("migration.apply.approvalCheckFailed").replace(
            "{message}",
            approvalQuery.error.message,
          )
        : undefined;
  useEffect(() => () => abortRef.current?.abort(), []);

  const failBeforeExecution = (message: string) => {
    dispatch({
      type: "error",
      action: "rollback",
      message,
      completedTargets: [],
      pendingTargets: targets,
    });
    setPhase("failed");
  };

  const requestApproval = async () => {
    if (requestingApproval) return;
    setRequestingApproval(true);
    try {
      const result = await SonamuUIService.requestMigrationApproval(targets, undefined, "rollback");
      if (result.type === "ready") {
        setPhase("ready");
      } else {
        setApproval(result);
        setPhase("approval");
      }
    } catch (caught) {
      failBeforeExecution(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRequestingApproval(false);
    }
  };

  const runRollback = async () => {
    setPhase("running");
    const abort = new AbortController();
    abortRef.current = abort;
    let succeeded = true;
    let completed = false;
    try {
      for await (const event of SonamuUIService.rollbackMigrations(targets, abort.signal)) {
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
        failBeforeExecution(message);
      } else {
        dispatch({ type: "disconnected", action: "rollback", message });
        setPhase("disconnected");
      }
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && closeLocked) return;
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
          if (closeLocked) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (closeLocked) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2Icon className="size-5 shrink-0" />
            {SD("migration.rollback")}
          </DialogTitle>
          <DialogDescription>{SD("migration.rollbackDialog.description")}</DialogDescription>
        </DialogHeader>
        {phase === "review" || phase === "ready" ? (
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
        <MigrationHeightReveal open={phase === "approval"}>
          <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-semibold text-foreground">
            <RefreshCwIcon className="size-3.5 shrink-0 animate-spin text-primary" />
            <span className="font-mono">#{approval?.channel}</span>{" "}
            {SD("migration.apply.approvalWaiting")}
          </div>
        </MigrationHeightReveal>
        <MigrationHeightReveal open={phase === "ready" && needsApproval}>
          <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-xs text-green-800">
            {`${SD("migration.apply.approved")}${approvalQuery.data?.approver ? ` — @${approvalQuery.data.approver}` : ""}`}
          </div>
        </MigrationHeightReveal>
        <MigrationHeightReveal
          open={phase === "disconnected" || (phase === "failed" && !hasAttributedError)}
        >
          <div className="pt-3">
            <MigrationErrorMessage
              message={
                phase === "disconnected"
                  ? SD("migration.disconnectedNotice")
                  : (approvalFailureMessage ??
                    execution.message ??
                    SD("migration.rollbackDialog.failed"))
              }
            />
          </div>
        </MigrationHeightReveal>
        <DialogFooter>
          {phase === "review" && needsApproval ? (
            <>
              <Button
                variant="secondary"
                disabled={requestingApproval}
                onClick={() => onOpenChange(false)}
              >
                {SD("common.cancel")}
              </Button>
              <Button
                icon={<SendIcon />}
                disabled={requestingApproval}
                onClick={() => void requestApproval()}
              >
                {SD("migration.apply.requestApproval")}
              </Button>
            </>
          ) : null}
          {phase === "approval" ? (
            <Button disabled icon={<RefreshCwIcon className="animate-spin" />}>
              {SD("migration.apply.approvalWaiting")}
            </Button>
          ) : null}
          {(phase === "review" && !needsApproval) || phase === "ready" ? (
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
