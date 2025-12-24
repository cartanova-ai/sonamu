import type { TemplateKey, TemplateOptions } from "../types/types";

/**
 * 렌더링된 템플릿 결과 타입
 * syncer.ts에서 필요한 타입만 추출
 */
export type RenderedTemplate = {
  target: string;
  path: string;
  body: string;
  importKeys: string[];
  customHeaders?: string[];
  preTemplates?: {
    key: TemplateKey;
    options: TemplateOptions[TemplateKey];
  }[];
};
