import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Switch,
  Textarea,
  useTypeForm,
} from "@sonamu-kit/react-components";
import classNames from "classnames";
import { useEffect, useRef, useState } from "react";
import type { MigrationStatus, SonamuDBConfig } from "sonamu";
import { z } from "zod";
import CheckIcon from "~icons/lucide/check";
import Loader2Icon from "~icons/lucide/loader-2";
import PlayIcon from "~icons/lucide/play";
import XIcon from "~icons/lucide/x";
import { defaultCatch } from "../../services/sonamu.shared";
import { SonamuUIService } from "../../services/sonamu-ui.service";

type MigrationActionModalProps = {
  action: "apply" | "rollback" | "shadow";
  targets: (keyof SonamuDBConfig)[];
  conns: MigrationStatus["conns"];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
};
export function MigrationActionModal({
  action,
  targets,
  conns,
  open,
  onOpenChange,
  onCompleted,
}: MigrationActionModalProps) {
  const [loading, setLoading] = useState(false);

  const { form, register } = useTypeForm(
    z.object({
      doShadowDbTesting: z.boolean(),
    }),
    {
      doShadowDbTesting: action === "apply",
    },
  );

  // Slack 승인 관련 상태
  const [approvalState, setApprovalState] = useState<{
    status: "idle" | "pending" | "approved" | "rejected";
    channel?: string;
    ts?: string;
  }>({ status: "idle" });

  const [forceModalOpen, setForceModalOpen] = useState(false);
  const [forceReason, setForceReason] = useState("");

  // Polling ref
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const startPolling = (channel: string, ts: string) => {
    pollingRef.current = setInterval(async () => {
      try {
        const { approved, rejected } = await SonamuUIService.migrationsCheckApproval(channel, ts);

        if (approved) {
          stopPolling();
          // 승인됨 → 실행
          const result = await SonamuUIService.migrationsRunAction(action, targets);
          if (!("type" in result)) {
            onOpenChange(false);
            onCompleted?.();
          }
        } else if (rejected) {
          stopPolling();
          setApprovalState({ status: "rejected" });
        }
      } catch (e) {
        console.error("Polling error:", e);
      }
    }, 2000); // 2초마다 polling
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  // 모달 닫힐 때 cleanup
  useEffect(() => {
    if (!open) {
      stopPolling();
      setApprovalState({ status: "idle" });
      setForceReason("");
    }
  }, [open]);

  // 컴포넌트 언마운트 시 cleanup
  useEffect(() => {
    return () => stopPolling();
  }, []);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (form.doShadowDbTesting) {
        await SonamuUIService.migrationsRunAction("shadow", targets);
      }

      const result = await SonamuUIService.migrationsRunAction(action, targets);

      // Slack 승인 대기 상태 체크
      if ("type" in result && result.type === "pending") {
        setApprovalState({
          status: "pending",
          channel: result.channel,
          ts: result.ts,
        });
        // polling 시작
        startPolling(result.channel, result.ts);
      } else {
        onOpenChange(false);
        onCompleted?.();
      }
    } catch (e) {
      defaultCatch(e);
    } finally {
      setLoading(false);
    }
  };

  const handleForce = async () => {
    if (!approvalState.channel || !approvalState.ts) return;

    setLoading(true);
    try {
      await SonamuUIService.migrationsForceApproval(
        approvalState.channel,
        approvalState.ts,
        forceReason,
      );

      const result = await SonamuUIService.migrationsRunAction(action, targets, {
        force: true,
        forceReason,
      });

      if (!("type" in result)) {
        onOpenChange(false);
        onCompleted?.();
      }
    } catch (e) {
      defaultCatch(e);
    } finally {
      setLoading(false);
      setForceModalOpen(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Migrations Action Form</DialogTitle>
            <DialogDescription>Execute migration action: {action.toUpperCase()}</DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 p-4">
            <div className={`form ${loading ? "loading" : ""}`}>
              <div className="ui basic segment">
                <div>
                  <h4>Action: {action.toUpperCase()}</h4>
                  <p>&nbsp;</p>
                </div>
                <div className="targets">
                  <h4>Targets</h4>
                  <div className="flex w-full gap-2 my-4">
                    {conns.map((conn) => (
                      <div
                        key={conn.name}
                        className={classNames(
                          "flex-1 text-center p-4 bg-[#f1fff5] border border-[#b1f3c4] rounded-[0.3em] opacity-30",
                          {
                            "bg-[#b1f3c4] text-green-600 font-bold opacity-100": targets.includes(
                              conn.connKey,
                            ),
                          },
                        )}
                      >
                        {targets.includes(conn.connKey) && (
                          <CheckIcon className="h-4 w-4 inline-block mr-1" />
                        )}
                        {conn.name}
                      </div>
                    ))}
                  </div>
                </div>
                {action === "apply" && (
                  <div className="shadow-db-testing">
                    <h4>Shadow DB Testing</h4>
                    <Switch {...register("doShadowDbTesting")} />
                  </div>
                )}

                {/* 승인 대기 상태 UI */}
                {approvalState.status === "pending" && (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded mt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Loader2Icon className="h-4 w-4 animate-spin" />
                      <span className="font-medium">승인 대기중...</span>
                    </div>
                    <p className="text-sm text-gray-600 mb-4">
                      슬랙에서 ✅ 이모지를 눌러 승인해주세요.
                    </p>
                    <Button variant="outline" onClick={() => setForceModalOpen(true)}>
                      Force 진행
                    </Button>
                  </div>
                )}

                {/* 거절됨 상태 UI */}
                {approvalState.status === "rejected" && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded mt-4">
                    <div className="flex items-center gap-2">
                      <XIcon className="h-4 w-4 text-red-600" />
                      <span className="font-medium text-red-600">
                        마이그레이션이 거절되었습니다.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={handleSubmit}
              icon={<PlayIcon />}
              disabled={loading || approvalState.status === "pending"}
            >
              Commit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Force 사유 입력 모달 */}
      <Dialog open={forceModalOpen} onOpenChange={setForceModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Force 진행</DialogTitle>
            <DialogDescription>승인 없이 진행합니다. 사유를 입력해주세요.</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="사유 입력..."
            value={forceReason}
            onChange={(e) => setForceReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setForceModalOpen(false)}>
              취소
            </Button>
            <Button onClick={handleForce} disabled={!forceReason.trim() || loading}>
              진행
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
