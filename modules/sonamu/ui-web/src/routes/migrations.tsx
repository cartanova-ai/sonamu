import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@sonamu-kit/react-components";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { type MigrationTarget } from "sonamu";
import TriangleAlertIcon from "~icons/lucide/triangle-alert";

import { useSonamuContext } from "../contexts/sonamu-provider";
import { SonamuUIService } from "../services/sonamu-ui.service";
import { defaultCatch } from "../services/sonamu.shared";
import { MigrationApplyDialog } from "./migrations/_migration_apply_dialog";
import { MigrationMatrix } from "./migrations/_migration_matrix";
import { useMigrationDetailedMode } from "./migrations/_migration_preferences";
import { MigrationPreview } from "./migrations/_migration_preview";
import { MigrationRollbackDialog } from "./migrations/_migration_rollback_dialog";

import "./migrations/migrations.css";

export const Route = createFileRoute("/migrations")({ component: MigrationsIndex });

type DialogSession = {
  kind: "apply" | "rollback";
  targets: MigrationTarget[];
  pendingByConnection: Record<string, string[]>;
  sessionId: number;
};

function normalizeMigrationTargets(
  targets: MigrationTarget[],
  connections: Array<{ connKey: MigrationTarget; host: string; port: number; database: string }>,
) {
  const selectedTargets = new Set(targets);
  const physicalDatabases = new Set<string>();
  return connections.flatMap((connection) => {
    if (!selectedTargets.has(connection.connKey)) return [];
    const physicalKey = `${connection.host}:${connection.port}/${connection.database}`;
    if (physicalDatabases.has(physicalKey)) return [];
    physicalDatabases.add(physicalKey);
    return [connection.connKey];
  });
}

