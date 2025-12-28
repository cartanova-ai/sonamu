import type React from "react";
import { useCallback, useRef, useState } from "react";
import Loader2Icon from "~icons/lucide/loader2";
import PlusIcon from "~icons/lucide/plus";
import XIcon from "~icons/lucide/x";
import { cn } from "../../lib/utils";
import { Button } from "./button";

export type MultiImageUploaderProps = {
  value?: string[];
  onValueChange?: (value: string[]) => void;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  uploader: (file: File) => Promise<string>;
  placeholder?: string;
  accept?: string;
  disabled?: boolean;
  className?: string;
  previewSize?: "sm" | "md" | "lg";
  maxImages?: number;
};

export function MultiImageUploader({
  value = [],
  onValueChange,
  onBlur,
  uploader,
  placeholder = "Click to upload",
  accept = "image/*",
  disabled = false,
  className,
  previewSize = "md",
  maxImages,
}: MultiImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const sizeClasses = {
    sm: "h-20 w-20",
    md: "h-32 w-32",
    lg: "h-48 w-48",
  };

  const handleFilesChange = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0 || disabled) return;

      setIsUploading(true);
      try {
        const uploadPromises = Array.from(files).map((file) => uploader(file));
        const uploadedUrls = await Promise.all(uploadPromises);
        const newValue = [...(value || []), ...uploadedUrls];

        // Limit to maxImages if specified
        const limitedValue = maxImages ? newValue.slice(0, maxImages) : newValue;
        onValueChange?.(limitedValue);
      } catch (error) {
        console.error("Upload failed:", error);
      } finally {
        setIsUploading(false);
      }
    },
    [uploader, onValueChange, disabled, value, maxImages],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFilesChange(e.target.files);
    e.target.value = "";
  };

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      handleFilesChange(e.dataTransfer.files);
    },
    [handleFilesChange],
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

  const handleRemove = (index: number) => {
    const newValue = [...(value || [])];
    newValue.splice(index, 1);
    onValueChange?.(newValue);
  };

  const handleClick = () => {
    if (!disabled && !isUploading) {
      inputRef.current?.click();
    }
  };

  const canAddMore = !maxImages || (value?.length || 0) < maxImages;

  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        onChange={handleInputChange}
        onBlur={onBlur}
        disabled={disabled || isUploading}
        className="sr-only"
      />

      {/* Existing images */}
      {value?.map((url, index) => (
        <div
          key={`${url}-${index}`}
          className={cn("relative rounded-lg border overflow-hidden", sizeClasses[previewSize])}
        >
          <img src={url} alt={`Uploaded ${index + 1}`} className="h-full w-full object-cover" />
          {!disabled && (
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute top-1 right-1 h-6 w-6 rounded-full"
              onClick={() => handleRemove(index)}
            >
              <XIcon className="h-3 w-3" />
            </Button>
          )}
        </div>
      ))}

      {/* Add button */}
      {canAddMore && (
        <div
          onClick={handleClick}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
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
              <PlusIcon className="h-6 w-6" />
              <span className="text-xs text-center">{placeholder}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
