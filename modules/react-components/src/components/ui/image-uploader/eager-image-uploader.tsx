import type React from "react";
import { useCallback, useRef, useState } from "react";
import Loader2Icon from "~icons/lucide/loader2";
import UploadIcon from "~icons/lucide/upload";
import XIcon from "~icons/lucide/x";
import { cn } from "../../../lib/utils";
import { Button } from "../button";
import type { PreviewSize, UploadedFile } from "./types";
import { sizeClasses } from "./types";

export type EagerImageUploaderProps = {
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

export function EagerImageUploader({
  value,
  onValueChange,
  onBlur,
  uploader,
  placeholder = "Click to upload image",
  accept = "image/*",
  disabled = false,
  className,
  previewSize = "md",
}: EagerImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFileChange = useCallback(
    async (file: File | null) => {
      if (!file || disabled) return;

      setIsUploading(true);
      try {
        const result = await uploader(file);
        onValueChange?.(result.url);
      } catch (error) {
        console.error("Upload failed:", error);
      } finally {
        setIsUploading(false);
      }
    },
    [uploader, onValueChange, disabled],
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
    onValueChange?.(null);
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
        ) : value ? (
          <>
            <img src={value} alt="Uploaded" className="h-full w-full object-cover rounded-lg" />
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
}
