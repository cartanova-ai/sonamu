import inflection from "inflection";
import { unique } from "radashi";
import { z } from "zod";
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
      target: "web/src/pages/admin",
      path: `${names.fsPlural}/form.tsx`,
    };
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
    parent: string = "",
  ): string {
    let regExpr: string = "";
    regExpr = `{...register(\`${parent}${col.name}\`)}`;

    switch (col.renderType) {
      case "string-plain":
        if (col.zodType instanceof z.ZodString && (col.zodType.maxLength ?? 0) <= 512) {
          return `<Input placeholder="${col.label}" ${regExpr} />`;
        } else {
          return `<Textarea rows={8} placeholder="${col.label}" ${regExpr} />`;
        }
      case "string-datetime":
        return `<DatePicker ${regExpr} />`;
      case "string-date":
        return `<DatePicker ${regExpr} />`;
      case "number-id":
        return `<input type="hidden" ${regExpr} />`;
      case "number-plain":
        return `<Input type="number" placeholder="${col.label}" ${regExpr} />`;
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
        return `{/* TODO: Implement multiple image uploader */}
                  <Input placeholder="${col.label}" ${regExpr} />`;
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
          return `<span className="text-destructive">찾을 수 없는 Enum ${col.name}</span>`;
        }
      case "number-fk_id":
        try {
          const relProp = getRelationPropFromColName(entityId, col.name.replace("_id", ""));
          const fkId = `${relProp.with}IdAsyncSelect`;
          return `<${fkId} {...register('${col.name}')} ${
            col.optional || col.nullable ? "clearable" : ""
          } subset="A" />`;
        } catch {
          return `<Input ${regExpr} />`;
        }
      case "array":
        return `<span className="text-muted-foreground">${col.name} array</span>`;
      case "object":
        return `<span className="text-muted-foreground">${col.name} object</span>`;
      default:
        throw new Error(`대응 불가능한 렌더 타입 ${col.renderType} on ${col.name}`);
    }
  }

  // New style rendering for feed-sites style form
  renderColumnNew(entityId: string, col: RenderingNode, names: EntityNamesRecord): string {
    const regExpr = `{...register("${col.name}")}`;

    switch (col.renderType) {
      case "string-plain":
        if (col.zodType instanceof z.ZodString && (col.zodType.maxLength ?? 0) <= 256) {
          return `<Input className="h-8 text-xs bg-white" placeholder="${col.label}" ${regExpr} />`;
        } else {
          return `<Textarea className="text-xs bg-white" rows={4} placeholder="${col.label}" ${regExpr} />`;
        }
      case "string-datetime":
        return `<Input
                    type="datetime-local"
                    className="h-8 text-xs bg-white"
                    value={toDatetimeLocalString(form.${col.name})}
                    onChange={(e) => setForm({ ...form, ${col.name}: fromDatetimeLocalString(e.target.value) })}
                  />`;
      case "string-date":
        return `<Input
                    type="date"
                    className="h-8 text-xs bg-white"
                    value={toDateString(form.${col.name})}
                    onChange={(e) => setForm({ ...form, ${col.name}: fromDateString(e.target.value) })}
                  />`;
      case "number-id":
        return `<input type="hidden" ${regExpr} />`;
      case "number-plain":
        return `<Input type="number" className="h-8 text-xs bg-white" placeholder="${col.label}" ${regExpr} />`;
      case "boolean":
        return `<Switch ${regExpr} />`;
      case "string-image":
        return `<Input className="h-8 text-xs bg-white" placeholder="Image URL" ${regExpr} />`;
      case "array-images":
        return `<Input className="h-8 text-xs bg-white" placeholder="Image URLs" ${regExpr} />`;
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
          return `<Input type="number" className="h-8 text-xs bg-white" placeholder="${col.label}" ${regExpr} />`;
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
import { Icon, type IconProps } from "@iconify/react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,${columns.some((col) => col.renderType === "string-plain" && col.zodType instanceof z.ZodString && (col.zodType.maxLength ?? 0) > 256) ? "\n  Textarea," : ""}${columns.some((col) => col.renderType === "enums") ? "\n  Select,\n  SelectContent,\n  SelectItem,\n  SelectTrigger,\n  SelectValue," : ""}${columns.some((col) => col.renderType === "boolean") ? "\n  Switch," : ""}${columns.some((col) => col.renderType === "string-image") ? "\n  ImageUploader," : ""}
} from "@sonamu-kit/react-components/components";
import { useGoBack, useTypeForm } from "@sonamu-kit/react-components/lib";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ${names.capital}Service } from "@/services/services.generated";
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
import { defaultCatch } from "@/services/sonamu.shared";${columns.some((col) => col.renderType === "string-image") ? '\nimport { FileService } from "@/services/file/file.service";' : ""}
import { ${names.capital}SaveParams } from "@/services/${names.fs}/${names.fs}.types";
${unique(
  columns
    .filter((col) => ["number-fk_id", "enums"].includes(col.renderType))
    .map((col) => {
      return this.renderColumnImport(entityId, col);
    }),
).join("\n")}

