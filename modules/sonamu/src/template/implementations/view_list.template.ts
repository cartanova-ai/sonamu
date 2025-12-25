import inflection from "inflection";
import { flat } from "radashi";
import { z } from "zod";
import { EntityManager, type EntityNamesRecord } from "../../entity/entity-manager";
import type { RenderingNode, TemplateKey, TemplateOptions } from "../../types/types";
import { getEnumInfoFromColName, getRelationPropFromColName } from "../helpers";
import type { RenderedTemplate } from "../template";
import { Template } from "../template";

export class Template__view_list extends Template {
  constructor() {
    super("view_list");
  }

  getTargetAndPath(names: EntityNamesRecord) {
    return {
      target: "web/src/pages/admin",
      path: `${names.fsPlural}/index.tsx`,
    };
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
        return `<>{${colName}}</>`;
      case "number-fk_id": {
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
      case "string-image":
        return `<>{${
          col.nullable ? `${colName} && ` : ""
        }<img src={${colName}} className="h-8 w-8 object-cover rounded" />}</>`;
      case "datetime":
        if (col.nullable || col.name.includes(".")) {
          return `<span className="text-xs text-muted-foreground">{${colName} ? datetimeF(${colName}) : '-'}</span>`;
        } else {
          return `<span className="text-xs text-muted-foreground">{datetimeF(${colName})}</span>`;
        }
      case "string-datetime":
        if (col.nullable || col.name.includes(".")) {
          return `<span className="text-xs text-muted-foreground">{${colName} ? dateF(${colName}) : '-'}</span>`;
        } else {
          return `<span className="text-xs text-muted-foreground">{dateF(${colName})}</span>`;
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
        return `<div className="flex gap-1">{ ${colName}.map((r, i) => ${
          col.nullable ? `r && ` : ""
        }<img key={i} src={r} className="h-8 w-8 object-cover rounded" />) }</div>`;
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
    } else if (col.renderType === "number-fk_id") {
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

  getDefault(columns: RenderingNode[]): {
    orderBy: string;
    search: string;
    hasSearch: boolean;
    hasOrderBy: boolean;
  } {
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

    // 실제 리스트 컬럼
    const columns = (columnsNode.children as RenderingNode[])
      .filter((col) => col.name !== "id")
      .map((col) => {
        const propCandidate = entity.props.find((p) => p.name === col.name);
        return {
          name: col.name,
          label: propCandidate?.desc ?? col.label,
          tc: `(row) => ${this.renderColumn(entityId, col, names)}`,
        };
      });

    // 필터 컬럼
    const filterColumns = (listParamsNode.children as RenderingNode[])
      .filter(
        (col) =>
          col.name !== "id" &&
          col.name !== "queryMode" &&
          (["enums", "number-id"].includes(col.renderType) || col.name.endsWith("_id")),
      )
      // orderBy가 가장 뒤로 오게 순서 조정
      .sort((a) => {
        return a.name === "orderBy" ? 1 : -1;
      });

    // 필터 컬럼을 프리 템플릿으로 설정
    const preTemplates: RenderedTemplate["preTemplates"] = [];
    for (const col of filterColumns) {
      let key: TemplateKey;
      let targetEntityId = entityId;
      let enumId: string | undefined;

      if (col.renderType === "enums") {
        if (col.name === "search") {
          key = "view_enums_dropdown";
          enumId = `${names.capital}SearchField`;
          targetEntityId = names.capital;
        } else {
          key = "view_enums_select";
          // config.enumId 우선 사용
          if (col.config && "enumId" in col.config) {
            enumId = (col.config as { enumId: string }).enumId;
            targetEntityId = entityId;
          } else {
            try {
              const { targetEntityNames, id } = getEnumInfoFromColName(entityId, col.name);
              targetEntityId = targetEntityNames.capital;
              enumId = id;
            } catch {
              continue;
            }
          }
        }
      } else {
        key = "view_id_async_select";
        try {
          const relProp = getRelationPropFromColName(entityId, col.name.replace("_id", ""));
          targetEntityId = relProp.with;
        } catch {
          continue;
        }
      }

      preTemplates.push({
        key,
        options: {
          entityId: targetEntityId,
          enumId,
        },
      });
    }

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

    // SearchInput
    preTemplates?.push({
      key: "view_search_input",
      options: {
        entityId,
      },
    });

    // 디폴트 파라미터
    // const def = this.getDefault(filterColumns);

    return {
      ...this.getTargetAndPath(names),
      body: `
import { useState, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { Icon, type IconProps } from "@iconify/react";

import { Card, CardContent, CardHeader } from "@sonamu-kit/react-components/components";
import { Badge } from "@sonamu-kit/react-components/components";
import { Button } from "@sonamu-kit/react-components/components";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@sonamu-kit/react-components/components";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@sonamu-kit/react-components/components";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@sonamu-kit/react-components/components";
import { Input } from "@sonamu-kit/react-components/components";
import { Checkbox } from "@sonamu-kit/react-components/components";

import { useListParams, numF, dateF, datetimeF } from "@sonamu-kit/react-components/lib";
import { ${names.capital}SubsetA } from "@/services/sonamu.generated";
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
        const filterEnumIds = filterColumns
          .filter(
            (col) => col.renderType === "enums" && col.name !== "search" && col.name !== "orderBy",
          )
          .map((col) => {
            if (col.config && "enumId" in col.config) {
              return (col.config as { enumId: string }).enumId;
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
${(() => {
  // FK 필드의 AsyncSelect 컴포넌트 import
  const fkColumns = filterColumns.filter((col) => col.name.endsWith("_id") && col.name !== "id");
  return fkColumns
    .map((col) => {
      try {
        const relProp = getRelationPropFromColName(entityId, col.name.replace("_id", ""));
        const targetNames = EntityManager.getNamesFromId(relProp.with);
        return `import { ${relProp.with}IdAsyncSelect } from "@/components/${targetNames.fs}/${relProp.with}IdAsyncSelect";`;
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .join("\n");
})()}

// Icons
const ListIcon = (props: Omit<IconProps, "icon">) => <Icon icon="mdi:format-list-bulleted" {...props} />;
const EditIcon = (props: Omit<IconProps, "icon">) => <Icon icon="lucide:square-pen" {...props} />;
const TrashIcon = (props: Omit<IconProps, "icon">) => <Icon icon="lucide:trash-2" {...props} />;
const SearchIcon = (props: Omit<IconProps, "icon">) => <Icon icon="mdi:magnify" {...props} />;

type ${names.capital}ListProps = {};

export default function ${names.capital}List({}: ${names.capital}ListProps) {
  const navigate = useNavigate();

  // 상태 관리
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: number; name?: string } | null>(null);

  // 리스트 필터
  const { listParams, register } = useListParams(${names.capital}ListParams, {
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
  });

  // 리스트 쿼리
  const { data, refetch, isLoading } = ${names.capital}Service.use${names.capitalPlural}("A", listParams);
  const { rows, total } = data ?? {};

  // 페이지네이션
  const itemsPerPage = listParams.num ?? 10;
  const currentPage = listParams.page ?? 1;
  const totalPages = Math.ceil((total ?? 0) / itemsPerPage);

  // 선택 핸들러
  const handleToggleItem = (id: number) => {
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
  const handleDeleteClick = (id: number, name?: string) => {
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

  // 현재 경로와 타이틀
  const PAGE = {
    route: "/admin/${names.fsPlural}",
    title: "${entity.title ?? names.capital}",
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
    ? `                  <Select key={\`search-\${listParams.search}\`} {...register("search")}>
                    <SelectTrigger className="w-[200px] h-8 bg-white border-gray-300 text-xs">
                      <SelectValue placeholder="Search Type" className="truncate" />
                    </SelectTrigger>
                    <SelectContent>
                      {${names.capital}SearchField.options.map((key) => (
                        <SelectItem key={key} value={key}>
                          {${names.capital}SearchFieldLabel[key]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>`
    : ""
}

                  <div className="relative flex-1 max-w-xs">
                    <Input
                      {...register("keyword")}
                      placeholder="Search..."
                      className="h-8 pr-8 text-xs bg-white border-gray-300"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-8 w-8 hover:bg-transparent"
                    >
                      <SearchIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>

                  <div className="ml-auto">
                    <Button
                      className="h-8 px-4 bg-primary hover:bg-primary/90 text-white"
                      onClick={() => navigate(\`\${PAGE.route}/form\`)}
                    >
                      <span className="text-xs">Create</span>
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
${filterColumns
  .filter((col) => col.name !== "search" && col.name !== "orderBy")
  .map((col) => {
    if (col.renderType === "enums") {
      try {
        // config.enumId가 있으면 우선 사용, 없으면 getEnumInfoFromColName 시도
        const enumId =
          col.config && "enumId" in col.config
            ? (col.config as { enumId: string }).enumId
            : getEnumInfoFromColName(entityId, col.name).id;
        return `                  <Select key={\`${col.name}-\${listParams.${col.name}}\`} {...register("${col.name}")} clearable>
                    <SelectTrigger className="w-[200px] h-8 bg-white border-gray-300 text-xs">
                      <SelectValue placeholder="${col.label}" className="truncate" />
                    </SelectTrigger>
                    <SelectContent>
                      {${enumId}.options.map((key) => (
                        <SelectItem key={key} value={key}>
                          {${enumId}Label[key]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>`;
      } catch {
        return "";
      }
    }
    // FK 필드 (AsyncSelect)
    if (col.name.endsWith("_id") && col.name !== "id") {
      try {
        const relProp = getRelationPropFromColName(entityId, col.name.replace("_id", ""));
        return `                  <${relProp.with}IdAsyncSelect
                    subset="A"
                    {...register("${col.name}")}
                    placeholder="${col.label ?? relProp.with}"
                    clearable
                    className="w-[200px] h-8 text-xs"
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
    ? `                  <Select key={\`orderBy-\${listParams.orderBy}\`} {...register("orderBy")}>
                    <SelectTrigger className="w-[200px] h-8 bg-white border-gray-300 text-xs">
                      <SelectValue placeholder="Sort" className="truncate" />
                    </SelectTrigger>
                    <SelectContent>
                      {${names.capital}OrderBy.options.map((key) => (
                        <SelectItem key={key} value={key}>
                          Sort: {${names.capital}OrderByLabel[key]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>`
    : ""
}
                  <span className="text-xs text-muted-foreground">{total ?? 0} results</span>
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
                        onChange={(e) => handleSelectAll(e.target.checked)}
                      />
                    </TableHead>
                    <TableHead className="h-9 text-xs w-[55px]">ID</TableHead>
${columns
  .map((col) => `                    <TableHead className="h-9 text-xs">${col.label}</TableHead>`)
  .join("\n")}
                    <TableHead className="h-9 text-xs text-center w-[100px]">Manage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!isLoading && rows && rows.map((row) => (
                    <Fragment key={row.id}>
                      <TableRow>
                        <TableCell className="py-3">
                          <Checkbox
                            checked={selectedItems.has(row.id)}
                            onChange={() => handleToggleItem(row.id)}
                          />
                        </TableCell>
                        <TableCell className="py-3 text-xs">{row.id}</TableCell>
${columns
  .map(
    (col) =>
      `                        <TableCell className="py-3 text-xs">${col.tc.replace("(row) => ", "").replace("(row, rowIndex) => ", "")}</TableCell>`,
  )
  .join("\n")}
                        <TableCell className="py-3">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 rounded bg-yellow-500 hover:bg-yellow-600 text-white"
                              onClick={() => navigate(\`\${PAGE.route}/form?id=\${row.id}\`)}
                            >
                              <EditIcon className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 rounded bg-red-500 hover:bg-red-600 text-white"
                              onClick={() => handleDeleteClick(row.id)}
                            >
                              <TrashIcon className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between pt-6">
                <div className="text-xs text-muted-foreground">
                  Showing {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, total ?? 0)} of {total ?? 0} results
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 text-xs"
                    disabled={currentPage === 1}
                    onClick={() => register("page").onChange(null, { value: currentPage - 1 })}
                  >
                    Previous
                  </Button>
                  <div className="flex items-center gap-1">
                    {(() => {
                      const maxVisible = 6;
                      let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
                      let endPage = Math.min(totalPages, startPage + maxVisible - 1);
                      if (endPage - startPage + 1 < maxVisible) {
                        startPage = Math.max(1, endPage - maxVisible + 1);
                      }
                      return Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i).map((page) => (
                        <Button
                          key={page}
                          variant="outline"
                          size="sm"
                          className={\`h-8 w-8 text-xs \${page === currentPage ? "bg-primary text-primary-foreground" : ""}\`}
                          onClick={() => register("page").onChange(null, { value: page })}
                        >
                          {page}
                        </Button>
                      ));
                    })()}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 text-xs"
                    disabled={currentPage === totalPages}
                    onClick={() => register("page").onChange(null, { value: currentPage + 1 })}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this item.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
      `.trim(),
      importKeys: [],
      preTemplates,
    };
  }
}
