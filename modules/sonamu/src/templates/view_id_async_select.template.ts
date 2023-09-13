import { TemplateOptions } from "../types/types";
import { EntityManager, EntityNamesRecord } from "../entity/entity-manager";
import { Template } from "./base-template";

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
    if (!textField) {
      const pickedProp = entity.props.find((prop) =>
        ["name", "title"].includes(prop.name)
      );
      if (pickedProp) {
        textField = pickedProp.name;
      } else {
        const candidateProp = entity.props.find(
          (prop) => prop.type === "string"
        );
        if (candidateProp) {
          textField = candidateProp.name;
        } else {
          console.log("textField 찾을 수 없음");
        }
      }
    }

    return {
      ...this.getTargetAndPath(names),
      body: `
import React, { useState, useEffect, SyntheticEvent } from "react";
import { DropdownProps, DropdownItemProps, DropdownOnSearchChangeData, Dropdown } from "semantic-ui-react";
import { ${names.capital}SubsetKey, ${
        names.capital
      }SubsetMapping } from "src/services/${names.fs}/${names.fs}.generated";
import { ${names.capital}Service } from "src/services/${names.fs}/${
        names.fs
      }.service";
import { ${names.capital}ListParams } from "src/services/${names.fs}/${
        names.fs
      }.types";

export function ${names.capital}IdAsyncSelect<T extends ${
        names.capital
      }SubsetKey>(
  { subset, baseListParams, textField, valueField, ...props }: DropdownProps & {
    subset: T;
    baseListParams?: ${names.capital}ListParams;
    textField${textField ? "?" : ""}: keyof ${names.capital}SubsetMapping[T];
    valueField?: keyof ${names.capital}SubsetMapping[T];
  },
) {
  const [options, setOptions] = useState<DropdownItemProps[]>([]);
  const [listParams, setListParams] = useState<${names.capital}ListParams>(
    baseListParams ?? {},
  );

  const { data, error } = ${names.capital}Service.use${
        names.capitalPlural
      }(subset, listParams);
  const { rows: ${names.camelPlural}, total } = data ?? {};

  useEffect(() => {
    setOptions(
      (${names.camelPlural} ?? []).map((${names.camel}) => {
        return {
          key: ${names.camel}.id,
          value: ${names.camel}[valueField ?? 'id'] as string | number,
          text: String(${names.camel}[textField${
        textField ? ` ?? '${textField}'` : ""
      }]),
        };
      }),
    );
  }, [${names.camelPlural}]);

  useEffect(() => {
    setListParams({
      ...listParams,
      ...baseListParams,
    });
  }, [baseListParams]);

  const handleSearchChange = (
    e: SyntheticEvent<HTMLElement, Event>,
    data: DropdownOnSearchChangeData,
  ) => {
    setListParams({
      ...listParams,
      keyword: data.searchQuery,
    });
  };

  return (
    <Dropdown
      placeholder="${names.constant}"
      selection
      options={options}
      onSearchChange={handleSearchChange}
      disabled={!${names.camelPlural}}
      loading={!${names.camelPlural}}
      selectOnBlur={false}
      {...props}
    />
  );
}
      `.trim(),
      importKeys: [],
    };
  }
}
