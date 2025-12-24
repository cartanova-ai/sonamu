import { Loader2, Upload, X } from "lucide-react";
import type React from "react";
import { useCallback, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

export type ImageUploaderProps = {
  value?: string | null;
  onChange?: (e: any, data: { value: string | null }) => void;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  uploader: (file: File) => Promise<string>;
  placeholder?: string;
  accept?: string;
  disabled?: boolean;
  className?: string;
  previewSize?: "sm" | "md" | "lg";
};

export function ImageUploader({
  value,
  onChange,
  onBlur,
  uploader,
  placeholder = "Click to upload image",
  accept = "image/*",
  disabled = false,
  className,
  previewSize = "md",
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const sizeClasses = {
    sm: "h-20 w-20",
    md: "h-32 w-32",
    lg: "h-48 w-48",
  };

  const handleFileChange = useCallback(
    async (file: File | null) => {
      if (!file || disabled) return;

      setIsUploading(true);
      try {
        const uploadedUrl = await uploader(file);
        onChange?.(null, { value: uploadedUrl });
      } catch (error) {
        console.error("Upload failed:", error);
      } finally {
        setIsUploading(false);
      }
    },
    [uploader, onChange, disabled],
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
    onChange?.(null, { value: null });
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
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-xs">Uploading...</span>
          </div>
        ) : value ? (
          <>
            <img src={value} alt="Uploaded" className="h-full w-full object-cover rounded-lg" />
            {!disabled && (
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                onClick={handleClear}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground p-2">
            <Upload className="h-6 w-6" />
            <span className="text-xs text-center">{placeholder}</span>
          </div>
        )}
      </div>
    </div>
  );
}
