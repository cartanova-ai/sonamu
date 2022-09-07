import { TemplateKey, TemplateOptions } from "../types/types";
import { SMDNamesRecord } from "../smd/smd-manager";
import { RenderedTemplate } from "../syncer/syncer";

export abstract class Template {
  constructor(public key: TemplateKey) {}
  public abstract render(
    options: TemplateOptions[TemplateKey],
    ...extra: unknown[]
  ): RenderedTemplate;

  public abstract getTargetAndPath(
    names: SMDNamesRecord,
    ...extra: unknown[]
  ): {
    target: string;
    path: string;
  };
}
