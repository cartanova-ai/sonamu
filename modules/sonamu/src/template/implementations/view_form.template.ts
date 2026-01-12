import inflection from "inflection";
import { unique } from "radashi";
import { z } from "zod";
import { Sonamu } from "../../api/sonamu";
import { EntityManager, type EntityNamesRecord } from "../../entity/entity-manager";
import type { RenderingNode, TemplateKey, TemplateOptions } from "../../types/types";
import { getEnumInfoFromColName, getRelationPropFromColName } from "../helpers";
import type { RenderedTemplate } from "../template";
import { Template } from "../template";

export class Template__view_form extends Template {
  constructor() {
    super("view_form");
  }

  getTargetAndPath(names: EntityNamesRecord) {
    return {
      target: "web/src/routes/admin",
      path: `${names.fsPlural}/form.tsx`,
    };
  }

  override getRequiredDictKeys(): string[] | null {
    if (!Sonamu.config.i18n) return null;
    return ["entity.create", "entity.edit", "common.backToList", "form.createdAt", "common.save"];
  }

  wrapFC(body: string, label?: string): string {
    return [
      `<div className="space-y-2">${label ? `\n  <Label>${label}</Label>` : ""}`,
      `  ${body}`,
      `</div>`,
    ].join("\n");
  }
  wrapFG(body: string, label?: string): string {
    return this.wrapFC(body, label);
  }

  renderColumnImport(entityId: string, col: RenderingNode) {
    if (col.renderType === "enums") {
      const { id, targetEntityNames } = getEnumInfoFromColName(entityId, col.name);
      const componentId = `${id}Select`;
      return `import { ${componentId} } from "@/components/${targetEntityNames.fs}/${componentId}";`;
    } else if (col.renderType === "number-fk_id") {
      try {
        const relProp = getRelationPropFromColName(entityId, col.name.replace("_id", ""));
        const targetNames = EntityManager.getNamesFromId(relProp.with);
        const componentId = `${relProp.with}IdAsyncSelect`;
        return `import { ${componentId} } from "@/components/${targetNames.fs}/${componentId}";`;
      } catch {
        return "";
      }
    } else {
      throw new Error(`렌더 불가능한 임포트 ${col.name} ${col.renderType}`);
    }
  }

  renderColumn(
    entityId: string,
    col: RenderingNode,
    names: EntityNamesRecord,
    useI18n: boolean = false,
  ): string {
    const regExpr = `{...register("${col.name}")}`;
    // i18n 적용 시 SD 사용, 아니면 하드코딩 문자열
    const placeholder = useI18n ? `{SD("entity.${entityId}.${col.name}")}` : `"${col.label}"`;

    switch (col.renderType) {
      case "string-plain":
        if (col.zodType instanceof z.ZodString && (col.zodType.maxLength ?? 0) <= 256) {
          return `<Input className="h-8 text-xs bg-white" placeholder=${placeholder} ${regExpr} />`;
        } else {
          return `<Textarea className="text-xs bg-white" rows={4} placeholder=${placeholder} ${regExpr} />`;
        }
      case "datetime":
        return `<DateInput
                    className="h-8 text-xs bg-white"
                    ${regExpr}
                  />`;
      case "number-id":
        return `<input type="hidden" ${regExpr} />`;
      case "number-plain":
        return `<Input type="number" className="h-8 text-xs bg-white" placeholder=${placeholder} ${regExpr} />`;
      case "boolean":
        return `<Switch ${regExpr} />`;
      case "string-image":
        return `<ImageUploader
                      ${regExpr}
                      uploader={async (file: File) => {
                        const { file: uploadedFile } = await FileService.upload(file);
                        return uploadedFile.url;
                      }}
                      previewSize="md"
                    />`;
      case "array-images":
        return `<MultiImageUploader
                    value={Array.isArray(form.${col.name}) ? form.${col.name} : []}
                    onValueChange={(urls) => setForm({ ...form, ${col.name}: urls })}
                    uploader={async (file: File) => {
                      const { file: uploadedFile } = await FileService.upload(file);
                      return uploadedFile.url;
                    }}
                    previewSize="md"
                    placeholder=${placeholder}
                  />`;
      case "enums":
        try {
          let enumId: string;
          if (col.name === "orderBy") {
            enumId = `${names.capital}${inflection.camelize(col.name)}Select`;
          } else {
            const { id } = getEnumInfoFromColName(entityId, col.name);
            enumId = `${id}Select`;
          }
          return `<${enumId} ${regExpr} ${col.optional || col.nullable ? "clearable" : ""} />`;
        } catch {
          return `<Input className="h-8 text-xs bg-white" ${regExpr} />`;
        }
      case "number-fk_id":
        try {
          const relProp = getRelationPropFromColName(entityId, col.name.replace("_id", ""));
          const fkId = `${relProp.with}IdAsyncSelect`;
          return `<${fkId} subset="A" ${regExpr} ${
            col.optional || col.nullable ? "clearable" : ""
          } className="h-8 text-xs" />`;
        } catch {
          return `<Input type="number" className="h-8 text-xs bg-white" placeholder=${placeholder} ${regExpr} />`;
        }
      case "array":
      case "object":
        return `<Input className="h-8 text-xs bg-white" placeholder="${col.name}" ${regExpr} />`;
      default:
        return `<Input className="h-8 text-xs bg-white" ${regExpr} />`;
    }
  }

