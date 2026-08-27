import inflection from "inflection";
import { flat } from "radashi";
import { z } from "zod";

import { EntityManager } from "../../entity/entity-manager";
import { type EntityNamesRecord } from "../../entity/entity-manager";
import { type RenderingNode, type TemplateOptions } from "../../types/types";
import {
  getEnumInfoFromColName,
  getRelationNameFromColumnName,
  getRelationPropFromColName,
} from "../helpers";
import { type RenderedTemplate } from "../template";
import { Template } from "../template";

function getConfigEnumId(config: RenderingNode["config"]): string | undefined {
  if (!config || !("enumId" in config)) {
    return undefined;
  }
  return Object.prototype.toString.call(config.enumId) === "[object String]"
    ? String(config.enumId)
    : undefined;
}

export class Template__view_list extends Template {
  constructor() {
    super("view_list");
  }

  getTargetAndPath(names: EntityNamesRecord) {
    return {
      target: "web/src/routes/admin",
      path: `${names.fsPlural}/index.tsx`,
    };
  }

  override getRequiredDictKeys(): string[] | null {
    return ["entity.listManage", "common.all"];
  }

  wrapTc(body: string, key: string, collapsing: boolean = true, className: string = "") {
    return `<Table.Cell key="${key}"${collapsing ? " collapsing" : ""}${
      className ? ` className={\`${className}\`}` : ""
    }>${body}</Table.Cell>`;
  }

  renderColumn(
    entityId: string,
    col: RenderingNode,
    names: EntityNamesRecord,
    parentObj: string = "row",
    withoutName: boolean = false,
  ): string {
    // 중첩 경로 처리 (예: "user.name" -> "row.user?.name")
    let colName: string;
    if (withoutName) {
      colName = parentObj;
    } else if (col.name.includes(".")) {
      // 중첩 경로는 optional chaining으로 변환
      const parts = col.name.split(".");
      colName = `${parentObj}.${parts.join("?.")}`;
    } else {
      colName = `${parentObj}.${col.name}`;
    }

    switch (col.renderType) {
      case "string-plain":
      case "string-date":
      case "number-id":
      case "string-id":
        return `<>{${colName}}</>`;
      case "number-fk_id":
      case "string-fk_id": {
        try {
          const baseName = col.name.includes(".")
            ? (col.name.split(".").pop() ?? col.name).replace("_id", "")
            : col.name.replace("_id", "");
          const relPropFk = getRelationPropFromColName(entityId, baseName);
          return `<>${relPropFk.with}#{${colName}}</>`;
        } catch {
          return `<>{${colName}}</>`;
        }
      }
      case "datetime":
        if (col.nullable || col.name.includes(".")) {
          return `<span>{${colName} ? datetimeF(${colName}) : '-'}</span>`;
        } else {
          return `<span>{datetimeF(${colName})}</span>`;
        }
      case "string-datetime":
        if (col.nullable || col.name.includes(".")) {
          return `<span>{${colName} ? dateF(${colName}) : '-'}</span>`;
        } else {
          return `<span>{dateF(${colName})}</span>`;
        }
      case "boolean":
        return `<>{${colName} ? <Badge variant="default">O</Badge> : <Badge variant="secondary">X</Badge>}</>`;
      case "enums": {
        try {
          const { id: enumId } = getEnumInfoFromColName(entityId, col.name);
          return `<>{${col.nullable ? `${colName} && ` : ""}${enumId}Label[${colName}]}</>`;
        } catch {
          return `<>{${colName}}</>`;
        }
      }
      case "array-images":
        return `<div className="flex gap-1">{ ${colName}?.map((r, i) => ${
          col.nullable ? `r && ` : ""
        }<img key={i} src={r} alt={\`${col.label ?? col.name} \${i + 1}\`} className="h-8 w-8 object-cover rounded" />) }</div>`;
      case "json-sonamufile":
        return `<div className="flex items-center gap-2">{${colName} ? <img src={${colName}.url} alt={${colName}.name} className="h-8 w-8 object-cover rounded" /> : '-'}</div>`;
      case "json-sonamufile-array":
        return `<div className="flex gap-1">{ ${colName}?.map((r, i) => ${
          col.nullable ? `r && ` : ""
        }<img key={i} src={r.url} alt={\`${col.label ?? col.name} \${i + 1}\`} className="h-8 w-8 object-cover rounded" />) }</div>`;
      case "number-plain":
        return `<>{${col.nullable || col.name.includes(".") ? `${colName} && ` : ""}numF(${colName})}</>`;
      case "object":
        return `<span className="text-xs">{${col.nullable ? `${colName} ? ` : ""}JSON.stringify(${colName})${col.nullable ? ` : '-'` : ""}}</span>`;
      case "object-pick": {
        const pickedChild = col.children?.find((child) => child.name === col.config?.picked);
        if (!pickedChild) {
          throw new Error(`object-pick 선택 실패 (오브젝트: ${col.name})`);
        }
        return this.renderColumn(
          entityId,
          pickedChild,
          names,
          `${colName}${col.nullable ? "?" : ""}`,
        );
      }
      case "array":
        return `<>{ /* array ${colName} */ }</>`;
      case "vector":
        // vector 타입은 차원 수만 표시 (실제 데이터는 너무 김)
        return `<>{${col.nullable ? `${colName} ? ` : ""}[Vector: {${colName}${col.nullable ? "" : " ?? []"}.length}d]${col.nullable ? " : '-'" : ""}}</>`;
      default:
        throw new Error(`렌더 불가 컬럼 ${col.renderType}`);
    }
  }

  renderColumnImport(
    entityId: string,
    col: RenderingNode,
    names: EntityNamesRecord,
  ): (string | null)[] {
    if (col.renderType === "enums") {
      const { id: enumId } = getEnumInfoFromColName(names.capital, col.name);
      return [`import { ${enumId}Label } from '@/services/sonamu.generated';`];
    } else if (col.renderType === "object") {
      try {
        const relProp = getRelationPropFromColName(entityId, col.name);
        const result = (col.children ?? []).map((child) => {
          entityId = relProp.with;
          names = EntityManager.getNamesFromId(relProp.with);
          return this.renderColumnImport(entityId, child, names);
        });
        return flat(result);
      } catch {
        return [null];
      }
    } else if (col.renderType === "array") {
      if (!col.element) return [null];
      return this.renderColumnImport(entityId, col.element, names);
    }

    return [null];
  }

  renderFilterImport(entityId: string, col: RenderingNode, names: EntityNamesRecord) {
    if (col.name === "search") {
      return `import { ${names.capital}SearchInput } from "@/components/${names.fs}/${names.capital}SearchInput";`;
    } else if (col.renderType === "enums") {
      if (col.name === "orderBy") {
        const componentId = `${names.capital}${inflection.camelize(col.name)}Select`;
        return `import { ${componentId} } from "@/components/${names.fs}/${componentId}";`;
      } else {
        try {
          const { id, targetEntityNames: targetMDNames } = getEnumInfoFromColName(
            entityId,
            col.name,
          );
          const componentId = `${id}Select`;
          return `import { ${componentId} } from "@/components/${targetMDNames.fs}/${componentId}";`;
        } catch {
          return "";
        }
      }
    } else if (col.renderType === "number-fk_id" || col.renderType === "string-fk_id") {
      try {
        const relProp = getRelationPropFromColName(entityId, col.name.replace("_id", ""));
        const targetNames = EntityManager.getNamesFromId(relProp.with);
        const componentId = `${relProp.with}IdAsyncSelect`;
        return `import { ${componentId} } from "@/components/${targetNames.fs}/${componentId}";`;
      } catch {
        return "";
      }
    } else {
      throw new Error(`렌더 불가능한 필터 임포트 ${col.name} ${col.renderType}`);
    }
  }

  renderFilter(entityId: string, col: RenderingNode, names: EntityNamesRecord) {
    if (col.name === "search") {
      return "";
    }

    const isClearable = col.optional === true && col.name !== "orderBy";
    let componentId: string;
    if (col.renderType === "enums") {
      if (col.name === "orderBy") {
        componentId = `${names.capital}${inflection.camelize(col.name)}Select`;
      } else {
        try {
          const { id } = getEnumInfoFromColName(entityId, col.name);
          componentId = `${id}Select`;
        } catch {
          return "";
        }
      }
      return `<${componentId} {...register('${col.name}')} ${isClearable ? "clearable" : ""} />`;
    } else if (col.renderType === "number-fk_id" || col.renderType === "string-fk_id") {
      try {
        const relProp = getRelationPropFromColName(entityId, col.name.replace("_id", ""));
        componentId = `${relProp.with}IdAsyncSelect`;
        return `<${componentId} {...register('${col.name}')} ${
          isClearable ? "clearable" : ""
        } subset="A" />`;
      } catch {
        return "";
      }
    } else {
      throw new Error(`렌더 불가능한 필터 임포트 ${col.name} ${col.renderType}`);
    }
  }

  getDefault(columns: RenderingNode[]) {
    const def = {
      orderBy: "",
      search: "",
      hasSearch: false,
      hasOrderBy: false,
    };
    const orderByZodType = columns.find((col) => col.name === "orderBy")?.zodType;
    if (orderByZodType && orderByZodType instanceof z.ZodEnum) {
      def.orderBy = Object.keys(orderByZodType.enum)[0];
      def.hasOrderBy = true;
    }
    const searchZodType = columns.find((col) => col.name === "search")?.zodType;
    if (searchZodType && searchZodType instanceof z.ZodEnum) {
      def.search = Object.keys(searchZodType.enum)[0];
      def.hasSearch = true;
    }
    return def;
  }

  async render({ entityId }: TemplateOptions["view_list"]) {
    const { getColumnsNode } = await import("../entity-converter");
    const { getZodTypeById, zodTypeToRenderingNode } = await import("../zod-converter");

    const columnsNode = await getColumnsNode(entityId, "A");
    const listParamsZodType = await getZodTypeById(`${entityId}ListParams`);
    const listParamsNode = zodTypeToRenderingNode(listParamsZodType);

    const names = EntityManager.getNamesFromId(entityId);
    const entity = EntityManager.get(entityId);

    // PK 타입 감지
    const pkType = entity.getPkType();
    const idTsType = pkType === "string" || pkType === "uuid" ? "string" : "number";

    // 실제 리스트 컬럼
    const columns = /* SAFETY: Columns 렌더링 노드의 자식은 모두 컬럼 노드다. */ (
      columnsNode.children as RenderingNode[]
    )

      .toSorted((a, b) => (a.name === "id" ? -1 : b.name === "id" ? 1 : 0))
      .map((col) => {
        const rendered = this.renderColumn(entityId, col, names);

        // 라벨 생성: common 필드(created_at)는 SD("common.{field}"), entity 필드는 SD("entity.{Entity}.{field}")
        let label: string;
        if (col.name === "id") {
          label = '"ID"';
        } else if (["created_at"].includes(col.name)) {
          // camelCase로 변환 (created_at -> createdAt)
          const camelName = col.name.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
          label = `SD("common.${camelName}")`;
        } else {
          const labelName = getRelationNameFromColumnName(entityId, col.name);
          label = `SD("entity.${names.capital}.${labelName}")`;
        }

        return {
          name: col.name,
          label,
          tc: `(row) => ${rendered}`,
          fit:
            col.name === "id" ||
            col.renderType === "number-id" ||
            col.renderType === "datetime" ||
            col.renderType === "string-datetime",
          align: col.name === "id" || col.renderType === "number-id" ? "center" : undefined,
        };
      });

    // 필터 컬럼
    const filterColumns =
      /* SAFETY: ListParams 렌더링 노드의 자식은 모두 필터 컬럼 노드다. */ (
        listParamsNode.children as RenderingNode[]
      )
        .filter(
          (col) =>
            col.name !== "id" &&
            col.name !== "queryMode" &&
            ["enums", "number-id", "number-fk_id", "string-fk_id"].includes(col.renderType),
        )
        // orderBy가 가장 뒤로 오게 순서 조정
        .toSorted((a) => {
          return a.name === "orderBy" ? 1 : -1;
        });

    // 필터 컬럼을 프리 템플릿으로 설정
    const preTemplates: RenderedTemplate["preTemplates"] = [];

    // 컬럼에서 사용하는 enum들 수집
    const columnEnums: string[] = [];
    (columnsNode.children ?? []).forEach((col) => {
      if (col.renderType === "enums") {
        try {
          const { id: enumId } = getEnumInfoFromColName(entityId, col.name);
          columnEnums.push(enumId);
        } catch {}
      }
    });

    // 디폴트 파라미터
    // const def = this.getDefault(filterColumns);

    return {
      ...this.getTargetAndPath(names),
      body: `
import { useState, Fragment } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Card, CardContent, CardHeader } from "@sonamu-kit/react-components/components";
import { Badge } from "@sonamu-kit/react-components/components";
import { Button } from "@sonamu-kit/react-components/components";
import { Pagination, Table, TableBody, TableCell, type TableCol, TableHead, TableHeader, TableRow } from "@sonamu-kit/react-components/components";
import { EnumSelect } from "@sonamu-kit/react-components/components";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@sonamu-kit/react-components/components";
import { Input } from "@sonamu-kit/react-components/components";
import { Checkbox } from "@sonamu-kit/react-components/components";
import { SonamuFilterModal, SonamuFilterPopover, extractFieldMetaFromSchema, type Rule } from "@sonamu-kit/react-components/components";

import { useListParams, numF, dateF, datetimeF } from "@sonamu-kit/react-components/lib";
import { ${names.capital}SubsetA, ${names.capital}BaseSchema } from "@/services/sonamu.generated";
import { ${names.capital}Service } from "@/services/services.generated";
import { ${names.capital}ListParams } from "@/services/${names.fs}/${names.fs}.types";
import { ${(() => {
        // 기본 enum 수집 (filterColumns에 있는 것만)
        const baseEnums: string[] = [];
        if (filterColumns.some((col) => col.name === "orderBy")) {
          baseEnums.push(`${names.capital}OrderBy`, `${names.capital}OrderByLabel`);
        }
        if (filterColumns.some((col) => col.name === "search")) {
          baseEnums.push(`${names.capital}SearchField`, `${names.capital}SearchFieldLabel`);
        }

        // 필터 enum 수집 (config.enumId 우선, 없으면 getEnumInfoFromColName)
        // SAFETY: 마지막 Boolean 필터가 null을 제거해 enum 식별자 문자열만 남긴다.
        const filterEnumIds = filterColumns
          .filter(
            (col) => col.renderType === "enums" && col.name !== "search" && col.name !== "orderBy",
          )
          .map((col) => {
            const configEnumId = getConfigEnumId(col.config);
            if (configEnumId) {
              return configEnumId;
            }
            try {
              const { id: enumId } = getEnumInfoFromColName(entityId, col.name);
              return enumId;
            } catch {
              return null;
            }
          })
          .filter(Boolean) as string[];

        // 모든 enum 합치고 중복 제거
        const allEnums = [...new Set([...filterEnumIds, ...columnEnums])];
        const enumImports = allEnums.flatMap((enumId) => [`${enumId}`, `${enumId}Label`]);

        return [...baseEnums, ...enumImports].join(", ");
      })()} } from "@/services/sonamu.generated";
import { IdAsyncSelect } from "@sonamu-kit/react-components/components";
${(() => {
  // FK 필드의 AsyncIdConfig import
  const fkColumns = filterColumns.filter(
    (col) => col.renderType === "number-fk_id" || col.renderType === "string-fk_id",
  );
  const configNames = fkColumns
    .map((col) => {
      try {
        const relProp = getRelationPropFromColName(entityId, col.name.replace("_id", ""));
        return `${relProp.with}AsyncIdConfig`;
      } catch {
        return "";
      }
    })
    .filter(Boolean);
  return configNames.length > 0
    ? `import { ${configNames.join(", ")} } from "@/services/services.generated";`
    : "";
})()}

import EditIcon from "~icons/lucide/square-pen";
import TrashIcon from "~icons/lucide/trash-2";
import FilterIcon from "~icons/mdi/filter-variant";
import ListIcon from "~icons/mdi/format-list-bulleted";
import SearchIcon from "~icons/mdi/magnify";
import { SD } from "@/i18n/sd.generated";

export const Route = createFileRoute("/admin/${names.fsPlural}/")({\n  head: () => ({\n    meta: [\n      { title: "${entity.title ?? names.capital} List" },\n      { name: "description", content: SD("entity.listManage")("${entity.title ?? names.capital}") },\n    ],\n  }),\n  component: ${names.capital}List,\n});\n\ntype ${names.capital}ListProps = {};

function ${names.capital}List({}: ${names.capital}ListProps) {
  const navigate = useNavigate();

  // 상태 관리
  const [selectedItems, setSelectedItems] = useState<Set<${idTsType}>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: ${idTsType}; name?: string } | null>(null);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [appliedRules, setAppliedRules] = useState<Rule[]>([]);

  // 리스트 필터
  const { listParams, register, setListParams } = useListParams(${names.capital}ListParams, {
    num: 10,
    page: 1,
    keyword: "",${
      filterColumns.some((col) => col.name === "search")
        ? `
    search: ${names.capital}SearchField.options[0],`
        : ""
    }${
      filterColumns.some((col) => col.name === "orderBy")
        ? `
    orderBy: ${names.capital}OrderBy.options[0],`
        : ""
    }
    sonamuFilter: {},
  });

  // 리스트 쿼리
  const { data, refetch, isLoading } = ${names.capital}Service.use${names.capitalPlural}("A", listParams);
  const { rows, total } = data ?? {};

  // 현재 경로와 타이틀
  const PAGE = {
    route: "/admin/${names.fsPlural}",
    title: SD("entity.list")(SD("entity.${names.capital}")),
  };

  // 컬럼 정의
  type ${names.capital}Row = NonNullable<typeof rows>[number];
  const columns: TableCol<${names.capital}Row>[] = [
${columns
  .map(
    (col) => `    {
      label: ${col.label},
      tc: ${col.tc},${
        col.fit
          ? `
      fit: true,`
          : ""
      }${
        col.align
          ? `
      align: "${col.align}",`
          : ""
      }
    }`,
  )
  .join(",\n")},
    {
      label: SD("common.manage"),
      fit: true,
      align: "center",
      tc: (row) => (
        <div className="flex items-center justify-center gap-1">
          <Button
            variant="yellow"
            size="xs"
            icon={<EditIcon />}
            onClick={() => navigate({ to: \`\${PAGE.route}/form\`, search: { id: row.id } })}
          />
          <Button
            variant="red"
            size="xs"
            icon={<TrashIcon />}
            onClick={() => handleDeleteClick(row.id)}
          />
        </div>
      ),
    },
  ];

  // 선택 핸들러
  const handleToggleItem = (id: ${idTsType}) => {
    const newSelection = new Set(selectedItems);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedItems(newSelection);
  };

  const isAllSelected = () => {
    return (rows?.length ?? 0) > 0 && rows!.every((row) => selectedItems.has(row.id));
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(new Set(rows?.map((row) => row.id) ?? []));
    } else {
      setSelectedItems(new Set());
    }
  };

  // 삭제 핸들러
  const handleDeleteClick = (id: ${idTsType}, name?: string) => {
    setItemToDelete({ id, name });
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (itemToDelete) {
      ${names.capital}Service.del([itemToDelete.id]).then(() => {
        refetch();
      });
    }
    setDeleteDialogOpen(false);
    setItemToDelete(null);
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-[1800px] mx-auto p-8">
        <div className="space-y-6 mb-8">
          {/* Header */}
          <div className="flex items-center gap-2">
            <ListIcon className="h-5 w-5" />
            <span className="text-lg font-semibold h-5">{PAGE.title}</span>
          </div>

          <Card className="shadow-sm border-border/40 overflow-hidden">
            <CardHeader className="pb-0 px-0 pt-0">
              {/* Filters */}
              <div className="bg-gray-100 px-6 py-4 space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
${
  filterColumns.some((col) => col.name === "search")
    ? `                  <EnumSelect
                    enum={${names.capital}SearchField}
                    labels={${names.capital}SearchFieldLabel}
                    {...register("search")}
                    placeholder={SD("common.searchType")}
                    className="w-50 h-8 bg-white border-gray-300 text-xs"
                  />`
    : ""
}

                  <div className="relative flex-1 max-w-xs">
                    <Input
                      {...register("keyword")}
                      placeholder={SD("common.search")}
                      className="h-8 pr-8 text-xs bg-white border-gray-300"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<SearchIcon />}
                      className="absolute right-0 top-0 h-8 w-8 hover:bg-transparent"
                    />
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      className="h-8 px-4 bg-primary hover:bg-primary/90 text-white"
                      onClick={() => navigate({ to: \`\${PAGE.route}/form\` })}
                    >
                      <span className="text-xs">{SD("common.create")}</span>
                    </Button>
                    <SonamuFilterPopover
                      rules={appliedRules}
                      fieldMeta={extractFieldMetaFromSchema(
                        ${names.capital}BaseSchema,
                        SD as (key: string) => string,
                      )}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<FilterIcon />}
                        onClick={() => setFilterModalOpen(true)}
                        className="h-8"
                      >
                        <span className="text-xs">{SD("rc.sonamuFilter.title")}</span>
                        {appliedRules.length > 0 && (
                          <Badge variant="secondary" className="ml-1">
                            {appliedRules.length}
                          </Badge>
                        )}
                      </Button>
                    </SonamuFilterPopover>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
${filterColumns
  .filter((col) => col.name !== "search" && col.name !== "orderBy")
  .map((col) => {
    if (col.renderType === "enums") {
      try {
        // config.enumId가 있으면 우선 사용, 없으면 getEnumInfoFromColName 시도
        const enumId = getConfigEnumId(col.config) ?? getEnumInfoFromColName(entityId, col.name).id;
        return `                  <EnumSelect
                    key={\`${col.name}-\${listParams.${col.name}}\`}
                    enum={${enumId}}
                    labels={${enumId}Label}
                    {...register("${col.name}")}
                    placeholder="${col.label}"
                    clearable
                    className="w-50 h-8 bg-white border-gray-300 text-xs"
                  />`;
      } catch {
        return "";
      }
    }
    // FK 필드 (IdAsyncSelect)
    if (col.renderType === "number-fk_id" || col.renderType === "string-fk_id") {
      try {
        const relProp = getRelationPropFromColName(entityId, col.name.replace("_id", ""));
        return `                  <IdAsyncSelect
                    config={${relProp.with}AsyncIdConfig}
                    subset="A"
                    {...register("${col.name}")}
                    placeholder="${col.label ?? relProp.with}"
                    clearable
                    className="w-50 h-8 text-xs"
                  />`;
      } catch {
        return "";
      }
    }
    return "";
  })
  .filter(Boolean)
  .join("\n")}
