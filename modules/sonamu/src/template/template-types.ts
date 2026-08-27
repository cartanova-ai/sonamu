import { type TemplateKey, type TemplateOptions } from "../types/types";

type TemplateGroupEntry = {
  [Key in TemplateKey]: {
    key: Key;
    getOptions: (baseOptions: Partial<TemplateOptions>) => TemplateOptions[Key];
  };
}[TemplateKey];

/**
 * 템플릿 그룹 (관련 템플릿 묶음 실행)
 */
export type TemplateGroup = {
  name: string;
  description?: string;
  templates: TemplateGroupEntry[];
};

/**
 * 템플릿 프리셋 (템플릿별 기본 옵션)
 */
export type TemplatePreset = Partial<{
  [Key in TemplateKey]: TemplateOptions[Key];
}>;