  resolveDefaultValue(columns: RenderingNode[]): object {
    return columns.reduce(
      (result, col) => {
        if (col.optional) {
          return result;
        }

        let value: unknown;
        if (col.nullable === true) {
          value = null;
        } else if (col.zodType instanceof z.ZodNumber) {
          value = 0;
        } else if (col.zodType instanceof z.ZodEnum) {
          value = Object.keys(col.zodType.enum)[0];
        } else if (col.zodType instanceof z.ZodBoolean) {
          value = false;
        } else if (col.zodType instanceof z.ZodString) {
          if (col.renderType === "string-datetime") {
            value = "now()";
          } else {
            value = "";
          }
        } else if (col.zodType instanceof z.ZodArray) {
          value = [];
        } else if (col.zodType instanceof z.ZodObject) {
          value = {};
        }

        result[col.name] = value;
        return result;
      },
      {} as { [key: string]: unknown },
    );
  }

  async render({ entityId }: TemplateOptions["view_form"]) {
    const entity = EntityManager.get(entityId);
    const names = EntityManager.getNamesFromId(entityId);

    // i18n 설정 확인
    const useI18n = !!Sonamu.config.i18n;

    // SaveParams 타입을 로드하여 saveParamsNode 생성
    const { loadTypes } = await import("../../syncer/module-loader");
    const loadedTypes = await loadTypes();
    const SaveParamsZodType = loadedTypes[`${entityId}SaveParams`];

    if (!SaveParamsZodType) {
      throw new Error(`SaveParams for ${entityId} not found. Did you run 'sonamu sync'?`);
    }

    // Zod 타입을 RenderingNode로 변환
    const { zodTypeToRenderingNode } = await import("../zod-converter");
    const saveParamsNode = zodTypeToRenderingNode(SaveParamsZodType);

    const columns = ((saveParamsNode?.children ?? []) as RenderingNode[])
      .filter((col) => col.name !== "id")
      .map((col) => {
        const propCandidate = entity.props.find((prop) => prop.name === col.name);
        col.label = propCandidate?.desc ?? col.label;
        return col;
      });

    const defaultValue = this.resolveDefaultValue(columns);

    // 프리 템플릿
    const preTemplates: RenderedTemplate["preTemplates"] = (columns as RenderingNode[])
      .filter((col) => {
        if (col.name === "id") {
          return false;
        } else if (col.name.endsWith("_id") || col.renderType === "number-id") {
          try {
            getRelationPropFromColName(entityId, col.name.replace("_id", ""));
            return true;
          } catch {
            return false;
          }
        } else if (col.renderType === "enums") {
          try {
            getEnumInfoFromColName(entityId, col.name);
            return true;
          } catch {
            return false;
          }
        }
        return false;
      })
      .map((col) => {
        let key: TemplateKey;
        let targetMdId = entityId;
        let enumId: string | undefined;
        if (col.renderType === "enums") {
          key = "view_enums_select";
          const { targetEntityNames: targetMDNames, id } = getEnumInfoFromColName(
            entityId,
            col.name,
          );
          targetMdId = targetMDNames.capital;
          enumId = id;
        } else {
          key = "view_id_async_select";
          const relProp = getRelationPropFromColName(entityId, col.name.replace("_id", ""));
          targetMdId = relProp.with;
        }

        return {
          key: key as TemplateKey,
          options: {
            entityId: targetMdId,
            node: col,
            enumId,
          },
        };
      })
      .filter((preTemplate) => {
        if (preTemplate.key === "view_id_async_select") {
          try {
            EntityManager.get(preTemplate.options.entityId);
            return true;
          } catch {
            return false;
          }
        }
        return true;
      });

    return {
      ...this.getTargetAndPath(names),
      body: `
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,${columns.some((col) => col.renderType === "string-plain" && col.zodType instanceof z.ZodString && (col.zodType.maxLength ?? 0) > 256) ? "\n  Textarea," : ""}${columns.some((col) => col.renderType === "enums") ? "\n  Select,\n  SelectContent,\n  SelectItem,\n  SelectTrigger,\n  SelectValue," : ""}${columns.some((col) => col.renderType === "boolean") ? "\n  Switch," : ""}${columns.some((col) => col.renderType === "string-image") ? "\n  ImageUploader," : ""}${columns.some((col) => col.renderType === "array-images") ? "\n  MultiImageUploader," : ""}${columns.some((col) => ["string-datetime", "string-date", "datetime"].includes(col.renderType)) ? "\n  DateInput," : ""}
} from "@sonamu-kit/react-components/components";
import { useTypeForm } from "@sonamu-kit/react-components/lib";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { ${names.capital}Service${
        columns.some((col) => ["string-image", "array-images"].includes(col.renderType))
          ? ", FileService"
          : ""
      } } from "@/services/services.generated";
import type { ${names.capital}SubsetA } from "@/services/sonamu.generated";${
        columns.filter((col) => col.renderType === "enums").length > 0
          ? "\nimport { " +
            unique(
              columns
                .filter((col) => col.renderType === "enums")
                .map((col) => {
                  try {
                    const { id } = getEnumInfoFromColName(entityId, col.name);
                    return `${id}, ${id}Label`;
                  } catch {
                    return "";
                  }
                }),
            )
              .filter(Boolean)
              .join(", ") +
            ' } from "@/services/sonamu.generated";'
          : ""
      }
import { defaultCatch } from "@/services/sonamu.shared";
import { ${names.capital}SaveParams } from "@/services/${names.fs}/${names.fs}.types";
${unique(
  columns
    .filter((col) => ["number-fk_id", "enums"].includes(col.renderType))
    .map((col) => {
      return this.renderColumnImport(entityId, col);
    }),
).join("\n")}
${useI18n ? `import { SD } from "@/i18n/sd.generated";` : ""}

import ArrowLeftIcon from "~icons/lucide/arrow-left";
import SaveIcon from "~icons/lucide/save";
import FormIcon from "~icons/mdi/form-select";

const formSearchSchema = z.object({
  id: z.number().optional(),
});

export const Route = createFileRoute("/admin/${names.fsPlural}/form")({
  validateSearch: formSearchSchema,
  component: ${names.capitalPlural}FormPage,
});

function ${names.capitalPlural}FormPage() {
  const { id } = Route.useSearch();
  return <${names.capitalPlural}Form id={id} />;
}

type ${names.capitalPlural}FormProps = {
  id?: number;
  mode?: "page" | "modal";
};

export function ${names.capitalPlural}Form({ id, mode }: ${names.capitalPlural}FormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { form, setForm, register } = useTypeForm(${names.capital}SaveParams, ${JSON.stringify(defaultValue).replace(/"now\(\)"/g, '""')});
${(() => {
  const hasDatetime = columns.some((col) => col.renderType === "string-datetime");
  const hasDate = columns.some((col) => col.renderType === "string-date");
  if (!hasDatetime && !hasDate) return "";

  let helpers = "\n";
  if (hasDatetime) {
    helpers += `  // datetime-local 형식으로 변환 (YYYY-MM-DDTHH:MM)
  const toDatetimeLocalString = (date: Date | string | null | undefined): string => {
    if (!date) return "";
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toISOString().slice(0, 16);
  };

  // datetime-local 문자열을 Date로 변환
  const fromDatetimeLocalString = (value: string): Date | null => {
    if (!value) return null;
    return new Date(value);
  };
`;
  }
  if (hasDate) {
    helpers += `  // date 형식으로 변환 (YYYY-MM-DD)
  const toDateString = (date: Date | string | null | undefined): string => {
    if (!date) return "";
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toISOString().split("T")[0];
  };

  // date 문자열을 Date로 변환
  const fromDateString = (value: string): Date | null => {
    if (!value) return null;
    return new Date(value);
  };
`;
  }
  return helpers;
})()}
  useEffect(() => {
    if (id) {
      ${names.capital}Service.get${names.capital}("A", id).then((row) => {
        setForm((prevForm) => ({
          ...prevForm,
          ...row,${(() => {
            // relation 필드들을 찾아서 변환 코드 생성
            const relationFields = columns
              .filter((col) => col.renderType === "number-fk_id")
              .map((col) => {
                const relationName = col.name.replace(/_id$/, "");
                if (col.nullable) {
                  return `\n          ${col.name}: row.${relationName}?.id ?? null,`;
                } else {
                  return `\n          ${col.name}: row.${relationName}?.id,`;
                }
              })
              .join("");
            return relationFields;
          })()}
        }));
      });
    }
  }, [id, setForm]);

  const saveMutation = ${names.capital}Service.useSaveMutation();
  const handleSubmit = () => {
    saveMutation.mutate(
      { spa: [form] },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: ["${names.capital}"],
          });

          if (mode === "modal") {
            // modal mode
          } else {
            router.navigate({ to: "/admin/${names.fsPlural}" });
          }
        },
        onError: defaultCatch,
      },
    );
  };

  const PAGE = {
    title: ${useI18n ? `id ? SD("entity.edit")(SD("entity.${entityId}"), id) : SD("entity.create")(SD("entity.${entityId}"))` : `\`${entity.title ?? names.capital}\${id ? \` #\${id} Edit\` : " Create"}\``},
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-[1800px] mx-auto p-8">
        <div className="space-y-6 mb-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FormIcon className="h-5 w-5" />
              <span className="text-lg font-semibold h-5">{PAGE.title}</span>
            </div>
            {mode !== "modal" && (
              <Button
                variant="outline"
                onClick={() => router.navigate({ to: "/admin/${names.fsPlural}" })}
                icon={<ArrowLeftIcon />}
              >
                ${useI18n ? `{SD("common.backToList")}` : "Back To List"}
              </Button>
            )}
          </div>

          {/* Form Card */}
          <Card className="border-border/40 bg-gray-50 shadow-sm">
            <CardHeader className="px-4 border-b border-gray-200 flex items-center">
              <CardTitle className="text-sm font-medium leading-none m-0">
                {PAGE.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-6">
${columns
  .filter((col) => col.name !== "created_at")
  .map((col) => {
    const label = (() => {
      if (col.label.endsWith("Id")) {
        try {
          const entity = EntityManager.get(col.label.replace("Id", ""));
          return entity.title ?? col.label;
        } catch {
          return col.label;
        }
      }
      return col.label;
    })();
    const labelExpr = useI18n ? `{SD("entity.${entityId}.${col.name}")}` : label;
    return `                {/* ${label} */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">${labelExpr}</label>
                  ${this.renderColumn(entityId, col, names, useI18n)}
                </div>`;
  })
  .join("\n\n")}

                {/* Save Button */}
                <div className="flex items-center justify-between pt-4">
                  {form.id && form.created_at && (
                    <div className="flex items-center">
                      <label className="mr-2 text-xs text-gray-600">${useI18n ? `{SD("form.createdAt")}` : "Created At"}:</label>
                      <span className="text-xs text-gray-600">
                        {String(form.created_at)}
                      </span>
                    </div>
                  )}
                  <Button
                    onClick={handleSubmit}
                    icon={<SaveIcon />}
                  >
                    ${useI18n ? `{SD("common.save")}` : "Save"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
      `.trim(),
      importKeys: [],
      preTemplates,
    };
  }
}
