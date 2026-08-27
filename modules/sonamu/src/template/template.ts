import path from "path";

import { type EntityNamesRecord } from "../entity/entity-manager";
import { type TemplateKey, type TemplateOptions } from "../types/types";
import { globAsync } from "../utils/async-utils";
import { importMembers } from "../utils/esm-utils";
import { isFunctionValue } from "../utils/runtime-value";

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

/**
 * 템플릿을 나타내는 베이스 클래스입니다.
 */
export abstract class Template {
  private static templates: Map<TemplateKey, Template> = new Map();

  constructor(public key: TemplateKey) {}

  /**
   * 템플릿 구현체가 있는 디렉토리의 모든 템플릿을 로드합니다.
   * 템플릿이 필요(TemplateManager.get)해지기 전에 최소 한 번 호출해주셔야 합니다.
   * @deprecated TemplateManager.autoload() 사용 권장
   */
  public static async autoload() {
    const templateFiles = await globAsync(
      // Sonamu의 코드베이스는 항상 빌드된 채로 dist 속에 머무르므로,
      // 현재 파일을 기준으로 마찬가지로 dist 속에 있는 템플릿 구현체 js 파일들을 찾습니다.
      path.join(import.meta.dirname, "implementations/*.template.js"),
    );

    for (const templateFile of templateFiles) {
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- importMembers의 반환 타입을 명시적으로 지정할 수 없음
      const templates = await importMembers<any>(templateFile);
      if (
        templates.length === 1 &&
        isFunctionValue(templates[0].value) &&
        templates[0].value.prototype instanceof Template
      ) {
        // 클래스의 인스턴스를 생성하여 등록
        const instance = new templates[0].value();
        Template.templates.set(instance.key, instance);
      } else {
        throw new Error(
          `Template ${templateFile} should export only one class that extends Template`,
        );
      }
    }

    // console.log(
    //   chalk.gray(`[Loading] Loaded ${this.templates.size} templates.`)
    // );
  }

  /**
   * 템플릿 **인스턴스**를 key로 찾아옵니다.
   * 만약 템플릿이 로드(autoload)되지 않았거나 찾는 템플릿이 없다면 에러를 던집니다.
   * @deprecated TemplateManager.get() 사용 권장
   * @param key
   * @returns
   */
  public static find(key: TemplateKey): Template {
    const instance = Template.templates.get(key);
    if (!instance) {
      throw new Error(
        `Template ${key} not found. It might be because you tried to find a template before loading all templates. Did you call TemplateManager.autoload()?`,
      );
    }
    return instance;
  }

  /**
   * 내부용: TemplateManager에서 사용
   */
  public static getTemplatesMap(): Map<TemplateKey, Template> {
    return Template.templates;
  }

  /**
   * 내부용: TemplateManager에서 사용
   */
  public static clearTemplates(): void {
    Template.templates.clear();
  }

  public abstract render(
    options: TemplateOptions[TemplateKey],
    ...extra: unknown[]
  ): RenderedTemplate | Promise<RenderedTemplate>;

  public abstract getTargetAndPath(
    names?: EntityNamesRecord,
    ...extra: unknown[]
  ): {
    target: string;
    path: string;
  };

  /**
   * 이 템플릿이 필요로 하는 i18n dict 키를 반환합니다.
   * 스캐폴딩 시 여러 템플릿의 키를 모아서 한 번에 처리합니다.
   *
   * @returns 필요한 dict 키 배열 또는 null (i18n 불필요 시)
   */
  public getRequiredDictKeys(): string[] | null {
    // 기본적으로 dict 키가 필요 없음. 필요한 템플릿에서 오버라이드
    return null;
  }
}
