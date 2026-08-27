import path from "path";

import { type TemplateKey } from "../types/types";
import { globAsync } from "../utils/async-utils";
import { importMembers } from "../utils/esm-utils";
import { isFunctionValue } from "../utils/runtime-value";
import { Template } from "./template";

type TemplateConstructor = new () => Template;

class TemplateManagerClass {
  private templates: Map<TemplateKey | string, Template> = new Map();
  isAutoloaded: boolean = false;

  // ================================
  // 기본 메서드
  // ================================

  /**
   * 빌트인 템플릿 로드 (implementations/*.template.js)
   */
  async autoload(): Promise<void> {
    if (this.isAutoloaded) {
      return;
    }
    const templateFiles = await globAsync(
      path.join(import.meta.dirname, "implementations/*.template.js"),
    );

    for (const templateFile of templateFiles) {
      const templates = await importMembers<unknown>(templateFile);
      if (templates.length === 1 && this.isTemplateClass(templates[0].value)) {
        const instance = new templates[0].value();
        this.templates.set(instance.key, instance);
      } else {
        throw new Error(
          `Template ${templateFile} should export only one class that extends Template`,
        );
      }
    }

    for (const [key, template] of this.templates) {
      Template.getTemplatesMap().set(
        /* SAFETY: 선행 Zod 종류 분기와 템플릿 입력 계약이 이 값의 타입을 보장한다. */ key as TemplateKey,
        template,
      );
    }

    this.isAutoloaded = true;
  }

  /**
   * 템플릿 다시 로드
   */
  async reload(): Promise<void> {
    this.templates.clear();
    Template.clearTemplates();
    this.isAutoloaded = false;
    await this.autoload();
  }

  /**
   * 프로젝트 디렉토리에서 커스텀 템플릿 로드
   */
  async loadFromDirectory(dir: string): Promise<number> {
    const templateFiles = await globAsync(path.join(dir, "*.template.{ts,js}"));
    let count = 0;

    for (const file of templateFiles) {
      const templates = await importMembers<unknown>(file);
      for (const { value } of templates) {
        if (this.isTemplateClass(value)) {
          const instance = new value();
          this.register(instance);
          count++;
        }
      }
    }

    return count;
  }

  private isTemplateClass<Value>(value: Value): value is Value & TemplateConstructor {
    return isFunctionValue(value) && value.prototype instanceof Template;
  }

  // ================================
  // 템플릿 등록
  // ================================

  /**
   * 템플릿 등록
   */
  register(template: Template): void {
    this.templates.set(template.key, template);
    // 하위 호환
    Template.getTemplatesMap().set(template.key, template);
  }

  /**
   * 여러 템플릿 등록
   */
  registerAll(templates: Template[]): void {
    for (const template of templates) {
      this.register(template);
    }
  }

  // ================================
  // 템플릿 조회
  // ================================

  /**
   * 템플릿 조회
   * 빌트인 : 자동완성 지원
   * 커스텀 : 임의 문자열 지원
   */
  get(key: TemplateKey | (string & {})): Template {
    const template = this.templates.get(key);
    if (!template) {
      throw new Error(`Template '${key}' not found. Available: [${this.getAllKeys().join(", ")}]`);
    }
    return template;
  }

  /**
   * 템플릿 존재 여부
   */
  exists(key: string): boolean {
    return this.templates.has(key);
  }

  /**
   * 모든 템플릿 키 목록
   */
  getAllKeys(): string[] {
    return Array.from(this.templates.keys()).toSorted();
  }

  /**
   * 등록된 템플릿 개수
   */
  get size(): number {
    return this.templates.size;
  }

  // ================================
  // 테스트 유틸리티
  // ================================

  /**
   * 모든 상태 초기화 (테스트용)
   */
  reset(): void {
    this.templates.clear();
    this.isAutoloaded = false;
    Template.clearTemplates();
  }

  /**
   * 격리된 인스턴스 생성 (테스트용)
   */
  static createInstance(): TemplateManagerClass {
    return new TemplateManagerClass();
  }
}

export const TemplateManager = new TemplateManagerClass();
export { TemplateManagerClass };
