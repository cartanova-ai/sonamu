import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
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
import classNames from "classnames";
import { Fragment, type ReactNode, useState } from "react";
import {
  type MigrationCode,
  type MigrationConnectionMeta,
  type MigrationConnectionStatus,
  type MigrationTarget,
} from "sonamu";
import CodeIcon from "~icons/lucide/code";
import GlobeIcon from "~icons/lucide/globe";
import PlayIcon from "~icons/lucide/play";
import RefreshCwIcon from "~icons/lucide/refresh-cw";
import TriangleAlertIcon from "~icons/lucide/triangle-alert";
import Undo2Icon from "~icons/lucide/undo-2";

import { useSonamuContext } from "../../contexts/sonamu-provider";
import { SonamuUIService } from "../../services/sonamu-ui.service";

type MigrationEditor = "vscode" | "cursor" | "zed";

export type MigrationStatusQueryView = {
  data?: { status: MigrationConnectionStatus };
  error: Error | null;
  isFetching: boolean;
  refetch: () => void;
};

type MigrationMatrixProps = {
  connections: MigrationConnectionMeta[];
  statusQueries: MigrationStatusQueryView[];
  codes: MigrationCode[];
  selectedConnections: MigrationTarget[];
  detailed: boolean;
  actionsDisabled: boolean;
  onDetailedChange: (detailed: boolean) => void;
  onConnectionToggle: (connKey: MigrationTarget) => void;
  onApply: () => void;
  onRollback: () => void;
  onOpenCode: (path: string, editor: MigrationEditor) => void;
};

function FileState({ children, tone }: { children: ReactNode; tone: "green" | "yellow" }) {
  return (
    <span
      className={classNames(
        "migration-status-in inline-block rounded px-2 py-1 text-xs font-bold text-white",
        tone === "green" ? "bg-green-500" : "bg-yellow-500",
      )}
    >
      {children}
    </span>
  );
}

function RemoteIndicator() {
  const { SD } = useSonamuContext();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={SD("migration.remoteDb")}
          title={SD("migration.remoteDb")}
          className="inline-flex shrink-0 cursor-pointer rounded-sm border-0 bg-transparent p-0 text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-muted-foreground/40"
          onClick={(event) => event.stopPropagation()}
        >
          <GlobeIcon className="size-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent aria-label={SD("migration.remoteDb")} className="w-auto px-3 py-2 text-xs">
        <p>{SD("migration.remoteDb")}</p>
      </PopoverContent>
    </Popover>
  );
}

