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
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sonamu-kit/react-components/components";
import { datetimeF, numF, useListParamsTanstack } from "@sonamu-kit/react-components/lib";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { DepartmentListParams } from "@/services/department/department.types";
import { DepartmentService } from "@/services/services.generated";
import {
  DepartmentOrderBy,
  DepartmentOrderByLabel,
  DepartmentSearchField,
  DepartmentSearchFieldLabel,
} from "@/services/sonamu.generated";
import EditIcon from "~icons/lucide/square-pen";
import TrashIcon from "~icons/lucide/trash-2";
import ListIcon from "~icons/mdi/format-list-bulleted";
import SearchIcon from "~icons/mdi/magnify";

export const Route = createFileRoute("/admin/departments/")({
  component: DepartmentList,
});

type DepartmentListProps = {};

function DepartmentList({}: DepartmentListProps) {
  const navigate = useNavigate();

  // 상태 관리
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: number; name?: string } | null>(null);

  // 리스트 필터
  const { listParams, register } = useListParamsTanstack(DepartmentListParams, {
    num: 10,
    page: 1,
    keyword: "",
    search: DepartmentSearchField.options[0],
    orderBy: DepartmentOrderBy.options[0],
  });

  // 리스트 쿼리
  const { data, refetch, isLoading } = DepartmentService.useDepartments("A", listParams);
  const { rows, total } = data ?? {};

  // 페이지네이션
  const itemsPerPage = listParams.num ?? 10;
  const currentPage = listParams.page ?? 1;
  const totalPages = Math.ceil((total ?? 0) / itemsPerPage);

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

  // 현재 경로와 타이틀
  const PAGE = {
    route: "/admin/departments",
    title: "부서",
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
                  <Select key={`search-${listParams.search}`} {...register("search")}>
                    <SelectTrigger className="w-[200px] h-8 bg-white border-gray-300 text-xs">
                      <SelectValue placeholder="Search Type" className="truncate" />
                    </SelectTrigger>
                    <SelectContent>
                      {DepartmentSearchField.options.map((key) => (
                        <SelectItem key={key} value={key}>
                          {DepartmentSearchFieldLabel[key]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="relative flex-1 max-w-xs">
                    <Input
                      {...register("keyword")}
                      placeholder="Search..."
                      className="h-8 pr-8 text-xs bg-white border-gray-300"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-8 w-8 hover:bg-transparent"
                    >
                      <SearchIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>

                  <div className="ml-auto">
                    <Button
                      className="h-8 px-4 bg-primary hover:bg-primary/90 text-white"
                      onClick={() => navigate({ to: `${PAGE.route}/form` })}
                    >
                      <span className="text-xs">Create</span>
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <Select key={`orderBy-${listParams.orderBy}`} {...register("orderBy")}>
                    <SelectTrigger className="w-[200px] h-8 bg-white border-gray-300 text-xs">
                      <SelectValue placeholder="Sort" className="truncate" />
                    </SelectTrigger>
                    <SelectContent>
                      {DepartmentOrderBy.options.map((key) => (
                        <SelectItem key={key} value={key}>
                          Sort: {DepartmentOrderByLabel[key]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">{total ?? 0} results</span>
                </div>
              </div>
            </CardHeader>

            <CardContent className="px-6 pb-6 pt-6 bg-white">
              {/* Table */}
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-gray-100">
                    <TableHead className="h-9 text-xs w-[40px]">
                      <Checkbox
                        checked={isAllSelected()}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                      />
                    </TableHead>
                    <TableHead className="h-9 text-xs w-[55px]">ID</TableHead>
                    <TableHead className="h-9 text-xs">등록일시</TableHead>
                    <TableHead className="h-9 text-xs">부서명</TableHead>
                    <TableHead className="h-9 text-xs">직원수</TableHead>
                    <TableHead className="h-9 text-xs">회사</TableHead>
                    <TableHead className="h-9 text-xs">상위부서</TableHead>
                    <TableHead className="h-9 text-xs">직원리스트</TableHead>
                    <TableHead className="h-9 text-xs text-center w-[100px]">Manage</TableHead>
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
                              onChange={() => handleToggleItem(row.id)}
                            />
                          </TableCell>
                          <TableCell className="py-3 text-xs">{row.id}</TableCell>
                          <TableCell className="py-3 text-xs">
                            <span className="text-xs text-muted-foreground">
                              {datetimeF(row.created_at)}
                            </span>
                          </TableCell>
                          <TableCell className="py-3 text-xs">{row.name}</TableCell>
                          <TableCell className="py-3 text-xs">{numF(row.employee_count)}</TableCell>
                          <TableCell className="py-3 text-xs">{row.company.name}</TableCell>
                          <TableCell className="py-3 text-xs">{row.parent?.name}</TableCell>
                          <TableCell className="py-3 text-xs">
                            {/* array row.employees */}
                          </TableCell>
                          <TableCell className="py-3">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 rounded bg-yellow-500 hover:bg-yellow-600 text-white"
                                onClick={() =>
                                  navigate({ to: `${PAGE.route}/form`, search: { id: row.id } })
                                }
                              >
                                <EditIcon className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 rounded bg-red-500 hover:bg-red-600 text-white"
                                onClick={() => handleDeleteClick(row.id)}
                              >
                                <TrashIcon className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between pt-6">
                <div className="text-xs text-muted-foreground">
                  Showing {(currentPage - 1) * itemsPerPage + 1}-
                  {Math.min(currentPage * itemsPerPage, total ?? 0)} of {total ?? 0} results
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 text-xs"
                    disabled={currentPage === 1}
                    onClick={() => register("page").onChange(null, { value: currentPage - 1 })}
                  >
                    Previous
                  </Button>
                  <div className="flex items-center gap-1">
                    {(() => {
                      const maxVisible = 6;
                      let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
                      const endPage = Math.min(totalPages, startPage + maxVisible - 1);
                      if (endPage - startPage + 1 < maxVisible) {
                        startPage = Math.max(1, endPage - maxVisible + 1);
                      }
                      return Array.from(
                        { length: endPage - startPage + 1 },
                        (_, i) => startPage + i,
                      ).map((page) => (
                        <Button
                          key={page}
                          variant="outline"
                          size="sm"
                          className={`h-8 w-8 text-xs ${page === currentPage ? "bg-primary text-primary-foreground" : ""}`}
                          onClick={() => register("page").onChange(null, { value: page })}
                        >
                          {page}
                        </Button>
                      ));
                    })()}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 text-xs"
                    disabled={currentPage === totalPages}
                    onClick={() => register("page").onChange(null, { value: currentPage + 1 })}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this item.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
