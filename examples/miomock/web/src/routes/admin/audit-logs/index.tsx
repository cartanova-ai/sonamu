import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  DateInput,
  EnumSelect,
  Input,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sonamu-kit/react-components/components";
import { type TableCol } from "@sonamu-kit/react-components/components";
import { datetimeF, useListParams } from "@sonamu-kit/react-components/lib";
import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import EyeIcon from "~icons/lucide/eye";
import ListIcon from "~icons/mdi/format-list-bulleted";
import SearchIcon from "~icons/mdi/magnify";

import { SD } from "@/i18n/sd.generated";
import { AuditLogListParams } from "@/services/audit-log/audit-log.types";
import { AuditLogService } from "@/services/services.generated";
import {
  type AuditLogAction as AuditLogActionType,
  AuditLogAction,
  type AuditLogSubsetA,
  AuditLogActionLabel,
  AuditLogOrderBy,
  AuditLogOrderByLabel,
  AuditLogSearchField,
  AuditLogSearchFieldLabel,
} from "@/services/sonamu.generated";

export const Route = createFileRoute("/admin/audit-logs/")({
  head: () => ({
    meta: [{ title: "감사 로그" }, { name: "description", content: "감사 로그 목록" }],
  }),
  component: AuditLogList,
});

const ENTITY_TYPES = ["Company", "Department", "Employee", "Project", "Tag", "Document"] as const;

type AuditLogFilterParams = AuditLogListParams & {
  action?: AuditLogActionType;
};

const actionBadgeVariant = {
  create: "default",
  update: "secondary",
  delete: "destructive",
} satisfies Record<AuditLogActionType, "default" | "secondary" | "destructive" | "outline">;

function createAuditLogColumns(onOpenDetail: (id: number) => void): TableCol<AuditLogSubsetA>[] {
  return [
    {
      label: "ID",
      tc: (row) => <>{row.id}</>,
      fit: true,
      align: "center",
    },
    {
      label: SD("common.createdAt"),
      tc: (row) => <span>{datetimeF(row.created_at)}</span>,
      fit: true,
    },
    {
      label: SD("entity.AuditLog.actor_id"),
      tc: (row) => <span className="text-xs">{row.actor_id ?? "-"}</span>,
      fit: true,
    },
    {
      label: SD("entity.AuditLog.action"),
      tc: (row) => (
        <Badge variant={actionBadgeVariant[row.action] ?? "outline"}>
          {AuditLogActionLabel[row.action]}
        </Badge>
      ),
      fit: true,
      align: "center",
    },
    {
      label: SD("entity.AuditLog.entity_type"),
      tc: (row) => <>{row.entity_type}</>,
      fit: true,
    },
    {
      label: SD("entity.AuditLog.entity_id"),
      tc: (row) => <>{row.entity_id}</>,
      fit: true,
      align: "center",
    },
    {
      label: SD("common.manage"),
      fit: true,
      align: "center",
      tc: (row) => (
        <Button
          variant="outline"
          size="xs"
          icon={<EyeIcon />}
          onClick={() => onOpenDetail(row.id)}
        />
      ),
    },
  ];
}

