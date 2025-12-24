import type { EntityNamesRecord } from "../entity/entity-manager";
import type { RenderedTemplate } from "../syncer/syncer";
import type { TemplateKey, TemplateOptions } from "../types/types";

export abstract class Template {
  constructor(public key: TemplateKey) {}
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
