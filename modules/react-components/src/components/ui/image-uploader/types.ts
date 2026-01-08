export type UploadedFile = { url: string; name: string };

export const sizeClasses = {
  sm: "h-20 w-20",
  md: "h-32 w-32",
  lg: "h-48 w-48",
};

export type PreviewSize = keyof typeof sizeClasses;

/**
 * 모든 이미지 업로더 컴포넌트에 공통으로 적용되는 Props
 */
export type CommonUploaderProps = {
  className?: string;
  disabled?: boolean;
  accept?: string;
  placeholder?: string;
  previewSize?: PreviewSize;
};
