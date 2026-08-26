import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Switch,
} from "@sonamu-kit/react-components";
import { useQuery } from "@tanstack/react-query";
import classNames from "classnames";
import { Fragment, useEffect, useReducer, useRef, useState } from "react";
import { type MigrationConnectionMeta, type MigrationStreamEvent } from "sonamu";
import PlayIcon from "~icons/lucide/play";
import RefreshCwIcon from "~icons/lucide/refresh-cw";
import SendIcon from "~icons/lucide/send";
import TriangleAlertIcon from "~icons/lucide/triangle-alert";

import { useSonamuContext } from "../../contexts/sonamu-provider";
import { SonamuUIService } from "../../services/sonamu-ui.service";
import { createMigrationExecutionState, migrationExecutionReducer } from "./_migration_execution";
import {
  MigrationErrorMessage,
  MigrationHeightReveal,
  MigrationProgressCard,
} from "./_migration_progress";

type ApplyPhase = "review" | "approval" | "ready" | "running" | "done" | "failed" | "disconnected";
type StreamOutcome = "complete" | "error" | "disconnected";
const FORCE_REASON_CHIP_KEYS = [
  "migration.apply.forceChip.harmless",
  "migration.apply.forceChip.agreed",
  "migration.apply.forceChip.urgent",
] as const;

