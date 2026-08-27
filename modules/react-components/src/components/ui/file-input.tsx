import { isFunction } from "radashi";
import type React from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { FileIcon as ReactFileIcon, defaultStyles } from "react-file-icon";
import ImageIcon from "~icons/lucide/image";
import Loader2Icon from "~icons/lucide/loader2";
import UploadIcon from "~icons/lucide/upload";
import XIcon from "~icons/lucide/x";

import { type SonamuFile, type UploadParams } from "@/contexts";
import { useSonamuBaseContext } from "@/contexts";
import { type RCKeys } from "@/i18n/rc-keys";
import { cn, useObjectUrls } from "@/lib/utils";

import { Button } from "./button";

export type PreviewSize = "sm" | "md" | "lg" | "xl";

function isFile(value: SonamuFile | File): value is File {
  return Object.prototype.toString.call(value) === "[object File]";
}

function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  if (parts.length < 2) return "";
  return parts[parts.length - 1].toLowerCase();
}

const fileIconSizes = {
  sm: 14,
  md: 18,
  lg: 22,
  xl: 26,
};

const fileIconStyles = new Map<string, Partial<React.ComponentProps<typeof ReactFileIcon>>>(
  Object.entries(defaultStyles),
);

function FileTypeIcon({ filename, size = "md" }: { filename: string; size?: PreviewSize }) {
  const ext = getFileExtension(filename);
  const styleProps = fileIconStyles.get(ext) ?? {};

  return (
    <div className="shrink-0 self-center" style={{ width: fileIconSizes[size], marginTop: -2 }}>
      <ReactFileIcon extension={ext || undefined} {...styleProps} />
    </div>
  );
}

// 이미지용: 정사각형
const imageSizeClasses = {
  sm: "w-20 h-20",
  md: "w-32 h-32",
  lg: "w-40 h-40",
  xl: "w-48 h-48",
};

// 파일용: 가로로 긴 직사각형
const fileSizeClasses = {
  sm: "w-48 h-12",
  md: "w-80 h-16",
  lg: "w-96 h-20",
  xl: "w-[28rem] h-24",
};

type BaseProps = {
  uploadMode: "eager" | "lazy";
  viewMode: "image" | "file";
  placeholder?: string;
  accept?: string;
  disabled?: boolean;
  className?: string;
  previewSize?: PreviewSize;
  uploadParams?: UploadParams;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
};

type SingleModeProps = BaseProps & {
  multiple?: false;
  value: SonamuFile | File | null;
  onValueChange?: (value: SonamuFile | File | null) => void;
};

