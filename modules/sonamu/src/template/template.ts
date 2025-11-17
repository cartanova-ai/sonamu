import { TemplateKey, TemplateOptions } from "../types/types";
import { EntityNamesRecord } from "../entity/entity-manager";
import { globAsync, importMembersFresh } from "../utils/utils";
import path from "path";
import chalk from "chalk";

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

export abstract class Template {
  private static templates: Map<TemplateKey, Template> = new Map();

  constructor(public key: TemplateKey) {}

  public static async loadAll() {
    const templateFiles = await globAsync(
      path.join(import.meta.dirname, "implementations/*.template.js")
    );

    for (const templateFile of templateFiles) {
      const templates = await importMembersFresh<any>(templateFile);
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

    console.log(
      chalk.gray(`[Loading] Loaded ${this.templates.size} templates.`)
    );
  }

  public static find(key: TemplateKey): Template {
    const instance = this.templates.get(key);
    if (!instance) {
      throw new Error(`Template ${key} not found`);
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
