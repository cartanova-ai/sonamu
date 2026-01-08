import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import Loader2Icon from "~icons/lucide/loader2";
import UploadIcon from "~icons/lucide/upload";
import XIcon from "~icons/lucide/x";
import { cn, useObjectUrls } from "../../../lib/utils";
import { Button } from "../button";
import type { CommonMultiUploaderProps, PreviewSize, UploadedFile } from "./types";
import { sizeClasses } from "./types";

export type { CommonMultiUploaderProps };

export type LazyMultiImageUploaderProps = {
  value?: string[];
  onValueChange?: (value: string[]) => void;
  uploader: (files: File[]) => Promise<UploadedFile[]>;
  placeholder?: string;
  accept?: string;
  disabled?: boolean;
  className?: string;
  previewSize?: PreviewSize;
  maxImages?: number;
};

export type LazyMultiImageUploaderRef = {
  commit: () => Promise<string[]>;
};

export const LazyMultiImageUploader = forwardRef<
  LazyMultiImageUploaderRef,
  LazyMultiImageUploaderProps
>(
  (
    {
      value = [],
      onValueChange,
      uploader,
      placeholder = "Click to upload images",
      accept = "image/*",
      disabled = false,
      className,
      previewSize = "md",
      maxImages = 10,
    },
    ref,
  ) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);

    // Object URL 생성 (자동 cleanup)
    const previewUrls = useObjectUrls(pendingFiles);

    // 표시할 URL 목록: 업로드된 이미지 + 대기 중인 이미지
    const displayUrls = [...value, ...previewUrls];
    const totalCount = displayUrls.length;

    // commit 메서드 노출
    useImperativeHandle(ref, () => ({
      commit: async () => {
        if (pendingFiles.length === 0) return value;

        setIsUploading(true);
        try {
          const results = await uploader(pendingFiles);
          const newUrls = results.map((r) => r.url);
          const finalValue = [...value, ...newUrls];
          onValueChange?.(finalValue);
          setPendingFiles([]);
          return finalValue;
        } catch (error) {
          console.error("Upload failed:", error);
          alert("업로드 실패");
          return value;
        } finally {
          setIsUploading(false);
        }
      },
    }));

    const handleFilesChange = useCallback(
      (files: File[]) => {
        if (files.length === 0 || disabled) return;

        // maxImages 체크
        const remainingSlots = maxImages - totalCount;
        if (remainingSlots <= 0) {
          alert(`최대 ${maxImages}개까지만 업로드 가능합니다.`);
          return;
        }

        const filesToAdd = files.slice(0, remainingSlots);
        setPendingFiles((prev) => [...prev, ...filesToAdd]);
        // Lazy 모드: onChange 호출 안 함!
      },
      [disabled, totalCount, maxImages],
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

        if (index < value.length) {
          // 업로드된 이미지 제거
          const newValue = value.filter((_, i) => i !== index);
          onValueChange?.(newValue);
        } else {
          // 대기 중인 이미지 제거
          const pendingIndex = index - value.length;
          const newPendingFiles = pendingFiles.filter((_, i) => i !== pendingIndex);
          setPendingFiles(newPendingFiles);
        }
      },
      [value, pendingFiles, onValueChange],
    );

    const canAddMore = totalCount < maxImages;

    return (
      <div className={cn("flex flex-wrap gap-3", className)}>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          onChange={handleInputChange}
          disabled={disabled || isUploading}
          className="sr-only"
        />

        {/* 업로드된 이미지 + 대기 중인 이미지 */}
        {displayUrls.map((url, index) => (
          <div key={`${url}-${index}`} className={cn("relative", sizeClasses[previewSize])}>
            <div className="h-full w-full rounded-lg border overflow-hidden">
              <img src={url} alt={`Uploaded ${index + 1}`} className="h-full w-full object-cover" />
            </div>
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
            {/* 대기 중인 이미지에 배지 표시 */}
            {index >= value.length && (
              <div className="absolute bottom-2 left-2 right-2 px-2 py-1 bg-yellow-500/90 text-white text-xs rounded text-center">
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
              "flex items-center justify-center rounded-lg border-2 border-dashed cursor-pointer transition-all",
              sizeClasses[previewSize],
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

LazyMultiImageUploader.displayName = "LazyMultiImageUploader";