function AuditLogList() {
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [actionFilter, setActionFilter] = useState<AuditLogActionType | "">("");
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);

  const { listParams, register, setListParams } = useListParams(AuditLogListParams, {
    num: 20,
    page: 1,
    keyword: "",
    search: AuditLogSearchField.options[0],
    orderBy: AuditLogOrderBy.options[0],
  });

  const params: AuditLogFilterParams = { ...listParams };
  if (entityTypeFilter) params.entity_type = entityTypeFilter;
  if (actionFilter) params.action = actionFilter;
  if (dateFrom) params.date_from = dateFrom;
  if (dateTo) params.date_to = dateTo;

  const { data, isLoading } = AuditLogService.useAuditLogs("A", params);
  const { rows, total } = data ?? {};

  const PAGE = {
    title: SD("entity.list")(SD("entity.AuditLog")),
  };

  const columns = createAuditLogColumns((id) => {
    setDetailId(id);
    setDetailOpen(true);
  });

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-[1800px] mx-auto p-8">
        <div className="space-y-6 mb-8">
          {/* Header */}
          <div className="flex items-center gap-2">
            <ListIcon className="h-5 w-5" />
            <span className="text-lg font-semibold h-5">{PAGE.title}</span>
          </div>

          <Card className="shadow-sm border-border/40 overflow-hidden">
            <CardHeader className="pb-0 px-0 pt-0">
              <div className="bg-gray-100 px-6 py-4 space-y-3">
                {/* Row 1: Search */}
                <div className="flex items-center gap-3 flex-wrap">
                  <EnumSelect
                    enum={AuditLogSearchField}
                    labels={AuditLogSearchFieldLabel}
                    {...register("search")}
                    placeholder={SD("common.searchType")}
                    className="w-50 h-8 bg-white border-gray-300 text-xs"
                  />
                  <div className="relative flex-1 max-w-xs">
                    <Input
                      {...register("keyword")}
                      placeholder={SD("common.search")}
                      className="h-8 pr-8 text-xs bg-white border-gray-300"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<SearchIcon />}
                      className="absolute right-0 top-0 h-8 w-8 hover:bg-transparent"
                    />
                  </div>
                </div>

                {/* Row 2: Filters */}
                <div className="flex items-center gap-3 flex-wrap">
                  <select
                    value={entityTypeFilter}
                    onChange={(e) => {
                      setEntityTypeFilter(e.target.value);
                      setListParams({ ...listParams, page: 1 });
                    }}
                    className="h-8 px-2 text-xs bg-white border border-gray-300 rounded-md"
                  >
                    <option value="">{SD("entity.AuditLog.entity_type")} (전체)</option>
                    {ENTITY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>

                  <EnumSelect
                    enum={AuditLogAction}
                    labels={AuditLogActionLabel}
                    value={actionFilter}
                    onValueChange={(v) => {
                      setActionFilter(Array.isArray(v) ? "" : (v ?? ""));
                      setListParams({ ...listParams, page: 1 });
                    }}
                    placeholder={`${SD("entity.AuditLog.action")} (전체)`}
                    className="w-32 h-8 bg-white border-gray-300 text-xs"
                  />

                  <DateInput
                    value={dateFrom}
                    onValueChange={(v) => {
                      setDateFrom(v);
                      setListParams({ ...listParams, page: 1 });
                    }}
                    placeholder="시작일"
                    className="w-36 h-8 text-xs bg-white border-gray-300"
                  />
                  <span className="text-xs text-muted-foreground">~</span>
                  <DateInput
                    value={dateTo}
                    onValueChange={(v) => {
                      setDateTo(v);
                      setListParams({ ...listParams, page: 1 });
                    }}
                    placeholder="종료일"
                    className="w-36 h-8 text-xs bg-white border-gray-300"
                  />
                </div>

                {/* Row 3: Sort & Count */}
                <div className="flex items-center gap-3 flex-wrap">
                  <EnumSelect
                    enum={AuditLogOrderBy}
                    labels={AuditLogOrderByLabel}
                    {...register("orderBy")}
                    placeholder={SD("common.sort")}
                    textPrefix={`${SD("common.sort")}: `}
                    className="w-50 h-8 bg-white border-gray-300 text-xs"
                  />
                  <span className="text-xs text-muted-foreground">
                    {SD("common.results")(total ?? 0)}
                  </span>
                </div>
              </div>
            </CardHeader>

            <CardContent className="px-6 pb-6 pt-6 bg-white">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-gray-100">
                    {columns.map((col, idx) => (
                      <TableHead key={idx} fit={col.fit} align={col.align}>
                        {col.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!isLoading &&
                    rows &&
                    rows.map((row) => (
                      <Fragment key={row.id}>
                        <TableRow>
                          {columns.map((col, idx) => (
                            <TableCell key={idx} fit={col.fit} align={col.align} className="py-3">
                              {col.tc(row)}
                            </TableCell>
                          ))}
                        </TableRow>
                      </Fragment>
                    ))}
                </TableBody>
              </Table>

              <Pagination
                {...register("page")}
                total={total ?? 0}
                itemsPerPage={listParams.num ?? 20}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Detail Dialog */}
      {detailOpen && detailId && (
        <AuditLogDetailDialog
          id={detailId}
          onClose={() => {
            setDetailOpen(false);
            setDetailId(null);
          }}
        />
      )}
    </div>
  );
}

type AuditLogDetailDialogProps = {
  id: number;
  onClose: () => void;
};

function AuditLogDetailDialog({ id, onClose }: AuditLogDetailDialogProps) {
  const { data: log } = AuditLogService.useAuditLog("A", id, { enabled: !!id });

  if (!log) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[80vh] overflow-auto m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              {SD("entity.AuditLog")} #{log.id}
            </h3>
            <Badge variant={actionBadgeVariant[log.action] ?? "outline"}>
              {AuditLogActionLabel[log.action]}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-xs text-gray-500">{SD("common.createdAt")}</span>
              <p>{datetimeF(log.created_at)}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500">{SD("entity.AuditLog.actor_id")}</span>
              <p>{log.actor_id ?? "-"}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500">{SD("entity.AuditLog.entity_type")}</span>
              <p>{log.entity_type}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500">{SD("entity.AuditLog.entity_id")}</span>
              <p>{log.entity_id}</p>
            </div>
          </div>

          {/* Diff View */}
          <div className="grid grid-cols-2 gap-4">
            {log.action !== "create" && (
              <div>
                <h4 className="text-xs font-medium text-gray-500 mb-2">
                  {SD("entity.AuditLog.old_value")}
                </h4>
                <pre className="bg-red-50 border border-red-200 rounded p-3 text-xs overflow-auto max-h-60">
                  {log.old_value ? JSON.stringify(log.old_value, null, 2) : "-"}
                </pre>
              </div>
            )}
            {log.action !== "delete" && (
              <div className={log.action === "create" ? "col-span-2" : ""}>
                <h4 className="text-xs font-medium text-gray-500 mb-2">
                  {SD("entity.AuditLog.new_value")}
                </h4>
                <pre className="bg-green-50 border border-green-200 rounded p-3 text-xs overflow-auto max-h-60">
                  {log.new_value ? JSON.stringify(log.new_value, null, 2) : "-"}
                </pre>
              </div>
            )}
            {log.action === "delete" && (
              <div className="col-span-2">
                <h4 className="text-xs font-medium text-gray-500 mb-2">
                  {SD("entity.AuditLog.old_value")}
                </h4>
                <pre className="bg-red-50 border border-red-200 rounded p-3 text-xs overflow-auto max-h-60">
                  {log.old_value ? JSON.stringify(log.old_value, null, 2) : "-"}
                </pre>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>
              닫기
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
