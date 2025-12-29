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
  ImageUploader,
  Input,
  MultiImageUploader,
  Pagination,
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
import {
  datetimeF,
  lazyUpload,
  useListParams,
  useTypeForm,
} from "@sonamu-kit/react-components/lib";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import z from "zod";
import { ApiLogViewer } from "@/admin-common/ApiLogViewer";
import { FileListParams, FileSaveParams } from "@/services/file/file.types";
import { FileService } from "@/services/services.generated";
import {
  FileOrderBy,
  FileOrderByLabel,
  FileSearchField,
  FileSearchFieldLabel,
} from "@/services/sonamu.generated";
import EditIcon from "~icons/lucide/square-pen";
import TrashIcon from "~icons/lucide/trash-2";
import ListIcon from "~icons/mdi/format-list-bulleted";
import SearchIcon from "~icons/mdi/magnify";
import UploadIcon from "~icons/mdi/upload";

export const Route = createFileRoute("/admin/files/")({
  component: FileList,
});

type FileListProps = {};

function FileList({}: FileListProps) {
  const navigate = useNavigate();

  // 상태 관리
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: number } | null>(null);
  const [uploading, setUploading] = useState(false);

  // Eager 모드 테스트 상태
  const eagerForm = useTypeForm(FileSaveParams, {
    name: "",
    url: "",
    mime_type: "",
  });
  const eagerMultipleForm = useTypeForm(
    z.object({
      urls: z.array(z.string()),
    }),
    {
      urls: [],
    },
  );

  // Lazy 모드 테스트 상태
  const lazyForm = useTypeForm(
    z.object({
      url: z.string(),
    }),
    {
      url: "",
    },
  );
  const lazyMultipleForm = useTypeForm(
    z.object({
      urls: z.array(z.string()),
    }),
    {
      urls: [],
    },
  );

  // 리스트 필터
  const { listParams, register } = useListParams(FileListParams, {
    num: 10,
    page: 1,
    keyword: "",
    search: FileSearchField.options[0],
    orderBy: FileOrderBy.options[0],
  });

  // 리스트 쿼리
  const { data, refetch, isLoading } = FileService.useFiles("A", listParams);
  const { rows, total } = data ?? {};

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
  const handleDeleteClick = (id: number) => {
    setItemToDelete({ id });
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (itemToDelete) {
      FileService.del([itemToDelete.id]).then(() => {
        refetch();
      });
    }
    setDeleteDialogOpen(false);
    setItemToDelete(null);
  };

  // 현재 경로와 타이틀
  const PAGE = {
    route: "/admin/files",
    title: "FILE",
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

          {/* Upload Test Cards */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="space-y-4">
              {/* Eager Single */}
              <Card className="border-blue-200 bg-blue-50/50">
                <CardHeader className="pb-2">
                  <div className="text-sm font-semibold text-blue-700">
                    Eager 모드 테스트 (기존 방식)
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">
                      파일 업로드 (즉시 업로드)
                    </label>
                    <ImageUploader
                      {...eagerForm.register("url")}
                      uploader={async (file: File) => {
                        const response = await FileService.upload(file);
                        return response.file.url;
                      }}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Eager Multiple */}
              <Card className="border-blue-200 bg-blue-50/50">
                <CardHeader className="pb-2">
                  <div className="text-sm font-semibold text-blue-700">
                    Eager 모드 테스트 (Multiple)
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">
                      파일 업로드 (즉시 업로드)
                    </label>
                    <MultiImageUploader
                      {...eagerMultipleForm.register("urls")}
                      uploader={async (file: File) => {
                        const response = await FileService.upload(file);
                        return response.file.url;
                      }}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Lazy Single */}
              <Card className="border-green-200 bg-green-50/50">
                <CardHeader className="pb-2">
                  <div className="text-sm font-semibold text-green-700">
                    Lazy 모드 테스트 (submit 시점에 업로드)
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">
                      파일 선택 (업로드 대기)
                    </label>
                    <ImageUploader
                      mode="lazy"
                      {...lazyForm.register("url")}
                      uploader={async (file: File) => {
                        const response = await FileService.upload(file);
                        return response.file.url;
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      className="h-8 px-4 bg-green-600 hover:bg-green-700 text-white"
                      onClick={async () => {
                        setUploading(true);
                        try {
                          await lazyUpload();
                          refetch();
                        } finally {
                          setUploading(false);
                        }
                      }}
                      disabled={uploading}
                      icon={<UploadIcon />}
                    >
                      {uploading ? "업로드 중..." : "저장 (클릭 시 업로드 시작)"}
                    </Button>
                    <span className="text-xs text-gray-500">
                      {lazyForm.form.url ? lazyForm.form.url : "파일 대기 중"}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Lazy Multiple */}
              <Card className="border-green-200 bg-green-50/50">
                <CardHeader className="pb-2">
                  <div className="text-sm font-semibold text-green-700">
                    Lazy 모드 테스트 (Multiple)
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">
                      파일 선택 (업로드 대기)
                    </label>
                    <MultiImageUploader
                      mode="lazy"
                      accept="image/*"
                      {...lazyMultipleForm.register("urls")}
                      uploader={async (file: File) => {
                        const response = await FileService.upload(file);
                        return response.file.url;
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      className="h-8 px-4 bg-green-600 hover:bg-green-700 text-white"
                      onClick={async () => {
                        setUploading(true);
                        try {
                          await lazyUpload();
                          refetch();
                        } finally {
                          setUploading(false);
                        }
                      }}
                      disabled={uploading}
                      icon={<UploadIcon />}
                    >
                      {uploading ? "업로드 중..." : "저장 (클릭 시 업로드 시작)"}
                    </Button>
                    <span className="text-xs text-gray-500">
                      {`${lazyMultipleForm.form.urls.length}개의 파일 대기 중`}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* API Log Viewer */}
            <div>
              <ApiLogViewer bodyOnly={true} />
            </div>
          </div>

          {/* Main List Card */}
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
                      {FileSearchField.options.map((key) => (
                        <SelectItem key={key} value={key}>
                          {FileSearchFieldLabel[key]}
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
                      {FileOrderBy.options.map((key) => (
                        <SelectItem key={key} value={key}>
                          Sort: {FileOrderByLabel[key]}
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
                      <Checkbox checked={isAllSelected()} onValueChange={handleSelectAll} />
                    </TableHead>
                    <TableHead className="h-9 text-xs w-[55px]">ID</TableHead>
                    <TableHead className="h-9 text-xs">등록일시</TableHead>
                    <TableHead className="h-9 text-xs">MIME타입</TableHead>
                    <TableHead className="h-9 text-xs">FILE명</TableHead>
                    <TableHead className="h-9 text-xs">URL</TableHead>
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
                              onValueChange={() => handleToggleItem(row.id)}
                            />
                          </TableCell>
                          <TableCell className="py-3 text-xs">{row.id}</TableCell>
                          <TableCell className="py-3 text-xs">
                            <span className="text-xs text-muted-foreground">
                              {datetimeF(row.created_at)}
                            </span>
                          </TableCell>
                          <TableCell className="py-3 text-xs">{row.mime_type}</TableCell>
                          <TableCell className="py-3 text-xs">{row.name}</TableCell>
                          <TableCell className="py-3 text-xs">{row.url}</TableCell>
                          <TableCell className="py-3">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="yellow"
                                size="xs"
                                icon={<EditIcon />}
                                onClick={() =>
                                  navigate({ to: `${PAGE.route}/form`, search: { id: row.id } })
                                }
                              />
                              <Button
                                variant="red"
                                size="xs"
                                icon={<TrashIcon />}
                                onClick={() => handleDeleteClick(row.id)}
                              />
                            </div>
                          </TableCell>
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
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this file.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      ;
    </div>
  );
}
