import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import FileIcon from "~icons/lucide/file";
import Loader2Icon from "~icons/lucide/loader2";
import UploadIcon from "~icons/lucide/upload";
import XIcon from "~icons/lucide/x";
import { cn, useObjectUrls } from "../../../lib/utils";
import { Button } from "../button";
import type { CommonFileUploaderProps, UploadedFile } from "./types";

export type { CommonFileUploaderProps };

type BaseProps = {
  placeholder?: string;
  accept?: string;
  disabled?: boolean;
  className?: string;
};

type SingleProps = BaseProps & {
  multiple?: false;
  value: string;
  onValueChange?: (value: string) => void;
  uploader: (file: File) => Promise<UploadedFile>;
};

type MultipleProps = BaseProps & {
  multiple: true;
  value: string[];
  onValueChange?: (value: string[]) => void;
  uploader: (files: File[]) => Promise<UploadedFile[]>;
  maxFiles?: number;
};

export type LazyFileUploaderProps = SingleProps | MultipleProps;

export type LazyFileUploaderRef = {
  commit: () => Promise<string | string[]>;
};

export const LazyFileUploader = forwardRef<LazyFileUploaderRef, LazyFileUploaderProps>(
  (props, ref) => {
    const {
      placeholder = props.multiple ? "Click to upload files" : "Click to upload file",
      accept = "*/*",
      disabled = false,
      className,
    } = props;

    const inputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);

    // Object URL 생성 (자동 cleanup)
    const previewUrls = useObjectUrls(pendingFiles);

    // 입력 정규화: 내부적으로 배열로 통일
    const urls = useMemo<string[]>(
      () => (props.multiple ? props.value : props.value ? [props.value] : []),
      [props.multiple, props.value],
    );

    // 출력 정규화
    const emitChange = useCallback(
      (next: string[]) => {
        if (props.multiple) {
          (props.onValueChange as ((v: string[]) => void) | undefined)?.(next);
        } else {
          (props.onValueChange as ((v: string) => void) | undefined)?.(next[0] || "");
        }
      },
      [props.multiple, props.onValueChange],
    );

    // Uploader 정규화
    const uploadNormalized = useCallback(
      async (files: File[]): Promise<UploadedFile[]> => {
        if (props.multiple) {
          return await (props.uploader as (fs: File[]) => Promise<UploadedFile[]>)(files);
        }
        const single = await (props.uploader as (f: File) => Promise<UploadedFile>)(files[0]);
        return [single];
      },
      [props.multiple, props.uploader],
    );

    // 표시할 URL 목록: 업로드된 파일 + 대기 중인 파일
    const displayUrls = [...urls, ...previewUrls];
    const totalCount = displayUrls.length;
    const maxFiles = props.multiple ? (props.maxFiles ?? Infinity) : 1;

    // commit 메서드 노출
    useImperativeHandle(
      ref,
      () => ({
        commit: async () => {
          if (pendingFiles.length === 0) {
            return props.multiple ? urls : urls[0] || "";
          }

          setIsUploading(true);
          try {
            const results = await uploadNormalized(pendingFiles);
            const newUrls = results.map((r) => r.url);
            const finalValue = [...urls, ...newUrls];
            emitChange(finalValue);
            setPendingFiles([]);
            return props.multiple ? finalValue : finalValue[0] || "";
          } catch (error) {
            console.error("Upload failed:", error);
            alert("업로드 실패");
            return props.multiple ? urls : urls[0] || "";
          } finally {
            setIsUploading(false);
          }
        },
      }),
      [pendingFiles, urls, props.multiple, uploadNormalized, emitChange],
    );

    const handleFilesChange = useCallback(
      (files: File[]) => {
        if (files.length === 0 || disabled) return;

        // maxFiles 체크
        const remainingSlots = maxFiles - totalCount;
        if (remainingSlots <= 0) {
          alert(`최대 ${maxFiles}개까지만 업로드 가능합니다.`);
          return;
        }

        const filesToAdd = files.slice(0, remainingSlots);
        setPendingFiles((prev) => [...prev, ...filesToAdd]);
        // ✅ Lazy 모드: onChange 호출 안 함!
      },
      [disabled, totalCount, maxFiles],
    );

    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        handleFilesChange(files);
        // input 초기화
        if (inputRef.current) {
          inputRef.current.value = "";
        }
      },
      [handleFilesChange],
    );

    const handleDrop = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        if (disabled || isUploading) return;

        const files = Array.from(e.dataTransfer.files);
        handleFilesChange(files);
      },
      [handleFilesChange, disabled, isUploading],
    );

    const handleRemove = useCallback(
      (index: number) => (e: React.MouseEvent) => {
        e.stopPropagation();

        if (index < urls.length) {
          // 업로드된 파일 제거
          const newValue = urls.filter((_, i) => i !== index);
          emitChange(newValue);
        } else {
          // 대기 중인 파일 제거
          const pendingIndex = index - urls.length;
          const newPendingFiles = pendingFiles.filter((_, i) => i !== pendingIndex);
          setPendingFiles(newPendingFiles);
        }
      },
      [urls, pendingFiles, emitChange],
    );

    const canAddMore = totalCount < maxFiles;

    // 파일명 추출 헬퍼
    const getFileName = (url: string, index: number): string => {
      if (index < urls.length) {
        // 업로드된 파일: URL에서 파일명 추출
        try {
          const urlObj = new URL(url, window.location.origin);
          const pathname = urlObj.pathname;
          return pathname.split("/").pop() || "Unknown file";
        } catch {
          return "Unknown file";
        }
      } else {
        // 대기 중인 파일: File 객체에서 파일명 가져오기
        const pendingIndex = index - urls.length;
        return pendingFiles[pendingIndex]?.name || "Unknown file";
      }
    };

    return (
      <div className={cn("flex flex-wrap gap-3", className)}>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={props.multiple}
          onChange={handleInputChange}
          disabled={disabled || isUploading}
          className="sr-only"
        />

        {/* 업로드된 파일 + 대기 중인 파일 */}
        {displayUrls.map((url, index) => (
          <div
            key={`${url}-${index}`}
            className={cn(
              "relative flex flex-col items-center justify-center gap-2 p-3 rounded-lg border-2 w-32 h-32",
              index >= urls.length
                ? "bg-yellow-50 border-yellow-300"
                : "border-muted-foreground/25",
            )}
          >
            <FileIcon className="h-8 w-8 text-muted-foreground" />
            <span className="text-xs text-center truncate w-full px-1">
              {getFileName(url, index)}
            </span>
            {!disabled && (
              <Button
                type="button"
                variant="destructive"
                size="xs"
                className="absolute -top-2 -right-2 rounded-full"
                onClick={handleRemove(index)}
                icon={<XIcon />}
              />
            )}
            {/* 대기 중인 파일에 배지 표시 */}
            {index >= urls.length && (
              <div className="absolute bottom-2 left-2 right-2 px-2 py-0.5 bg-yellow-500/90 text-white text-xs rounded text-center">
                대기중
              </div>
            )}
          </div>
        ))}

        {/* 추가 버튼 */}
        {canAddMore && (
          <div
            onClick={() => !disabled && !isUploading && inputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              !disabled && !isUploading && setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragOver(false);
            }}
            className={cn(
              "flex items-center justify-center rounded-lg border-2 border-dashed cursor-pointer transition-all w-32 h-32",
              dragOver
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50",
              disabled && "opacity-50 cursor-not-allowed",
              isUploading && "cursor-wait",
            )}
          >
            {isUploading ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2Icon className="h-6 w-6 animate-spin" />
                <span className="text-xs">Uploading...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground p-2">
                <UploadIcon className="h-6 w-6" />
                <span className="text-xs text-center">{placeholder}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
);

LazyFileUploader.displayName = "LazyFileUploader";
