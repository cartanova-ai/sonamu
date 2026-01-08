import { useCallback, useRef, useState } from "react";
import Loader2Icon from "~icons/lucide/loader2";
import UploadIcon from "~icons/lucide/upload";
import XIcon from "~icons/lucide/x";
import { cn } from "../../../lib/utils";
import { Button } from "../button";
import type { PreviewSize, UploadedFile } from "./types";
import { sizeClasses } from "./types";

export type EagerMultiImageUploaderProps = {
  value: string[];
  onValueChange?: (value: string[]) => void;
  uploader: (files: File[]) => Promise<UploadedFile[]>;
  placeholder?: string;
  accept?: string;
  disabled?: boolean;
  className?: string;
  previewSize?: PreviewSize;
  maxImages?: number;
};

export function EagerMultiImageUploader({
  value,
  onValueChange,
  uploader,
  placeholder = "Click to upload images",
  accept = "image/*",
  disabled = false,
  className,
  previewSize = "md",
  maxImages = 10,
}: EagerMultiImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFilesChange = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || disabled) return;

      // maxImages 체크
      const remainingSlots = maxImages - value.length;
      if (remainingSlots <= 0) {
        alert(`최대 ${maxImages}개까지만 업로드 가능합니다.`);
        return;
      }

      const filesToUpload = files.slice(0, remainingSlots);

      setIsUploading(true);
      try {
        const results = await uploader(filesToUpload);
        const newUrls = results.map((r) => r.url);
        onValueChange?.([...value, ...newUrls]);
      } catch (error) {
        console.error("Upload failed:", error);
        alert("업로드 실패");
      } finally {
        setIsUploading(false);
        // input 초기화
        if (inputRef.current) {
          inputRef.current.value = "";
        }
      }
    },
    [uploader, onValueChange, disabled, value, maxImages],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      handleFilesChange(files);
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
      const newValue = value.filter((_, i) => i !== index);
      onValueChange?.(newValue);
    },
    [value, onValueChange],
  );

  const canAddMore = value.length < maxImages;

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

      {/* 업로드된 이미지들 */}
      {value.map((url, index) => (
        <div key={url} className={cn("relative", sizeClasses[previewSize])}>
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
}
