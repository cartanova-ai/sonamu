import type React from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import Loader2Icon from "~icons/lucide/loader2";
import UploadIcon from "~icons/lucide/upload";
import XIcon from "~icons/lucide/x";
import { cn, useObjectUrls } from "../../../lib/utils";
import { Button } from "../button";
import type { CommonUploaderProps, PreviewSize, UploadedFile } from "./types";
import { sizeClasses } from "./types";

export type { CommonUploaderProps };

export type LazyImageUploaderProps = {
  value?: string | null;
  onValueChange?: (value: string | null) => void;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  uploader: (file: File) => Promise<UploadedFile>;
  placeholder?: string;
  accept?: string;
  disabled?: boolean;
  className?: string;
  previewSize?: PreviewSize;
};

export type LazyImageUploaderRef = {
  commit: () => Promise<string | null>;
};

export const LazyImageUploader = forwardRef<LazyImageUploaderRef, LazyImageUploaderProps>(
  (
    {
      value,
      onValueChange,
      onBlur,
      uploader,
      placeholder = "Click to upload image",
      accept = "image/*",
      disabled = false,
      className,
      previewSize = "md",
    },
    ref,
  ) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [pendingFile, setPendingFile] = useState<File | null>(null);

    // Object URL 생성 (자동 cleanup)
    const previewUrls = useObjectUrls(pendingFile ? [pendingFile] : []);
    const displayValue = previewUrls[0] || value;

    // commit 메서드 노출
    useImperativeHandle(ref, () => ({
      commit: async () => {
        if (!pendingFile) return value || null;

        setIsUploading(true);
        try {
          const result = await uploader(pendingFile);
          onValueChange?.(result.url);
          setPendingFile(null);
          return result.url;
        } catch (error) {
          console.error("Upload failed:", error);
          return value || null;
        } finally {
          setIsUploading(false);
        }
      },
    }));

    const handleFileChange = useCallback(
      (file: File | null) => {
        if (!file || disabled) return;
        setPendingFile(file);
        // Lazy 모드: onChange 호출 안 함!
      },
      [disabled],
    );

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      handleFileChange(file);
      e.target.value = "";
    };

    const handleDrop = useCallback(
      (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0] ?? null;
        handleFileChange(file);
      },
      [handleFileChange],
    );

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) {
        setDragOver(true);
      }
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
    };

    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation();
      setPendingFile(null);
      if (value) {
        onValueChange?.(null);
      }
    };

    const handleClick = () => {
      if (!disabled && !isUploading) {
        inputRef.current?.click();
      }
    };

    return (
      <div className={cn("relative inline-block", className)}>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          onBlur={onBlur}
          disabled={disabled || isUploading}
          className="sr-only"
        />

        <div
          onClick={handleClick}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            "relative flex items-center justify-center rounded-lg border-2 border-dashed cursor-pointer transition-all",
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
          ) : displayValue ? (
            <>
              <img
                src={displayValue}
                alt="Preview"
                className="h-full w-full object-cover rounded-lg"
              />
              {!disabled && (
                <Button
                  type="button"
                  variant="destructive"
                  size="xs"
                  className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                  onClick={handleClear}
                  icon={<XIcon />}
                />
              )}
              {/* 대기 중인 이미지에 배지 표시 */}
              {pendingFile && (
                <div className="absolute bottom-2 left-2 right-2 px-2 py-1 bg-yellow-500/90 text-white text-xs rounded text-center">
                  대기중
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground p-2">
              <UploadIcon className="h-6 w-6" />
              <span className="text-xs text-center">{placeholder}</span>
            </div>
          )}
        </div>
      </div>
    );
  },
);

LazyImageUploader.displayName = "LazyImageUploader";
