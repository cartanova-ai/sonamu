/**
 * Lazy 모드의 모든 ImageUploader/MultiImageUploader 컴포넌트의 업로드를 실행합니다.
 *
 * Lazy 모드에서는 파일을 선택해도 즉시 업로드되지 않습니다.
 * 대기 중인 모든 파일을 업로드할 준비가 되었을 때 이 함수를 호출하세요.
 *
 * @returns 업로드된 URL 배열을 반환하는 Promise
 */
export function lazyUpload(): Promise<string[]> {
  return new Promise((resolve) => {
    document.dispatchEvent(
      new CustomEvent("app:image-uploader/commit", {
        detail: {
          channel: "image-uploader",
          done: resolve,
        },
      }),
    );
  });
}
