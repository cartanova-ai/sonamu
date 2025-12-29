import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import Loader2Icon from "~icons/lucide/loader2";
import PlusIcon from "~icons/lucide/plus";
import XIcon from "~icons/lucide/x";
import { cn } from "../../lib/utils";
import { Button } from "./button";

export type MultiImageUploaderProps = {
  value?: string[];
  onValueChange?: (value: string[]) => void;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  uploader?: (file: File) => Promise<string>;
  placeholder?: string;
  accept?: string;
  disabled?: boolean;
  className?: string;
  previewSize?: "sm" | "md" | "lg";
  maxImages?: number;
  mode?: "eager" | "lazy";
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
  mode = "eager",
}: MultiImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  const sizeClasses = {
    sm: "h-20 w-20",
    md: "h-32 w-32",
    lg: "h-48 w-48",
  };

  const handleFilesChange = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0 || disabled) return;

      const fileArray = Array.from(files);

      if (mode === "lazy") {
        // Lazy mode: store files and create previews
        const newPendingFiles = [...pendingFiles, ...fileArray];
        const limitedFiles = maxImages ? newPendingFiles.slice(0, maxImages) : newPendingFiles;

        setPendingFiles(limitedFiles);

        // Create preview URLs
        const newPreviewUrls = fileArray.map((file) => URL.createObjectURL(file));
        const allPreviewUrls = [...previewUrls, ...newPreviewUrls];
        const limitedPreviewUrls = maxImages ? allPreviewUrls.slice(0, maxImages) : allPreviewUrls;

        setPreviewUrls(limitedPreviewUrls);
        // Don't call onValueChange in lazy mode - we'll update it after upload
        return;
      }

      // Eager mode: upload immediately
      if (!uploader) {
        console.error("uploader prop is required in eager mode");
        return;
      }

      setIsUploading(true);
      try {
        const uploadPromises = fileArray.map((file) => uploader(file));
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
    [uploader, onValueChange, disabled, value, maxImages, mode, pendingFiles, previewUrls],
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
    if (mode === "lazy") {
      // In lazy mode, all displayed items are from previewUrls
      const newPendingFiles = [...pendingFiles];
      newPendingFiles.splice(index, 1);
      setPendingFiles(newPendingFiles);

      // Clean up preview URL
      const urlToRevoke = previewUrls[index];
      if (urlToRevoke) {
        URL.revokeObjectURL(urlToRevoke);
      }
      const newPreviewUrls = [...previewUrls];
      newPreviewUrls.splice(index, 1);
      setPreviewUrls(newPreviewUrls);
    } else {
      // Eager mode: remove from uploaded values
      const newValue = [...(value || [])];
      newValue.splice(index, 1);
      onValueChange?.(newValue);
    }
  };

  // Commit function for lazy mode
  const commitUpload = useCallback(async (): Promise<string[]> => {
    if (mode !== "lazy" || pendingFiles.length === 0 || !uploader) {
      return value || [];
    }

    setIsUploading(true);
    try {
      const uploadPromises = pendingFiles.map((file) => uploader(file));
      const uploadedUrls = await Promise.all(uploadPromises);

      // Clean up preview URLs
      for (const url of previewUrls) {
        URL.revokeObjectURL(url);
      }
      setPreviewUrls([]);
      setPendingFiles([]);

      const finalValue = [...(value || []), ...uploadedUrls];
      onValueChange?.(finalValue);
      return finalValue;
    } catch (error) {
      console.error("Upload failed:", error);
      return value || [];
    } finally {
      setIsUploading(false);
    }
  }, [mode, pendingFiles, uploader, value, previewUrls, onValueChange]);

  const handleClick = () => {
    if (!disabled && !isUploading) {
      inputRef.current?.click();
    }
  };

  // Listen for commit event in lazy mode
  useEffect(() => {
    if (mode !== "lazy") return;

    const handleCommit = async (event: Event) => {
      const customEvent = event as CustomEvent<{
        channel: string;
        done: (urls: string[]) => void;
      }>;

      if (customEvent.detail?.channel !== "image-uploader") return;

      const result = await commitUpload();
      customEvent.detail.done(result);
    };

    document.addEventListener("app:image-uploader/commit", handleCommit);
    return () => {
      document.removeEventListener("app:image-uploader/commit", handleCommit);
    };
  }, [mode, commitUpload]);

  // Clean up preview URLs on unmount
  useEffect(() => {
    return () => {
      for (const url of previewUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [previewUrls]);

  const totalCount = mode === "lazy" ? pendingFiles.length : value?.length || 0;
  const canAddMore = !maxImages || totalCount < maxImages;
  const displayUrls = mode === "lazy" ? previewUrls : value;

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

      {/* Existing and pending images */}
      {displayUrls?.map((url, index) => (
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
              icon={<XIcon />}
              onClick={() => handleRemove(index)}
            />
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
