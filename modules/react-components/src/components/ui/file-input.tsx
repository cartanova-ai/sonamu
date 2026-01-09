import type React from "react";
import { useCallback, useRef, useState } from "react";
import { useSonamuContext } from "@/contexts/sonamu-context";
import { cn, useObjectUrls } from "@/lib/utils";
import FileIcon from "~icons/lucide/file";
import ImageIcon from "~icons/lucide/image";
import Loader2Icon from "~icons/lucide/loader2";
import UploadIcon from "~icons/lucide/upload";
import XIcon from "~icons/lucide/x";
import { Button } from "./button";

export type PreviewSize = "sm" | "md" | "lg" | "xl";

const sizeClasses: Record<PreviewSize, string> = {
  sm: "w-20 h-20",
  md: "w-32 h-32",
  lg: "w-40 h-40",
  xl: "w-48 h-48",
};

type BaseProps = {
  uploadMode: "eager" | "lazy";
  viewMode: "image" | "file";
  placeholder?: string;
  accept?: string;
  disabled?: boolean;
  className?: string;
  previewSize?: PreviewSize;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
};

type SingleModeProps = BaseProps & {
  multiple?: false;
  value: string | File | null;
  onValueChange?: (value: string | File | null) => void;
};

type MultipleModeProps = BaseProps & {
  multiple: true;
  value: (string | File)[];
  onValueChange?: (value: (string | File)[]) => void;
  maxFiles?: number;
};

export type FileInputProps = SingleModeProps | MultipleModeProps;

