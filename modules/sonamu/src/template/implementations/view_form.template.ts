import { unique } from "radashi";
import { z } from "zod";

import { EntityManager } from "../../entity/entity-manager";
import { type EntityNamesRecord } from "../../entity/entity-manager";
import { type RenderingNode, type TemplateOptions } from "../../types/types";
import {
  getEnumInfoFromColName,
  getRelationNameFromColumnName,
  getRelationPropFromColName,
} from "../helpers";
import { Template } from "../template";

type FormDefaultValue =
  | null
  | undefined
  | boolean
  | number
  | string
  | never[]
  | Record<string, never>;
interface FormDefaults {
  [columnName: string]: FormDefaultValue;
}

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
      const { id } = getEnumInfoFromColName(entityId, col.name);
      return { type: "enum" as const, enumId: id };
    } else if (col.renderType === "number-fk_id" || col.renderType === "string-fk_id") {
      try {
        const relProp = getRelationPropFromColName(entityId, col.name.replace("_id", ""));
        return { type: "fk" as const, entityId: relProp.with };
      } catch {
        return null;
      }
    } else if (col.renderType === "array" && col.name.endsWith("_ids")) {
      // ManyToMany relation의 FK 배열
      try {
        const baseName = col.name.replace(/_ids$/, "");
        const relProp = getRelationPropFromColName(entityId, baseName);
        return { type: "fk" as const, entityId: relProp.with };
      } catch {
        return null;
      }
    }
    return null;
  }

  renderColumn(entityId: string, col: RenderingNode): string {
    const regExpr = `{...register("${col.name}")}`;
    const placeholderName = getRelationNameFromColumnName(entityId, col.name);
    const placeholder = `{SD("entity.${entityId}.${placeholderName}")}`;

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
      case "string-id":
        return `<input type="hidden" ${regExpr} />`;
      case "number-plain":
        return `<Input type="number" className="h-8 text-xs bg-white" placeholder=${placeholder} ${regExpr} />`;
      case "boolean":
        return `<Switch ${regExpr} />`;
      case "json-sonamufile":
        return `<FileInput
                    uploadMode="lazy"
                    viewMode="image"
                    previewSize="md"
                    ${regExpr}
                  />`;
      case "json-sonamufile-array":
        return `<FileInput
                    multiple={true}
                    uploadMode="lazy"
                    viewMode="image"
                    previewSize="md"
                    maxFiles={10}
                    ${regExpr}
                  />`;
      case "enums":
        try {
          const { id } = getEnumInfoFromColName(entityId, col.name);
          return `<EnumSelect
                    enum={${id}}
                    labels={${id}Label}
                    ${regExpr}
                  />`;
        } catch {
          return `<Input className="h-8 text-xs bg-white" ${regExpr} />`;
        }
      case "number-fk_id":
      case "string-fk_id":
        try {
          const relProp = getRelationPropFromColName(entityId, col.name.replace("_id", ""));
          return `<IdAsyncSelect
                    config={${relProp.with}AsyncIdConfig}
                    subset="A"
                    ${regExpr}
                  />`;
        } catch {
          return `<Input type="number" className="h-8 text-xs bg-white" placeholder=${placeholder} ${regExpr} />`;
        }
      case "array":
        // ManyToMany relation의 FK 배열인지 확인
        if (col.name.endsWith("_ids")) {
          try {
            const baseName = col.name.replace(/_ids$/, "");
            const relProp = getRelationPropFromColName(entityId, baseName);
            return `<IdAsyncSelect
                    config={${relProp.with}AsyncIdConfig}
                    subset="A"
                    multiple
                    ${regExpr}
                  />`;
          } catch {
            return `<Input className="h-8 text-xs bg-white" placeholder="${col.name}" ${regExpr} />`;
          }
        }
        return `<Input className="h-8 text-xs bg-white" placeholder="${col.name}" ${regExpr} />`;
      case "object":
        return `<Input className="h-8 text-xs bg-white" placeholder="${col.name}" ${regExpr} />`;
      default:
        return `<Input className="h-8 text-xs bg-white" ${regExpr} />`;
    }
  }

  resolveDefaultValue(columns: RenderingNode[]): FormDefaults {
    return columns.reduce<FormDefaults>((result, col) => {
      if (col.optional) {
        return result;
      }

      let value: FormDefaultValue;
      if (col.nullable === true) {
        value = null;
      } else if (col.zodType instanceof z.ZodNumber) {
        value = 0;
      } else if (col.zodType instanceof z.ZodEnum) {
        value = Object.keys(col.zodType.enum)[0];
      } else if (col.zodType instanceof z.ZodBoolean) {
        value = false;
      } else if (col.zodType instanceof z.core.$ZodString) {
        // NOTE: z.ZodString으로 비교하면 z.url(), z.email() 등의 타입에서 문제가 생기므로 z.core.$ZodString으로 비교함
        // FIXME: email이나 url 타입 등에 대한 처리가 필요함
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
    }, {});
  }

  async render({ entityId }: TemplateOptions["view_form"]) {
    const entity = EntityManager.get(entityId);
    const names = EntityManager.getNamesFromId(entityId);

    // PK 타입 감지
    const pkType = entity.getPkType();
    const idTsType = pkType === "string" || pkType === "uuid" ? "string" : "number";
    const idZodType =
      pkType === "string" || pkType === "uuid" ? "z.string().optional()" : "z.number().optional()";

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

    const columns = (saveParamsNode?.children ?? [])
      .filter((col) => col.name !== "id")
      .map((col) => {
        const propCandidate = entity.props.find((prop) => prop.name === col.name);
        col.label = propCandidate?.desc ?? col.label;
        return col;
      });

    const defaultValue = this.resolveDefaultValue(columns);

    // enum과 FK에 대한 import 정보 수집
    const enumImports = new Set<string>();
    const fkConfigImports = new Set<string>();

    columns.forEach((col) => {
      if (col.renderType === "enums") {
        try {
          const { id } = getEnumInfoFromColName(entityId, col.name);
          enumImports.add(id);
        } catch {
          return;
        }
      } else if (col.renderType === "number-fk_id" || col.renderType === "string-fk_id") {
        try {
          const relProp = getRelationPropFromColName(entityId, col.name.replace("_id", ""));
          fkConfigImports.add(relProp.with);
        } catch {
          return;
        }
      } else if (
        col.renderType === "string-plain" &&
        col.name.endsWith("_id") &&
        col.name !== "id"
      ) {
        // string FK 처리 (자신의 PK인 id는 제외)
        try {
          const relProp = getRelationPropFromColName(entityId, col.name.replace("_id", ""));
          fkConfigImports.add(relProp.with);
        } catch {
          return;
        }
      } else if (col.renderType === "array" && col.name.endsWith("_ids")) {
        // ManyToMany relation의 FK 배열
        try {
          const baseName = col.name.replace(/_ids$/, "");
          const relProp = getRelationPropFromColName(entityId, baseName);
          fkConfigImports.add(relProp.with);
        } catch {
          return;
        }
      }
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
  Input,${columns.some((col) => col.renderType === "string-plain" && col.zodType instanceof z.ZodString && (col.zodType.maxLength ?? 0) > 256) ? "\n  Textarea," : ""}${columns.some((col) => col.renderType === "enums") ? "\n  EnumSelect," : ""}${columns.some((col) => col.renderType === "number-fk_id" || col.renderType === "string-fk_id" || (col.renderType === "array" && col.name.endsWith("_ids"))) ? "\n  IdAsyncSelect," : ""}${columns.some((col) => col.renderType === "boolean") ? "\n  Switch," : ""}${columns.some((col) => ["json-sonamufile", "json-sonamufile-array"].includes(col.renderType)) ? "\n  FileInput," : ""}${columns.some((col) => ["string-datetime", "string-date", "datetime"].includes(col.renderType)) ? "\n  DateInput," : ""}
} from "@sonamu-kit/react-components/components";
import { useTypeForm } from "@sonamu-kit/react-components/lib";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
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
import { defaultCatch } from "@/services/sonamu.shared";
import { ${names.capital}SaveParams } from "@/services/${names.fs}/${names.fs}.types";${
        fkConfigImports.size > 0
          ? `\nimport { ${Array.from(fkConfigImports)
              .map((relatedEntityId) => `${relatedEntityId}AsyncIdConfig`)
              .join(", ")} } from "@/services/services.generated";`
          : ""
      }
import { SD } from "@/i18n/sd.generated";

import ArrowLeftIcon from "~icons/lucide/arrow-left";
import SaveIcon from "~icons/lucide/save";
import FormIcon from "~icons/mdi/form-select";

const formSearchSchema = z.object({
  id: ${idZodType},
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
  id?: ${idTsType};
  mode?: "page" | "modal";
};

export function ${names.capitalPlural}Form({ id, mode }: ${names.capitalPlural}FormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { form, setForm, register${columns.some((col) => ["json-sonamufile", "json-sonamufile-array"].includes(col.renderType)) ? ", submit" : ""} } = useTypeForm(${names.capital}SaveParams, ${JSON.stringify(defaultValue).replace(/"now\(\)"/g, '""')});
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
            // number FK, string FK (자신의 PK 제외), ManyToMany FK 배열만 필터링
            const relationFields = columns
              .filter(
                (col) =>
                  col.renderType === "number-fk_id" ||
                  col.renderType === "string-fk_id" ||
                  (col.renderType === "array" && col.name.endsWith("_ids")),
              )
              .map((col) => {
                // ManyToMany(array) 처리
                if (col.renderType === "array" && col.name.endsWith("_ids")) {
                  const relationName = getRelationNameFromColumnName(entityId, col.name);
                  return `\n          ${col.name}: row.${relationName}?.map((r) => r.id) ?? [],`;
                }
                // FK(number, string) 처리
                const relationName = getRelationNameFromColumnName(entityId, col.name);
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
  const handleSubmit = ${
    columns.some((col) => ["json-sonamufile", "json-sonamufile-array"].includes(col.renderType))
      ? `submit(async (form) => {
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
  })`
      : `() => {
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
  }`
  };

  const PAGE = {
    title: id ? SD("entity.edit")(SD("entity.${entityId}"), id) : SD("entity.create")(SD("entity.${entityId}")),
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
                {SD("common.backToList")}
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
          const relatedEntity = EntityManager.get(col.label.replace("Id", ""));
          return relatedEntity.title ?? col.label;
        } catch {
          return col.label;
        }
      }
      return col.label;
    })();
    const labelName = getRelationNameFromColumnName(entityId, col.name);
    return `                {/* ${label} */}
                <div className="space-y-2">
                  <label className="block text-xs mb-1 text-gray-600">{SD("entity.${entityId}.${labelName}")}</label>
                  ${this.renderColumn(entityId, col)}
                </div>`;
  })
  .join("\n\n")}

                {/* Save Button */}
                <div className="flex items-center justify-between pt-4">
                  {form.id && form.created_at && (
                    <div className="flex items-center">
                      <label className="mr-2 text-xs text-gray-600">{SD("form.createdAt")}:</label>
                      <span className="text-xs text-gray-600">
                        {String(form.created_at)}
                      </span>
                    </div>
                  )}
                  <Button
                    onClick={handleSubmit}
                    icon={<SaveIcon />}
                  >
                    {SD("common.save")}
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
    };
  }
}
