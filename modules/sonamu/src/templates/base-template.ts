import { TemplateKey, TemplateOptions } from "../types/types";
import { EntityNamesRecord } from "../entity/entity-manager";
import { RenderedTemplate } from "../syncer/syncer";

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
