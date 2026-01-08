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
  EagerImageUploader,
  EagerMultiImageUploader,
  Input,
  LazyFileUploader,
  LazyImageUploader,
  LazyMultiImageUploader,
  Pagination,
  Table,
  TableBody,
  TableCell,
  type TableCol,
  TableHead,
  TableHeader,
  TableRow,
} from "@sonamu-kit/react-components/components";
import { datetimeF, useListParams, useTypeForm } from "@sonamu-kit/react-components/lib";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useRef, useState } from "react";
import z from "zod";
import { ApiLogViewer } from "@/admin-common/ApiLogViewer";
import { FileOrderBySelect } from "@/components/file/FileOrderBySelect";
import { FileSearchFieldSelect } from "@/components/file/FileSearchFieldSelect";
import { SD } from "@/i18n/sd.generated";
import { FileListParams } from "@/services/file/file.types";
import { FileService } from "@/services/services.generated";
import { FileOrderBy, FileSearchField } from "@/services/sonamu.generated";
import EditIcon from "~icons/lucide/square-pen";
import TrashIcon from "~icons/lucide/trash-2";
import ListIcon from "~icons/mdi/format-list-bulleted";
import SearchIcon from "~icons/mdi/magnify";
import UploadIcon from "~icons/mdi/upload";

export const Route = createFileRoute("/admin/files/")({
  head: () => ({
    meta: [{ title: "FILE List" }, { name: "description", content: "FILE 목록 관리" }],
  }),
  component: FileList,
});

type FileListProps = {};

