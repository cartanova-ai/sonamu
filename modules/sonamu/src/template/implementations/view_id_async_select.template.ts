import { EntityManager, type EntityNamesRecord } from "../../entity/entity-manager";
import type { TemplateOptions } from "../../types/types";
import { Template } from "../template";

export class Template__view_id_async_select extends Template {
  constructor() {
    super("view_id_async_select");
  }

  getTargetAndPath(names: EntityNamesRecord) {
    return {
      target: "web/src/components",
      path: `${names.fs}/${names.capital}IdAsyncSelect.tsx`,
    };
  }

  render({ entityId, textField }: TemplateOptions["view_id_async_select"]) {
    const names = EntityManager.getNamesFromId(entityId);

    const entity = EntityManager.get(entityId);

    // PK 타입 감지
    const pkType = entity.getPkType();
    const idTsType = pkType === "string" || pkType === "uuid" ? "string" : "number";
    const isStringId = pkType === "string" || pkType === "uuid";

    // textField가 지정되지 않은 경우 모든 subset에 공통으로 있는 필드 찾기
    if (!textField) {
      const subsetKeys = Object.keys(entity.subsets);
      if (subsetKeys.length > 0) {
        // 모든 subset에 공통으로 포함된 직접 필드만 추출
        const commonFields = subsetKeys.reduce(
          (common, key) => {
            const fields = entity.subsets[key]
              .filter((path) => !path.includes(".")) // 직접 필드만
              .map((path) => path);
            return common.filter((field) => fields.includes(field));
          },
          entity.subsets[subsetKeys[0]].filter((path) => !path.includes(".")),
        );

        // 우선순위: name > title > 첫 번째 string 타입
        const pickedProp = entity.props.find(
          (prop) => ["name", "title"].includes(prop.name) && commonFields.includes(prop.name),
        );
        if (pickedProp) {
          textField = pickedProp.name;
        } else {
          const candidateProp = entity.props.find(
            (prop) => prop.type === "string" && commonFields.includes(prop.name),
          );
          if (candidateProp) {
            textField = candidateProp.name;
          } else {
            // 공통 필드가 없으면 id 사용
            textField = "id";
            console.log(
              `Warning: ${entityId}에 모든 subset에 공통으로 포함된 string 필드가 없어 id를 사용합니다`,
            );
          }
        }
      }
    }

    return {
      ...this.getTargetAndPath(names),
      body: `
import {
  AsyncSelect,
  type AsyncSelectOption,
  MultiSelect,
} from "@sonamu-kit/react-components/components";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ${names.capital}Service } from "@/services/services.generated";
import type { ${names.capital}SubsetKey, ${names.capital}SubsetMapping } from "@/services/sonamu.generated";
import type { ${names.capital}ListParams } from "@/services/${names.fs}/${names.fs}.types";

export type ${names.capital}IdAsyncSelectProps<T extends ${names.capital}SubsetKey> = {
  subset: T;
  baseListParams?: ${names.capital}ListParams;
  textField?: keyof ${names.capital}SubsetMapping[T];
  valueField?: keyof ${names.capital}SubsetMapping[T];
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  multiple?: boolean;
} & (
  | {
      multiple?: false;
      value?: ${idTsType} | null;
      onValueChange?: (value: ${idTsType} | undefined) => void;
    }
  | {
      multiple: true;
      value?: ${idTsType}[];
      onValueChange?: (value: ${idTsType}[]) => void;
    }
);

export function ${names.capital}IdAsyncSelect<T extends ${names.capital}SubsetKey>({
  subset,
  value,
  onValueChange,
  baseListParams,
  textField,
  valueField,
  placeholder = "${entity.title ?? names.constant}",
  clearable,
  disabled,
  className,
  multiple = false,
}: ${names.capital}IdAsyncSelectProps<T>) {
  const [listParams, setListParams] = useState<${names.capital}ListParams>(baseListParams ?? {});

  const { data, isLoading } = ${names.capital}Service.use${names.capitalPlural}(subset, listParams);
  const { rows: ${names.camelPlural} } = data ?? {};

  // 옵션 생성
  const options = useMemo(() => {
    return (${names.camelPlural} ?? []).map((${names.camel}) => ({
      value: String(${names.camel}[valueField ?? "id"] as ${idTsType}),
      label: String(${names.camel}[textField ?? "${textField || "id"}"]),
    }));
  }, [${names.camelPlural}, textField, valueField]);

  // baseListParams 변경 시 반영
  useEffect(() => {
    setListParams((prev) => ({
      ...prev,
      ...baseListParams,
    }));
  }, [baseListParams]);

  // 검색어 변경 핸들러
  const handleSearch = useCallback((keyword: string) => {
    setListParams((prev) => ({
      ...prev,
      keyword: keyword || undefined,
    }));
  }, []);

  // Multiple select
  if (multiple) {
    const multiValue = Array.isArray(value) ? value.map(String) : [];

    const handleMultiChange = (selectedValues: string[]) => {
      ${
        isStringId
          ? `(onValueChange as ((value: string[]) => void) | undefined)?.(selectedValues);`
          : `const numericValues = selectedValues.map(Number);
      (onValueChange as ((value: number[]) => void) | undefined)?.(numericValues);`
      }
    };

    return (
      <MultiSelect
        options={options}
        value={multiValue}
        onValueChange={handleMultiChange}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
      />
    );
  }

  // Single select
  const singleValue = typeof value === "${idTsType}" ? value : undefined;

  const handleSingleChange = (value: string | undefined) => {
    ${
      isStringId
        ? `(onValueChange as ((value: string | undefined) => void) | undefined)?.(value);`
        : `const numericValue = value ? Number(value) : undefined;
    (onValueChange as ((value: number | undefined) => void) | undefined)?.(numericValue);`
    }
  };

  return (
    <AsyncSelect
      options={options as AsyncSelectOption<string>[]}
      value={singleValue !== undefined ? String(singleValue) : undefined}
      onValueChange={handleSingleChange}
      isLoading={isLoading}
      placeholder={placeholder}
      clearable={clearable}
      disabled={disabled}
      className={className}
      onSearch={handleSearch}
    />
  );
}
      `.trim(),
      importKeys: [],
    };
  }
}
