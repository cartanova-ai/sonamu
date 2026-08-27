import {
  Button,
  Card,
  CardContent,
  CardHeader,
  FileInput,
  Input,
} from "@sonamu-kit/react-components/components";
import { useTypeForm } from "@sonamu-kit/react-components/lib";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import UploadIcon from "~icons/mdi/upload";

import { ApiLogViewer } from "@/admin-common/ApiLogViewer";
import { FileService } from "@/services/services.generated";

export const Route = createFileRoute("/admin/files/upload-test")({
  head: () => ({
    meta: [
      { title: "Files Upload Test" },
      { name: "description", content: "Buffer/Stream 업로드 모드 테스트" },
    ],
  }),
  component: FilesUploadTest,
});

type UploadResult = {
  name: string;
  files: Array<{
    filename: string;
    url: string;
    mimetype: string;
    size: number;
    md5?: string;
    key?: string;
  }>;
};

function FilesUploadTest() {
  // Buffer 모드 테스트 폼
  const bufferForm = useTypeForm(
    z.object({
      name: z.string(),
      files: z.array(z.union([z.string(), z.instanceof(File)])),
    }),
    { name: "", files: [] },
  );
  const [bufferResult, setBufferResult] = useState<UploadResult | null>(null);
  const [bufferLoading, setBufferLoading] = useState(false);

  // Stream 모드 테스트 폼
  const streamForm = useTypeForm(
    z.object({
      name: z.string(),
      files: z.array(z.union([z.string(), z.instanceof(File)])),
    }),
    { name: "", files: [] },
  );
  const [streamResult, setStreamResult] = useState<UploadResult | null>(null);
  const [streamLoading, setStreamLoading] = useState(false);

  // Buffer 모드 업로드 핸들러
  const handleBufferUpload = async () => {
    const { name, files } = bufferForm.form;
    const filesToUpload = files.filter((f): f is File => f instanceof File);

    if (filesToUpload.length === 0) {
      alert("업로드할 파일을 선택해주세요.");
      return;
    }

    setBufferLoading(true);
    try {
      const result = await FileService.testBufferUpload({ name }, filesToUpload);
      setBufferResult(result);
      bufferForm.setForm((form) => ({ ...form, files: [] }));
    } catch (e) {
      console.error("Buffer upload failed:", e);
      alert("업로드 실패");
    } finally {
      setBufferLoading(false);
    }
  };

  // Stream 모드 업로드 핸들러
  const handleStreamUpload = async () => {
    const { name, files } = streamForm.form;
    const filesToUpload = files.filter((f): f is File => f instanceof File);

    if (filesToUpload.length === 0) {
      alert("업로드할 파일을 선택해주세요.");
      return;
    }

    setStreamLoading(true);
    try {
      const result = await FileService.testStreamUpload({ name }, filesToUpload);
      setStreamResult(result);
      streamForm.setForm((form) => ({ ...form, files: [] }));
    } catch (e) {
      console.error("Stream upload failed:", e);
      alert("업로드 실패");
    } finally {
      setStreamLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-[1400px] mx-auto p-8">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-2">
            <UploadIcon className="h-5 w-5" />
            <span className="text-lg font-semibold">Files Upload Test</span>
          </div>

          <p className="text-sm text-gray-600">
            Buffer 모드와 Stream 모드의 파일 업로드를 테스트합니다.
          </p>

          {/* 테스트 카드 그리드 */}
          <div className="grid grid-cols-2 gap-6">
            {/* Buffer 모드 테스트 */}
            <Card className="border-blue-200 bg-blue-50/50">
              <CardHeader className="pb-2">
                <div className="text-sm font-semibold text-blue-700">
                  Buffer 모드 (testBufferUpload)
                </div>
                <p className="text-xs text-blue-600 mt-1">
                  파일을 메모리에 로드한 후 MD5 해시로 저장합니다.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  {...bufferForm.register("name")}
                  placeholder="name 파라미터"
                  className="bg-white"
                />
                <FileInput
                  multiple={true}
                  uploadMode="lazy"
                  viewMode="image"
                  previewSize="md"
                  maxFiles={5}
                  {...bufferForm.register("files")}
                />
                <Button
                  size="sm"
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  onClick={handleBufferUpload}
                  disabled={bufferLoading}
                  icon={<UploadIcon />}
                >
                  {bufferLoading ? "업로드 중..." : "Buffer Upload"}
                </Button>

                {/* 결과 표시 */}
                {bufferResult && (
                  <div className="mt-4 p-3 bg-white rounded border text-xs">
                    <div className="font-semibold mb-2">결과 (name: {bufferResult.name})</div>
                    {bufferResult.files.map((file, idx) => (
                      <div key={idx} className="mb-2 p-2 bg-gray-50 rounded">
                        <div>
                          <span className="font-medium">filename:</span> {file.filename}
                        </div>
                        <div>
                          <span className="font-medium">mimetype:</span> {file.mimetype}
                        </div>
                        <div>
                          <span className="font-medium">size:</span> {file.size} bytes
                        </div>
                        <div>
                          <span className="font-medium">md5:</span> {file.md5}
                        </div>
                        <div className="truncate">
                          <span className="font-medium">url:</span> {file.url}
                        </div>
                        {file.url && (
                          <img
                            src={file.url}
                            alt={file.filename}
                            className="mt-2 max-w-full h-auto max-h-32 object-contain"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Stream 모드 테스트 */}
            <Card className="border-green-200 bg-green-50/50">
              <CardHeader className="pb-2">
                <div className="text-sm font-semibold text-green-700">
                  Stream 모드 (testStreamUpload)
                </div>
                <p className="text-xs text-green-600 mt-1">파일을 즉시 저장소로 스트리밍합니다.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  {...streamForm.register("name")}
                  placeholder="name 파라미터"
                  className="bg-white"
                />
                <FileInput
                  multiple={true}
                  uploadMode="lazy"
                  viewMode="image"
                  previewSize="md"
                  maxFiles={5}
                  {...streamForm.register("files")}
                />
                <Button
                  size="sm"
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={handleStreamUpload}
                  disabled={streamLoading}
                  icon={<UploadIcon />}
                >
                  {streamLoading ? "업로드 중..." : "Stream Upload"}
                </Button>

                {/* 결과 표시 */}
                {streamResult && (
                  <div className="mt-4 p-3 bg-white rounded border text-xs">
                    <div className="font-semibold mb-2">결과 (name: {streamResult.name})</div>
                    {streamResult.files.map((file, idx) => (
                      <div key={idx} className="mb-2 p-2 bg-gray-50 rounded">
                        <div>
                          <span className="font-medium">filename:</span> {file.filename}
                        </div>
                        <div>
                          <span className="font-medium">mimetype:</span> {file.mimetype}
                        </div>
                        <div>
                          <span className="font-medium">size:</span> {file.size} bytes
                        </div>
                        <div>
                          <span className="font-medium">key:</span> {file.key}
                        </div>
                        <div className="truncate">
                          <span className="font-medium">url:</span> {file.url}
                        </div>
                        {file.url && (
                          <img
                            src={file.url}
                            alt={file.filename}
                            className="mt-2 max-w-full h-auto max-h-32 object-contain"
                          />
                        )}
                      </div>
                    ))}
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
      </div>
    </div>
  );
}
