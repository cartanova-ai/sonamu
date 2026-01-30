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
  Input,
  Pagination,
  Table,
  TableBody,
  TableCell,
  type TableCol,
  TableHead,
  TableHeader,
  TableRow,
} from "@sonamu-kit/react-components/components";
import { datetimeF, useListParams } from "@sonamu-kit/react-components/lib";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { UserOrderBySelect } from "@/components/user/UserOrderBySelect";
import { UserSearchFieldSelect } from "@/components/user/UserSearchFieldSelect";
import { SD } from "@/i18n/sd.generated";
import { UserService } from "@/services/services.generated";
import { UserOrderBy, UserRoleLabel, UserSearchField } from "@/services/sonamu.generated";
import { UserListParams } from "@/services/user/user.types";

import EditIcon from "~icons/lucide/square-pen";
import TrashIcon from "~icons/lucide/trash-2";
import ListIcon from "~icons/mdi/format-list-bulleted";
import SearchIcon from "~icons/mdi/magnify";

export const Route = createFileRoute("/admin/users/")({
  head: () => ({
    meta: [{ title: "USER List" }, { name: "description", content: "USER 목록 관리" }],
  }),
  component: UserList,
});

type UserListProps = {};

function UserList({}: UserListProps) {
  const navigate = useNavigate();

  // 상태 관리
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string; name?: string } | null>(null);

  // 리스트 필터
  const { listParams, register } = useListParams(UserListParams, {
    num: 10,
    page: 1,
    keyword: "",
    search: UserSearchField.options[0],
    orderBy: UserOrderBy.options[0],
  });

  // 리스트 쿼리
  const { data, refetch, isLoading } = UserService.useUsers("A", listParams);
  const { rows, total } = data ?? {};

  // 현재 경로와 타이틀
  const PAGE = {
    route: "/admin/users",
    title: SD("entity.list")(SD("entity.User")),
  };

  // 컬럼 정의
  type UserRow = NonNullable<typeof rows>[number];
  const columns: TableCol<UserRow>[] = [
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
      label: SD("entity.User.email"),
      tc: (row) => <>{row.email}</>,
    },
    {
      label: SD("entity.User.username"),
      tc: (row) => <>{row.username}</>,
    },
    {
      label: SD("entity.User.birth_date"),
      tc: (row) => <span>{row.birth_date ? datetimeF(row.birth_date) : "-"}</span>,
      fit: true,
    },
    {
      label: SD("entity.User.role"),
      tc: (row) => <>{UserRoleLabel[row.role]}</>,
    },
    {
      label: SD("entity.User.last_login_at"),
      tc: (row) => <span>{row.last_login_at ? datetimeF(row.last_login_at) : "-"}</span>,
      fit: true,
    },
    {
      label: SD("entity.User.bio"),
      tc: (row) => <>{row.bio}</>,
    },
    {
      label: SD("entity.User.is_verified"),
      tc: (row) => (
        <>
          {row.is_verified ? (
            <Badge variant="default">O</Badge>
          ) : (
            <Badge variant="secondary">X</Badge>
          )}
        </>
      ),
    },
    {
      label: SD("entity.User.deleted_at"),
      tc: (row) => <span>{row.deleted_at ? datetimeF(row.deleted_at) : "-"}</span>,
      fit: true,
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
  const handleToggleItem = (id: string) => {
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
  const handleDeleteClick = (id: string, name?: string) => {
    setItemToDelete({ id, name });
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (itemToDelete) {
      UserService.del([itemToDelete.id]).then(() => {
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
                  <UserSearchFieldSelect
                    {...register("search")}
                    placeholder={SD("common.searchType")}
                    className="w-[200px] h-8 bg-white border-gray-300 text-xs"
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

                  <div className="ml-auto">
                    <Button
                      className="h-8 px-4 bg-primary hover:bg-primary/90 text-white"
                      onClick={() => navigate({ to: `${PAGE.route}/form` })}
                    >
                      <span className="text-xs">{SD("common.create")}</span>
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <UserOrderBySelect
                    {...register("orderBy")}
                    placeholder={SD("common.sort")}
                    textPrefix={`${SD("common.sort")}: `}
                    className="w-[200px] h-8 bg-white border-gray-300 text-xs"
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
    </div>
  );
}
