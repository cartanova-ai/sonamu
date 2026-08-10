import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@sonamu-kit/react-components";
import { createFileRoute } from "@tanstack/react-router";
import classNames from "classnames";
import { diff, unique } from "radashi";
import { Fragment, useState } from "react";
import { type SonamuDBConfig } from "sonamu";
import CheckIcon from "~icons/lucide/check";
import CodeIcon from "~icons/lucide/code";
import PlayIcon from "~icons/lucide/play";
import RefreshCwIcon from "~icons/lucide/refresh-cw";
import ToggleLeftIcon from "~icons/lucide/toggle-left";
import ToggleRightIcon from "~icons/lucide/toggle-right";
import TrashIcon from "~icons/lucide/trash";
import TriangleAlertIcon from "~icons/lucide/triangle-alert";

import { useSonamuContext } from "../contexts/sonamu-provider";
import { SonamuUIService } from "../services/sonamu-ui.service";
import { defaultCatch } from "../services/sonamu.shared";
import { MigrationActionModal } from "./migrations/_migration_action_modal";

export const Route = createFileRoute("/migrations")({
  component: MigrationsIndex,
});

type MigrationsIndexProps = {};
function MigrationsIndex(_props: MigrationsIndexProps) {
  const { SD } = useSonamuContext();
  const { data, error, refetch } = SonamuUIService.useMigrationStatus();
  const { status } = data ?? {};
  const { preparedCodes, conns, codes } = status ?? {};
  const migrationStatusError = status?.error;

  const isLoading = !error && !data;
  const [loading, setLoading] = useState(false);

  const [selectedConnKeys, setSelectedConnKeys] = useState<(keyof SonamuDBConfig)[]>([]);
  const [selectedCodeNames, setSelectedCodeNames] = useState<string[]>([]);
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [actionModalData, setActionModalData] = useState<{
    action: "apply" | "rollback" | "shadow";
    targets: (keyof SonamuDBConfig)[];
  } | null>(null);
  const [isAllCodeViewerOpen, setAllCodeViewerOpen] = useState(false);
  const [pendingConnKeys, setPendingConnKeys] = useState<(keyof SonamuDBConfig)[] | null>(null);

  const selectConnKeys = (nextConnKeys: (keyof SonamuDBConfig)[]) => {
    // Production을 새로 포함하는 선택은 사용자가 위험을 확인할 때까지 보류한다.
    if (!selectedConnKeys.includes("production") && nextConnKeys.includes("production")) {
      setPendingConnKeys(nextConnKeys);
      return;
    }
    setSelectedConnKeys(nextConnKeys);
  };

  const handleProductionWarningOpenChange = (open: boolean) => {
    if (!open) {
      setPendingConnKeys(null);
    }
  };

  const confirmProductionSelection = () => {
    if (!pendingConnKeys) {
      return;
    }
    setSelectedConnKeys(pendingConnKeys);
    setPendingConnKeys(null);
  };

  const cancelProductionSelection = () => {
    if (!pendingConnKeys) {
      return;
    }
    // 명시적 취소는 운영 연결만 제외한 안전한 후보를 반영한다.
    setSelectedConnKeys(pendingConnKeys.filter((connKey) => connKey !== "production"));
    setPendingConnKeys(null);
  };

  const toggleConnKeys = (preset: "ALL" | "LOCAL" | "REMOTE" | "TESTING" | "FIXTURE") => {
    const availableConnKeys = new Set((conns ?? []).map((conn) => conn.connKey));
    const presetTargetKeys: (keyof SonamuDBConfig)[] = (() => {
      switch (preset) {
        case "ALL":
          return ["test", "fixture", "development", "staging", "production"];
        case "LOCAL":
          return ["test"];
        case "REMOTE":
          return ["development", "staging", "production"];
        case "TESTING":
          return ["test", "fixture"];
        case "FIXTURE":
          return ["fixture"];
      }
    })();
    const targetKeys = presetTargetKeys.filter((key) => availableConnKeys.has(key));
    if (targetKeys.length === 0) {
      return;
    }

    if (targetKeys.filter((key) => selectedConnKeys.includes(key)).length === targetKeys.length) {
      selectConnKeys(selectedConnKeys.filter((key) => !targetKeys.includes(key)));
    } else if (diff(targetKeys, selectedConnKeys).length > 0) {
      selectConnKeys(targetKeys);
    } else {
      selectConnKeys(unique([...selectedConnKeys, ...targetKeys]));
    }
  };

  const confirmDelCodes = () => {
    if (selectedCodeNames.length === 0) {
      return;
    }
    const answer = confirm(
      SD("migration.confirm.deleteCodes").replace("{count}", String(selectedCodeNames.length)),
    );
    if (!answer) {
      return;
    }

    setLoading(true);
    SonamuUIService.migrationsDelCodes(selectedCodeNames)
      .then(() => {
        refetch();
      })
      .catch(defaultCatch)
      .finally(() => {
        setLoading(false);
      });
  };

  const generatePreparedCodes = () => {
    setLoading(true);
    SonamuUIService.migrationsGeneratePreparedCodes()
      .then(() => {
        // TS컴파일을 위해 0.5초 대기
        setTimeout(() => {
          refetch();
        }, 500);
      })
      .catch(defaultCatch)
      .finally(() => {
        setLoading(false);
      });
  };

  const openActionModal = (
    action: "apply" | "rollback" | "shadow",
    _targets?: (keyof SonamuDBConfig)[],
  ) => {
    if (!conns) {
      return;
    }
    const targets = _targets ?? selectedConnKeys;
    setActionModalData({ action, targets });
    setActionModalOpen(true);
  };

  const handleActionModalCompleted = () => {
    refetch();
  };

  const toggleAllFiles = () => {
    if (!codes) {
      return;
    }

    if (selectedCodeNames.length === 0) {
      setSelectedCodeNames(codes.map((code) => code.name));
    } else {
      setSelectedCodeNames([]);
    }
  };

  if (error) {
    return (
      <div className="p-8">
        <div className="w-[50em] my-[30vh] mx-auto whitespace-pre-line p-[3em] bg-white leading-[2em] border-2 border-red-500">
          {error.message}
        </div>
      </div>
    );
  }
  return (
    <div className="p-8">
      <div
        className={`block p-4 bg-white border border-gray-200 rounded-md shadow-sm ${loading || isLoading ? "opacity-50 pointer-events-none" : ""}`}
      >
        {preparedCodes && (
          <div className="p-4">
            <h3 className="relative ">
              {SD("migration.preparedCodes")}{" "}
              <div className="absolute right-0 top-0 flex gap-2">
                <Button
                  icon={isAllCodeViewerOpen ? <ToggleRightIcon /> : <ToggleLeftIcon />}
                  size="xs"
                  onClick={() => setAllCodeViewerOpen(!isAllCodeViewerOpen)}
                >
                  {SD("migration.toggleCodes")}
                </Button>
                <Button size="xs" icon={<PlayIcon />} onClick={() => generatePreparedCodes()}>
                  {SD("migration.generate")}
                </Button>
              </div>
            </h3>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent bg-gray-100">
                  <TableHead>{SD("common.type")}</TableHead>
                  <TableHead>{SD("common.table")}</TableHead>
                  <TableHead>{SD("common.name")}</TableHead>
                  <TableHead>{SD("common.code")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {migrationStatusError && (
                  <TableRow>
                    <TableCell colSpan={6}>{migrationStatusError}</TableCell>
                  </TableRow>
                )}
                {!migrationStatusError && preparedCodes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center">
                      {SD("migration.noPreparedCodes")}
                    </TableCell>
                  </TableRow>
                )}
                {preparedCodes.map((pcode, pcodeIndex) => (
                  <TableRow key={pcodeIndex}>
                    <TableCell>{pcode.type}</TableCell>
                    <TableCell>{pcode.table}</TableCell>
                    <TableCell>{pcode.title}</TableCell>
                    <TableCell style={{ padding: 0, width: 700, textAlign: "center" }}>
                      <CodeViewer
                        code={pcode.formatted ?? ""}
                        open={isAllCodeViewerOpen}
                        collapsedText={SD("migration.codeCollapsed")}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="border-b border-gray-200" />
          </div>
        )}
        <div className="p-4">
          <h3>{SD("migration.codeFiles")}</h3>
          <div className="flex gap-8">
            <div className="flex-1">
              <Button
                variant="destructive"
                icon={<TrashIcon />}
                disabled={selectedCodeNames.length === 0}
                onClick={() => confirmDelCodes()}
              >
                {SD("migration.deleteCodes")}
              </Button>
            </div>
            <div className="flex gap-2 justify-end">
              {(["ALL", "LOCAL", "REMOTE", "TESTING", "FIXTURE"] as const).map((preset) => (
                <Button key={preset} variant="yellow" onClick={() => toggleConnKeys(preset)}>
                  {preset}
                </Button>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="default"
                icon={<PlayIcon />}
                disabled={selectedConnKeys.length === 0 || !!migrationStatusError}
                onClick={() => openActionModal("apply")}
              >
                {SD("migration.applyToLatest")}
              </Button>
              <Button
                variant="destructive"
                icon={<RefreshCwIcon />}
                disabled={selectedConnKeys.length === 0 || !!migrationStatusError}
                onClick={() => openActionModal("rollback")}
              >
                {SD("migration.rollback")}
              </Button>
            </div>
          </div>
          {conns && codes && (
            <Table className="mt-4 text-[0.9em]">
              <TableHeader>
                <TableRow className="hover:bg-transparent bg-gray-100">
                  <TableHead className="flex items-center gap-1">
                    Name{" "}
                    <Button
                      icon={<CheckIcon />}
                      size="xs"
                      variant="blue"
                      onClick={() => toggleAllFiles()}
                    />
                  </TableHead>
                  {conns.map((conn, connIndex) => (
                    <TableHead
                      key={connIndex}
                      style={{ width: "150px" }}
                      className={classNames("py-2 px-3", {
                        "bg-[#dafde6]": selectedConnKeys.includes(conn.connKey),
                      })}
                    >
                      <Checkbox
                        disabled={conn.status === "error" || !!migrationStatusError}
                        checked={selectedConnKeys.includes(conn.connKey)}
                        label={
                          <Tooltip>
                            <TooltipTrigger>{`${conn.name} / ${conn.status}`}</TooltipTrigger>
                            <TooltipContent>
                              <p>{conn.connString}</p>
                            </TooltipContent>
                          </Tooltip>
                        }
                        onCheckedChange={(checked) => {
                          if (checked) {
                            selectConnKeys(unique([...selectedConnKeys, conn.connKey]));
                          } else {
                            selectConnKeys(selectedConnKeys.filter((key) => key !== conn.connKey));
                          }
                        }}
                      />
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(conns.some((conn) => conn.status === "error") || !!migrationStatusError) && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <b className="text-destructive">{SD("migration.error.connections")}</b>
                      {/* 실제 연결 실패 원인(대상 DB·에러 메시지)을 노출해 진단을 돕는다. */}
                      {migrationStatusError && (
                        <pre className="mt-1 text-xs text-destructive whitespace-pre-wrap break-all">
                          {migrationStatusError}
                        </pre>
                      )}
                    </TableCell>
                  </TableRow>
                )}
                {codes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>{SD("migration.noCodeFiles")}</TableCell>
                  </TableRow>
                )}
                {codes.map((code, codeIndex) => (
                  <Fragment key={codeIndex}>
                    <TableRow>
                      <TableCell className="flex items-center gap-1">
                        <Checkbox
                          checked={selectedCodeNames.includes(code.name)}
                          label={code.name}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedCodeNames(unique([...selectedCodeNames, code.name]));
                            } else {
                              setSelectedCodeNames(
                                selectedCodeNames.filter((name) => name !== code.name),
                              );
                            }
                          }}
                        />
                        &nbsp;{" "}
                        <Button
                          size="xs"
                          variant="secondary"
                          icon={<CodeIcon />}
                          onClick={() => {
                            SonamuUIService.openVscode({
                              absPath: code.path,
                            });
                          }}
                        />
                      </TableCell>
                      {conns.map((conn, connIndex) => (
                        <TableCell
                          key={connIndex}
                          className={classNames("text-center py-2 px-3", {
                            "bg-[#dafde6]": selectedConnKeys.includes(conn.connKey),
                          })}
                        >
                          {conn.pending.includes(code.name) ? (
                            <span className="inline-block px-2 py-1 text-xs font-bold rounded bg-yellow-500 text-white">
                              PENDING
                            </span>
                          ) : conn.status === "error" || !!migrationStatusError ? (
                            <span className="inline-block px-2 py-1 text-xs font-bold rounded bg-red-500 text-white">
                              ERROR
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-1 text-xs font-bold rounded bg-green-500 text-white">
                              APPLIED
                            </span>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
      {conns && actionModalData && (
        <MigrationActionModal
          action={actionModalData.action}
          targets={actionModalData.targets}
          conns={conns}
          open={actionModalOpen}
          onOpenChange={setActionModalOpen}
          onCompleted={handleActionModalCompleted}
        />
      )}
      <AlertDialog open={pendingConnKeys !== null} onOpenChange={handleProductionWarningOpenChange}>
        <AlertDialogContent className="border-2 border-red-600 bg-red-50">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <TriangleAlertIcon className="size-6 shrink-0" />
              {SD("migration.warning.production.title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-red-700">
              {SD("migration.warning.production.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* oxlint-disable-next-line jsx-a11y/no-autofocus */}
            <AlertDialogCancel autoFocus onClick={cancelProductionSelection}>
              {SD("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={confirmProductionSelection}
            >
              {SD("migration.warning.production.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type CodeViewerProps = {
  code: string;
  open: boolean;
  collapsedText: string;
};
function CodeViewer({ code, open, collapsedText }: CodeViewerProps) {
  return (
    <div className="flex items-start">
      {open ? (
        <pre className="bg-green-50 text-gray-900 p-4 rounded-lg overflow-x-auto text-sm font-mono leading-relaxed text-left">
          <code>{code}</code>
        </pre>
      ) : (
        <div className="m-auto">{collapsedText}</div>
      )}
    </div>
  );
}
