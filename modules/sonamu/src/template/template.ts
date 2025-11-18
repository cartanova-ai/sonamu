import { TemplateKey, TemplateOptions } from "../types/types";
import { EntityNamesRecord } from "../entity/entity-manager";
import { globAsync } from "../utils/async-utils";
import { importMembers } from "../utils/esm-utils";
import path from "path";

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
   * 템플릿이 필요(Template.find)해지기 전에 최소 한 번 호출해주셔야 합니다.
   */
  public static async loadAll() {
    const templateFiles = await globAsync(
      // Sonamu의 코드베이스는 항상 빌드된 채로 dist 속에 머무르므로,
      // 현재 파일을 기준으로 마찬가지로 dist 속에 있는 템플릿 구현체 js 파일들을 찾습니다.
      path.join(import.meta.dirname, "implementations/*.template.js")
    );

    for (const templateFile of templateFiles) {
      const templates = await importMembers<any>(templateFile);
      if (
        templates.length === 1 &&
        typeof templates[0].value === "function" &&
        templates[0].value.prototype instanceof Template
      ) {
        // 클래스의 인스턴스를 생성하여 등록
        const instance = new templates[0].value();
        this.templates.set(instance.key, instance);
      } else {
        throw new Error(
          `Template ${templateFile} should export only one class that extends Template`
        );
      }
    }

    // console.log(
    //   chalk.gray(`[Loading] Loaded ${this.templates.size} templates.`)
    // );
  }

  /**
   * 템플릿 **인스턴스**를 key로 찾아옵니다.
   * 만약 템플릿이 로드(loadAll)되지 않았거나 찾는 템플릿이 없다면 에러를 던집니다.
   * @param key 
   * @returns 
   */
  public static find(key: TemplateKey): Template {
    const instance = this.templates.get(key);
    if (!instance) {
      throw new Error(`Template ${key} not found. It might be becasuse you tried to find a template before loading all templates. Did you call Template.loadAll()?`);
    }
    return instance;
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
}