function MigrationsIndex() {
  const { SD } = useSonamuContext();
  const queryClient = useQueryClient();
  const connectionsQuery = SonamuUIService.useMigrationConnections();
  const codesQuery = SonamuUIService.useMigrationCodes();
  const connections = connectionsQuery.data?.connections ?? [];
  const codes = codesQuery.data?.codes ?? [];
  const statusQueries = SonamuUIService.useMigrationConnectionStatuses(connections);
  const [selectedConnections, setSelectedConnections] = useState<MigrationTarget[]>([]);
  const [productionSelectionPending, setProductionSelectionPending] = useState(false);
  const [requestedCompareKey, setRequestedCompareKey] = useState<MigrationTarget>("development");
  const [dialog, setDialog] = useState<DialogSession>();
  const [generating, setGenerating] = useState(false);
  const [detailed, setDetailed] = useMigrationDetailedMode();

  const eligibleCompareConnections = connections.filter((_connection, index) => {
    const status = statusQueries[index]?.data?.status;
    return status?.status === 0 && status.error === undefined;
  });
  const compareConnKey = eligibleCompareConnections.some(
    ({ connKey }) => connKey === requestedCompareKey,
  )
    ? requestedCompareKey
    : eligibleCompareConnections[0]?.connKey;
  const preparedCodesQuery = SonamuUIService.useMigrationPreparedCodes(compareConnKey);
  const selectedHasUnavailableConnection = selectedConnections.some((connKey) => {
    const index = connections.findIndex((connection) => connection.connKey === connKey);
    const query = statusQueries[index];
    return (
      query === undefined ||
      query.isFetching ||
      query.error !== null ||
      query.data?.status.status === "error" ||
      query.data?.status.error !== undefined
    );
  });
  const actionsDisabled = selectedConnections.length === 0 || selectedHasUnavailableConnection;

  const toggleConnection = (connKey: MigrationTarget) => {
    // Production 신규 선택은 사용자가 위험을 확인할 때까지 반영하지 않습니다.
    if (connKey === "production" && !selectedConnections.includes(connKey)) {
      setProductionSelectionPending(true);
      return;
    }
    setSelectedConnections((current) =>
      current.includes(connKey) ? current.filter((key) => key !== connKey) : [...current, connKey],
    );
  };
  const confirmProductionSelection = () => {
    setSelectedConnections((current) =>
      current.includes("production") ? current : [...current, "production"],
    );
    setProductionSelectionPending(false);
  };
  const openDialog = (kind: DialogSession["kind"]) => {
    // 같은 물리 DB의 alias는 core 실행과 동일하게 커넥션 목록에서 앞선 항목만 유지합니다.
    const targets = normalizeMigrationTargets(selectedConnections, connections);
    const pendingByConnection = Object.fromEntries(
      targets.map((connKey) => {
        const index = connections.findIndex((connection) => connection.connKey === connKey);
        return [connKey, statusQueries[index]?.data?.status.pending ?? []];
      }),
    );
    setDialog({
      kind,
      targets,
      pendingByConnection,
      sessionId: Date.now(),
    });
  };
  const handleExecutionSettled = async (success: boolean) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["migrations", "status"] }),
      queryClient.invalidateQueries({ queryKey: ["migrations", "prepared-codes"] }),
    ]);
    if (success) setSelectedConnections([]);
  };
  const handleGenerate = async () => {
    if (compareConnKey === undefined) return;
    setGenerating(true);
    try {
      await SonamuUIService.migrationsGeneratePreparedCodes(compareConnKey);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["migrations", "codes"] }),
        queryClient.invalidateQueries({ queryKey: ["migrations", "status"] }),
        queryClient.invalidateQueries({ queryKey: ["migrations", "prepared-codes"] }),
      ]);
    } catch (error) {
      defaultCatch(error);
    } finally {
      setGenerating(false);
    }
  };
  if (connectionsQuery.error || codesQuery.error) {
    return (
      <div className="p-8">
        <div className="mx-auto my-[30vh] w-[50em] whitespace-pre-line border-2 border-red-500 bg-white p-[3em] leading-[2em]">
          {(connectionsQuery.error ?? codesQuery.error)?.message}
        </div>
      </div>
    );
  }

  const dialogConnections = (dialog?.targets ?? []).flatMap((target) => {
    const connection = connections.find(({ connKey }) => connKey === target);
    return connection === undefined ? [] : [connection];
  });
  return (
    <div className="p-8">
      <div className="block rounded-md border border-gray-200 bg-white p-4 shadow-sm">
        <div className="space-y-6 p-4">
          <MigrationPreview
            connections={eligibleCompareConnections}
            compareConnKey={compareConnKey}
            preparedCodes={preparedCodesQuery.data?.preparedCodes}
            error={preparedCodesQuery.error}
            loading={preparedCodesQuery.isFetching}
            generating={generating}
            onCompareConnKeyChange={setRequestedCompareKey}
            onGenerate={() => void handleGenerate()}
            onRetry={() => void preparedCodesQuery.refetch()}
          />
          <MigrationMatrix
            connections={connections}
            statusQueries={statusQueries}
            codes={codes}
            selectedConnections={selectedConnections}
            detailed={detailed}
            actionsDisabled={actionsDisabled}
            onDetailedChange={setDetailed}
            onConnectionToggle={toggleConnection}
            onApply={() => openDialog("apply")}
            onRollback={() => openDialog("rollback")}
            onOpenCode={(path, editor) => {
              void SonamuUIService.openEditor({ absPath: path, editor }).catch(defaultCatch);
            }}
          />
        </div>
      </div>
      {dialog?.kind === "apply" ? (
        <MigrationApplyDialog
          key={dialog.sessionId}
          open
          connections={dialogConnections}
          shadowConnection={connections.find(({ connKey }) => connKey === "test")}
          pendingByConnection={dialog.pendingByConnection}
          onOpenChange={(open) => {
            if (!open) setDialog(undefined);
          }}
          onSettled={handleExecutionSettled}
        />
      ) : null}
      {dialog?.kind === "rollback" ? (
        <MigrationRollbackDialog
          key={dialog.sessionId}
          open
          connections={dialogConnections}
          onOpenChange={(open) => {
            if (!open) setDialog(undefined);
          }}
          onSettled={handleExecutionSettled}
        />
      ) : null}
      <AlertDialog open={productionSelectionPending} onOpenChange={setProductionSelectionPending}>
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
            <AlertDialogCancel>{SD("common.cancel")}</AlertDialogCancel>
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
