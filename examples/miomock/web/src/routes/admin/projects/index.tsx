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
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  EnumSelect,
  Input,
  Pagination,
  SonamuFilterModal,
  Table,
  TableBody,
  TableCell,
  type TableCol,
  TableHead,
  TableHeader,
  TableRow,
} from "@sonamu-kit/react-components/components";
import { datetimeF, numF, useListParams } from "@sonamu-kit/react-components/lib";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { SD } from "@/i18n/sd.generated";
import { ProjectListParams } from "@/services/project/project.types";
import { ProjectService } from "@/services/services.generated";
import {
  ProjectBaseSchema,
  ProjectOrderBy,
  ProjectOrderByLabel,
  ProjectSearchField,
  ProjectSearchFieldLabel,
  ProjectStatusLabel,
} from "@/services/sonamu.generated";
import EditIcon from "~icons/lucide/square-pen";
import TrashIcon from "~icons/lucide/trash-2";
import FilterIcon from "~icons/mdi/filter-variant";
import ListIcon from "~icons/mdi/format-list-bulleted";
import SearchIcon from "~icons/mdi/magnify";

export const Route = createFileRoute("/admin/projects/")({
  head: () => ({
    meta: [
      { title: "PROJECT List" },
      { name: "description", content: SD("entity.listManage")("PROJECT") },
    ],
  }),
  component: ProjectList,
});

type ProjectListProps = {};

function ProjectList({}: ProjectListProps) {
  const navigate = useNavigate();

  // 상태 관리
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: number; name?: string } | null>(null);
  const [filterModalOpen, setFilterModalOpen] = useState(false);

  // 리스트 필터
  const { listParams, register, setListParams } = useListParams(ProjectListParams, {
    num: 10,
    page: 1,
    keyword: "",
    search: ProjectSearchField.options[0],
    orderBy: ProjectOrderBy.options[0],
    sonamuFilter: {},
  });

  // 리스트 쿼리
  const { data, refetch, isLoading } = ProjectService.useProjects("A", listParams);
  const { rows, total } = data ?? {};

  // 현재 경로와 타이틀
  const PAGE = {
    route: "/admin/projects",
    title: SD("entity.list")(SD("entity.Project")),
  };

  // 컬럼 정의
  type ProjectRow = NonNullable<typeof rows>[number];
  const columns: TableCol<ProjectRow>[] = [
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
      label: SD("entity.Project.name"),
      tc: (row) => <>{row.name}</>,
    },
    {
      label: SD("entity.Project.status"),
      tc: (row) => <>{ProjectStatusLabel[row.status]}</>,
    },
    {
      label: SD("entity.Project.description"),
      tc: (row) => <>{row.description}</>,
    },
    {
      label: SD("entity.Project.budget"),
      tc: (row) => <>{row.budget}</>,
    },
    {
      label: SD("entity.Project.deadline"),
      tc: (row) => <span>{row.deadline ? datetimeF(row.deadline) : "-"}</span>,
      fit: true,
    },
    {
      label: SD("entity.Project.image_urls"),
      tc: (row) => (
        <div className="flex gap-1">
          {row.image_urls?.map(
            (r, i) =>
              r && (
                <img
                  key={i}
                  src={r.url}
                  alt={`ImageUrls ${i + 1}`}
                  className="h-8 w-8 object-cover rounded"
                />
              ),
          )}
        </div>
      ),
    },
    {
      label: SD("entity.Project.virtual_test"),
      tc: (row) => <>{row.virtual_test && numF(row.virtual_test)}</>,
    },
    {
      label: SD("entity.Project.virtual_query_test"),
      tc: (row) => <>{row.virtual_query_test}</>,
    },
    {
      label: SD("entity.Project.employee"),
      tc: (_row) => <>{/* array row.employee */}</>,
    },
    {
      label: SD("entity.Project.tags"),
      tc: (_row) => <>{/* array row.tags */}</>,
    },
    {
      label: SD("common.manage"),
      fit: true,
      align: "center",
      tc: (row) => (
        <div className="flex items-center justify-center gap-1">
          <Button
            variant="yellow"
            size="xs"
            icon={<EditIcon />}
            onClick={() => navigate({ to: `${PAGE.route}/form`, search: { id: row.id } })}
          />
          <Button
            variant="red"
            size="xs"
            icon={<TrashIcon />}
            onClick={() => handleDeleteClick(row.id)}
          />
        </div>
      ),
    },
  ];

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
      ProjectService.del([itemToDelete.id]).then(() => {
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
                    enum={ProjectSearchField}
                    labels={ProjectSearchFieldLabel}
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
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<FilterIcon />}
                      onClick={() => setFilterModalOpen(true)}
                      className="h-8"
                    >
                      <span className="text-xs">{SD("rc.sonamuFilter.title")}</span>
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <EnumSelect
                    enum={ProjectOrderBy}
                    labels={ProjectOrderByLabel}
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
        baseSchema={ProjectBaseSchema}
        open={filterModalOpen}
        onOpenChange={setFilterModalOpen}
        onApply={(filters) => {
          setListParams({ ...listParams, sonamuFilter: filters, page: 1 });
        }}
      />
    </div>
  );
}
