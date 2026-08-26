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
          message: "마이그레이션 스트림이 완료 이벤트 없이 종료되었습니다.",
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
            롤백
          </DialogTitle>
          <DialogDescription>
            각 DB에서 가장 최근에 실행한 마이그레이션 batch를 되돌립니다.
          </DialogDescription>
        </DialogHeader>
        {phase === "review" ? (
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>
              DB마다 <code className="font-mono">knex.migrate.rollback()</code>이 호출되어, 마지막
              batch에 포함된 파일들의 <code className="font-mono">down()</code>이 역순으로
              실행됩니다.
            </li>
            <li>
              롤백을 진행하면 컬럼·테이블 삭제 등으로 데이터가 유실될 수 있으니, 롤백의 내용을 모두
              숙지하신 상태로 실행하실 것을 권장합니다.
            </li>
            <li>
              도중에 오류가 발생하면 해당 파일에서 중단됩니다. 다만 롤백 트랜잭션도 취소되기 때문에
              아무런 변화가 없어 보일 수 있습니다. 롤백은 최신 마이그레이션부터 순서대로 실행되므로,
              이렇게 중간에 문제가 발생하는 경우 다음 롤백으로 넘어갈 수 없습니다.
            </li>
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
              verb="롤백"
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
                  ? "연결이 끊겨도 실행은 계속될 수 있으니 상태를 다시 확인하세요."
                  : (execution.message ?? "롤백에 실패했습니다.")
              }
            />
          </div>
        </MigrationHeightReveal>
        <DialogFooter>
          {phase === "review" ? (
            <>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                취소
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
                  {armed ? "확실하십니까? 한 번만 더 눌러주세요." : "롤백"}
                </span>
              </Button>
            </>
          ) : null}
          {phase === "done" || phase === "failed" || phase === "disconnected" ? (
            <Button variant="secondary" onClick={() => handleOpenChange(false)}>
              닫기
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