${
  filterColumns.some((col) => col.name === "orderBy")
    ? `                  <EnumSelect
                    enum={${names.capital}OrderBy}
                    labels={${names.capital}OrderByLabel}
                    {...register("orderBy")}
                    placeholder={SD("common.sort")}
                    textPrefix={\`\${SD("common.sort")}: \`}
                    className="w-50 h-8 bg-white border-gray-300 text-xs"
                  />`
    : ""
}
                  <span className="text-xs text-muted-foreground">{SD("common.results")(total ?? 0)}</span>
                </div>
              </div>
            </CardHeader>

            <CardContent className="px-6 pb-6 pt-6 bg-white">
              {/* Table */}
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-gray-100">
                    <TableHead className="h-9 text-xs w-[40px]">
                      <Checkbox
                        checked={isAllSelected()}
                        onValueChange={handleSelectAll}
                      />
                    </TableHead>
                    {columns.map((col, idx) => (
                      <TableHead key={idx} fit={col.fit} align={col.align}>
                        {col.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!isLoading && rows && rows.map((row) => (
                    <Fragment key={row.id}>
                      <TableRow>
                        <TableCell className="py-3">
                          <Checkbox
                            checked={selectedItems.has(row.id)}
                            onValueChange={() => handleToggleItem(row.id)}
                          />
                        </TableCell>
                        {columns.map((col, idx) => (
                          <TableCell key={idx} fit={col.fit} align={col.align} className="py-3">
                            {col.tc(row)}
                          </TableCell>
                        ))}
                      </TableRow>
                    </Fragment>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <Pagination
                {...register("page")}
                total={total ?? 0}
                itemsPerPage={listParams.num ?? 10}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{SD("delete.confirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>{SD("delete.confirm.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{SD("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>
              {SD("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sonamu Filter Modal */}
      <SonamuFilterModal
        baseSchema={${names.capital}BaseSchema}
        open={filterModalOpen}
        onOpenChange={setFilterModalOpen}
        initialRules={appliedRules}
        onApply={(filters, rules) => {
          setListParams({ ...listParams, sonamuFilter: filters, page: 1 });
          setAppliedRules(rules);
        }}
      />
    </div>
  );
}
      `.trim(),
      importKeys: [],
      preTemplates,
    };
  }
}
