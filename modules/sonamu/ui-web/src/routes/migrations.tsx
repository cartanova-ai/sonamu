import {
  Button,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  type TableCol,
  TableHead,
  TableHeader,
  TableRow,
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
import { defaultCatch } from "../services/sonamu.shared";
import { SonamuUIService } from "../services/sonamu-ui.service";
import { MigrationActionModal } from "./migrations/_migration_action_modal";

export const Route = createFileRoute("/migrations")({
  component: MigrationsIndex,
});

type MigrationsIndexProps = {};
function MigrationsIndex(_props: MigrationsIndexProps) {
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
      `Are you sure to delete the selected ${selectedCodeNames.length} migration codes?`,
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

  // Prepared Migration Codes 테이블 컬럼 정의
  type PreparedCode = NonNullable<typeof preparedCodes>[number];
  const preparedCodesColumns: TableCol<PreparedCode>[] = [
    {
      label: "Type",
      tc: (pcode) => <>{pcode.type}</>,
      fit: true,
    },
    {
      label: "Table",
      tc: (pcode) => <>{pcode.table}</>,
      fit: true,
    },
    {
      label: "Name",
      tc: (pcode) => <>{pcode.title}</>,
      fit: true,
    },
    {
      label: "Code",
      tc: (pcode) => <CodeViewer code={pcode.formatted ?? ""} open={isAllCodeViewerOpen} />,
    },
  ];

  // Migration Code Files 테이블 컬럼 정의 (동적 생성)
  type MigrationCode = NonNullable<typeof codes>[number];
  const getMigrationCodeColumns = (): TableCol<MigrationCode>[] => {
    if (!conns) return [];

    return [
      {
        label: (
          <div className="flex items-center gap-1">
            Name{" "}
            <Button
              icon={<CheckIcon />}
              size="xs"
              variant="blue"
              onClick={() => toggleAllFiles()}
            />
          </div>
        ),
        tc: (code) => (
          <div className="flex items-center gap-1">
            <Checkbox
              checked={selectedCodeNames.includes(code.name)}
              onCheckedChange={(checked) => {
                if (checked) {
                  setSelectedCodeNames(unique([...selectedCodeNames, code.name]));
                } else {
                  setSelectedCodeNames(selectedCodeNames.filter((name) => name !== code.name));
                }
              }}
            />
            <span className="ml-2">{code.name}</span>
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
          </div>
        ),
      },
      ...conns.map((conn) => ({
        label: (
          <Checkbox
            disabled={conn.status === "error" || !!migrationStatusError}
            checked={selectedConnKeys.includes(conn.connKey)}
            onCheckedChange={(checked: boolean) => {
              if (checked) {
                setSelectedConnKeys(unique([...selectedConnKeys, conn.connKey]));
              } else {
                setSelectedConnKeys(selectedConnKeys.filter((key) => key !== conn.connKey));
              }
            }}
          >
            <span className="ml-2">{`${conn.name} / ${conn.status}`}</span>
          </Checkbox>
        ),
        tc: (code: MigrationCode) => (
          <>
            {conn.pending.includes(code.name) ? (
              <span className="ui mini yellow label">
                <i className="minus icon" />
                PENDING
              </span>
            ) : conn.status === "error" || !!migrationStatusError ? (
              <span className="ui mini red label">
                <i className="times icon" />
                ERROR
              </span>
            ) : (
              <span className="ui mini green label">
                <i className="check icon" />
                APPLIED
              </span>
            )}
          </>
        ),
        fit: true,
      })),
    ];
  };

  if (error) {
    return (
      <div className="migrations-index">
        <div className="message-box error">{error.message}</div>
      </div>
    );
  }
  return (
    <div className="migrations-index">
      <div className={`ui segment migrations-index ${loading || isLoading ? "loading" : ""}`}>
        {preparedCodes && (
          <div className="prepared">
            <h3>
              Prepared Migration Codes{" "}
              <div className="flex gap-2 justify-end">
                <Button
                  icon={isAllCodeViewerOpen ? <ToggleRightIcon /> : <ToggleLeftIcon />}
                  size="xs"
                  onClick={() => setAllCodeViewerOpen(!isAllCodeViewerOpen)}
                >
                  Toggle codes
                </Button>
                <Button size="xs" icon={<PlayIcon />} onClick={() => generatePreparedCodes()}>
                  Generate
                </Button>
              </div>
            </h3>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent bg-gray-100">
                  {preparedCodesColumns.map((col, idx) => (
                    <TableHead key={idx} fit={col.fit}>
                      {col.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {migrationStatusError && (
                  <TableRow>
                    <TableCell colSpan={preparedCodesColumns.length}>
                      {migrationStatusError}
                    </TableCell>
                  </TableRow>
                )}
                {!migrationStatusError && preparedCodes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={preparedCodesColumns.length} className="text-center">
                      No prepared migration codes.
                    </TableCell>
                  </TableRow>
                )}
                {preparedCodes.map((pcode, pcodeIndex) => (
                  <TableRow key={pcodeIndex}>
                    {preparedCodesColumns.map((col, idx) => (
                      <TableCell
                        key={idx}
                        fit={col.fit}
                        style={
                          idx === preparedCodesColumns.length - 1
                            ? { padding: 0, width: 700, textAlign: "center" }
                            : undefined
                        }
                      >
                        {col.tc(pcode, pcodeIndex)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="ui border-b" />
          </div>
        )}
        <div className="codes">
          <h3>Migration Code Files</h3>
          <div className="tools">
            <div className="flex-1">
              <Button
                variant="destructive"
                icon={<TrashIcon />}
                disabled={selectedCodeNames.length === 0}
                onClick={() => confirmDelCodes()}
              >
                Delete codes
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
                Apply to Latest
              </Button>
              <Button
                variant="destructive"
                icon={<RefreshCwIcon />}
                disabled={selectedConnKeys.length === 0 || !!migrationStatusError}
                onClick={() => openActionModal("rollback")}
              >
                Rollback
              </Button>
            </div>
          </div>
          {conns &&
            codes &&
            (() => {
              const migrationCodeColumns = getMigrationCodeColumns();
              return (
                <Table className="mt-4">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent bg-gray-100">
                      {migrationCodeColumns.map((col, idx) => (
                        <TableHead
                          key={idx}
                          fit={col.fit}
                          style={idx > 0 ? { width: "150px" } : undefined}
                          className={
                            idx > 0 && conns[idx - 1]
                              ? classNames({
                                  "conn-selected": selectedConnKeys.includes(
                                    conns[idx - 1].connKey,
                                  ),
                                })
                              : undefined
                          }
                        >
                          {col.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conns.some((conn) => conn.status === "error" || !!migrationStatusError) && (
                      <TableRow>
                        <TableCell colSpan={migrationCodeColumns.length}>
                          <b>
                            Some connections are in error state. Please check the connection
                            settings and try again.
                          </b>
                        </TableCell>
                      </TableRow>
                    )}
                    {codes.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={migrationCodeColumns.length}>
                          No migration code files
                        </TableCell>
                      </TableRow>
                    )}
                    {codes.map((code, codeIndex) => (
                      <Fragment key={codeIndex}>
                        <TableRow>
                          {migrationCodeColumns.map((col, idx) => (
                            <TableCell
                              key={idx}
                              fit={col.fit}
                              className={
                                idx === 0
                                  ? "flex items-center gap-1"
                                  : idx > 0 && conns[idx - 1]
                                    ? classNames("conn-status", {
                                        "conn-selected": selectedConnKeys.includes(
                                          conns[idx - 1].connKey,
                                        ),
                                      })
                                    : undefined
                              }
                            >
                              {col.tc(code, codeIndex)}
                            </TableCell>
                          ))}
                        </TableRow>
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              );
            })()}
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
};
function CodeViewer({ code, open }: CodeViewerProps) {
  return (
    <div className="code-viewer">{open ? <code>{code}</code> : <div>Code is collapsed</div>}</div>
  );
}
