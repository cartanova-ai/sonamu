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
  FileInput,
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
import { datetimeF, useListParams, useTypeForm } from "@sonamu-kit/react-components/lib";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { z } from "zod";
import EditIcon from "~icons/lucide/square-pen";
import TrashIcon from "~icons/lucide/trash-2";
import ListIcon from "~icons/mdi/format-list-bulleted";
import SearchIcon from "~icons/mdi/magnify";
import UploadIcon from "~icons/mdi/upload";

import { ApiLogViewer } from "@/admin-common/ApiLogViewer";
import { SD } from "@/i18n/sd.generated";
import { FileListParams } from "@/services/file/file.types";
import { FileService } from "@/services/services.generated";
import {
  FileOrderBy,
  FileOrderByLabel,
  type FileSubsetA,
  FileSearchField,
  FileSearchFieldLabel,
} from "@/services/sonamu.generated";
import { SonamuFileSchema } from "@/services/sonamu.shared";
import { type SonamuFile } from "@/services/sonamu.shared";

type InlineUploadFile = string | File | SonamuFile;

const toSonamuFileFromUrl = (url: string): SonamuFile => ({
  name: url.split("/").pop() ?? url,
  url,
  mime_type: "",
  size: 0,
});

const isSonamuFile = (value: InlineUploadFile): value is SonamuFile =>
  SonamuFileSchema.safeParse(value).success;

const replaceUploadedFiles = (
  files: InlineUploadFile[],
  uploadedFiles: SonamuFile[],
): InlineUploadFile[] => {
  let uploadedIndex = 0;

  return files.map((item) => {
    if (item instanceof File) {
      const uploaded = uploadedFiles[uploadedIndex];
      uploadedIndex += 1;
      return uploaded ?? item;
    }
    if (isSonamuFile(item)) {
      return item;
    }
    return toSonamuFileFromUrl(item);
  });
};

