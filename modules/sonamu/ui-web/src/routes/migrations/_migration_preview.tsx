import {
  Badge,
  Button,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sonamu-kit/react-components";
import classNames from "classnames";
import { useState } from "react";
import { type GenMigrationCode, type MigrationConnectionMeta, type MigrationTarget } from "sonamu";
import CodeIcon from "~icons/lucide/code";
import PlayIcon from "~icons/lucide/play";
import RefreshCwIcon from "~icons/lucide/refresh-cw";
import TriangleAlertIcon from "~icons/lucide/triangle-alert";

import { useSonamuContext } from "../../contexts/sonamu-provider";

type MigrationPreviewProps = {
  connections: MigrationConnectionMeta[];
  compareConnKey?: MigrationTarget;
  preparedCodes?: GenMigrationCode[];
  error: Error | null;
  loading: boolean;
  generating: boolean;
  onCompareConnKeyChange: (connKey: MigrationTarget) => void;
  onGenerate: () => void;
  onRetry: () => void;
};

export function MigrationPreview({
  connections,
  compareConnKey,
  preparedCodes,
  error,
  loading,
  generating,
  onCompareConnKeyChange,
  onGenerate,
  onRetry,
}: MigrationPreviewProps) {
  const { SD } = useSonamuContext();
  const [expanded, setExpanded] = useState(false);

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h3 className="my-0! flex h-10 shrink-0 items-center">{SD("migration.preview.title")}</h3>
        <span className="flex h-10 min-w-0 basis-full items-center gap-2 text-sm font-normal sm:ml-4 sm:basis-auto">
          <span className="shrink-0">{SD("migration.preview.compareBase")}</span>
          {connections.length > 0 && compareConnKey !== undefined ? (
            <Select
              className="min-w-0 flex-1 border-border sm:w-[180px] sm:flex-none"
              items={connections.map(({ connKey, name }) => ({ value: connKey, label: name }))}
              value={compareConnKey}
              onValueChange={(value) => {
                if (value !== undefined) onCompareConnKeyChange(value as MigrationTarget);
              }}
            />
          ) : (
            <span className="text-muted-foreground">{SD("migration.preview.noComparable")}</span>
          )}
        </span>
        <span className="flex min-w-0 basis-full flex-wrap items-center gap-2 sm:ml-auto sm:basis-auto sm:flex-nowrap">
          <Button
            size="sm"
            variant="secondary"
            icon={<CodeIcon />}
            disabled={(preparedCodes?.length ?? 0) === 0}
            aria-expanded={expanded}
            aria-controls="proposed-code-previews"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? SD("migration.preview.collapseAll") : SD("migration.preview.expandAll")}
          </Button>
          <Button
            size="sm"
            icon={<PlayIcon />}
            disabled={
              compareConnKey === undefined ||
              preparedCodes === undefined ||
              error !== null ||
              loading ||
              generating
            }
            onClick={onGenerate}
          >
            {SD("migration.preview.generate").replace(
              "{count}",
              String(preparedCodes?.length ?? 0),
            )}
          </Button>
        </span>
      </div>
      <Table className="text-[0.9em]">
        <TableHeader>
          <TableRow className="hover:bg-transparent bg-gray-100">
            <TableHead style={{ width: "90px" }}>{SD("common.type")}</TableHead>
            <TableHead style={{ width: "160px" }}>{SD("common.table")}</TableHead>
            <TableHead>{SD("migration.preview.fileToCreate")}</TableHead>
            <TableHead style={{ width: "50%" }}>{SD("common.code")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody id="proposed-code-previews">
          {error !== null ? (
            <TableRow className="bg-destructive/5 hover:bg-destructive/5">
              <TableCell colSpan={4} className="border border-destructive/30 py-3">
                <div role="alert" className="flex items-start gap-2 text-destructive">
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="font-medium">{SD("migration.preview.errorTitle")}</div>
                    <pre className="m-0 whitespace-pre-wrap break-all font-mono text-xs leading-relaxed">
                      {error.message}
                    </pre>
                  </div>
                  <Button size="xs" variant="outline" icon={<RefreshCwIcon />} onClick={onRetry}>
                    {SD("migration.preview.retry")}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ) : (preparedCodes?.length ?? 0) === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                {SD("migration.preview.noChanges")}
              </TableCell>
            </TableRow>
          ) : null}
          {error === null
            ? preparedCodes?.map((change, index) => (
                <TableRow key={`${change.title}-${index}`}>
                  <TableCell className="align-top py-3">
                    <Badge
                      variant="outline"
                      className={classNames("w-16 justify-center", {
                        "border-green-300 bg-green-100/60 text-green-800": change.type === "normal",
                        "border-gray-300 bg-gray-100 text-gray-600": change.type === "foreign",
                      })}
                    >
                      {change.type.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono align-top py-3">{change.table}</TableCell>
                  <TableCell className="font-mono align-top py-3">{change.title}</TableCell>
                  <TableCell className="py-2">
                    {expanded ? (
                      <pre className="max-w-full overflow-x-auto whitespace-pre rounded-lg bg-green-50 p-4 font-mono text-sm leading-relaxed text-gray-900">
                        <code>{change.formatted ?? ""}</code>
                      </pre>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            : null}
        </TableBody>
      </Table>
    </section>
  );
}