function ApplyStepper({ phase, needsApproval }: { phase: ApplyPhase; needsApproval: boolean }) {
  const { SD } = useSonamuContext();
  const stageKeys = [
    "migration.apply.stage.review" as const,
    ...(needsApproval ? ["migration.apply.stage.approval" as const] : []),
    "migration.apply.stage.apply" as const,
  ];
  const stages = stageKeys.map((key) => SD(key));
  const current = SD(
    phase === "review"
      ? "migration.apply.stage.review"
      : phase === "approval" || phase === "ready"
        ? "migration.apply.stage.approval"
        : "migration.apply.stage.apply",
  );
  const currentIndex = Math.max(stages.indexOf(current), 0);
  return (
    <div className="flex w-full items-start px-2 pt-3 pb-1">
      {stages.map((stage, index) => {
        const done =
          index < currentIndex || phase === "done" || (phase === "ready" && index === currentIndex);
        const active = !done && index === currentIndex;
        return (
          <Fragment key={stage}>
            {index > 0 ? (
              <div className="mt-2.5 h-0.5 flex-1 bg-gray-200">
                {index <= currentIndex ? (
                  <div className="migration-step-fill h-full bg-primary" />
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-col items-center gap-1 px-1">
              <div
                key={done ? "done" : active ? "active" : "idle"}
                className={classNames(
                  "flex size-5 items-center justify-center rounded-full text-[10px] font-bold",
                  {
                    "migration-pop": done || active,
                    "migration-pop-after-line": active && index > 0,
                    "bg-primary text-primary-foreground": done,
                    "bg-primary/50 text-primary-foreground": active,
                    "border-2 border-gray-200 bg-white text-muted-foreground/50": !done && !active,
                  },
                )}
              >
                {done ? "✓" : index + 1}
              </div>
              <span
                className={classNames("text-xs", {
                  "font-semibold text-foreground": done || active,
                  "text-muted-foreground/50": !done && !active,
                })}
              >
                {stage}
              </span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

type MigrationApplyDialogProps = {
  open: boolean;
  connections: MigrationConnectionMeta[];
  shadowConnection?: MigrationConnectionMeta;
  pendingByConnection: Record<string, string[]>;
  onOpenChange: (open: boolean) => void;
  onSettled: (success: boolean) => Promise<void> | void;
};

export function MigrationApplyDialog({
  open,
  connections,
  shadowConnection,
  pendingByConnection,
  onOpenChange,
  onSettled,
}: MigrationApplyDialogProps) {
  const { SD } = useSonamuContext();
  const [phase, setPhase] = useState<ApplyPhase>("review");
  const [shadowEnabled, setShadowEnabled] = useState(true);
  const [approval, setApproval] = useState<{ channel: string; ts: string }>();
  const [forceOpen, setForceOpen] = useState(false);
  const [forceChips, setForceChips] = useState<string[]>([]);
  const [forceReason, setForceReason] = useState("");
  const [bypassed, setBypassed] = useState(false);
  const [requestingApproval, setRequestingApproval] = useState(false);
  const [runningStage, setRunningStage] = useState<"shadow" | "apply">();
  const [execution, dispatch] = useReducer(
    migrationExecutionReducer,
    "apply",
    createMigrationExecutionState,
  );
  const abortRef = useRef<AbortController | undefined>(undefined);
  const approvalRequestRef = useRef(false);
  const targets = connections.map(({ connKey }) => connKey);
  const needsApproval = connections.some(
    ({ connKey, remote, requiresApproval }) =>
      remote && requiresApproval && (pendingByConnection[connKey]?.length ?? 0) > 0,
  );
  const closeLocked = requestingApproval || phase === "approval" || phase === "running";
  const combinedForceReason = [...forceChips, forceReason.trim()].filter(Boolean).join(" ");
  const shadowProgress = execution.targets.shadow;
  const shadowFiles = [...new Set(Object.values(pendingByConnection).flat())].toSorted();
  const shadowTarget = shadowProgress ?? {
    connKey: "shadow" as const,
    files: shadowFiles,
    completed: 0,
    done: false,
  };
  const shadowConnectionDisplay =
    shadowConnection === undefined
      ? undefined
      : `${shadowConnection.host}:${shadowConnection.port}/${shadowConnection.database}__migration_shadow`;
  const hasAttributedError = Object.values(execution.targets).some(
    ({ error }) => error !== undefined,
  );

  const approvalQuery = useQuery({
    queryKey: ["migrations", "approval", approval?.channel, approval?.ts],
    queryFn: () =>
      SonamuUIService.migrationsCheckApproval(approval?.channel ?? "", approval?.ts ?? ""),
    enabled: phase === "approval" && approval !== undefined,
    refetchInterval: 2000,
    retry: 2,
  });

  useEffect(() => {
    if (approvalQuery.data?.approved === true) setPhase("ready");
    if (approvalQuery.data?.rejected === true) {
      dispatch({
        type: "error",
        action: "apply",
        message: SD("migration.apply.approvalRejected"),
        completedTargets: [],
        pendingTargets: connections.map(({ connKey }) => connKey),
      });
      setPhase("failed");
    }
  }, [approvalQuery.data?.approved, approvalQuery.data?.rejected, connections]);
  useEffect(() => {
    if (phase !== "approval" || approvalQuery.error === null) return;
    dispatch({
      type: "error",
      action: "apply",
      message: SD("migration.apply.approvalCheckFailed").replace(
        "{message}",
        approvalQuery.error.message,
      ),
      completedTargets: [],
      pendingTargets: targets,
    });
    setPhase("failed");
  }, [approvalQuery.error, phase, targets]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const consume = async (
    events: AsyncGenerator<MigrationStreamEvent>,
    includeComplete: boolean,
  ): Promise<StreamOutcome> => {
    let completed = false;
    for await (const event of events) {
      if (event.type === "error") {
        dispatch(event);
        return "error";
      }
      if (event.type === "complete") {
        completed = true;
        if (includeComplete) dispatch(event);
      } else {
        dispatch(event);
      }
    }
    if (completed) return "complete";

    dispatch({
      type: "disconnected",
      action: "apply",
      message: SD("migration.streamEndedWithoutComplete"),
    });
    return "disconnected";
  };

  const failBeforeExecution = (caught: unknown) => {
    dispatch({
      type: "error",
      action: "apply",
      message: caught instanceof Error ? caught.message : String(caught),
      completedTargets: [],
      pendingTargets: targets,
    });
    setPhase("failed");
  };

  const runApply = async () => {
    setPhase("running");
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      if (shadowEnabled) {
        setRunningStage("shadow");
        const shadowOutcome = await consume(SonamuUIService.shadowMigrations(abort.signal), false);
        if (shadowOutcome !== "complete") {
          setPhase(shadowOutcome === "error" ? "failed" : "disconnected");
          return;
        }
      }
      setRunningStage("apply");
      const applyOutcome = await consume(
        SonamuUIService.applyMigrations(targets, undefined, abort.signal),
        true,
      );
      setPhase(
        applyOutcome === "complete" ? "done" : applyOutcome === "error" ? "failed" : "disconnected",
      );
    } catch (caught) {
      if (caught instanceof SonamuUIService.MigrationResponseError) {
        failBeforeExecution(caught);
      } else {
        const message = caught instanceof Error ? caught.message : String(caught);
        dispatch({ type: "disconnected", action: "apply", message });
        setPhase("disconnected");
      }
    }
  };

  const handleReviewAction = async () => {
    if (approvalRequestRef.current) return;
    try {
      if (!needsApproval) {
        await runApply();
        return;
      }
      approvalRequestRef.current = true;
      setRequestingApproval(true);
      const result = await SonamuUIService.requestMigrationApproval(targets);
      if (result.type === "ready") {
        setPhase("ready");
      } else {
        setApproval(result);
        setPhase("approval");
      }
    } catch (caught) {
      failBeforeExecution(caught);
    } finally {
      approvalRequestRef.current = false;
      setRequestingApproval(false);
    }
  };

  const handleForce = async () => {
    if (approval === undefined || combinedForceReason.length === 0) return;
    try {
      await SonamuUIService.migrationsForceApproval(
        approval.channel,
        approval.ts,
        combinedForceReason,
      );
      setBypassed(true);
      setPhase("ready");
    } catch (caught) {
      failBeforeExecution(caught);
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
        className="sm:max-w-[560px]"
        onEscapeKeyDown={(event) => {
          if (closeLocked) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (closeLocked) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlayIcon className="size-4" />
            {SD("migration.applyToLatest")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {SD("migration.apply.description")}
          </DialogDescription>
          <ApplyStepper phase={phase} needsApproval={needsApproval} />
        </DialogHeader>
        <div className="text-sm">
          <MigrationHeightReveal open={shadowEnabled}>
            <div className="pb-3">
              <MigrationProgressCard
                connectionDisplay={shadowConnectionDisplay}
                target={shadowTarget}
                label={SD("migration.apply.shadowLabel")}
                verb="verify"
                dashed
                showProgress={shadowProgress !== undefined}
                showZeroFileDone
              />
            </div>
          </MigrationHeightReveal>
          <div className="space-y-3">
            {connections.map((connection) => {
              const progress = execution.targets[connection.connKey] ?? {
                connKey: connection.connKey,
                files: pendingByConnection[connection.connKey] ?? [],
                completed: 0,
                done: false,
              };
              return (
                <MigrationProgressCard
                  key={connection.connKey}
                  connection={connection}
                  target={progress}
                  verb="apply"
                  showDone={phase === "done"}
                  showProgress={
                    (phase === "running" && runningStage === "apply") ||
                    phase === "done" ||
                    execution.order.includes(connection.connKey)
                  }
                />
              );
            })}
            {phase === "review" || phase === "approval" || phase === "ready" ? (
              <label
                htmlFor="shadow-toggle"
                className="flex w-fit cursor-pointer items-center gap-2 text-xs"
              >
                <Switch
                  id="shadow-toggle"
                  className="data-[state=unchecked]:bg-gray-300"
                  checked={shadowEnabled}
                  disabled={phase !== "review"}
                  onCheckedChange={(checked) => setShadowEnabled(checked === true)}
                />
                {SD("migration.apply.shadowToggle")}
              </label>
            ) : null}
          </div>
          <MigrationHeightReveal open={phase === "approval"}>
            <div className="pt-3">
              <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-3">
                <div className="flex items-center gap-2 py-0.5 text-xs font-semibold text-foreground">
                  <RefreshCwIcon className="size-3.5 shrink-0 animate-spin text-primary" />
                  <span className="font-mono">#{approval?.channel}</span>{" "}
                  {SD("migration.apply.approvalWaiting")}
                </div>
                <button
                  type="button"
                  className="mt-3! block w-fit cursor-pointer border-0 bg-transparent p-0 text-[11px]! leading-normal! text-muted-foreground underline hover:text-foreground"
                  aria-expanded={forceOpen}
                  onClick={() => setForceOpen((value) => !value)}
                >
                  {SD("migration.apply.forcePrompt")}
                </button>
                <MigrationHeightReveal open={forceOpen}>
                  <div className="flex flex-wrap items-center gap-1.5 pt-2">
                    {FORCE_REASON_CHIP_KEYS.map((chipKey) => {
                      const chip = SD(chipKey);
                      return (
                        <button
                          key={chipKey}
                          type="button"
                          className={classNames(
                            "cursor-pointer rounded-full border px-2 py-0.5 text-[11px]! leading-normal!",
                            forceChips.includes(chip)
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-gray-300 bg-transparent text-muted-foreground hover:bg-gray-100",
                          )}
                          onClick={() =>
                            setForceChips((current) =>
                              current.includes(chip)
                                ? current.filter((value) => value !== chip)
                                : [...current, chip],
                            )
                          }
                        >
                          {chip}
                        </button>
                      );
                    })}
                    <Input
                      className="h-8 min-w-32 flex-1 border-gray-300 text-xs"
                      placeholder={SD("migration.apply.forceReasonPlaceholder")}
                      value={forceReason}
                      onChange={(event) => setForceReason(event.target.value)}
                    />
                    <Button
                      size="sm"
                      className="bg-orange-500 text-white hover:bg-orange-600"
                      disabled={combinedForceReason.length === 0}
                      onClick={() => void handleForce()}
                    >
                      {SD("migration.apply.forceSkip")}
                    </Button>
                  </div>
                </MigrationHeightReveal>
              </div>
            </div>
          </MigrationHeightReveal>
          <MigrationHeightReveal open={phase === "ready"}>
            <div className="pt-3">
              <div
                className={classNames(
                  "flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
                  bypassed
                    ? "border-orange-300 bg-orange-50 text-orange-800"
                    : "border-green-300 bg-green-50 text-green-800",
                )}
              >
                {bypassed ? <TriangleAlertIcon className="size-3.5 shrink-0" /> : null}
                {bypassed
                  ? SD("migration.apply.bypassed").replace("{reason}", combinedForceReason)
                  : `${SD("migration.apply.approved")}${approvalQuery.data?.approver ? ` — @${approvalQuery.data.approver}` : ""}`}
              </div>
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
                    : (execution.message ?? SD("migration.apply.failed"))
                }
              />
            </div>
          </MigrationHeightReveal>
        </div>
        <DialogFooter>
          {phase === "review" ? (
            <>
              <Button
                variant="secondary"
                disabled={requestingApproval}
                onClick={() => handleOpenChange(false)}
              >
                {SD("common.cancel")}
              </Button>
              <Button
                icon={needsApproval ? <SendIcon /> : <PlayIcon />}
                disabled={requestingApproval}
                onClick={() => void handleReviewAction()}
              >
                {needsApproval
                  ? SD("migration.apply.requestApproval")
                  : SD("migration.apply.applyToCount").replace(
                      "{count}",
                      String(connections.length),
                    )}
              </Button>
            </>
          ) : null}
          {phase === "approval" ? (
            <Button disabled icon={<RefreshCwIcon className="animate-spin" />}>
              {SD("migration.apply.approvalWaiting")}
            </Button>
          ) : null}
          {phase === "ready" ? (
            <>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                {SD("common.cancel")}
              </Button>
              <Button icon={<PlayIcon />} onClick={() => void runApply()}>
                {SD("migration.apply.applyToCount").replace("{count}", String(connections.length))}
              </Button>
            </>
          ) : null}
          {phase === "running" ? (
            <Button disabled icon={<RefreshCwIcon className="animate-spin" />}>
              {SD("migration.running")}
            </Button>
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
