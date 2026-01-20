import {
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
import type { SonamuDBConfig } from "sonamu";
import CheckIcon from "~icons/lucide/check";
import CodeIcon from "~icons/lucide/code";
import PlayIcon from "~icons/lucide/play";
import RefreshCwIcon from "~icons/lucide/refresh-cw";
import ToggleLeftIcon from "~icons/lucide/toggle-left";
import ToggleRightIcon from "~icons/lucide/toggle-right";
import TrashIcon from "~icons/lucide/trash";
import { useSD } from "../i18n";
import { defaultCatch } from "../services/sonamu.shared";
import { SonamuUIService } from "../services/sonamu-ui.service";
import { MigrationActionModal } from "./migrations/_migration_action_modal";

export const Route = createFileRoute("/migrations")({
  component: MigrationsIndex,
});

type MigrationsIndexProps = {};
function MigrationsIndex(_props: MigrationsIndexProps) {
  const SD = useSD();
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

  const toggleConnKeys = (preset: "ALL" | "LOCAL" | "REMOTE" | "TESTING" | "FIXTURE") => {
    const targetKeys: (keyof SonamuDBConfig)[] = (() => {
      switch (preset) {
        case "ALL":
          return ["test", "fixture", "development_master", "production_master"];
        case "LOCAL":
          return ["test"];
        case "REMOTE":
          return ["fixture", "development_master", "production_master"];
        case "TESTING":
          return ["test", "fixture"];
        case "FIXTURE":
          return ["fixture"];
      }
    })();

    if (targetKeys.filter((key) => selectedConnKeys.includes(key)).length === targetKeys.length) {
      setSelectedConnKeys(selectedConnKeys.filter((key) => !targetKeys.includes(key)));
    } else if (diff(targetKeys, selectedConnKeys).length > 0) {
      setSelectedConnKeys(targetKeys);
    } else {
      setSelectedConnKeys(unique([...selectedConnKeys, ...targetKeys]));
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
                            <TooltipTrigger>
                              {`${conn.name} / ${conn.status}`}
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>${conn.connString}</p>
                            </TooltipContent>
                          </Tooltip>
                        }
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedConnKeys(unique([...selectedConnKeys, conn.connKey]));
                          } else {
                            setSelectedConnKeys(
                              selectedConnKeys.filter((key) => key !== conn.connKey),
                            );
                          }
                        }}
                      />
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {conns.some((conn) => conn.status === "error" || !!migrationStatusError) && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <b>{SD("migration.error.connections")}</b>
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