// Icons
const FormIcon = (props: Omit<IconProps, "icon">) => <Icon icon="mdi:form-select" {...props} />;
const ArrowLeftIcon = (props: Omit<IconProps, "icon">) => <Icon icon="lucide:arrow-left" {...props} />;
const SaveIcon = (props: Omit<IconProps, "icon">) => <Icon icon="lucide:save" {...props} />;

export default function ${names.capitalPlural}FormPage() {
  const [searchParams] = useSearchParams();
  const query = {
    id: searchParams.get("id") ?? undefined,
  };

  return <${names.capitalPlural}Form id={query?.id ? Number(query.id) : undefined} />;
}

type ${names.capitalPlural}FormProps = {
  id?: number;
  mode?: "page" | "modal";
};

export function ${names.capitalPlural}Form({ id, mode }: ${names.capitalPlural}FormProps) {
  const [_row, setRow] = useState<${names.capital}SubsetA | undefined>();

  const { form, setForm, register } = useTypeForm(${
    names.capital
  }SaveParams, ${JSON.stringify(defaultValue).replace(/"now\(\)"/g, '""')});
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
        setRow(row);
        setForm((prevForm) => ({
          ...prevForm,
          ...row,${(() => {
            const fkColumns = columns.filter((col) => col.renderType === "number-fk_id");
            if (fkColumns.length === 0) return "";
            return (
              "\n          " +
              fkColumns
                .map((col) => {
                  const relationName = col.name.replace("_id", "");
                  if (col.nullable) {
                    return `${col.name}: row.${relationName}?.id ?? null`;
                  } else {
                    return `${col.name}: row.${relationName}.id`;
                  }
                })
                .join(",\n          ") +
              ","
            );
          })()}
        }));
      });
    }
  }, [id, setForm]);

  const { goBack } = useGoBack();
  const handleSubmit = useCallback(() => {
    ${names.capital}Service.save([form])
      .then(() => {
        if (mode === "modal") {
          // modal mode
        } else {
          goBack("/admin/${names.fsPlural}");
        }
      })
      .catch(defaultCatch);
  }, [form, mode, goBack]);

  const PAGE = {
    title: \`${entity.title ?? names.capital}\${id ? \` #\${id} Edit\` : " Create"}\`,
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
              <Button variant="outline" onClick={() => goBack("/admin/${names.fsPlural}")} className="gap-2">
                <ArrowLeftIcon className="h-4 w-4" />
                Back To List
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
    return `                {/* ${label} */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">${label}</label>
                  ${this.renderColumnNew(entityId, col, names)}
                </div>`;
  })
  .join("\n\n")}

                {/* Save Button */}
                <div className="flex items-center justify-between pt-4">
                  {form.id && form.created_at && (
                    <div className="flex items-center">
                      <label className="mr-2 text-xs text-gray-600">Created At:</label>
                      <span className="text-xs text-gray-600">
                        {String(form.created_at)}
                      </span>
                    </div>
                  )}
                  <Button
                    onClick={handleSubmit}
                    className="gap-2 bg-primary hover:bg-primary/90"
                  >
                    <SaveIcon className="h-4 w-4" />
                    Save
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