type MultipleModeProps = BaseProps & {
  multiple: true;
  value: (SonamuFile | File)[] | null;
  onValueChange?: (value: (SonamuFile | File)[]) => void;
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
    uploadParams,
    onBlur,
  } = props;

  const { uploader, SD } = useSonamuBaseContext<RCKeys>();

  const isMultiple = props.multiple ?? false;
  const isImageView = viewMode === "image";

  // viewMode에 따라 accept 자동 설정
  const accept = props.accept ?? (isImageView ? "image/*" : "*/*");

  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // 기본 placeholder 설정
  const defaultPlaceholder =
    placeholder ??
    `${isImageView ? SD("rc.fileInput.imagePlaceholder") : SD("rc.fileInput.filePlaceholder")} URL${isMultiple ? "S" : ""}`;

  // 입력 정규화: 내부적으로 배열로 통일
  const values: Array<SonamuFile | File> = useMemo(() => {
    if (props.multiple !== true) {
      const singleValue = props.value;
      return singleValue ? [singleValue] : [];
    }
    return props.value ?? [];
  }, [props.multiple, props.value]);

  // File 객체만 추출
  const fileObjects = useMemo(() => values.filter(isFile), [values]);

  // File 객체는 useObjectUrls로 안전하게 blob URL 생성 (자동 메모리 해제)
  const blobUrls = useObjectUrls(fileObjects);

  // 최종 display 데이터: 원래 순서를 유지하면서 File은 blob URL로, SonamuFile은 그대로
  const displayItems = values.map((v) => {
    if (isFile(v)) {
      const index = fileObjects.indexOf(v);
      return {
        url: blobUrls[index],
        name: v.name,
        isPending: true,
      };
    }
    // SonamuFile
    return {
      url: v.url,
      name: v.name,
      isPending: false,
    };
  });

  const maxFiles = props.multiple === true ? (props.maxFiles ?? 10) : 1;
  const totalCount = values.length;
  const canAddMore = totalCount < maxFiles;

  const handleFilesChange = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || disabled) return;

      // maxFiles 체크
      const remainingSlots = maxFiles - totalCount;
      if (remainingSlots <= 0) {
        const maxFilesTranslation = SD("rc.fileInput.maxFilesExceeded");
        alert(
          isFunction(maxFilesTranslation) ? maxFilesTranslation(maxFiles) : maxFilesTranslation,
        );
        return;
      }

      const filesToAdd = files.slice(0, remainingSlots);

      // Eager 모드: 즉시 업로드
      if (uploadMode === "eager") {
        setIsUploading(true);
        try {
          const uploadedFiles = await uploader(filesToAdd, uploadParams);

          if (props.multiple === true) {
            // Multiple 파일 업로드
            const finalValues = [...values, ...uploadedFiles];
            props.onValueChange?.(finalValues);
          } else {
            // Single 파일 업로드
            props.onValueChange?.(uploadedFiles[0] ?? null);
          }
        } catch (error) {
          console.error("Upload failed:", error);
          alert(SD("rc.fileInput.uploadFailed"));
        } finally {
          setIsUploading(false);
        }
      } else {
        // Lazy 모드: File 객체 그대로 전달
        if (props.multiple === true) {
          const finalValues = [...values, ...filesToAdd];
          props.onValueChange?.(finalValues);
        } else {
          props.onValueChange?.(filesToAdd[0] ?? null);
        }
      }
    },
    [disabled, totalCount, maxFiles, uploadMode, uploadParams, values, props, uploader, SD],
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

      if (props.multiple !== true) {
        props.onValueChange?.(null);
      } else {
        const newValue = values.filter((_, i) => i !== index);
        props.onValueChange?.(newValue);
      }
    },
    [values, props],
  );

  const handleClick = () => {
    if (!disabled && !isUploading) {
      inputRef.current?.click();
    }
  };

  // viewMode에 따라 적절한 사이즈 클래스 선택
  const sizeClasses = isImageView ? imageSizeClasses : fileSizeClasses;

  // Single 모드 렌더링
  if (!isMultiple && displayItems.length > 0) {
    const item = displayItems[0];
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
              <span className="text-xs">{SD("rc.fileInput.uploading")}</span>
            </div>
          ) : (
            <>
              {isImageView ? (
                <img
                  src={item.url}
                  alt="Preview"
                  className="h-full w-full object-cover rounded-lg overflow-hidden"
                />
              ) : (
                <div className="flex items-center gap-2 px-3 h-full w-full min-w-0 overflow-hidden">
                  <FileTypeIcon filename={item.name} size={previewSize} />
                  <span
                    className={cn(
                      "text-xs truncate min-w-0",
                      item.isPending ? "w-[140px] shrink-0" : "flex-1",
                    )}
                  >
                    {item.name}
                  </span>
                  {item.isPending && (
                    <span className="px-2 py-0.5 bg-yellow-500/90 text-white text-xs rounded whitespace-nowrap shrink-0">
                      {SD("rc.fileInput.pending")}
                    </span>
                  )}
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
              {/* 이미지 모드일 때만 하단에 대기중 배지 표시 */}
              {isImageView && item.isPending && (
                <div className="absolute bottom-2 left-2 right-2 mx-auto max-w-[calc(100%-1rem)] px-2 py-1 bg-yellow-500/90 text-white text-xs rounded text-center truncate">
                  {SD("rc.fileInput.pending")}
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
      {displayItems.map((item, index) => (
        <div key={`${item.url}-${index}`} className={cn("relative", sizeClasses[previewSize])}>
          {isImageView ? (
            <div className="h-full w-full rounded-lg border overflow-hidden">
              <img
                src={item.url}
                alt={`Uploaded ${index + 1}`}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div
              className={cn(
                "relative flex items-center gap-2 px-3 rounded-lg border-2 min-w-0 overflow-hidden",
                "border-dashed border-muted-foreground/25",
                "h-full w-full",
              )}
            >
              <FileTypeIcon filename={item.name} size={previewSize} />
              <span
                className={cn(
                  "text-xs truncate min-w-0",
                  item.isPending ? "w-[140px] shrink-0" : "flex-1",
                )}
              >
                {item.name}
              </span>
              {item.isPending && (
                <span className="px-2 py-0.5 bg-yellow-500/90 text-white text-xs rounded whitespace-nowrap shrink-0">
                  {SD("rc.fileInput.pending")}
                </span>
              )}
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
          {/* 이미지 모드일 때만 하단에 대기중 배지 표시 */}
          {isImageView && item.isPending && (
            <div className="absolute bottom-2 left-2 right-2 mx-auto max-w-[calc(100%-1rem)] px-2 py-1 bg-yellow-500/90 text-white text-xs rounded text-center truncate">
              {SD("rc.fileInput.pending")}
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
              <span className="text-xs">{SD("rc.fileInput.uploading")}</span>
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
