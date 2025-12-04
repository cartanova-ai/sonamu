/**
 * 템플릿 그룹 (관련 템플릿 묶음 실행)
 */
export type TemplateGroup = {
  name: string;
  description?: string;
  templates: Array<{
    key: string;
    getOptions: (baseOptions: Record<string, unknown>) => Record<string, unknown>;
  }>;
};

/**
 * 템플릿 프리셋 (템플릿별 기본 옵션)
 */
export type TemplatePreset = Record<string, Record<string, unknown>>;