function FileList({}: FileListProps) {
  const navigate = useNavigate();

  // 상태 관리
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: number } | null>(null);

  // Eager 모드 테스트 상태
  const eagerMultipleForm = useTypeForm(z.object({ urls: z.array(z.string()) }), { urls: [] });
  const eagerForm = useTypeForm(z.object({ url: z.string() }), { url: "" });

  // Lazy 모드 테스트 상태
  const lazyImageRef = useRef<{ commit: () => Promise<string> }>(null);
  const lazyForm = useTypeForm(z.object({ url: z.string() }), { url: "" });
  const lazyMultiImageRef = useRef<{ commit: () => Promise<string[]> }>(null);
  const lazyMultipleForm = useTypeForm(z.object({ urls: z.array(z.string()) }), { urls: [] });

  // File Uploader 테스트 상태
  const lazyFileSingleRef = useRef<{ commit: () => Promise<string> }>(null);
  const lazyFileSingleForm = useTypeForm(z.object({ url: z.string() }), { url: "" });
  const lazyFileMultipleRef = useRef<{ commit: () => Promise<string[]> }>(null);
  const lazyFileMultipleForm = useTypeForm(z.object({ urls: z.array(z.string()) }), { urls: [] });

  // Upload mutations
  const uploadSingleMutation = FileService.useUploadMutation();
  const uploadMultipleMutation = FileService.useUploadMultipleMutation();

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

  // 현재 경로와 타이틀
  const PAGE = {
    route: "/admin/files",
    title: SD("entity.File.list"),
  };

  // 컬럼 정의
  type FileRow = NonNullable<typeof rows>[number];
  const columns: TableCol<FileRow>[] = [
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
      label: SD("entity.File.mime_type"),
      tc: (row) => <>{row.mime_type}</>,
    },
    {
      label: SD("entity.File.name"),
      tc: (row) => <>{row.name}</>,
    },
    {
      label: SD("entity.File.url"),
      tc: (row) => <>{row.url}</>,
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

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-[1800px] mx-auto p-8">
        {/* 2. Lazy 모드 테스트 */}
        <div className="space-y-6 mb-8">
          {/* Header */}
          <div className="flex items-center gap-2">
            <ListIcon className="h-5 w-5" />
            <span className="text-lg font-semibold h-5">{PAGE.title}</span>
          </div>

          {/* Upload Test Cards */}
          <div className="space-y-6 mb-6">
            <div className="grid grid-cols-2 gap-4">
              {/* Eager Single */}
              <Card className="border-blue-200 bg-blue-50/50">
                <CardHeader className="pb-2">
                  <div className="text-sm font-semibold text-blue-700">
                    Eager Single Image Uploader
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">
                      파일 업로드 (즉시 업로드)
                    </label>
                    <EagerImageUploader
                      value={eagerForm.form.url}
                      onValueChange={(url) =>
                        eagerForm.setForm({ ...eagerForm.form, url: url || "" })
                      }
                      uploader={async (file: File) => {
                        const response = await uploadSingleMutation.mutateAsync({ file });
                        return { url: response.file.url, name: response.file.name };
                      }}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Eager Multiple */}
              <Card className="border-blue-200 bg-blue-50/50">
                <CardHeader className="pb-2">
                  <div className="text-sm font-semibold text-blue-700">
                    Eager Multiple Image Uploader
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">
                      파일 업로드 (즉시 업로드)
                    </label>
                    <EagerMultiImageUploader
                      value={eagerMultipleForm.form.urls}
                      onValueChange={(urls) =>
                        eagerMultipleForm.setForm({ ...eagerMultipleForm.form, urls })
                      }
                      uploader={async (files: File[]) => {
                        const response = await uploadMultipleMutation.mutateAsync({ files });
                        return response.files.map((f) => ({ url: f.url, name: f.name }));
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 2. Lazy 모드 테스트 */}
            <div className="grid grid-cols-2 gap-4">
              {/* Lazy Single */}
              <Card className="border-green-200 bg-green-50/50">
                <CardHeader className="pb-2">
                  <div className="text-sm font-semibold text-green-700">
                    Lazy Single Image Uploader
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">
                      파일 선택 (업로드 대기)
                    </label>
                    <LazyImageUploader
                      ref={lazyImageRef}
                      value={lazyForm.form.url}
                      onValueChange={(url) =>
                        lazyForm.setForm({ ...lazyForm.form, url: url || "" })
                      }
                      uploader={async (file: File) => {
                        const response = await uploadSingleMutation.mutateAsync({ file });
                        return { url: response.file.url, name: response.file.name };
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      className="h-8 px-4 bg-green-600 hover:bg-green-700 text-white"
                      onClick={async () => {
                        if (lazyImageRef.current) {
                          const url = await lazyImageRef.current.commit();
                          lazyForm.setForm({ ...lazyForm.form, url });
                          refetch();
                        }
                      }}
                      icon={<UploadIcon />}
                    >
                      저장 (클릭 시 업로드 시작)
                    </Button>
                    <span className="text-xs text-gray-500">
                      {lazyForm.form.url || "파일을 선택하세요"}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Lazy Multiple */}
              <Card className="border-green-200 bg-green-50/50">
                <CardHeader className="pb-2">
                  <div className="text-sm font-semibold text-green-700">
                    Lazy Multiple Image Uploader
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">
                      파일 선택 (업로드 대기)
                    </label>
                    <LazyMultiImageUploader
                      ref={lazyMultiImageRef}
                      value={lazyMultipleForm.form.urls}
                      onValueChange={(urls) =>
                        lazyMultipleForm.setForm({ ...lazyMultipleForm.form, urls })
                      }
                      uploader={async (files: File[]) => {
                        const response = await uploadMultipleMutation.mutateAsync({ files });
                        return response.files.map((f) => ({ url: f.url, name: f.name }));
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      className="h-8 px-4 bg-green-600 hover:bg-green-700 text-white"
                      icon={<UploadIcon />}
                      onClick={async () => {
                        if (lazyMultiImageRef.current) {
                          const urls = await lazyMultiImageRef.current.commit();
                          lazyMultipleForm.setForm({ ...lazyMultipleForm.form, urls });
                          refetch();
                        }
                      }}
                    >
                      저장 (클릭 시 업로드 시작)
                    </Button>
                    <span className="text-xs text-gray-500">
                      {lazyMultipleForm.form.urls.length > 0
                        ? `${lazyMultipleForm.form.urls.length}개의 파일 업로드됨`
                        : "파일을 선택하세요"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 3. File Uploader 테스트 */}
            <div className="grid grid-cols-2 gap-4">
              {/* Lazy Single File Uploader */}
              <Card className="border-purple-200 bg-purple-50/50">
                <CardHeader className="pb-2">
                  <div className="text-sm font-semibold text-purple-700">
                    Lazy Single File Uploader
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">
                      파일 선택 (업로드 대기)
                    </label>
                    <LazyFileUploader
                      ref={lazyFileSingleRef}
                      multiple={false}
                      value={lazyFileSingleForm.form.url}
                      onValueChange={(url) =>
                        lazyFileSingleForm.setForm({ ...lazyFileSingleForm.form, url: url || "" })
                      }
                      uploader={async (file: File) => {
                        const response = await uploadSingleMutation.mutateAsync({ file });
                        return { url: response.file.url, name: response.file.name };
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      className="h-8 px-4 bg-purple-600 hover:bg-purple-700 text-white"
                      onClick={async () => {
                        if (lazyFileSingleRef.current) {
                          const url = await lazyFileSingleRef.current.commit();
                          lazyFileSingleForm.setForm({ ...lazyFileSingleForm.form, url });
                          refetch();
                        }
                      }}
                      disabled={uploadSingleMutation.isPending}
                      icon={<UploadIcon />}
                    >
                      {uploadSingleMutation.isPending
                        ? "업로드 중..."
                        : "저장 (클릭 시 업로드 시작)"}
                    </Button>
                    <span className="text-xs text-gray-500">
                      {lazyFileSingleForm.form.url || "파일을 선택하세요"}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Lazy Multiple File Uploader */}
              <Card className="border-purple-200 bg-purple-50/50">
                <CardHeader className="pb-2">
                  <div className="text-sm font-semibold text-purple-700">
                    Lazy Multiple File Uploader
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">
                      파일 선택 (업로드 대기)
                    </label>
                    <LazyFileUploader
                      ref={lazyFileMultipleRef}
                      multiple={true}
                      value={lazyFileMultipleForm.form.urls}
                      onValueChange={(urls) =>
                        lazyFileMultipleForm.setForm({ ...lazyFileMultipleForm.form, urls })
                      }
                      uploader={async (files: File[]) => {
                        const response = await uploadMultipleMutation.mutateAsync({ files });
                        return response.files.map((f) => ({ url: f.url, name: f.name }));
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      className="h-8 px-4 bg-purple-600 hover:bg-purple-700 text-white"
                      onClick={async () => {
                        if (lazyFileMultipleRef.current) {
                          const urls = await lazyFileMultipleRef.current.commit();
                          lazyFileMultipleForm.setForm({ ...lazyFileMultipleForm.form, urls });
                          refetch();
                        }
                      }}
                      disabled={uploadMultipleMutation.isPending}
                      icon={<UploadIcon />}
                    >
                      {uploadMultipleMutation.isPending
                        ? "업로드 중..."
                        : "저장 (클릭 시 업로드 시작)"}
                    </Button>
                    <span className="text-xs text-gray-500">
                      {lazyFileMultipleForm.form.urls.length > 0
                        ? `${lazyFileMultipleForm.form.urls.length}개의 파일 업로드됨`
                        : "파일을 선택하세요"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 4. API 로그 */}
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
                  <FileSearchFieldSelect
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
                  <FileOrderBySelect
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
