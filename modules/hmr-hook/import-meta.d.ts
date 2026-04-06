/* eslint-disable unicorn/filename-case */
interface ImportMeta {
  readonly hot?: {
    dispose(callback: () => Promise<void> | void): void;
    decline(): void;
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- HMR boundary 옵션은 사용자 정의 값을 허용해야 함
    boundary: Record<string, any>;
  };
}