function createFileColumns(
  onEdit: (id: number) => void,
  onDelete: (id: number) => void,
): TableCol<FileSubsetA>[] {
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
          <Button variant="yellow" size="xs" icon={<EditIcon />} onClick={() => onEdit(row.id)} />
          <Button variant="red" size="xs" icon={<TrashIcon />} onClick={() => onDelete(row.id)} />
        </div>
      ),
    },
  ];
}

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
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: number } | null>(null);

  // FileInput 테스트 상태 - Single modes
  const singleEagerImageForm = useTypeForm(z.object({ file: z.string().nullable() }), {
    file: null,
  });
  const singleLazyImageForm = useTypeForm(
    z.object({ file: z.union([z.string(), z.instanceof(File)]).nullable() }),
    { file: null },
  );
  const singleEagerFileForm = useTypeForm(z.object({ file: z.string().nullable() }), {
    file: null,
  });
  const singleLazyFileForm = useTypeForm(
    z.object({ file: z.union([z.string(), z.instanceof(File)]).nullable() }),
    { file: null },
  );

  // FileInput 테스트 상태 - Multiple modes
  const multipleEagerImageForm = useTypeForm(z.object({ files: z.array(z.string()) }), {
    files: [],
  });
  const multipleLazyImageForm = useTypeForm(
    z.object({ files: z.array(z.union([z.string(), z.instanceof(File)])) }),
    { files: [] },
  );
  const multipleEagerFileForm = useTypeForm(z.object({ files: z.array(z.string()) }), {
    files: [],
  });
  const multipleLazyFileForm = useTypeForm(
    z.object({ files: z.array(z.union([z.string(), z.instanceof(File)])) }),
    { files: [] },
  );

  const inlineUploadForm = useTypeForm(
    z.object({
      category: z.string(),
      files: z.array(z.union([z.string(), z.instanceof(File), SonamuFileSchema])),
    }),
    { category: "", files: [] },
  );

  const inlineUploadFlatForm = useTypeForm(
    z.object({
      category: z.string(),
      files: z.array(z.union([z.string(), z.instanceof(File), SonamuFileSchema])),
    }),
    { category: "", files: [] },
  );

  // Lazy 모드 Submit 핸들러
  const handleSingleLazyImageSubmit = singleLazyImageForm.submit(async (values) => {
    console.log("Single Lazy Image - Uploaded URL:", values.file);
    refetch();
  });

  const handleSingleLazyFileSubmit = singleLazyFileForm.submit(async (values) => {
    console.log("Single Lazy File - Uploaded URL:", values.file);
    refetch();
  });

  const handleMultipleLazyImageSubmit = multipleLazyImageForm.submit(async (values) => {
    console.log("Multiple Lazy Image - Uploaded URLs:", values.files);
    refetch();
  });

  const handleMultipleLazyFileSubmit = multipleLazyFileForm.submit(async (values) => {
    console.log("Multiple Lazy File - Uploaded URLs:", values.files);
    refetch();
  });

  /**
   * Inline Upload
   *
   * 1. useTypeForm submit 대신 일반 async 함수 사용
   * 2. File만 선별해 별도 처리 (AI 분석 등)
   * 3. 업로드 완료 후 File → SonamuFile로 교체해서 "대기중" 제거 + 파일명 유지 (TODO: 로직 공통화)
   */
  const handleInlineUploadSubmit = async () => {
    const { files, category } = inlineUploadForm.form;

    // File 객체만 필터링 (URL 문자열 제외)
    const filesToUpload = files.filter((f) => f instanceof File);

    // 업로드할 새 파일이 없으면 종료
    if (filesToUpload.length === 0) return;

    const result = await FileService.inlineUpload({ category }, filesToUpload);

    const uploadedFiles = replaceUploadedFiles(files, result.files);
    inlineUploadForm.setForm((form) => ({ ...form, files: uploadedFiles }));
    refetch();
  };

  const handleInlineUploadFlat = async () => {
    const { files, category } = inlineUploadFlatForm.form;

    const filesToUpload = files.filter((f) => f instanceof File);

    if (filesToUpload.length === 0) return;

    const result = await FileService.inlineUploadFlat(category, filesToUpload);

    const uploadedFiles = replaceUploadedFiles(files, result.files);
    inlineUploadFlatForm.setForm((form) => ({ ...form, files: uploadedFiles }));
    refetch();
  };

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
    title: SD("entity.list")(SD("entity.File")),
  };

  // 컬럼 정의
  const columns = createFileColumns(
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
        <div className="space-y-6 mb-8">
          {/* Header */}
          <div className="flex items-center gap-2">
            <ListIcon className="h-5 w-5" />
            <span className="text-lg font-semibold h-5">{PAGE.title}</span>
          </div>

          {/* FileInput 테스트 - Row 1: Single Modes */}
          <div className="space-y-6 mb-6">
            <div className="grid grid-cols-4 gap-4">
              {/* 1. Single + Eager + Image */}
              <Card className="border-blue-200 bg-blue-50/50">
                <CardHeader className="pb-2">
                  <div className="text-xs font-semibold text-blue-700">Single + Eager + Image</div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <FileInput
                    multiple={false}
                    uploadMode="eager"
                    viewMode="image"
                    previewSize="md"
                    {...singleEagerImageForm.register("file")}
                  />
                  <div className="text-xs text-gray-500 wrap-break-word">
                    {singleEagerImageForm.form.file ?? "파일 없음"}
                  </div>
                </CardContent>
              </Card>

              {/* 2. Single + Lazy + Image */}
              <Card className="border-green-200 bg-green-50/50">
                <CardHeader className="pb-2">
                  <div className="text-xs font-semibold text-green-700">Single + Lazy + Image</div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <FileInput
                    multiple={false}
                    uploadMode="lazy"
                    viewMode="image"
                    previewSize="md"
                    {...singleLazyImageForm.register("file")}
                  />
                  <Button
                    size="xs"
                    className="w-full bg-green-600 hover:bg-green-700"
                    onClick={handleSingleLazyImageSubmit}
                    icon={<UploadIcon />}
                  >
                    Upload
                  </Button>
                  <div className="text-xs text-gray-500 wrap-break-word">
                    {singleLazyImageForm.form.file instanceof File
                      ? singleLazyImageForm.form.file.name
                      : (singleLazyImageForm.form.file ?? "파일 없음")}
                  </div>
                </CardContent>
              </Card>

              {/* 3. Single + Eager + File */}
              <Card className="border-orange-200 bg-orange-50/50">
                <CardHeader className="pb-2">
                  <div className="text-xs font-semibold text-orange-700">Single + Eager + File</div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <FileInput
                    multiple={false}
                    uploadMode="eager"
                    viewMode="file"
                    previewSize="md"
                    {...singleEagerFileForm.register("file")}
                  />
                  <div className="text-xs text-gray-500 wrap-break-word">
                    {singleEagerFileForm.form.file ?? "파일 없음"}
                  </div>
                </CardContent>
              </Card>

              {/* 4. Single + Lazy + File */}
              <Card className="border-purple-200 bg-purple-50/50">
                <CardHeader className="pb-2">
                  <div className="text-xs font-semibold text-purple-700">Single + Lazy + File</div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <FileInput
                    multiple={false}
                    uploadMode="lazy"
                    viewMode="file"
                    previewSize="md"
                    {...singleLazyFileForm.register("file")}
                  />
                  <Button
                    size="xs"
                    className="w-full bg-purple-600 hover:bg-purple-700"
                    onClick={handleSingleLazyFileSubmit}
                    icon={<UploadIcon />}
                  >
                    Upload
                  </Button>
                  <div className="text-xs text-gray-500 wrap-break-word">
                    {singleLazyFileForm.form.file instanceof File
                      ? singleLazyFileForm.form.file.name
                      : (singleLazyFileForm.form.file ?? "파일 없음")}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Row 2: Multiple Modes */}
            <div className="grid grid-cols-4 gap-4">
              {/* 5. Multiple + Eager + Image */}
              <Card className="border-blue-200 bg-blue-50/50">
                <CardHeader className="pb-2">
                  <div className="text-xs font-semibold text-blue-700">
                    Multiple + Eager + Image
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <FileInput
                    multiple={true}
                    uploadMode="eager"
                    viewMode="image"
                    previewSize="md"
                    maxFiles={3}
                    {...multipleEagerImageForm.register("files")}
                  />
                  <div className="text-xs text-gray-500">
                    {multipleEagerImageForm.form.files.length}개 파일
                  </div>
                </CardContent>
              </Card>

              {/* 6. Multiple + Lazy + Image */}
              <Card className="border-green-200 bg-green-50/50">
                <CardHeader className="pb-2">
                  <div className="text-xs font-semibold text-green-700">
                    Multiple + Lazy + Image
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <FileInput
                    multiple={true}
                    uploadMode="lazy"
                    viewMode="image"
                    previewSize="md"
                    maxFiles={3}
                    {...multipleLazyImageForm.register("files")}
                  />
                  <Button
                    size="xs"
                    className="w-full bg-green-600 hover:bg-green-700"
                    onClick={handleMultipleLazyImageSubmit}
                    icon={<UploadIcon />}
                  >
                    Upload
                  </Button>
                  <div className="text-xs text-gray-500">
                    {multipleLazyImageForm.form.files.length}개 파일
                  </div>
                </CardContent>
              </Card>

              {/* 7. Multiple + Eager + File */}
              <Card className="border-orange-200 bg-orange-50/50">
                <CardHeader className="pb-2">
                  <div className="text-xs font-semibold text-orange-700">
                    Multiple + Eager + File
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <FileInput
                    multiple={true}
                    uploadMode="eager"
                    viewMode="file"
                    previewSize="md"
                    maxFiles={3}
                    {...multipleEagerFileForm.register("files")}
                  />
                  <div className="text-xs text-gray-500">
                    {multipleEagerFileForm.form.files.length}개 파일
                  </div>
                </CardContent>
              </Card>

              {/* 8. Multiple + Lazy + File */}
              <Card className="border-purple-200 bg-purple-50/50">
                <CardHeader className="pb-2">
                  <div className="text-xs font-semibold text-purple-700">
                    Multiple + Lazy + File
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <FileInput
                    multiple={true}
                    uploadMode="lazy"
                    viewMode="file"
                    previewSize="md"
                    maxFiles={3}
                    {...multipleLazyFileForm.register("files")}
                  />
                  <Button
                    size="xs"
                    className="w-full bg-purple-600 hover:bg-purple-700"
                    onClick={handleMultipleLazyFileSubmit}
                    icon={<UploadIcon />}
                  >
                    Upload
                  </Button>
                  <div className="text-xs text-gray-500">
                    {multipleLazyFileForm.form.files.length}개 파일
                  </div>
                </CardContent>
              </Card>
              {/* 9. Inline Upload (Object Params) */}
              <Card className="border-red-200 bg-red-50/50">
                <CardHeader className="pb-2">
                  <div className="text-xs font-semibold text-red-700">
                    Inline Upload (Object Params)
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Input
                    {...inlineUploadForm.register("category")}
                    placeholder="Category"
                    className="bg-white"
                  />
                  <FileInput
                    multiple={true}
                    uploadMode="lazy"
                    viewMode="file"
                    previewSize="md"
                    maxFiles={3}
                    {...inlineUploadForm.register("files")}
                  />
                  <Button
                    size="xs"
                    className="w-full bg-red-600 hover:bg-red-700"
                    onClick={handleInlineUploadSubmit}
                    icon={<UploadIcon />}
                  >
                    Upload
                  </Button>
                  {inlineUploadForm.form.files.length > 0 && (
                    <div className="text-xs text-gray-500">
                      {inlineUploadForm.form.files.length}개 파일
                    </div>
                  )}
                </CardContent>
              </Card>
              {/* 10. Inline Upload (Flat Params) */}
              <Card className="border-orange-200 bg-orange-50/50">
                <CardHeader className="pb-2">
                  <div className="text-xs font-semibold text-orange-700">
                    Inline Upload (Flat Params)
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Input
                    {...inlineUploadFlatForm.register("category")}
                    placeholder="Category"
                    className="bg-white"
                  />
                  <FileInput
                    multiple={true}
                    uploadMode="lazy"
                    viewMode="file"
                    previewSize="md"
                    maxFiles={1}
                    {...inlineUploadFlatForm.register("files")}
                  />
                  <Button
                    size="xs"
                    className="w-full bg-orange-600 hover:bg-orange-700"
                    onClick={handleInlineUploadFlat}
                    icon={<UploadIcon />}
                  >
                    Upload
                  </Button>
                  {inlineUploadFlatForm.form.files.length > 0 && (
                    <div className="text-xs text-gray-500">
                      {inlineUploadFlatForm.form.files.length}개 파일
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* API 로그 */}
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
                  <EnumSelect
                    enum={FileSearchField}
                    labels={FileSearchFieldLabel}
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
                  <EnumSelect
                    enum={FileOrderBy}
                    labels={FileOrderByLabel}
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
