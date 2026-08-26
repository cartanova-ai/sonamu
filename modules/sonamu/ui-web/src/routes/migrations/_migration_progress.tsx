import { Badge } from "@sonamu-kit/react-components";
import classNames from "classnames";
import { type ReactNode } from "react";
import { type MigrationConnectionMeta } from "sonamu";
import GlobeIcon from "~icons/lucide/globe";

import { useSonamuContext } from "../../contexts/sonamu-provider";
import { type MigrationExecutionTarget } from "./_migration_execution";

export function MigrationHeightReveal({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={classNames("migration-height-reveal grid", {
        "migration-height-reveal-open": open,
      })}
      aria-hidden={!open}
      inert={open ? undefined : true}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

export function MigrationErrorMessage({ message }: { message: string }) {
  return (
    <pre
      role="alert"
      className="m-0 whitespace-pre-wrap break-all rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 font-mono text-xs leading-relaxed text-destructive"
    >
      {message}
    </pre>
  );
}

export function RemoteTag() {
  const { SD } = useSonamuContext();
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-normal text-muted-foreground">
      <GlobeIcon className="size-3.5 shrink-0" />
      {SD("migration.remoteTag")}
    </span>
  );
}

type MigrationProgressCardProps = {
  connection?: MigrationConnectionMeta;
  connectionDisplay?: string;
  target: MigrationExecutionTarget;
  label?: string;
  verb: "apply" | "verify" | "rollback";
  dashed?: boolean;
  showProgress?: boolean;
  showDone?: boolean;
  showZeroFileDone?: boolean;
};

export function MigrationProgressCard({
  connection,
  connectionDisplay,
  target,
  label,
  verb,
  dashed = false,
  showProgress = true,
  showDone = true,
  showZeroFileDone = false,
}: MigrationProgressCardProps) {
  const { SD } = useSonamuContext();
  const total = target.files.length;
  const completed = Math.min(target.completed, total);
  const currentFile = target.currentFile ?? target.files[completed];
  const percent = total === 0 ? (target.done ? 100 : 0) : (completed / total) * 100;
  return (
    <div
      className={classNames("space-y-2 rounded-md border px-3 py-2", {
        "border-dashed bg-gray-50": dashed,
        "border-destructive/50": target.error !== undefined,
      })}
    >
      <div className="flex h-6 items-center gap-2">
        <b>{label ?? connection?.name ?? target.connKey}</b>
        {connection?.remote === true ? <RemoteTag /> : null}
        {target.error !== undefined ? (
          <Badge className="migration-pop ml-auto h-5 border border-destructive/30 bg-destructive/5 text-destructive">
            {SD("migration.progress.error")}
          </Badge>
        ) : showDone && target.done && (total > 0 || showZeroFileDone) ? (
          <Badge className="migration-pop ml-auto h-5 border border-primary/30 bg-primary/5 text-primary">
            {verb === "verify" ? SD("migration.progress.passed") : SD("migration.progress.done")}
          </Badge>
        ) : null}
      </div>
      {connectionDisplay !== undefined || connection !== undefined ? (
        <div className="break-all font-mono text-xs text-muted-foreground">
          {connectionDisplay ?? `${connection?.host}:${connection?.port}/${connection?.database}`}
        </div>
      ) : null}
      {showProgress && total > 0 ? (
        <div className="space-y-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
            <div
              className="migration-progress h-full rounded-full bg-primary"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="font-mono text-[11px] text-muted-foreground">
            {target.done
              ? `${total}/${total}`
              : `${SD(`migration.verb.${verb}`)} ${completed}/${total} · ${currentFile ?? SD("migration.progress.preparing")}`}
          </div>
        </div>
      ) : null}
      {target.error !== undefined ? <MigrationErrorMessage message={target.error} /> : null}
    </div>
  );
}
