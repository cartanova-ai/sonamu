import {
  Badge,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
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
}: MigrationPreviewProps) {
  const { SD } = useSonamuContext();
  const [expanded, setExpanded] = useState(false);
  const [errorOpen, setErrorOpen] = useState(false);

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
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                <div role="alert" className="flex items-center justify-center gap-2">
                  <span>{SD("migration.preview.errorTitle")}</span>
                  <Popover open={errorOpen} onOpenChange={setErrorOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label={SD("migration.preview.errorDetail")}
                        className="shrink-0 cursor-pointer rounded-full border border-destructive/40 bg-transparent px-1.5 py-0.5 text-[10px]! font-medium leading-none! text-destructive outline-none hover:bg-destructive/5 focus-visible:ring-2 focus-visible:ring-destructive/30"
                      >
                        {SD("migration.preview.error")}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="center"
                      aria-label={SD("migration.preview.errorDetail")}
                      className="w-[440px] max-w-[calc(100vw-2rem)] space-y-2 normal-case"
                      tabIndex={-1}
                      onKeyDown={(event) => {
                        if (event.key === "Tab") setErrorOpen(false);
                      }}
                    >
                      <div className="flex items-center gap-2 font-bold text-destructive">
                        <TriangleAlertIcon className="size-4 shrink-0" />
                        {SD("migration.preview.errorTitle")}
                      </div>
                      <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap break-all rounded-md border border-red-200 bg-red-50 p-3 font-mono text-xs text-red-800">
                        {error.message}
                      </pre>
                    </PopoverContent>
                  </Popover>
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