export function FileInput(props: FileInputProps) {
  const {
    placeholder,
    disabled = false,
    className,
    previewSize = "md",
    uploadMode,
    viewMode,
    onBlur,
  } = props;

  const { uploader } = useSonamuContext();

  const isMultiple = props.multiple ?? false;
  const isImageView = viewMode === "image";

  // viewMode에 따라 accept 자동 설정
  const accept = props.accept ?? (isImageView ? "image/*" : "*/*");

  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // 기본 placeholder 설정
  const defaultPlaceholder =
    placeholder ?? `${isImageView ? "이미지" : "파일"} URL${isMultiple ? "S" : ""}`;

  // 입력 정규화: 내부적으로 배열로 통일
  const values = (() => {
    if (!isMultiple) {
      const singleValue = (props as SingleModeProps).value;
      return singleValue ? [singleValue] : [];
    }
    return (props as MultipleModeProps).value;
  })();

  // File 객체만 추출
  const fileObjects = values.filter((v): v is File => v instanceof File);

  // File 객체는 useObjectUrls로 안전하게 blob URL 생성 (자동 메모리 해제)
  const blobUrls = useObjectUrls(fileObjects);

  // 최종 URLs: 원래 순서를 유지하면서 File은 blob URL로, string은 그대로
  const urls = values.map((v) => {
    if (v instanceof File) {
      const index = fileObjects.indexOf(v);
      return blobUrls[index];
    }
    return v;
  });

  const maxFiles = isMultiple ? ((props as MultipleModeProps).maxFiles ?? 10) : 1;
  const totalCount = values.length;
  const canAddMore = totalCount < maxFiles;

  const handleFilesChange = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || disabled) return;

      // maxFiles 체크
      const remainingSlots = maxFiles - totalCount;
      if (remainingSlots <= 0) {
        alert(`최대 ${maxFiles}개까지만 업로드 가능합니다.`);
        return;
      }

      const filesToAdd = files.slice(0, remainingSlots);

      // Eager 모드: 즉시 업로드
      if (uploadMode === "eager") {
        setIsUploading(true);
        try {
          // uploader는 항상 File[] 배열을 받음
          const uploadedUrls = await uploader(filesToAdd);

          if (isMultiple) {
            // Multiple 파일 업로드
            const finalValues = [...values, ...uploadedUrls];
            (props.onValueChange as ((v: (string | File)[]) => void) | undefined)?.(finalValues);
          } else {
            // Single 파일 업로드
            (props.onValueChange as ((v: string | File) => void) | undefined)?.(uploadedUrls[0]);
          }
        } catch (error) {
          console.error("Upload failed:", error);
          alert("업로드 실패");
        } finally {
          setIsUploading(false);
        }
      } else {
        // Lazy 모드: File 객체 그대로 전달
        if (isMultiple) {
          const finalValues = [...values, ...filesToAdd];
          (props.onValueChange as ((v: (string | File)[]) => void) | undefined)?.(finalValues);
        } else {
          (props.onValueChange as ((v: string | File) => void) | undefined)?.(filesToAdd[0]);
        }
      }
    },
    [disabled, totalCount, maxFiles, isMultiple, uploadMode, values, props, uploader],
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

      if (!isMultiple) {
        (props.onValueChange as ((v: string | File | null) => void) | undefined)?.(null);
      } else {
        const newValue = values.filter((_, i) => i !== index);
        (props.onValueChange as ((v: (string | File)[]) => void) | undefined)?.(newValue);
      }
    },
    [values, isMultiple, props.onValueChange],
  );

  const handleClick = () => {
    if (!disabled && !isUploading) {
      inputRef.current?.click();
    }
  };

  // 파일명 추출 헬퍼
  const getFileName = (url: string): string => {
    try {
      const urlObj = new URL(url, window.location.origin);
      const pathname = urlObj.pathname;
      return pathname.split("/").pop() || "Unknown file";
    } catch {
      return "Unknown file";
    }
  };

  // File 객체 여부 판단 (lazy mode에서 "대기중" 배지 표시용)
  const isPendingFile = (index: number) => {
    return values[index] instanceof File;
  };

  // Single 모드 렌더링
  if (!isMultiple && urls.length > 0) {
    const url = urls[0];
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
          onDragOver={(e) => {
            e.preventDefault();
            !disabled && !isUploading && setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
          className={cn(
            "relative flex items-center justify-center rounded-lg border-2 cursor-pointer transition-all",
            sizeClasses[previewSize],
            isImageView
              ? "border-transparent"
              : "border-dashed border-muted-foreground/25 hover:border-muted-foreground/50",
            dragOver && "border-primary bg-primary/5",
            disabled && "opacity-50 cursor-not-allowed",
            isUploading && "cursor-wait",
          )}
        >
          {isUploading ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2Icon className="h-6 w-6 animate-spin" />
              <span className="text-xs">업로드 중...</span>
            </div>
          ) : (
            <>
              {isImageView ? (
                <img src={url} alt="Preview" className="h-full w-full object-cover rounded-lg overflow-hidden" />
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 p-3 h-full w-full">
                  <FileIcon className="h-8 w-8 text-muted-foreground" />
                  <span className="text-xs text-center truncate w-full px-1">
                    {getFileName(url)}
                  </span>
                </div>
              )}
              {!disabled && (
                <Button
                  type="button"
                  variant="destructive"
                  size="xs"
                  className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                  onClick={handleRemove(0)}
                  icon={<XIcon />}
                />
              )}
              {/* 대기 중인 파일에 배지 표시 */}
              {isPendingFile(0) && (
                <div className="absolute bottom-2 left-2 right-2 mx-auto max-w-[calc(100%-1rem)] px-2 py-1 bg-yellow-500/90 text-white text-xs rounded text-center truncate">
                  대기중
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // Multiple 모드 또는 빈 Single 모드 렌더링
  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={isMultiple}
        onChange={handleInputChange}
        onBlur={onBlur}
        disabled={disabled || isUploading}
        className="sr-only"
      />

      {/* 업로드된 파일들 */}
      {urls.map((url, index) => (
        <div key={`${url}-${index}`} className={cn("relative", sizeClasses[previewSize])}>
          {isImageView ? (
            <div className="h-full w-full rounded-lg border overflow-hidden">
              <img src={url} alt={`Uploaded ${index + 1}`} className="h-full w-full object-cover" />
            </div>
          ) : (
            <div
              className={cn(
                "relative flex flex-col items-center justify-center gap-2 p-3 rounded-lg border-2",
                "border-dashed border-muted-foreground/25",
                "h-full w-full",
              )}
            >
              <FileIcon className="h-8 w-8 text-muted-foreground" />
              <span className="text-xs text-center truncate w-full px-1">{getFileName(url)}</span>
            </div>
          )}
          {!disabled && (
            <Button
              type="button"
              variant="destructive"
              size="xs"
              className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
              onClick={handleRemove(index)}
              icon={<XIcon />}
            />
          )}
          {/* 대기 중인 파일에 배지 표시 */}
          {isPendingFile(index) && (
            <div className="absolute bottom-2 left-2 right-2 mx-auto max-w-[calc(100%-1rem)] px-2 py-1 bg-yellow-500/90 text-white text-xs rounded text-center truncate">
              대기중
            </div>
          )}
        </div>
      ))}

      {/* 추가 버튼 */}
      {canAddMore && (
        <div
          onClick={handleClick}
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
              <span className="text-xs">업로드 중...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground p-2">
              {isImageView ? <ImageIcon className="h-6 w-6" /> : <UploadIcon className="h-6 w-6" />}
              <span className="text-xs text-center">{defaultPlaceholder}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
