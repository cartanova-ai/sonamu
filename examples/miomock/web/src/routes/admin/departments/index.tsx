import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  EnumSelect,
  extractFieldMetaFromSchema,
  Input,
  Pagination,
  SonamuFilterModal,
  SonamuFilterPopover,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sonamu-kit/react-components/components";
import { type Rule, type TableCol } from "@sonamu-kit/react-components/components";
import { datetimeF, numF, useListParams } from "@sonamu-kit/react-components/lib";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import EditIcon from "~icons/lucide/square-pen";
import TrashIcon from "~icons/lucide/trash-2";
import FilterIcon from "~icons/mdi/filter-variant";
import ListIcon from "~icons/mdi/format-list-bulleted";
import SearchIcon from "~icons/mdi/magnify";

import { translateFilterEnumKey } from "@/admin-common/filter-utils";
import { SD } from "@/i18n/sd.generated";
import { DepartmentListParams } from "@/services/department/department.types";
import { DepartmentService } from "@/services/services.generated";
import {
  DepartmentBaseSchema,
  DepartmentOrderBy,
  DepartmentOrderByLabel,
  type DepartmentSubsetA,
  DepartmentSearchField,
  DepartmentSearchFieldLabel,
} from "@/services/sonamu.generated";

export const Route = createFileRoute("/admin/departments/")({
  head: () => ({
    meta: [
      { title: "부서 List" },
      { name: "description", content: SD("entity.listManage")("부서") },
    ],
  }),
  component: DepartmentList,
});

type DepartmentListProps = {};

function createDepartmentColumns(
  onEdit: (id: number) => void,
  onDelete: (id: number) => void,
): TableCol<DepartmentSubsetA>[] {
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
      label: SD("entity.Department.name"),
      tc: (row) => <>{row.name}</>,
    },
    {
      label: SD("entity.Department.employee_count"),
      tc: (row) => <>{numF(row.employee_count)}</>,
    },
    {
      label: SD("entity.Department.company"),
      tc: (row) => <>{row.company.name}</>,
    },
    {
      label: SD("entity.Department.parent"),
      tc: (row) => <>{row.parent?.name}</>,
    },
    {
      label: SD("entity.Department.employees"),
      tc: () => <>{/* array row.employees */}</>,
    },
    {
      label: SD("common.manage"),
      fit: true,
      align: "center",
      tc: (row) => (
        <div className="flex items-center justify-center gap-1">
          <Button variant="yellow" size="xs" icon={<EditIcon />} onClick={() => onEdit(row.id)} />
          <Button variant="red" size="xs" icon={<TrashIcon />} onClick={() => onDelete(row.id)} />
        </div>
      ),
    },
  ];
}

function DepartmentList({}: DepartmentListProps) {
  const navigate = useNavigate();

  // 상태 관리
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: number; name?: string } | null>(null);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [appliedRules, setAppliedRules] = useState<Rule[]>([]);

  // 리스트 필터
  const { listParams, register, setListParams } = useListParams(DepartmentListParams, {
    num: 10,
    page: 1,
    keyword: "",
    search: DepartmentSearchField.options[0],
    orderBy: DepartmentOrderBy.options[0],
    sonamuFilter: {},
  });

  // 리스트 쿼리
  const { data, refetch, isLoading } = DepartmentService.useDepartments("A", listParams);
  const { rows, total } = data ?? {};

  // 현재 경로와 타이틀
  const PAGE = {
    route: "/admin/departments",
    title: SD("entity.list")(SD("entity.Department")),
  };

  // 컬럼 정의
  const columns = createDepartmentColumns(
    (id) => navigate({ to: `${PAGE.route}/form`, search: { id } }),
    (id) => handleDeleteClick(id),
  );

  // 선택 핸들러
  const handleToggleItem = (id: number) => {
    const newSelection = new Set(selectedItems);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedItems(newSelection);
  };

  const isAllSelected = () => {
    return (rows?.length ?? 0) > 0 && rows?.every((row) => selectedItems.has(row.id));
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(new Set(rows?.map((row) => row.id) ?? []));
    } else {
      setSelectedItems(new Set());
    }
  };

  // 삭제 핸들러
  const handleDeleteClick = (id: number, name?: string) => {
    setItemToDelete({ id, name });
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (itemToDelete) {
      DepartmentService.del([itemToDelete.id]).then(() => {
        refetch();
      });
    }
    setDeleteDialogOpen(false);
    setItemToDelete(null);
  };

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
              {/* Filters */}
              <div className="bg-gray-100 px-6 py-4 space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <EnumSelect
                    enum={DepartmentSearchField}
                    labels={DepartmentSearchFieldLabel}
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

                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      className="h-8 px-4 bg-primary hover:bg-primary/90 text-white"
                      onClick={() => navigate({ to: `${PAGE.route}/form` })}
                    >
                      <span className="text-xs">{SD("common.create")}</span>
                    </Button>
                    <SonamuFilterPopover
                      rules={appliedRules}
                      fieldMeta={extractFieldMetaFromSchema(
                        DepartmentBaseSchema,
                        translateFilterEnumKey,
                      )}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<FilterIcon />}
                        onClick={() => setFilterModalOpen(true)}
                        className="h-8"
                      >
                        <span className="text-xs">{SD("rc.sonamuFilter.title")}</span>
                        {appliedRules.length > 0 && (
                          <Badge variant="secondary" className="ml-1">
                            {appliedRules.length}
                          </Badge>
                        )}
                      </Button>
                    </SonamuFilterPopover>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <EnumSelect
                    enum={DepartmentOrderBy}
                    labels={DepartmentOrderByLabel}
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
              {/* Table */}
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-gray-100">
                    <TableHead className="h-9 text-xs w-[40px]">
                      <Checkbox checked={isAllSelected()} onValueChange={handleSelectAll} />
                    </TableHead>
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
                          <TableCell className="py-3">
                            <Checkbox
                              checked={selectedItems.has(row.id)}
                              onValueChange={() => handleToggleItem(row.id)}
                            />
                          </TableCell>
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

              {/* Pagination */}
              <Pagination
                {...register("page")}
                total={total ?? 0}
                itemsPerPage={listParams.num ?? 10}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{SD("delete.confirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>{SD("delete.confirm.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{SD("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>
              {SD("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sonamu Filter Modal */}
      <SonamuFilterModal
        baseSchema={DepartmentBaseSchema}
        open={filterModalOpen}
        onOpenChange={setFilterModalOpen}
        initialRules={appliedRules}
        onApply={(filters, rules) => {
          setListParams({ ...listParams, sonamuFilter: filters, page: 1 });
          setAppliedRules(rules);
        }}
      />
    </div>
  );
}