function ConnectionHeader({
  connection,
  query,
  selected,
  detailed,
  onToggle,
}: {
  connection: MigrationConnectionMeta;
  query: MigrationStatusQueryView;
  selected: boolean;
  detailed: boolean;
  onToggle: () => void;
}) {
  const { SD } = useSonamuContext();
  const [errorOpen, setErrorOpen] = useState(false);
  const status = query.data?.status;
  const error = status?.error ?? query.error?.message;
  const ready = !query.isFetching && error === undefined && status?.status !== "error";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={classNames(
            "relative flex w-max min-w-0 flex-col gap-1 px-4",
            detailed ? "max-w-[252px] py-2" : "py-1",
            { "opacity-60": error !== undefined },
          )}
        >
          <div className="flex items-center gap-1.5">
            <Checkbox
              aria-label={SD("migration.matrix.selectConnection").replace(
                "{name}",
                connection.name,
              )}
              checked={selected}
              disabled={!ready}
              onCheckedChange={onToggle}
              onClick={(event) => event.stopPropagation()}
            />
            <span
              className={classNames("min-w-0 truncate", { "migration-shimmer": query.isFetching })}
            >
              {connection.name}
            </span>
            {(status?.pending.length ?? 0) > 0 ? (
              <span className="shrink-0 font-bold text-yellow-600">({status?.pending.length})</span>
            ) : null}
            {error !== undefined ? (
              <Popover open={errorOpen} onOpenChange={setErrorOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={SD("migration.matrix.errorDetail").replace(
                      "{name}",
                      connection.name,
                    )}
                    className="shrink-0 cursor-pointer rounded-full border border-destructive/40 bg-transparent px-1.5 py-0.5 text-[10px]! font-medium leading-none! text-destructive outline-none hover:bg-destructive/5 focus-visible:ring-2 focus-visible:ring-destructive/30"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {SD("migration.matrix.error")}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  aria-label={SD("migration.matrix.errorTitle").replace("{name}", connection.name)}
                  className="w-[440px] max-w-[calc(100vw-2rem)] space-y-2 normal-case"
                  tabIndex={-1}
                  onKeyDown={(event) => {
                    if (event.key === "Tab") setErrorOpen(false);
                  }}
                >
                  <div className="flex items-center gap-2 font-bold text-destructive">
                    <TriangleAlertIcon className="size-4 shrink-0" />{" "}
                    {SD("migration.matrix.errorTitle").replace("{name}", connection.name)}
                  </div>
                  <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap break-all rounded-md border border-red-200 bg-red-50 p-3 font-mono text-xs text-red-800">
                    {error}
                  </pre>
                </PopoverContent>
              </Popover>
            ) : null}
            {detailed ? (
              <Button
                size="xs"
                variant="ghost"
                className="-mr-1 ml-auto hover:bg-black/10 hover:text-foreground"
                icon={<RefreshCwIcon className={query.isFetching ? "animate-spin" : ""} />}
                disabled={query.isFetching}
                aria-label={SD("migration.matrix.refreshStatus").replace("{name}", connection.name)}
                onClick={(event) => {
                  event.stopPropagation();
                  query.refetch();
                }}
              />
            ) : null}
          </div>
          {detailed ? (
            <div className="flex min-w-0 flex-col gap-0.5 pl-6 font-mono text-[11px] font-normal normal-case text-muted-foreground">
              <span className="flex min-w-0 items-center gap-1">
                <span className="truncate">
                  {connection.host}:{connection.port}
                </span>
                {connection.remote ? <RemoteIndicator /> : null}
              </span>
              <span className="truncate">{connection.database}</span>
            </div>
          ) : null}
          {error === undefined && (query.isFetching || status !== undefined) ? (
            <span className="sr-only">
              {query.isFetching
                ? SD("migration.matrix.connectionChecking")
                : SD("migration.matrix.connectionOk")}
            </span>
          ) : null}
        </div>
      </TooltipTrigger>
      <TooltipContent className="space-y-0.5 font-mono text-xs">
        <p>
          {connection.host}:{connection.port}/{connection.database}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

export function MigrationMatrix({
  connections,
  statusQueries,
  codes,
  selectedConnections,
  detailed,
  actionsDisabled,
  onDetailedChange,
  onConnectionToggle,
  onApply,
  onRollback,
  onOpenCode,
}: MigrationMatrixProps) {
  const { SD } = useSonamuContext();
  const [expandedCodes, setExpandedCodes] = useState<string[]>([]);
  const [loadingCodes, setLoadingCodes] = useState<string[]>([]);
  const [codeContents, setCodeContents] = useState<Record<string, string>>({});
  const [codeErrors, setCodeErrors] = useState<Record<string, string>>({});
  const totalPending = connections.reduce((total, connection, index) => {
    return selectedConnections.includes(connection.connKey)
      ? total + (statusQueries[index]?.data?.status.pending.length ?? 0)
      : total;
  }, 0);

  const toggleCodePreview = async (codeName: string) => {
    if (expandedCodes.includes(codeName)) {
      setExpandedCodes((current) => current.filter((name) => name !== codeName));
      return;
    }

    setExpandedCodes((current) => [...current, codeName]);
    if (codeContents[codeName] !== undefined) return;

    setLoadingCodes((current) => [...current, codeName]);
    setCodeErrors((current) => {
      const next = { ...current };
      delete next[codeName];
      return next;
    });
    try {
      const { code } = await SonamuUIService.getMigrationCode(codeName);
      setCodeContents((current) => ({ ...current, [codeName]: code }));
    } catch (caught) {
      setCodeErrors((current) => ({
        ...current,
        [codeName]: caught instanceof Error ? caught.message : String(caught),
      }));
    } finally {
      setLoadingCodes((current) => current.filter((name) => name !== codeName));
    }
  };

  return (
    <section>
      <h3 className="flex items-center gap-3">
        {SD("migration.matrix.title")}
        <label
          htmlFor="matrix-detailed-toggle"
          className="flex w-fit cursor-pointer items-center gap-1.5 text-sm leading-none! font-normal text-muted-foreground"
        >
          <Checkbox
            id="matrix-detailed-toggle"
            checked={detailed}
            onCheckedChange={(checked) => onDetailedChange(checked === true)}
          />
          {SD("migration.matrix.detailed")}
        </label>
        <span className="ml-auto flex items-center gap-2 text-sm font-normal">
          <Button
            size="sm"
            icon={<PlayIcon />}
            disabled={actionsDisabled || totalPending === 0}
            onClick={onApply}
          >
            {SD("migration.applyToLatest")}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            icon={<Undo2Icon />}
            disabled={actionsDisabled}
            onClick={onRollback}
          >
            {SD("migration.rollback")}
          </Button>
        </span>
      </h3>
      <Table className="border-separate border-spacing-x-0.5 border-spacing-y-0 text-[0.9em]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="bg-gray-100">{SD("migration.matrix.filename")}</TableHead>
            {connections.map((connection, index) => {
              const query = statusQueries[index];
              const selected = selectedConnections.includes(connection.connKey);
              if (query === undefined) return null;
              const ready =
                !query.isFetching &&
                query.data?.status.status !== "error" &&
                query.data?.status.error === undefined &&
                !query.error;
              return (
                <TableHead
                  key={connection.connKey}
                  style={{ width: "1px" }}
                  className={classNames("h-auto p-0! align-middle", {
                    "bg-[#dafde6]": selected,
                    "bg-gray-100": !selected,
                    "cursor-pointer select-none": ready,
                  })}
                  onClick={() => {
                    if (ready) onConnectionToggle(connection.connKey);
                  }}
                >
                  <ConnectionHeader
                    connection={connection}
                    query={query}
                    selected={selected}
                    detailed={detailed}
                    onToggle={() => onConnectionToggle(connection.connKey)}
                  />
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {codes.length === 0 ? (
            <TableRow>
              <TableCell colSpan={connections.length + 1}>
                {SD("migration.matrix.noFiles")}
              </TableCell>
            </TableRow>
          ) : null}
          {codes.map((code) => (
            <Fragment key={code.name}>
              <TableRow>
                <TableCell className="border-b font-mono">
                  <span className="flex items-center gap-1">
                    {code.name}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-label={SD("migration.matrix.openCode").replace("{name}", code.name)}
                          size="xs"
                          variant="secondary"
                          icon={<CodeIcon />}
                          className="ml-1"
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={() => void toggleCodePreview(code.name)}>
                          {SD("migration.matrix.previewHere")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-xs text-muted-foreground">
                          {SD("migration.matrix.openInEditor")}
                        </DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => onOpenCode(code.path, "vscode")}>
                          VS Code
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onOpenCode(code.path, "cursor")}>
                          Cursor
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onOpenCode(code.path, "zed")}>
                          Zed
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </span>
                </TableCell>
                {connections.map((connection, index) => {
                  const query = statusQueries[index];
                  const status = query?.data?.status;
                  const selectable =
                    !query?.isFetching &&
                    status?.status !== "error" &&
                    status?.error === undefined &&
                    !query?.error;
                  return (
                    <TableCell
                      key={connection.connKey}
                      className={classNames("border-b px-4 py-2 text-center", {
                        "bg-[#dafde6]": selectedConnections.includes(connection.connKey),
                        "bg-gray-50/70": !selectedConnections.includes(connection.connKey),
                        "cursor-pointer select-none": selectable,
                      })}
                      onClick={() => {
                        if (selectable) onConnectionToggle(connection.connKey);
                      }}
                    >
                      {query?.isFetching || status === undefined ? (
                        <Skeleton className="inline-block h-6 w-16 rounded align-middle" />
                      ) : status.status === "error" || status.error !== undefined || query.error ? (
                        <span className="text-muted-foreground/40">—</span>
                      ) : status.pending.includes(code.name) ? (
                        <FileState tone="yellow">{SD("migration.status.pending")}</FileState>
                      ) : (
                        <FileState tone="green">{SD("migration.status.applied")}</FileState>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
              {expandedCodes.includes(code.name) ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={connections.length + 1} className="py-2">
                    {loadingCodes.includes(code.name) ? (
                      <Skeleton className="h-28 w-full" />
                    ) : codeErrors[code.name] !== undefined ? (
                      <pre className="whitespace-pre-wrap break-all rounded-lg border border-red-200 bg-red-50 p-4 font-mono text-xs text-destructive">
                        {codeErrors[code.name]}
                      </pre>
                    ) : (
                      <pre className="overflow-x-auto rounded-lg bg-green-50 p-4 font-mono text-sm leading-relaxed text-gray-900">
                        <code>{codeContents[code.name]}</code>
                      </pre>
                    )}
                  </TableCell>
                </TableRow>
              ) : null}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
