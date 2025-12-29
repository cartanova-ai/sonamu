import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import Loader2Icon from "~icons/lucide/loader2";
import UploadIcon from "~icons/lucide/upload";
import XIcon from "~icons/lucide/x";
import { cn } from "../../lib/utils";
import { Button } from "./button";

export type ImageUploaderProps = {
  value?: string | null;
  onValueChange?: (value: string | null) => void;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  uploader?: (file: File) => Promise<string>;
  placeholder?: string;
  accept?: string;
  disabled?: boolean;
  className?: string;
  previewSize?: "sm" | "md" | "lg";
  mode?: "eager" | "lazy";
};

export function ImageUploader({
  value,
  onValueChange,
  onBlur,
  uploader,
  placeholder = "Click to upload image",
  accept = "image/*",
  disabled = false,
  className,
  previewSize = "md",
  mode = "eager",
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const sizeClasses = {
    sm: "h-20 w-20",
    md: "h-32 w-32",
    lg: "h-48 w-48",
  };

  const handleFileChange = useCallback(
    async (file: File | null) => {
      if (!file || disabled) return;

      if (mode === "lazy") {
        // Lazy mode: store file and create preview
        setPendingFile(file);
        const objectUrl = URL.createObjectURL(file);
        setPreviewUrl(objectUrl);
        onValueChange?.(objectUrl); // Store preview URL temporarily
        return;
      }

      // Eager mode: upload immediately
      if (!uploader) {
        console.error("uploader prop is required in eager mode");
        return;
      }

      setIsUploading(true);
      try {
        const uploadedUrl = await uploader(file);
        onValueChange?.(uploadedUrl);
      } catch (error) {
        console.error("Upload failed:", error);
      } finally {
        setIsUploading(false);
      }
    },
    [uploader, onValueChange, disabled, mode],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    handleFileChange(file);
    // Reset input value to allow re-uploading same file
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
    e.preventDefault();
    e.stopPropagation();

    // Clean up preview URL if in lazy mode
    if (previewUrl && mode === "lazy") {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPendingFile(null);
    }

    onValueChange?.(null);
  };

  // Commit function for lazy mode
  const commitUpload = useCallback(async (): Promise<string | null> => {
    if (mode !== "lazy" || !pendingFile || !uploader) {
      return value || null;
    }

    setIsUploading(true);
    try {
      const uploadedUrl = await uploader(pendingFile);

      // Clean up preview URL
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }

      setPendingFile(null);
      onValueChange?.(uploadedUrl);
      return uploadedUrl;
    } catch (error) {
      console.error("Upload failed:", error);
      return null;
    } finally {
      setIsUploading(false);
    }
  }, [mode, pendingFile, uploader, value, previewUrl, onValueChange]);

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
      customEvent.detail.done(result ? [result] : []);
    };

    document.addEventListener("app:image-uploader/commit", handleCommit);
    return () => {
      document.removeEventListener("app:image-uploader/commit", handleCommit);
    };
  }, [mode, commitUpload]);

  // Clean up preview URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const displayValue = mode === "lazy" && previewUrl ? previewUrl : value;

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
              alt="Uploaded"
              className="h-full w-full object-cover rounded-lg"
            />
            {!disabled && (
              <Button
                type="button"
                variant="destructive"
                size="xs"
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                onClick={handleClear}
              >
                <XIcon className="h-3 w-3" />
              </Button>
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
