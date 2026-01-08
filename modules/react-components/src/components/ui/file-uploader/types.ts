export type UploadedFile = { url: string; name: string };

/**
 * 모든 파일 업로더 컴포넌트에 공통으로 적용되는 Props
 */
export type CommonFileUploaderProps = {
  className?: string;
  disabled?: boolean;
  accept?: string;
  placeholder?: string;
};
